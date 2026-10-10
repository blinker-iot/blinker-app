import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ values: new Map<string, string>(), native: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => storage.native } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  getItem: vi.fn(async (key: string) => storage.values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { storage.values.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { storage.values.delete(key); }),
  keys: vi.fn(async () => [...storage.values.keys()]),
} }));

import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { WiFiProvAllocation } from './wifiprov-allocation';
import { CapacitorWiFiProvAllocationStore } from './wifiprov-allocation-store';

const instance = new Uint8Array(16).fill(1);
const scope = { authority: 'https://gateway.test', accountId: 'owner' };
const context = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111',
  credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const deviceKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const created = () => ({ status: 201, data: { replayed: false,
  device: { ...context, state: 'active', name: 'Lamp', deviceType: 'diy' } } });

function harness() {
  let current = true;
  const store = () => new CapacitorWiFiProvAllocationStore(() => scope);
  const management = {
    createDeviceKeyV2: vi.fn(async () => created()),
    revealDeviceKeyV2: vi.fn(async () => ({ status: 200, data: { ...context, deviceKey } })),
  };
  return { store, management, leave: () => { current = false; },
    client: () => new WiFiProvAllocation(store(), management as any, () => {
      if (!current) throw Error('ACCOUNT_OR_PAGE_CHANGED');
    }) };
}

