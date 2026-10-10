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

import { CapacitorEdgeGatewayAttachCheckpointStore } from './checkpoint-store';

describe('Gateway attachment checkpoint store', () => {
  const accountA = { authority: 'https://gateway.test', accountId: 'account-a' };
  const accountB = { authority: 'https://gateway.test', accountId: 'account-b' };

  beforeEach(() => storage.clear());

  it('persists no-secret operation identity only for its account', async () => {
    const operationId = new Uint8Array(16).fill(0x11);
    const checkpoint = {
      operationId,
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
      childDeviceInstanceId: new Uint8Array(16).fill(0x22),
    };
    const storeA = new CapacitorEdgeGatewayAttachCheckpointStore(() => accountA);
    await storeA.save(checkpoint);

    await expect(storeA.load(operationId)).resolves.toEqual(checkpoint);
    await expect(storeA.list()).resolves.toEqual([checkpoint]);
    await expect(new CapacitorEdgeGatewayAttachCheckpointStore(() => accountB).list())
      .resolves.toEqual([]);
    const encoded = [...storage.values()][0]!;
    expect(encoded).not.toContain('secret');
    expect(encoded).not.toContain('credential');

    await storeA.remove(operationId);
    await expect(storeA.list()).resolves.toEqual([]);
  });
});
