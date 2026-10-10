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

import { CapacitorEdgeGatewayEnrollmentCheckpointStore } from './enrollment-checkpoint-store';

describe('Gateway enrollment checkpoint store', () => {
  const accountA = { authority: 'https://gateway.test', accountId: 'account-a' };
  const accountB = { authority: 'https://gateway.test', accountId: 'account-b' };

  beforeEach(() => storage.clear());

  it('persists only the exact Hub-child workflow identity', async () => {
    const store = new CapacitorEdgeGatewayEnrollmentCheckpointStore(() => accountA);
    await store.save({
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
    });

    await expect(store.list()).resolves.toEqual([{
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
    }]);
    const encoded = [...storage.values()][0]!;
    expect(encoded).not.toContain('secret');
    expect(encoded).not.toContain('credential');
    expect(encoded).not.toContain('operationId');

    await store.remove('device_child');
    await expect(store.list()).resolves.toEqual([]);
  });

  it('keeps recovery workflow metadata account scoped', async () => {
    const storeA = new CapacitorEdgeGatewayEnrollmentCheckpointStore(() => accountA);
    await storeA.save({
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
    });

    await expect(new CapacitorEdgeGatewayEnrollmentCheckpointStore(() => accountB).list())
      .resolves.toEqual([]);
    await expect(storeA.list()).resolves.toHaveLength(1);
  });
});
