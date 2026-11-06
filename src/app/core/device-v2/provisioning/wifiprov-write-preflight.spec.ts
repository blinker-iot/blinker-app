import type { BleControllerCredential } from '../ble-direct/credential-store';
import type { BlinkerConfigInfo } from './esp32-wifiprov';
import { assertWiFiProvWritePreflight } from './wifiprov-write-preflight';

describe('isolated SoftAP write preflight is read-only and cannot replay an identity', () => {
  const info: BlinkerConfigInfo = { deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 0,
    hasDeviceKey: false, hasAccessState: false, supportsAccessBootstrap: true };
  function setup() {
    const allocations = { load: vi.fn(async (_instance: Uint8Array) => undefined as unknown) };
    const credentials = {
      inspectForProvisioning: vi.fn(async (_instance: Uint8Array) => ({ hasAny: false, hasUnconfirmed: false })),
      findWiFiProv: vi.fn(async (_instance: Uint8Array) => undefined as BleControllerCredential | undefined),
    };
    const current = vi.fn();
    const run = (value = info) => assertWiFiProvWritePreflight(value, allocations as any, credentials, current);
    return { allocations, credentials, current, run };
  }
  const credential = (state: 'pending' | 'active' = 'active'): BleControllerCredential => ({
    source: 'wifiprov', state, logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111',
    deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 1, controllerId: new Uint8Array(16).fill(2),
    controllerSecret: new Uint8Array(32).fill(3), credentialVersion: 1, permissions: 15,
    intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array(),
  });
  it('only reads a fresh empty root and detaches lookup bytes', async () => {
    const f = setup(); await f.run();
    expect(f.allocations.load).toHaveBeenCalledExactlyOnceWith(info.deviceInstanceId);
    expect(f.credentials.inspectForProvisioning).toHaveBeenCalledExactlyOnceWith(info.deviceInstanceId);
    expect(f.credentials.findWiFiProv).not.toHaveBeenCalled();
    expect(f.allocations.load.mock.calls[0][0]).not.toBe(info.deviceInstanceId);
  });
  it.each([{}, { context: { logicalDeviceId: 'old' } }])('blocks an existing allocation without replay or deletion', async record => {
    const f = setup(); f.allocations.load.mockResolvedValue(record);
    await expect(f.run()).rejects.toMatchObject({ code: 'WIFIPROV_IDENTITY_UNCONFIRMED' });
    expect(f.credentials.inspectForProvisioning).not.toHaveBeenCalled();
  });
  it.each(['pending', 'prepared', 'key-ready'])('retains %s Admin/rotation without advancing it', async state => {
    const f = setup(), value = credential(state === 'pending' ? 'pending' : 'active');
    if (state !== 'pending') value.keyRotation = { phase: state as 'prepared' | 'key-ready' } as any;
    f.credentials.inspectForProvisioning.mockResolvedValue({ hasAny: true, hasUnconfirmed: true });
    await expect(f.run()).rejects.toMatchObject({ code: 'WIFIPROV_IDENTITY_UNCONFIRMED' });
    expect(f.credentials.findWiFiProv).not.toHaveBeenCalled();
  });
  it('blocks a known active identity whose physical root now appears empty', async () => {
    const f = setup(); f.credentials.inspectForProvisioning.mockResolvedValue({ hasAny: true, hasUnconfirmed: false });
    await expect(f.run()).rejects.toMatchObject({ code: 'WIFIPROV_DEVICE_CONTEXT_CHANGED' });
  });
  it('requires a local credential for a complete existing root, without treating the read as authentication', async () => {
    const full = { ...info, accessEpoch: 1, hasDeviceKey: true, hasAccessState: true }, f = setup();
    await expect(f.run(full)).rejects.toMatchObject({ code: 'WIFIPROV_ADMIN_CREDENTIAL_REQUIRED' });
    const value = credential(); f.credentials.findWiFiProv.mockResolvedValue(value);
    await expect(f.run(full)).resolves.toBeUndefined();
    expect(value.controllerSecret.every(v => v === 0)).toBe(true);
  });
  it('keeps an unknown storage failure unchanged and never interprets it as a new transaction', async () => {
    const f = setup(), unknown = { code: 'PROVISIONING_RESULT_UNKNOWN', requestId: 'retained' };
    f.allocations.load.mockRejectedValue(unknown); await expect(f.run()).rejects.toBe(unknown);
    expect(f.credentials.inspectForProvisioning).not.toHaveBeenCalled();
  });
  it('clears loaded secrets when the account/owner retires while storage is pending', async () => {
    const f = setup(), value = credential(); f.credentials.findWiFiProv.mockImplementation(async () => {
      f.current.mockImplementation(() => { throw Error('retired'); }); return value;
    });
    await expect(f.run({ ...info, hasAccessState: true, hasDeviceKey: true, accessEpoch: 1 })).rejects.toThrow('retired');
    expect(value.controllerSecret.every(v => v === 0)).toBe(true);
  });
});
