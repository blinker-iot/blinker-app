import type { DeviceKeyContext } from '../../model/response.model';
import type { BleControllerCredential } from '../ble-direct/credential-store';
import { base64UrlEncode } from '../ble-direct/wire';
import type { BlinkerConfigInfo } from './esp32-wifiprov';
import { WiFiProvAdmin } from './wifiprov-admin';

const id = 'device_11111111-1111-4111-8111-111111111111';
const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const context = (): DeviceKeyContext => ({ logicalDeviceId: id, credentialVersion: 4, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' });
const info = (): BlinkerConfigInfo => ({ deviceInstanceId: new Uint8Array(16).fill(5), accessEpoch: 7,
  hasDeviceKey: true, hasAccessState: true, supportsAccessBootstrap: true });
function credential(): BleControllerCredential {
  return { source: 'wifiprov', state: 'active', logicalDeviceId: id, deviceInstanceId: info().deviceInstanceId,
    accessEpoch: 7, controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 0x0f, cloudContext: { credentialVersion: 4, locator: context().locator },
    presenceKeys: [{ state: 'current', accessEpoch: 7, version: 1, key: new Uint8Array(16).fill(4) }],
    intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() };
}
function copy(value: BleControllerCredential): BleControllerCredential {
  const bytes = (input: Uint8Array) => input instanceof Uint8Array ? Uint8Array.from(input) : input;
  return { ...value, deviceInstanceId: bytes(value.deviceInstanceId), controllerId: bytes(value.controllerId),
    controllerSecret: bytes(value.controllerSecret), cloudContext: value.cloudContext && { ...value.cloudContext },
    presenceKeys: value.presenceKeys?.map(x => ({ ...x, key: bytes(x.key) })),
    intentId: bytes(value.intentId), commitId: bytes(value.commitId), receipt: bytes(value.receipt) };
}
function harness() {
  let stored: BleControllerCredential | undefined = credential(), loaded: BleControllerCredential | undefined, current = true;
  const changed = Error('account changed'), order: string[] = [];
  const record = { logicalDeviceId: id, accessEpoch: 7, controllerId: base64UrlEncode(stored.controllerId), credentialVersion: 1 };
  const store = { load: vi.fn(async (_id: string) => { order.push('load'); loaded = stored && copy(stored); return loaded; }),
    findWiFiProv: vi.fn(), save: vi.fn() };
  const management = { getDirectAdminV2: vi.fn(async (_id: string) => { order.push('admin-get'); return record; }),
    revealDeviceKeyV2: vi.fn(async (_context: DeviceKeyContext) => { order.push('reveal'); return { status: 200, data: { ...context(), deviceKey: key } }; }),
    rotateDeviceKeyV2: vi.fn(), registerDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn() };
  const transport = { request: vi.fn() }, guard = vi.fn(() => { if (!current) throw changed; });
  const client = new WiFiProvAdmin(store, management as any, transport, guard);
  const resume = vi.spyOn(client, 'resume');
  return { client, store, management, transport, guard, order, record, changed, resume,
    stored: () => stored!, loaded: () => loaded, setStored: (value: BleControllerCredential | undefined) => { stored = value; },
    setLoaded: (value: BleControllerCredential | undefined) => { loaded = value; }, retire: () => { current = false; } };
}
function readonly(h: ReturnType<typeof harness>) {
  expect(h.store.save).not.toHaveBeenCalled(); expect(h.store.findWiFiProv).not.toHaveBeenCalled(); expect(h.resume).not.toHaveBeenCalled();
  expect(h.management.rotateDeviceKeyV2).not.toHaveBeenCalled(); expect(h.management.registerDirectAdminV2).not.toHaveBeenCalled();
  expect(h.management.resetDirectAdminV2).not.toHaveBeenCalled(); expect(h.transport.request).not.toHaveBeenCalled();
}
function cleared(h: ReturnType<typeof harness>) {
  const loaded = h.loaded();
  if (loaded?.controllerSecret instanceof Uint8Array) expect(loaded.controllerSecret.every(x => x === 0)).toBe(true);
  for (const presence of loaded?.presenceKeys ?? []) expect(presence.key.every(x => x === 0)).toBe(true);
}
afterEach(() => vi.restoreAllMocks());

describe('read-only existing WiFiProv Admin inspection', () => {
  it('admits explicit network-only reuse without reveal, writes, resume or secret exposure', async () => {
    const h = harness();
    await expect(h.client.inspectExistingNetwork(context(), info())).resolves.toEqual({ ...context(), accessEpoch: 7 });
    expect(h.order).toEqual(['load', 'admin-get']);
    expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled(); readonly(h); cleared(h);
    expect(h.stored().controllerSecret.some(Boolean)).toBe(true);
  });

  it('keeps pending, rotation, local CAS and fresh Admin fences in network-only inspection', async () => {
    for (const change of ['pending', 'rotation', 'permissions', 'local-cas', 'cloud-admin', 'physical-epoch']) {
      const h = harness(), physical = info();
      if (change === 'pending') h.stored().state = 'pending';
      if (change === 'rotation') h.stored().keyRotation = {} as any;
      if (change === 'permissions') h.stored().permissions = 3;
      if (change === 'local-cas') h.stored().cloudContext!.credentialVersion++;
      if (change === 'cloud-admin') h.record.accessEpoch++;
      if (change === 'physical-epoch') physical.accessEpoch++;
      await expect(h.client.inspectExistingNetwork(context(), physical)).rejects.toThrow();
      expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled(); readonly(h); cleared(h);
    }
  });

  it('rejects changed accounts and original read failures without network-only retry', async () => {
    for (const phase of ['load', 'admin']) for (const failure of ['account', 'unknown']) {
      const h = harness(), unknown = Object.assign(Error('original unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
      if (phase === 'load') h.store.load.mockImplementationOnce(async () => {
        const value = copy(h.stored()); h.setLoaded(value);
        if (failure === 'unknown') throw unknown;
        h.retire(); return value;
      });
      else h.management.getDirectAdminV2.mockImplementationOnce(async () => {
        if (failure === 'unknown') throw unknown;
        h.retire(); return h.record;
      });
      await expect(h.client.inspectExistingNetwork(context(), info())).rejects.toBe(failure === 'account' ? h.changed : unknown);
      expect(h.store.load).toHaveBeenCalledOnce();
      expect(h.management.getDirectAdminV2.mock.calls.length).toBeLessThanOrEqual(1);
      expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled(); readonly(h);
      if (!(phase === 'load' && failure === 'unknown')) cleared(h);
    }
  });

  it('loads only the requested credential, checks fresh Admin and CAS, then returns no secrets', async () => {
    const h = harness(), expected = context(), result = await h.client.inspectExisting(expected, info());
    expect(result).toEqual({ ...expected, accessEpoch: 7 }); expect(Object.keys(result).sort()).toEqual(['accessEpoch', 'credentialVersion', 'locator', 'logicalDeviceId']);
    expect(h.order).toEqual(['load', 'admin-get', 'reveal']); expect(h.store.load).toHaveBeenCalledExactlyOnceWith(id);
    expect(h.management.getDirectAdminV2).toHaveBeenCalledExactlyOnceWith(id);
    expect(h.management.revealDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(expected);
    readonly(h); cleared(h); expect(h.stored().controllerSecret.some(Boolean)).toBe(true);
    expect(h.stored().presenceKeys![0].key.some(Boolean)).toBe(true); expect(JSON.stringify(result)).not.toContain(key);
  });

  it('admits an active enrollment credential without Cloud metadata, including the store legacy source default', async () => {
    for (const source of ['enrollment', undefined] as const) {
      const h = harness(); h.stored().source = source; h.stored().cloudContext = undefined;
      await expect(h.client.inspectExisting(context(), info())).resolves.toEqual({ ...context(), accessEpoch: 7 }); readonly(h); cleared(h);
    }
  });

  it('refuses absent, pending, rotation, nonadmin or malformed credentials without discovery or repair', async () => {
    for (const change of ['absent', 'pending', 'rotation', 'permissions', 'version', 'logical', 'instance', 'epoch', 'controller-size', 'controller-zero',
      'secret-size', 'secret-zero', 'secret-type', 'missing-cloud', 'source']) {
      const h = harness(), value = h.stored();
      if (change === 'absent') h.setStored(undefined);
      if (change === 'pending') value.state = 'pending';
      if (change === 'rotation') value.keyRotation = {} as any;
      if (change === 'permissions') value.permissions = 3;
      if (change === 'version') value.credentialVersion = 2;
      if (change === 'logical') value.logicalDeviceId = 'device_22222222-2222-4222-8222-222222222222';
      if (change === 'instance') value.deviceInstanceId[0]++;
      if (change === 'epoch') value.accessEpoch++;
      if (change === 'controller-size') value.controllerId = new Uint8Array(15).fill(1);
      if (change === 'controller-zero') value.controllerId.fill(0);
      if (change === 'secret-size') value.controllerSecret = new Uint8Array(31).fill(1);
      if (change === 'secret-zero') value.controllerSecret.fill(0);
      if (change === 'secret-type') value.controllerSecret = undefined as any;
      if (change === 'missing-cloud') value.cloudContext = undefined;
      if (change === 'source') value.source = 'other' as any;
      await expect(h.client.inspectExisting(context(), info())).rejects.toThrow('WIFIPROV_EXISTING_ADMIN_REQUIRED');
      expect(h.management.getDirectAdminV2).not.toHaveBeenCalled(); expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled(); readonly(h); cleared(h);
    }
  });

  it('rejects nonphysical or incomplete existing roots before loading credentials', async () => {
    for (const change of ['instance-size', 'instance-zero', 'key', 'access', 'bootstrap', 'zero-epoch', 'large-epoch', 'fractional-epoch']) {
      const h = harness(), value = info();
      if (change === 'instance-size') value.deviceInstanceId = new Uint8Array(15).fill(1);
      if (change === 'instance-zero') value.deviceInstanceId.fill(0);
      if (change === 'key') value.hasDeviceKey = false;
      if (change === 'access') value.hasAccessState = false;
      if (change === 'bootstrap') value.supportsAccessBootstrap = false;
      if (change === 'zero-epoch') value.accessEpoch = 0;
      if (change === 'large-epoch') value.accessEpoch = 0x100000000;
      if (change === 'fractional-epoch') value.accessEpoch = 1.5;
      await expect(h.client.inspectExisting(context(), value)).rejects.toThrow('WIFIPROV_EXISTING_ROOT_REQUIRED');
      expect(h.store.load).not.toHaveBeenCalled(); readonly(h);
    }
  });

  it('rejects missing or mismatched fresh Cloud Admin metadata before revealing a Key', async () => {
    for (const change of ['missing', 'logical', 'controller', 'epoch', 'version']) {
      const h = harness();
      if (change === 'missing') h.management.getDirectAdminV2.mockResolvedValueOnce(null as any);
      if (change === 'logical') h.record.logicalDeviceId = 'other';
      if (change === 'controller') h.record.controllerId = base64UrlEncode(new Uint8Array(16).fill(9));
      if (change === 'epoch') h.record.accessEpoch++;
      if (change === 'version') h.record.credentialVersion++;
      await expect(h.client.inspectExisting(context(), info())).rejects.toThrow('WIFIPROV_ADMIN_EPOCH_CONFLICT');
      expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled(); readonly(h); cleared(h);
    }
  });

  it('requires exact optional credential CAS and exact revealed CAS/valid nonzero Key', async () => {
    for (const local of [true, false]) for (const change of ['version', 'locator']) {
      const h = harness();
      if (local) {
        if (change === 'version') h.stored().cloudContext!.credentialVersion = 5;
        else h.stored().cloudContext!.locator = base64UrlEncode(new Uint8Array(16).fill(2));
      }
      else h.management.revealDeviceKeyV2.mockResolvedValueOnce({ status: 200, data: { ...context(), deviceKey: key,
        ...(change === 'version' ? { credentialVersion: 5 } : { locator: base64UrlEncode(new Uint8Array(16).fill(2)) }) } });
      await expect(h.client.inspectExisting(context(), info())).rejects.toThrow('WIFIPROV_KEY_CONTEXT_CHANGED'); readonly(h); cleared(h);
      if (local) expect(h.management.getDirectAdminV2).not.toHaveBeenCalled();
    }
    const h = harness(); h.management.revealDeviceKeyV2.mockResolvedValueOnce({ status: 200, data: { ...context(), deviceKey: base64UrlEncode(new Uint8Array(32)) } });
    await expect(h.client.inspectExisting(context(), info())).rejects.toThrow('DEVICE_V2_BASE64URL_INVALID'); readonly(h); cleared(h);
  });

  it('copies caller context and physical info before the first asynchronous boundary', async () => {
    const h = harness(), expected = context(), physical = info(); let finish!: (value: BleControllerCredential) => void;
    h.store.load.mockImplementationOnce(() => new Promise<BleControllerCredential | undefined>(resolve => { finish = value => { h.setLoaded(value); resolve(value); }; }));
    const work = h.client.inspectExisting(expected, physical), loaded = copy(h.stored());
    expected.credentialVersion = 99; expected.locator = base64UrlEncode(new Uint8Array(16).fill(8)); physical.deviceInstanceId.fill(0); physical.accessEpoch = 99;
    finish(loaded); await expect(work).resolves.toEqual({ ...context(), accessEpoch: 7 });
    expect(h.management.revealDeviceKeyV2).toHaveBeenCalledWith(context()); readonly(h); cleared(h);
  });

  it('rejects account change at every awaited read and clears even a late loaded secret', async () => {
    for (const phase of ['load', 'admin', 'reveal']) {
      const h = harness();
      if (phase === 'load') h.store.load.mockImplementationOnce(async () => { const value = copy(h.stored()); h.setLoaded(value); h.retire(); return value; });
      if (phase === 'admin') h.management.getDirectAdminV2.mockImplementationOnce(async () => { h.retire(); return h.record; });
      if (phase === 'reveal') h.management.revealDeviceKeyV2.mockImplementationOnce(async () => { h.retire(); return { status: 200, data: { ...context(), deviceKey: key } }; });
      await expect(h.client.inspectExisting(context(), info())).rejects.toBe(h.changed); readonly(h); cleared(h);
      if (phase === 'load') expect(h.management.getDirectAdminV2).not.toHaveBeenCalled();
      if (phase !== 'reveal') expect(h.management.revealDeviceKeyV2).not.toHaveBeenCalled();
    }
  });

  it('propagates the original UNKNOWN from any read without retrying, replaying or replacing it', async () => {
    for (const phase of ['load', 'admin', 'reveal']) {
      const h = harness(), unknown = Object.assign(Error('original unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
      if (phase === 'load') h.store.load.mockRejectedValueOnce(unknown);
      if (phase === 'admin') h.management.getDirectAdminV2.mockRejectedValueOnce(unknown);
      if (phase === 'reveal') h.management.revealDeviceKeyV2.mockRejectedValueOnce(unknown);
      await expect(h.client.inspectExisting(context(), info())).rejects.toBe(unknown); readonly(h); cleared(h);
      expect(h.store.load).toHaveBeenCalledOnce(); expect(h.management.getDirectAdminV2.mock.calls.length).toBeLessThanOrEqual(1);
      expect(h.management.revealDeviceKeyV2.mock.calls.length).toBeLessThanOrEqual(1);
    }
  });

  it('refuses an already stale account or malformed CAS before touching secure storage', async () => {
    const stale = harness(); stale.retire(); await expect(stale.client.inspectExisting(context(), info())).rejects.toBe(stale.changed);
    expect(stale.store.load).not.toHaveBeenCalled(); readonly(stale);
    for (const value of [{ ...context(), credentialVersion: 0 }, { ...context(), locator: base64UrlEncode(new Uint8Array(16)) }, { ...context(), logicalDeviceId: 'other' }]) {
      const h = harness(); await expect(h.client.inspectExisting(value, info())).rejects.toThrow(); expect(h.store.load).not.toHaveBeenCalled(); readonly(h);
    }
  });
});
