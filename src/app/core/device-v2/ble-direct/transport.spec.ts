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

  const target = { device: { deviceId: 'guard-test' }, profile: { mode: BleApplicationMode.Direct,
    wireVersion: 3, capabilities: 0x51, modeLocator: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) } };
  const turn = async () => { for (let i = 0; i < 16; ++i) await Promise.resolve(); };
  const collectProvisioningCandidates = async () => {
    // Candidate identity is not a wall-clock scheduling test. A 1 ms real
    // deadline can expire before the mock scan starts on a busy build host.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const discovery = discoverBlinkerDevices(BleApplicationMode.Provisioning, 100);
      await vi.advanceTimersByTimeAsync(100);
      return await discovery;
    } finally {
      vi.useRealTimers();
    }
  };

  it('rechecks admission after async initialization, immediately before the native connect', async () => {
    const abort = new AbortController(), assertAcquire = vi.fn(() => { throw Error('READY_EXPIRED'); });
    const link = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire, assertActive() {} });
    await expect(link.connect(target)).rejects.toThrow('READY_EXPIRED');
    expect(assertAcquire).toHaveBeenCalledOnce(); expect(bleClient.connect).not.toHaveBeenCalled();
  });

  it('notifies actual native acquisition only after admission passes', async () => {
    const abort = new AbortController(), onAcquire = vi.fn();
    const link = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire() {}, assertActive() {}, onAcquire });
    await link.connect(target);
    expect(onAcquire).toHaveBeenCalledOnce();
    expect(onAcquire.mock.invocationCallOrder[0]).toBeLessThan(bleClient.connect.mock.invocationCallOrder[0]);
    await link.disconnect();
  });

  it('pre-cancel and disconnect during initialization cannot reach native acquisition', async () => {
    const abort = new AbortController(); abort.abort();
    const cancelled = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire() {}, assertActive() {} });
    await expect(cancelled.connect(target)).rejects.toMatchObject({ name: 'AbortError' });
    const link = new CapacitorBleDirectRecordLink();
    const connecting = link.connect(target), result = connecting.catch(e => e);
    await link.disconnect(); expect((await result).message).toBe('BLE_DIRECT_CONNECT_CANCELLED');
    expect(bleClient.connect).not.toHaveBeenCalled();
  });

  for (const phase of ['connect', 'getServices', 'startNotifications'] as const) {
    it(`cancel during ${phase} rejects late native success without starting secure traffic`, async () => {
      const validServices = await bleClient.getServices();
      let finish!: (value: any) => void;
      const pending = new Promise<any>(resolve => { finish = resolve; });
      bleClient[phase].mockImplementationOnce(() => pending);
      const abort = new AbortController();
      const link = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire() {}, assertActive() {} });
      const connecting = link.connect(target).catch(e => e); await turn();
      abort.abort(); await turn(); finish(phase === 'getServices' ? validServices : undefined);
      expect(await connecting).toMatchObject({ name: 'AbortError' });
      await expect(link.sendRecord(Uint8Array.of(1))).rejects.toThrow();
      expect(bleClient.write).not.toHaveBeenCalled(); expect(bleClient.disconnect).toHaveBeenCalled();
      if (phase !== 'startNotifications') expect(bleClient.startNotifications).not.toHaveBeenCalled();
    });
  }

  it('live-record checks do not require a new acquisition permit, but expiry forbids even the first fragment', async () => {
    const abort = new AbortController(), assertAcquire = vi.fn(), assertActive = vi.fn();
    const link = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire, assertActive });
    await link.connect(target);
    assertAcquire.mockImplementation(() => { throw Error('RENEW_PENDING'); });
    await link.sendRecord(Uint8Array.of(1)); expect(bleClient.write).toHaveBeenCalledOnce();
    assertActive.mockImplementation(() => { throw Error('EXPIRED'); });
    await expect(link.sendRecord(Uint8Array.of(2))).rejects.toThrow('EXPIRED');
    expect(() => link.receiveRecord()).toThrow('EXPIRED');
    expect(bleClient.write).toHaveBeenCalledOnce(); await link.disconnect();
  });

  it('cancel in the inter-fragment delay prevents subsequent native writes', async () => {
    vi.useFakeTimers();
    try {
      const abort = new AbortController();
      const link = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire() {}, assertActive() {} });
      await link.connect(target);
      const sending = link.sendRecord(new Uint8Array(40)).catch(e => e); await turn();
      expect(bleClient.write).toHaveBeenCalledOnce(); abort.abort(); await vi.advanceTimersByTimeAsync(30);
      expect(await sending).toMatchObject({ name: 'AbortError' }); expect(bleClient.write).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it('old disconnect callbacks cannot retire a reused link generation', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target);
    const oldDisconnect = (bleClient.connect.mock.calls[0] as unknown as [string, () => void])[1];
    await link.disconnect(); await link.connect(target); oldDisconnect();
    await link.sendRecord(Uint8Array.of(1)); expect(bleClient.write).toHaveBeenCalledOnce(); await link.disconnect();
  });

  it('repeated disconnect and a successor connect wait for the same native cleanup', async () => {
    let finish!: () => void;
    bleClient.disconnect.mockImplementationOnce(() => new Promise<void>(r => { finish = r; }));
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target);
    let firstClosed = false, secondClosed = false;
    const first = link.disconnect().then(() => { firstClosed = true; });
    const second = link.disconnect().then(() => { secondClosed = true; });
    const next = link.connect(target); await turn();
    expect(bleClient.disconnect).toHaveBeenCalledOnce(); expect(bleClient.connect).toHaveBeenCalledOnce();
    expect(firstClosed).toBe(false); expect(secondClosed).toBe(false);
    finish(); await Promise.all([first, second, next]); expect(bleClient.connect).toHaveBeenCalledTimes(2);
    await link.sendRecord(Uint8Array.of(1)); await link.disconnect();
  });

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

    await expect(collectProvisioningCandidates()).resolves.toEqual(expect.arrayContaining([
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

  it('streams only the first deduplicated observation, with at most 64 candidates', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const seen = vi.fn();
      bleClient.requestLEScan.mockImplementationOnce(async (_options, callback) => {
        for (let locator = 1; locator <= 70; ++locator) {
          const profile = new DataView(Uint8Array.of(1, BleApplicationMode.Provisioning, 1, 0x07, 0,
            locator, 2, 3, 4, 5, 6, 7, 8).buffer);
          for (const deviceId of [`first-${locator}`, `alias-${locator}`]) callback({ device: { deviceId },
            serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': profile } });
        }
      });
      let complete = false;
      const result = discoverBlinkerDevices(BleApplicationMode.Provisioning, 100, undefined, seen)
        .then(value => { complete = true; return value; });
      await turn(); expect(seen).toHaveBeenCalledTimes(64); expect(complete).toBe(false);
      await vi.advanceTimersByTimeAsync(100); expect(await result).toHaveLength(64);
    } finally { vi.useRealTimers(); }
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

    await expect(collectProvisioningCandidates()).resolves.toEqual([
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

  it('a late async locator match cannot turn an expired scan into a GATT candidate', async () => {
    vi.useFakeTimers();
    try {
      let matched!: (value: boolean) => void, closed!: () => void;
      bleClient.requestLEScan.mockImplementationOnce(async (_options, callback) => {
        callback({ device: { deviceId: 'late' }, serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32':
          new DataView(Uint8Array.of(1, BleApplicationMode.Direct, 3, 0x51, 0, 1, 2, 3, 4, 5, 6, 7, 8).buffer) } });
      });
      bleClient.stopLEScan.mockImplementationOnce(() => new Promise<void>(r => { closed = r; }));
      const work = discoverBlinkerDevice(BleApplicationMode.Direct, 100, new Set(), undefined,
        () => new Promise<boolean>(r => { matched = r; })).catch(e => e);
      await turn(); await vi.advanceTimersByTimeAsync(100);
      matched(true); await turn(); closed();
      expect((await work).message).toBe('BLE_DIRECT_SCAN_TIMEOUT');
      expect(bleClient.connect).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
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