describe('WiFiProv first allocation journal', () => {
  beforeEach(() => { vi.clearAllMocks(); storage.values.clear(); storage.native = true; });

  it('loads no journal without creating a request or writing storage', async () => {
    expect(await harness().store().load(instance)).toBeUndefined();
    expect(SecureStorage.setItem).not.toHaveBeenCalled();
  });

  it('finds only the exact device in this account and authority without removing records', async () => {
    const h = harness(); await h.client().create(instance, 'Lamp');
    const other = new CapacitorWiFiProvAllocationStore(() => ({ ...scope, accountId: 'other' }));
    const record = await other.prepare(instance, 'Other'); await other.bind(instance, record.requestId, context);
    await h.store().prepare(new Uint8Array(16).fill(2), 'Pending');
    storage.values.set('unrelated-secret', 'not-json');
    expect(await h.store().findDevice(context.logicalDeviceId)).toEqual(instance);
    expect(await h.store().findDevice('device_22222222-2222-4222-8222-222222222222')).toBeUndefined();
    expect(SecureStorage.removeItem).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(4);
  });

  it('rejects two instances claiming the same allocated device, without deleting either', async () => {
    const h = harness(); await h.client().create(instance, 'Lamp');
    const second = new Uint8Array(16).fill(2), record = await h.store().prepare(second, 'Second');
    await h.store().bind(second, record.requestId, context);
    await expect(h.store().findDevice(context.logicalDeviceId)).rejects.toThrow('CONFLICT');
    expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('does not clear a captured account after a scope change during native read', async () => {
    const h = harness(); await h.client().create(instance, 'Lamp');
    let current = scope;
    const scoped = new CapacitorWiFiProvAllocationStore(() => current);
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async key => {
      current = { ...scope, accountId: 'other' }; return storage.values.get(key) ?? null;
    });
    await expect(scoped.complete(instance, context.logicalDeviceId)).rejects.toThrow('SCOPE_CHANGED');
    expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('skips native allocation cleanup on the browser without blocking ordinary cloud removal', async () => {
    storage.native = false;
    expect(await harness().store().findDevice(context.logicalDeviceId)).toBeUndefined();
    expect(SecureStorage.keys).not.toHaveBeenCalled();
  });

  it('loads the exact persisted context on a new store without replacing it', async () => {
    const h = harness(); await h.client().create(instance, 'Original');
    const before = [...storage.values.values()];
    expect(await h.store().load(instance)).toMatchObject({ name: 'Original', context });
    expect([...storage.values.values()]).toEqual(before);
  });

  it('persists before CREATE, then context before REVEAL; no secrets or request-body drift', async () => {
    const h = harness();
    h.management.createDeviceKeyV2.mockImplementation(async () => {
      expect(JSON.parse([...storage.values.values()][0]).record.context).toBeUndefined();
      return created();
    });
    h.management.revealDeviceKeyV2.mockImplementation(async () => {
      expect(JSON.parse([...storage.values.values()][0]).record.context).toEqual(context);
      return { status: 200, data: { ...context, deviceKey } };
    });
    await expect(h.client().create(instance, ' Lamp ')).resolves.toEqual({ ...context, deviceKey });
    await expect(h.client().create(instance, 'Changed name')).resolves.toEqual({ ...context, deviceKey });
    expect(h.management.createDeviceKeyV2).toHaveBeenCalledOnce();
    expect(h.management.createDeviceKeyV2).toHaveBeenCalledWith('Lamp', expect.stringMatching(/^wifiprov-[a-f0-9]{32}$/), 'diy');
    const raw = [...storage.values.values()][0];
    expect(raw).not.toContain(deviceKey); expect(raw).not.toContain('controllerSecret');
    expect(JSON.parse(raw).record.name).toBe('Lamp');
    await h.store().complete(instance, context.logicalDeviceId);
    expect(storage.values.size).toBe(0);
  });

  it.each(['response-lost', 'context-write-lost'])('replays the same CREATE after %s and page reconstruction', async failure => {
    const h = harness();
    if (failure === 'response-lost') h.management.createDeviceKeyV2.mockRejectedValueOnce(Error('lost'));
    else vi.mocked(SecureStorage.setItem).mockImplementationOnce(async (key, value) => { storage.values.set(key, value as string); })
      .mockRejectedValueOnce(Error('lost'));
    await expect(h.client().create(instance, 'Original')).rejects.toThrow('lost');
    await h.client().create(instance, 'Changed');
    expect(h.management.createDeviceKeyV2).toHaveBeenCalledTimes(2);
    expect(h.management.createDeviceKeyV2.mock.calls[0]).toEqual(h.management.createDeviceKeyV2.mock.calls[1]);
    expect(h.management.revealDeviceKeyV2).toHaveBeenCalledOnce();
  });

  it('preserves allocated context when REVEAL fails; does not CREATE again', async () => {
    const h = harness(); h.management.revealDeviceKeyV2.mockRejectedValueOnce(Error('offline'));
    await expect(h.client().create(instance, 'Lamp')).rejects.toThrow('offline');
    await h.client().create(instance, 'Renamed');
    expect(h.management.createDeviceKeyV2).toHaveBeenCalledOnce();
    expect(h.management.revealDeviceKeyV2).toHaveBeenCalledTimes(2);
  });

  it('requires durable preparation before any server mutation', async () => {
    const h = harness(); vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(Error('disk'));
    await expect(h.client().create(instance, 'Lamp')).rejects.toThrow('disk');
    expect(h.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it.each(['prepare', 'create', 'reveal'])('fences account/page changes during %s', async phase => {
    const h = harness();
    if (phase === 'prepare') vi.mocked(SecureStorage.setItem).mockImplementationOnce(async (key, value) => {
      storage.values.set(key, value as string); h.leave();
    });
    if (phase === 'create') h.management.createDeviceKeyV2.mockImplementationOnce(async () => { h.leave(); return created(); });
    if (phase === 'reveal') h.management.revealDeviceKeyV2.mockImplementationOnce(async () => {
      h.leave(); return { status: 200, data: { ...context, deviceKey } };
    });
    await expect(h.client().create(instance, 'Lamp')).rejects.toThrow('ACCOUNT_OR_PAGE_CHANGED');
    expect(storage.values.size).toBe(1); // Kept for the original account's explicit recovery.
    if (phase === 'prepare') expect(h.management.createDeviceKeyV2).not.toHaveBeenCalled();
    if (phase !== 'reveal') expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('isolates authority, account and instance and never clears another target', async () => {
    const h = harness(); await h.client().create(instance, 'Lamp');
    for (const changed of [{ ...scope, accountId: 'other' }, { ...scope, authority: 'https://other.test' }]) {
      const record = await new CapacitorWiFiProvAllocationStore(() => changed).prepare(instance, 'Other');
      expect(record.context).toBeUndefined(); expect(record.name).toBe('Other');
    }
    expect((await h.store().prepare(new Uint8Array(16).fill(2), 'Second')).context).toBeUndefined();
    await expect(h.store().complete(instance, 'device_22222222-2222-4222-8222-222222222222')).rejects.toThrow('CONFLICT');
    await h.store().complete(instance, context.logicalDeviceId); expect(storage.values.size).toBe(3);
  });

  it('does not clear a journal on cleanup failure and can retry exact cleanup', async () => {
    const h = harness(); await h.client().create(instance, 'Lamp');
    vi.mocked(SecureStorage.removeItem).mockRejectedValueOnce(Error('disk'));
    await expect(h.store().complete(instance, context.logicalDeviceId)).rejects.toThrow('disk');
    await h.store().complete(instance, context.logicalDeviceId); expect(storage.values.size).toBe(0);
  });

  it.each(['rotated', 'invalid-key', 'wrong-device', 'deleted'])('does not restart allocation after %s', async change => {
    const h = harness(); await h.client().create(instance, 'Lamp');
    if (change === 'deleted') h.management.revealDeviceKeyV2.mockRejectedValueOnce(Error('DEVICE_REVOKED'));
    else h.management.revealDeviceKeyV2.mockResolvedValueOnce({ status: 200, data: { ...context, deviceKey,
      ...(change === 'rotated' ? { credentialVersion: 2 } : change === 'invalid-key' ? { deviceKey: 'invalid' }
        : { logicalDeviceId: 'device_22222222-2222-4222-8222-222222222222' }) } });
    await expect(h.client().create(instance, 'Lamp')).rejects.toThrow();
    expect(h.management.createDeviceKeyV2).toHaveBeenCalledOnce(); expect(storage.values.size).toBe(1);
  });

  it('rejects a revoked idempotent CREATE, not a new request', async () => {
    const h = harness(); h.management.createDeviceKeyV2.mockRejectedValue(Error('DEVICE_V2_CREATE_REVOKED'));
    await expect(h.client().create(instance, 'Lamp')).rejects.toThrow('REVOKED');
    await expect(h.client().create(instance, 'New')).rejects.toThrow('REVOKED');
    expect(h.management.createDeviceKeyV2.mock.calls[0]).toEqual(h.management.createDeviceKeyV2.mock.calls[1]);
  });

  it('rejects corrupt/mis-scoped storage without falling back to a new CREATE', async () => {
    const h = harness(); await h.store().prepare(instance, 'Lamp');
    const key = [...storage.values.keys()][0];
    for (const encoded of ['invalid', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, ...scope,
      deviceInstanceId: 'wrong', record: { name: 'Lamp' } })]) {
      storage.values.set(key, encoded); await expect(h.client().create(instance, 'Lamp')).rejects.toThrow();
    }
    expect(h.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('rejects concurrent preparation without a second journal/request identity', async () => {
    const h = harness(); let release!: () => void;
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(null); }));
    const pending = h.store().prepare(instance, 'First');
    await expect(h.store().prepare(instance, 'Second')).rejects.toThrow('BUSY');
    release(); await pending;
    expect((await h.store().prepare(instance, 'Third')).name).toBe('First');
  });

  it('requires native storage, a real instance and valid bounded name', async () => {
    const h = harness(); storage.native = false;
    await expect(h.client().create(instance, 'Lamp')).rejects.toThrow('SECURE_STORAGE'); storage.native = true;
    await expect(h.client().create(new Uint8Array(16), 'Lamp')).rejects.toThrow('INSTANCE');
    await expect(h.client().create(instance, '')).rejects.toThrow();
    await expect(h.client().create(instance, '灯'.repeat(100))).rejects.toThrow();
    expect(h.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });
});
