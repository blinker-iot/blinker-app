import { GatewayHttpError } from '../../model/response.model';
import { encodeCanonicalByteString, encodeCanonicalMap, encodeCanonicalUnsigned } from '../../protocol/device-v2';
import { BleDirectClient } from './client';
import { BleControllerCredential } from './credential-store';
import { NoiseNnInitiator } from './crypto';
import { BleApplicationMode, LocalSecureRecordType, encodeLocalSecureRecord } from './wire';

const source = { sourceCollection: 'devices' as const, sourceId: 'a'.repeat(24) };
const original: BleControllerCredential = {
  state: 'pending', logicalDeviceId: 'ble_' + 'A'.repeat(22), legacySource: source,
  deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 1,
  controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
  credentialVersion: 1, permissions: 15, intentId: new Uint8Array(16).fill(4),
  commitId: new Uint8Array(16).fill(5), receipt: new Uint8Array(145).fill(6), method2Confirmed: true,
};
const expired = () => new GatewayHttpError({ httpStatus: 410, code: 'DEVICE_V2_BLE_ENROLLMENT_EXPIRED', message: 'expired' });

function setup(instance = original.deviceInstanceId, accessEpoch = 2) {
  const locator = new Uint8Array(8).fill(8);
  const hello = encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(2)], [1, encodeCanonicalUnsigned(2)], [2, encodeCanonicalUnsigned(1)],
    [3, encodeCanonicalByteString(instance)], [4, encodeCanonicalByteString(new Uint8Array(16).fill(7))],
    [5, encodeCanonicalByteString(locator)], [6, encodeCanonicalUnsigned(accessEpoch)],
    [7, encodeCanonicalUnsigned(1)], [8, encodeCanonicalUnsigned(1)], [9, encodeCanonicalUnsigned(1)],
  ]);
  vi.spyOn(NoiseNnInitiator, 'create').mockResolvedValueOnce({
    writeInitiator: async () => new Uint8Array(32).fill(9),
    readResponder: async () => hello,
    transcriptHash: () => new Uint8Array(32).fill(10),
    clear: vi.fn(),
  } as any);
  const api = {
    commit: vi.fn(async () => { throw expired(); }),
    issue: vi.fn(async () => { throw new Error('NEW_GRANT_REQUESTED'); }),
    cancel: vi.fn(),
  };
  const store = {
    load: vi.fn(async () => structuredClone(original)), save: vi.fn(), remove: vi.fn(),
  };
  const link = {
    connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined), sendRecord: vi.fn(async () => undefined),
    receiveRecord: vi.fn(async () => encodeLocalSecureRecord(LocalSecureRecordType.ResponderHandshake, new Uint8Array(32).fill(1))),
  };
  const client = new BleDirectClient(link as any, api as any, store as any);
  const target = { device: { deviceId: 'test' }, profile: { mode: BleApplicationMode.Provisioning, wireVersion: 2, capabilities: 7, modeLocator: locator } };
  const options = { displayName: 'Lamp', legacySource: source, replacePendingLogicalDeviceId: original.logicalDeviceId };
  return { api, store, client, target, options };
}

