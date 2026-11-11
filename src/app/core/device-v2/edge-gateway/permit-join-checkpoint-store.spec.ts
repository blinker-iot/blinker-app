const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    setItem: async (key: string, value: string) => storage.set(key, value),
    getItem: async (key: string) => storage.get(key) ?? null,
    keys: async () => [...storage.keys()],
    removeItem: async (key: string) => storage.delete(key),
  },
}));

import { CapacitorEdgeGatewayPermitJoinCheckpointStore } from './permit-join-checkpoint-store';

describe('Permit-join checkpoint store', () => {
  const accountA = { authority: 'https://gateway.test', accountId: 'account-a' };
  const accountB = { authority: 'https://gateway.test', accountId: 'account-b' };

  beforeEach(() => storage.clear());

  it('persists only operation cleanup identity and removes it at terminal close', async () => {
    const store = new CapacitorEdgeGatewayPermitJoinCheckpointStore(() => accountA);
    const operationId = new Uint8Array(16).fill(0x11);
    await store.save({
      operationId,
      edgeHubLogicalDeviceId: 'device_hub',
      adapterId: 1,
    });

    await expect(store.list()).resolves.toEqual([{
      operationId,
      edgeHubLogicalDeviceId: 'device_hub',
      adapterId: 1,
    }]);
    expect([...storage.values()][0]).not.toContain('candidate');
    expect([...storage.values()][0]).not.toContain('fragment');
    await store.remove(operationId);
    await expect(store.list()).resolves.toEqual([]);
  });

  it('does not recover another account permit-join window', async () => {
    const operationId = new Uint8Array(16).fill(0x22);
    const storeA = new CapacitorEdgeGatewayPermitJoinCheckpointStore(() => accountA);
    await storeA.save({ operationId, edgeHubLogicalDeviceId: 'device_hub', adapterId: 1 });

    await expect(new CapacitorEdgeGatewayPermitJoinCheckpointStore(() => accountB).list())
      .resolves.toEqual([]);
    await expect(storeA.list()).resolves.toHaveLength(1);
  });
});
