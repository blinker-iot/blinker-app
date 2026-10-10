import { describe, expect, it, vi } from 'vitest';
import { WiFiProvRetirement } from './wifiprov-retirement';

const id = 'device_11111111-1111-4111-8111-111111111111', instance = new Uint8Array(16).fill(1);
const info = { supportsAccessBootstrap: true, hasDeviceKey: false, hasAccessState: false, accessEpoch: 0, deviceInstanceId: instance };
function harness() {
  let current = true;
  const store = { findDevice: vi.fn(async () => instance), load: vi.fn(async () => ({ context: { logicalDeviceId: id } })),
    complete: vi.fn().mockResolvedValue(undefined) };
  const credentials = { load: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
  const management = { deleteDeviceV2: vi.fn(async () => ({ status: 202, data: { logicalDeviceId: id,
    state: 'deleted', cloudAuthorization: 'revoked', localAccess: 'not_confirmed' } })),
    readDeviceStateV2: vi.fn().mockResolvedValue('deleted') };
  const client = new WiFiProvRetirement(store as any, credentials as any, management as any, () => {
    if (!current) throw Error('ACCOUNT_CHANGED');
  });
  const confirm = vi.fn().mockResolvedValue(true);
  return { client, store, credentials, management, confirm, leave: () => { current = false; } };
}
function credential() {
  return { source: 'wifiprov', logicalDeviceId: id, deviceInstanceId: instance.slice(),
    controllerSecret: new Uint8Array(32).fill(3), presenceKeys: [{ key: new Uint8Array(32).fill(4) }] };
}

describe('WiFiProv exact allocation retirement', () => {
  it('confirms cloud deletion before retiring only its matching native Admin and journal', async () => {
    const h = harness(), value = credential(); h.credentials.load.mockResolvedValue(value);
    const result = await h.client.removeOwned(id);
    expect(result.allocationCleanupPending).toBe(false);
    expect(h.management.deleteDeviceV2).toHaveBeenCalledExactlyOnceWith(id);
    expect(h.credentials.remove).toHaveBeenCalledExactlyOnceWith(id);
    expect(h.store.complete).toHaveBeenCalledExactlyOnceWith(instance, id);
    expect(h.management.deleteDeviceV2.mock.invocationCallOrder[0]).toBeLessThan(h.credentials.remove.mock.invocationCallOrder[0]);
    expect(h.credentials.remove.mock.invocationCallOrder[0]).toBeLessThan(h.store.complete.mock.invocationCallOrder[0]);
    expect(value.controllerSecret.some(Boolean)).toBe(false);
    expect(result.response.data.localAccess).toBe('not_confirmed');
  });

  it.each(['unknown-delete', 'account-changed'])('does not retire after %s', async failure => {
    const h = harness();
    if (failure === 'unknown-delete') h.management.deleteDeviceV2.mockRejectedValue(Error('timeout'));
    else h.management.deleteDeviceV2.mockImplementationOnce(async () => { h.leave(); return {} as any; });
    await expect(h.client.removeOwned(id)).rejects.toThrow();
    expect(h.store.findDevice).not.toHaveBeenCalled();
    expect(h.store.complete).not.toHaveBeenCalled();
  });

  it('does not touch an Admin if no allocation journal identifies this device', async () => {
    const h = harness(); h.store.findDevice.mockResolvedValue(undefined as any);
    expect((await h.client.removeOwned(id)).allocationCleanupPending).toBe(false);
    expect(h.credentials.load).not.toHaveBeenCalled();
    expect(h.store.complete).not.toHaveBeenCalled();
  });

  it.each(['source', 'instance', 'logical-id', 'remove-fails', 'journal-fails'])('retains retry evidence after %s', async failure => {
    const h = harness(), value = credential();
    if (failure === 'source') value.source = 'enrollment';
    if (failure === 'instance') value.deviceInstanceId.fill(2);
    if (failure === 'logical-id') value.logicalDeviceId = 'another';
    h.credentials.load.mockResolvedValue(value);
    if (failure === 'remove-fails') h.credentials.remove.mockRejectedValue(Error('disk'));
    if (failure === 'journal-fails') h.store.complete.mockRejectedValue(Error('disk'));
    expect((await h.client.removeOwned(id)).allocationCleanupPending).toBe(true);
    if (failure !== 'journal-fails') expect(h.store.complete).not.toHaveBeenCalled();
    if (!failure.endsWith('fails')) expect(h.credentials.remove).not.toHaveBeenCalled();
    expect(value.controllerSecret.some(Boolean)).toBe(false);
  });

  it('retries after Admin removal succeeded but journal deletion failed', async () => {
    const h = harness(); h.credentials.load.mockResolvedValueOnce(credential());
    h.store.complete.mockRejectedValueOnce(Error('disk'));
    expect((await h.client.removeOwned(id)).allocationCleanupPending).toBe(true);
    await h.client.recoverRemoved(info, h.confirm);
    expect(h.management.deleteDeviceV2).toHaveBeenCalledTimes(2);
    expect(h.credentials.remove).toHaveBeenCalledTimes(1);
    expect(h.store.complete).toHaveBeenCalledTimes(2);
    expect(h.confirm).toHaveBeenCalledOnce();
  });

  it.each(['live-key', 'live-access', 'no-bootstrap', 'epoch'])('never clears an installed/invalid physical root: %s', async state => {
    const h = harness(); const changed = { ...info, ...(state === 'live-key' ? { hasDeviceKey: true }
      : state === 'live-access' ? { hasAccessState: true } : state === 'epoch' ? { accessEpoch: 1 } : { supportsAccessBootstrap: false }) };
    await h.client.recoverRemoved(changed, h.confirm);
    expect(h.store.load).not.toHaveBeenCalled();
    expect(h.management.deleteDeviceV2).not.toHaveBeenCalled();
  });

  it.each(['active', 'no-context', 'lookup-fails', 'cancel', 'account-changed'])('requires actual deletion and explicit consent: %s', async state => {
    const h = harness();
    if (state === 'active') h.management.readDeviceStateV2.mockResolvedValue('active');
    if (state === 'no-context') h.store.load.mockResolvedValue({} as any);
    if (state === 'lookup-fails') h.management.readDeviceStateV2.mockRejectedValue(Error('404 or offline'));
    if (state === 'cancel') h.confirm.mockResolvedValue(false);
    if (state === 'account-changed') h.confirm.mockImplementation(async () => { h.leave(); return true; });
    if (state === 'active' || state === 'no-context') await h.client.recoverRemoved(info, h.confirm);
    else await expect(h.client.recoverRemoved(info, h.confirm)).rejects.toThrow();
    expect(h.management.deleteDeviceV2).not.toHaveBeenCalled();
    expect(h.store.complete).not.toHaveBeenCalled();
  });
});
