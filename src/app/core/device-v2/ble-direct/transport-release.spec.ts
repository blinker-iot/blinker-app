import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  connect: vi.fn(async () => undefined),
  getServices: vi.fn(async () => { throw Error('GATT_SERVICE_FAILED'); }),
  stopNotifications: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => { throw Error('private native detail'); }),
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: native, ScanMode: { SCAN_MODE_LOW_LATENCY: 2 } }));
import { CapacitorBleDirectRecordLink } from './transport';
import { BleApplicationMode } from './wire';

// Isolated module lifetime: never reset the production quarantine to make
// later tests pass. A new link/account is not evidence of a native release.
it('rejected native close is visible, idempotent and prevents a successor link acquiring the SDK', async () => {
  const target = { device: { deviceId: 'test' }, profile: { mode: BleApplicationMode.Direct,
    wireVersion: 3, capabilities: 0x51, modeLocator: new Uint8Array(8).fill(1) } };
  const link = new CapacitorBleDirectRecordLink();
  await expect(link.connect(target)).rejects.toThrow('GATT_SERVICE_FAILED');
  await expect(link.disconnect()).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
  await expect(link.disconnect()).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
  const next = new CapacitorBleDirectRecordLink();
  await expect(next.connect(target)).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
  expect(native.connect).toHaveBeenCalledOnce(); expect(native.disconnect).toHaveBeenCalledOnce();
});
