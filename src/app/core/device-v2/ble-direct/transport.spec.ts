import { beforeEach, describe, expect, it, vi } from 'vitest';

const bleClient = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  requestLEScan: vi.fn(async (
    _options: unknown,
    _callback: (result: any) => void,
  ) => undefined),
  stopLEScan: vi.fn(async () => undefined),
  connect: vi.fn(async () => undefined),
  isBonded: vi.fn(async () => false),
  createBond: vi.fn(async () => undefined),
  getServices: vi.fn(async () => [{
    uuid: '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32',
    characteristics: [
      {
        uuid: '5f6d0002-3f5b-4e4f-9f4d-626c696e6b32',
        properties: { write: true, writeWithoutResponse: true },
      },
      {
        uuid: '5f6d0003-3f5b-4e4f-9f4d-626c696e6b32',
        properties: { notify: true, indicate: false },
      },
    ],
  }]),
  getMtu: vi.fn(async () => 23),
  startNotifications: vi.fn(async () => undefined),
  stopNotifications: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
}));

vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: bleClient,
  ScanMode: { SCAN_MODE_LOW_LATENCY: 2 },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
}));

import { BleApplicationMode } from './wire';
import { CapacitorBleDirectRecordLink, discoverBlinkerDevice } from './transport';

describe('BLE Direct transport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not request Android location permission for BLE discovery', async () => {
    await expect(discoverBlinkerDevice(BleApplicationMode.Provisioning, 1))
      .rejects.toThrow('BLE_DIRECT_SCAN_TIMEOUT');

    expect(bleClient.initialize).toHaveBeenCalledWith({ androidNeverForLocation: true });
  });

  it('skips Direct candidates already rejected by Method 2', async () => {
    const profile = new DataView(Uint8Array.of(
      1, BleApplicationMode.Direct, 2, 0x11, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ).buffer);
    bleClient.requestLEScan.mockImplementationOnce(async (
      _options: unknown,
      callback: (result: any) => void,
    ) => {
      callback({
        device: { deviceId: 'rejected' },
        serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile },
      });
      callback({
        device: { deviceId: 'candidate' },
        serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile },
      });
    });

    await expect(discoverBlinkerDevice(
      BleApplicationMode.Direct,
      100,
      new Set(['rejected']),
    )).resolves.toMatchObject({ device: { deviceId: 'candidate' } });
  });

  it('cancels an in-flight scan when its page leaves', async () => {
    const abort = new AbortController();
    const discovery = discoverBlinkerDevice(
      BleApplicationMode.Direct, 1000, new Set(), abort.signal,
    );
    await vi.waitFor(() => expect(bleClient.requestLEScan).toHaveBeenCalled());
    abort.abort();

    await expect(discovery).rejects.toThrow('BLE_DIRECT_SCAN_CANCELLED');
    expect(bleClient.stopLEScan).toHaveBeenCalled();
  });

  it('does not start a scan when discovery is already cancelled', async () => {
    const abort = new AbortController();
    abort.abort();

    await expect(discoverBlinkerDevice(
      BleApplicationMode.Direct, 1000, new Set(), abort.signal,
    )).rejects.toThrow('BLE_DIRECT_SCAN_CANCELLED');
    expect(bleClient.requestLEScan).not.toHaveBeenCalled();
    expect(bleClient.stopLEScan).not.toHaveBeenCalled();
  });

  it('lets encrypted characteristic access drive Android link security', async () => {
    const link = new CapacitorBleDirectRecordLink();
    await link.connect({
      device: { deviceId: 'AA:BB:CC:DD:EE:FF' },
      profile: {
        mode: BleApplicationMode.Provisioning,
        wireVersion: 1,
        capabilities: 0x0f,
        setupSessionLocator: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
      },
    });

    expect(bleClient.connect).toHaveBeenCalledOnce();
    expect(bleClient.createBond).not.toHaveBeenCalled();
    expect(bleClient.getServices).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
  });

  it('does not retire an authenticated session merely because it is idle', async () => {
    vi.useFakeTimers();
    try {
      const link = new CapacitorBleDirectRecordLink();
      await link.connect({
        device: { deviceId: 'AA:BB:CC:DD:EE:FF' },
        profile: {
          mode: BleApplicationMode.Direct,
          wireVersion: 1,
          capabilities: 0x11,
          setupSessionLocator: new Uint8Array(8),
        },
      });

      let settled = false;
      const receive = link.receiveRecord(0).finally(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);

      await link.disconnect();
      await expect(receive).rejects.toThrow('BLE_DIRECT_DISCONNECTED');
    } finally {
      vi.useRealTimers();
    }
  });
});