describe('same-device replacement enrollment', () => {
  afterEach(() => vi.restoreAllMocks());

  it('only requests a replacement grant after server expiry and matching real setup identity', async () => {
    const { api, store, client, target, options } = setup();
    await expect(client.enroll(target, options)).rejects.toThrow('NEW_GRANT_REQUESTED');
    expect(api.commit.mock.calls[0].map((value: Uint8Array) => Array.from(value)))
      .toEqual([original.intentId, original.commitId, original.receipt].map(value => Array.from(value)));
    expect(api.issue).toHaveBeenCalledWith(expect.objectContaining({ legacySource: source, deviceInstanceId: original.deviceInstanceId, accessEpoch: 2 }));
    expect(store.remove).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('does not replace an already committed enrollment even when the user expected expiry', async () => {
    const { api, store, client, target, options } = setup();
    api.commit.mockResolvedValueOnce({ logicalDeviceId: original.logicalDeviceId, accessEpoch: 1, controllerId: original.controllerId, state: 'active' } as never);
    await expect(client.enroll(target, options)).rejects.toThrow('BLE_DIRECT_REPLACEMENT_ALREADY_REGISTERED');
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'active' }));
    expect(api.issue).not.toHaveBeenCalled();
  });

  it('rejects a different physical device and retains the original recovery material', async () => {
    const { api, store, client, target, options } = setup(new Uint8Array(16).fill(11));
    await expect(client.enroll(target, options)).rejects.toThrow('BLE_DIRECT_REPLACEMENT_CONTEXT_MISMATCH');
    expect(api.issue).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('retains the original pending credentials when the server cannot confirm its result', async () => {
    const { api, store, client, target, options } = setup();
    api.commit.mockRejectedValueOnce(new Error('offline'));
    await expect(client.enroll(target, options)).rejects.toThrow('offline');
    expect(api.issue).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('terminates an unconfirmed grant only after explicit same-device setup replacement', async () => {
    const { api, store, client, target, options } = setup(original.deviceInstanceId, original.accessEpoch);
    store.load.mockResolvedValueOnce({ ...structuredClone(original), method2Confirmed: false });
    api.cancel.mockResolvedValueOnce({
      intentId: original.intentId, logicalDeviceId: original.logicalDeviceId,
      deviceInstanceId: original.deviceInstanceId, accessEpoch: original.accessEpoch,
      controllerId: original.controllerId, state: 'cancelled',
    });
    await expect(client.enroll(target, options)).rejects.toThrow('NEW_GRANT_REQUESTED');
    expect(api.cancel).toHaveBeenCalledOnce();
    expect(api.commit).not.toHaveBeenCalled();
    expect(api.issue).toHaveBeenCalledOnce();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('retains the nested old backup until the replacement commit is confirmed', async () => {
    const current = { ...structuredClone(original), logicalDeviceId: 'ble_' + 'B'.repeat(22), previousEnrollment: structuredClone(original) };
    const store = { load: vi.fn(async () => structuredClone(current)), save: vi.fn(), remove: vi.fn() };
    const api = { commit: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      logicalDeviceId: current.logicalDeviceId, accessEpoch: 1, controllerId: current.controllerId, state: 'active',
    }) };
    const client = new BleDirectClient({} as any, api as any, store as any);
    await expect(client.replayPendingCommit(current.logicalDeviceId)).rejects.toThrow('offline');
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    await expect(client.replayPendingCommit(current.logicalDeviceId)).resolves.toBe(true);
    expect(store.remove).toHaveBeenCalledWith(original.logicalDeviceId);
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'active', previousEnrollment: undefined }));
  });
  it.each([true, false])('accepts explicit server retirement only after a new setup epoch (confirmed=%s)', async confirmed => {
    const { api, store, client, target, options } = setup();
    store.load.mockResolvedValueOnce({ ...structuredClone(original), method2Confirmed: confirmed });
    const retired = new GatewayHttpError({ httpStatus: 410, code: 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED', message: 'retired' });
    (confirmed ? api.commit : api.cancel).mockRejectedValueOnce(retired);
    await expect(client.enroll(target, options)).rejects.toThrow('NEW_GRANT_REQUESTED');
    expect(api.issue).toHaveBeenCalledOnce();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it.each(['different-device', 'same-epoch'])('does not let retirement bypass physical setup validation: %s', async mismatch => {
    const { api, store, client, target, options } = setup(
      mismatch === 'different-device' ? new Uint8Array(16).fill(11) : original.deviceInstanceId,
      mismatch === 'same-epoch' ? original.accessEpoch : 2,
    );
    api.commit.mockRejectedValueOnce(new GatewayHttpError({
      httpStatus: 410, code: 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED', message: 'retired',
    }));
    await expect(client.enroll(target, options)).rejects.toThrow();
    expect(api.issue).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

});
