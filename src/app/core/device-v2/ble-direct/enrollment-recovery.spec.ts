import { BleDirectClient } from './client';
import { BleControllerCredential } from './credential-store';

function harness(confirmed = true) {
  const stored: BleControllerCredential = {
    state: 'pending', logicalDeviceId: 'ble_' + 'A'.repeat(22),
    deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 1,
    controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 15,
    intentId: new Uint8Array(16).fill(4), commitId: new Uint8Array(16).fill(5),
    receipt: new Uint8Array(145).fill(6), method2Confirmed: confirmed,
  };
  const store = { load: vi.fn(async () => ({ ...stored, controllerSecret: stored.controllerSecret.slice() })), save: vi.fn(async () => undefined), remove: vi.fn() };
  const api = { commit: vi.fn(async () => ({ logicalDeviceId: stored.logicalDeviceId, accessEpoch: 1, controllerId: stored.controllerId, state: 'active' })), cancel: vi.fn() };
  const client = new BleDirectClient({} as any, api as any, store as any);
  return { stored, store, api, client };
}
describe('pending BLE enrollment recovery', () => {
  it('replays the exact confirmed commit before needing live hardware', async () => {
    const { stored, store, api, client } = harness();
    await expect(client.replayPendingCommit(stored.logicalDeviceId)).resolves.toBe(true);
    expect(api.commit).toHaveBeenCalledWith(stored.intentId, stored.commitId, stored.receipt);
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'active' }));
    expect(api.cancel).not.toHaveBeenCalled();
  });
  it('requires Method 2 before first commit and preserves pending material after refusal', async () => {
    const unconfirmed = harness(false);
    await expect(unconfirmed.client.replayPendingCommit(unconfirmed.stored.logicalDeviceId)).resolves.toBe(false);
    expect(unconfirmed.api.commit).not.toHaveBeenCalled();
    const refused = harness();
    refused.api.commit.mockRejectedValueOnce(new Error('quota'));
    await expect(refused.client.replayPendingCommit(refused.stored.logicalDeviceId)).rejects.toThrow('quota');
    expect(refused.store.save).not.toHaveBeenCalled();
    expect(refused.store.remove).not.toHaveBeenCalled();
    expect(refused.api.cancel).not.toHaveBeenCalled();
  });
});
