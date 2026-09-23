import { CapacitorBleControllerCredentialStore, BleControllerCredential } from './credential-store';

const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    setItem: async (key: string, value: string) => { values.set(key, value); },
    getItem: async (key: string) => values.get(key) ?? null,
    keys: async () => [...values.keys()],
    removeItem: async (key: string) => { values.delete(key); },
  },
}));

function credential(logicalDeviceId: string): BleControllerCredential {
  return {
    state: 'pending', logicalDeviceId, deviceInstanceId: new Uint8Array(16).fill(1),
    accessEpoch: 2, controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 15, intentId: new Uint8Array(16).fill(4),
    commitId: new Uint8Array(16).fill(5), receipt: new Uint8Array(145).fill(6),
    method2Confirmed: true, legacySource: { sourceCollection: 'devices', sourceId: 'a'.repeat(24) },
  };
}
describe('replacement credential persistence in mocked SecureStorage', () => {
  beforeEach(() => values.clear());
  it('round-trips the old recovery backup and exposes only the latest pending enrollment', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => ({ authority: 'https://api.example.test', accountId: 'account-a' }));
    const previous = credential('ble_AQEBAQEBAQEBAQEBAQEBAQ');
    const current = { ...credential('ble_AgICAgICAgICAgICAgICAg'), previousEnrollment: previous };
    await store.save(previous);
    await store.save(current);
    const loaded = await store.load(current.logicalDeviceId);
    expect(loaded?.previousEnrollment).toMatchObject(previous);
    expect(loaded?.method2Confirmed).toBe(true);
    expect(await store.listPending()).toEqual([current.logicalDeviceId]);
  });
  it('keeps both generations when an existing logical device is reused', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => ({ authority: 'https://api.example.test', accountId: 'account-a' }));
    const previous = credential('ble_AQEBAQEBAQEBAQEBAQEBAQ');
    const current = { ...credential(previous.logicalDeviceId), accessEpoch: 3, previousEnrollment: previous };
    await store.save(current);
    const loaded = await store.load(current.logicalDeviceId);
    expect(loaded?.accessEpoch).toBe(3);
    expect(loaded?.previousEnrollment?.accessEpoch).toBe(2);
    expect(await store.listPending()).toEqual([current.logicalDeviceId]);
  });
  it('keeps migration pending credentials isolated by both account and authority', async () => {
    const scope = { authority: 'https://api.example.test', accountId: 'account-a' };
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    const previous = credential('ble_AQEBAQEBAQEBAQEBAQEBAQ');
    const current = { ...credential('ble_AgICAgICAgICAgICAgICAg'), previousEnrollment: previous };
    await store.save(current);
    scope.accountId = 'account-b';
    expect(await store.listPending()).toEqual([]);
    expect(await store.load(current.logicalDeviceId)).toBeUndefined();
    expect(await store.findPending(current.deviceInstanceId)).toBeUndefined();
    scope.accountId = 'account-a';
    scope.authority = 'https://other.example.test';
    expect(await store.listPending()).toEqual([]);
    scope.authority = 'https://api.example.test';
    expect(await store.listPending()).toEqual([current.logicalDeviceId]);
    const key = [...values.keys()][0];
    const stored = JSON.parse(values.get(key)!);
    stored.previousEnrollment.accountId = 'account-b';
    values.set(key, JSON.stringify(stored));
    await expect(store.load(current.logicalDeviceId)).rejects.toThrow('BLE_DIRECT_CREDENTIAL_CORRUPT');
  });

});
