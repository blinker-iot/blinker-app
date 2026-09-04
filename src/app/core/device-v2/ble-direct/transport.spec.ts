import { beforeEach, describe, expect, it, vi } from 'vitest';

const bleClient = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  requestLEScan: vi.fn(async (
    _options: unknown,
    _callback: (result: any) => void,
  ) => undefined),
  stopLEScan: vi.fn(async () => undefined),
  connect: vi.fn(async () => undefined),
  discoverServices: vi.fn(async () => undefined),
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
  startNotifications: vi.fn(async () => undefined),
  stopNotifications: vi.fn(async () => undefined),
  write: vi.fn(async () => undefined),
  writeWithoutResponse: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
}));

vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: bleClient,
  ScanMode: { SCAN_MODE_LOW_LATENCY: 2 },
}));

import { BleApplicationMode } from './wire';
import {
  CapacitorBleDirectRecordLink,
  discoverBlinkerDevice,
  discoverBlinkerDevices,
  parseBlinkerAdvertisement,
} from './transport';

describe('BLE Direct transport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recognizes Blinker by the frozen UUID and valid mode profile only', () => {
    const profile = new DataView(Uint8Array.of(
      1, BleApplicationMode.Direct, 2, 0x11, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ).buffer);
    expect(parseBlinkerAdvertisement({
      serviceData: { '5F6D0001-3F5B-4E4F-9F4D-626C696E6B32': profile },
    })).toMatchObject({
      mode: BleApplicationMode.Direct,
      wireVersion: 2,
      capabilities: 0x11,
    });
    const authorized = new DataView(Uint8Array.of(
      1, BleApplicationMode.Direct, 3, 0x51, 0,
      0xa0, 0xa1, 0xa2, 0xa3, 0x59, 0x44, 0xbb, 0x16,
    ).buffer);
    expect(parseBlinkerAdvertisement({
      serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': authorized },
    })).toMatchObject({
      mode: BleApplicationMode.Direct,
      wireVersion: 3,
      capabilities: 0x51,
    });
    expect(parseBlinkerAdvertisement({
      serviceData: { '0000180f-0000-1000-8000-00805f9b34fb': profile },
    })).toBeUndefined();
    expect(parseBlinkerAdvertisement({
      serviceData: {
        '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': new DataView(Uint8Array.of(1, 2).buffer),
      },
    })).toBeUndefined();
  });

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

  it('returns every provisioning candidate with its latest RSSI', async () => {
    const profile = (locator: number) => new DataView(Uint8Array.of(
      1, BleApplicationMode.Provisioning, 1, 0x07, 0,
      locator, 2, 3, 4, 5, 6, 7, 8,
    ).buffer);
    bleClient.requestLEScan.mockImplementationOnce(async (
      _options: unknown,
      callback: (result: any) => void,
    ) => {
      callback({
        device: { deviceId: 'AA:BB:CC:00:00:01', name: 'Blinker' },
        rssi: -71,
        serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile(1) },
      });
      callback({
        device: { deviceId: 'AA:BB:CC:00:00:02', name: 'Blinker' },
        rssi: -42,
        serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile(9) },
      });
    });

    await expect(discoverBlinkerDevices(
      BleApplicationMode.Provisioning,
      1,
    )).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        device: expect.objectContaining({ deviceId: 'AA:BB:CC:00:00:01' }),
        rssi: -71,
      }),
      expect.objectContaining({
        device: expect.objectContaining({ deviceId: 'AA:BB:CC:00:00:02' }),
        rssi: -42,
      }),
    ]));
  });

  it('collapses transport-address aliases for one advertising session', async () => {
    const profile = new DataView(Uint8Array.of(
      1, BleApplicationMode.Provisioning, 1, 0x07, 0,
      1, 2, 3, 4, 5, 6, 7, 8,
    ).buffer);
    bleClient.requestLEScan.mockImplementationOnce(async (
      _options: unknown,
      callback: (result: any) => void,
    ) => {
      for (const [deviceId, rssi] of [['old-address', -70], ['current-address', -45]]) {
        callback({
          device: { deviceId, name: 'Blinker' },
          rssi,
          serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile },
        });
      }
    });

    await expect(discoverBlinkerDevices(
      BleApplicationMode.Provisioning,
      1,
    )).resolves.toEqual([
      expect.objectContaining({
        device: expect.objectContaining({ deviceId: 'current-address' }),
        rssi: -45,
      }),
    ]);
  });

  it('filters Direct advertisements before opening a GATT connection', async () => {
    const profile = (locator: number) => new DataView(Uint8Array.of(
      1, BleApplicationMode.Direct, 3, 0x51, 0,
      locator, 2, 3, 4, 5, 6, 7, 8,
    ).buffer);
    bleClient.requestLEScan.mockImplementationOnce(async (
      _options: unknown,
      callback: (result: any) => void,
    ) => {
      callback({
        device: { deviceId: 'wrong' },
        serviceData: {
          '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile(1),
        },
      });
      callback({
        device: { deviceId: 'expected' },
        serviceData: {
          '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile(9),
        },
      });
    });

    await expect(discoverBlinkerDevice(
      BleApplicationMode.Direct,
      100,
      new Set(),
      undefined,
      target => target.profile.modeLocator[0] === 9,
    )).resolves.toMatchObject({ device: { deviceId: 'expected' } });
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

  it('starts the BBP/2 secure channel without platform bonding', async () => {
    const link = new CapacitorBleDirectRecordLink();
    await link.connect({
      device: { deviceId: 'AA:BB:CC:DD:EE:FF' },
      profile: {
        mode: BleApplicationMode.Provisioning,
        wireVersion: 1,
        capabilities: 0x0f,
        modeLocator: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
      },
    });

    expect(bleClient.connect).toHaveBeenCalledWith(
      'AA:BB:CC:DD:EE:FF',
      expect.any(Function),
      { timeout: 15_000 },
    );
    expect(bleClient.startNotifications).toHaveBeenCalled();
  });

  it('refreshes a stale Android GATT cache before rejecting the contract', async () => {
    const validServices = await bleClient.getServices();
    bleClient.getServices
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(validServices);
    const link = new CapacitorBleDirectRecordLink();

    await link.connect({
      device: { deviceId: 'AA:BB:CC:DD:EE:FF' },
      profile: {
        mode: BleApplicationMode.Provisioning,
        wireVersion: 1,
        capabilities: 0x0f,
        modeLocator: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
      },
    });

    expect(bleClient.discoverServices).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
    expect(bleClient.startNotifications).toHaveBeenCalled();
  });

  it('allows only the first security-establishing record a longer write timeout', async () => {
    const link = new CapacitorBleDirectRecordLink();
    await link.connect({
      device: { deviceId: 'AA:BB:CC:DD:EE:FF' },
      profile: {
        mode: BleApplicationMode.Provisioning,
        wireVersion: 1,
        capabilities: 0x0f,
        modeLocator: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
      },
    });

    await link.sendRecord(Uint8Array.of(1), 45_000);
    await link.sendRecord(Uint8Array.of(2));

    expect(bleClient.write).toHaveBeenNthCalledWith(
      1,
      'AA:BB:CC:DD:EE:FF',
      '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32',
      '5f6d0002-3f5b-4e4f-9f4d-626c696e6b32',
      expect.any(DataView),
      { timeout: 45_000 },
    );
    expect(bleClient.write).toHaveBeenNthCalledWith(
      2,
      'AA:BB:CC:DD:EE:FF',
      '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32',
      '5f6d0002-3f5b-4e4f-9f4d-626c696e6b32',
      expect.any(DataView),
      undefined,
    );
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
          modeLocator: new Uint8Array(8),
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
