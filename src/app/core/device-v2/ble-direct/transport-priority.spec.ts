import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: vi.fn(() => 'android'),
  priority: vi.fn(async (_options: { deviceId: string; connectionPriority: number }) => undefined),
  client: {
    initialize: vi.fn(async () => undefined),
    connect: vi.fn(async (_id: string, _onDisconnected: () => void) => undefined),
    getServices: vi.fn(async () => [{
      uuid: '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32',
      characteristics: [
        { uuid: '5f6d0002-3f5b-4e4f-9f4d-626c696e6b32', properties: { write: true } },
        { uuid: '5f6d0003-3f5b-4e4f-9f4d-626c696e6b32', properties: { notify: true } },
      ],
    }]),
    startNotifications: vi.fn(async () => undefined),
    stopNotifications: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
    // Must never put the hint into the normal JS GATT queue.
    requestConnectionPriority: vi.fn(() => { throw Error('queued hint'); }),
  },
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: native.client,
  BluetoothLe: { requestConnectionPriority: native.priority },
}));
vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return Object.assign({}, actual, {
    Capacitor: Object.assign({}, actual.Capacitor, { getPlatform: native.platform }),
  });
});
import { BluetoothLe } from '@capacitor-community/bluetooth-le';
import { CapacitorBleDirectRecordLink } from './transport';
import { BleApplicationMode } from './wire';
import { BLE_BOOTSTRAP_PRIORITY_WINDOW_MS, BLE_PRIORITY_RESPONSE_BUDGET_MS } from './bootstrap-priority';

describe('native BLE priority ownership', () => {
  const target = { device: { deviceId: 'test' }, profile: { mode: BleApplicationMode.Direct,
    wireVersion: 3, capabilities: 0x51, modeLocator: new Uint8Array(8).fill(1) } };
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); native.platform.mockReturnValue('android'); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('is disabled by default even on Android', async () => {
    const link = new CapacitorBleDirectRecordLink();
    await link.connect(target);
    await link.sendRecord(Uint8Array.of(1));
    link.finishBootstrap();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(native.priority).not.toHaveBeenCalled();
    await link.disconnect();
  });

  for (const platform of ['ios', 'web']) {
    it(`skips the optional Android hint on ${platform}`, async () => {
      native.platform.mockReturnValue(platform);
      const link = new CapacitorBleDirectRecordLink(undefined, true);
      await link.connect(target);
      await link.sendRecord(Uint8Array.of(1));
      link.finishBootstrap();
      expect(native.priority).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      await link.disconnect();
    });
  }

  it('starts after GATT notifications and restores only at explicit bootstrap completion', async () => {
    const link = new CapacitorBleDirectRecordLink(undefined, true);
    await link.connect(target);
    expect(native.client.startNotifications.mock.invocationCallOrder[0])
      .toBeLessThan(native.priority.mock.invocationCallOrder[0]!);
    expect(native.priority.mock.calls.map(([options]) => options)).toEqual([
      { deviceId: 'test', connectionPriority: 1 },
    ]);
    await link.sendRecord(Uint8Array.of(1));
    link.finishBootstrap(); link.finishBootstrap();
    expect(native.priority.mock.calls.map(([options]) => options.connectionPriority)).toEqual([1, 0]);
    expect(native.client.requestConnectionPriority).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await link.disconnect();
  });

  it('keeps fragmented writes working with BOTH native priority responses unsettled', async () => {
    native.priority.mockImplementationOnce(() => new Promise<void>(() => undefined))
      .mockImplementationOnce(() => new Promise<void>(() => undefined));
    const link = new CapacitorBleDirectRecordLink(undefined, true);
    await link.connect(target);
    const sent = link.sendRecord(new Uint8Array(40));
    await vi.advanceTimersByTimeAsync(BLE_PRIORITY_RESPONSE_BUDGET_MS);
    await sent;
    expect(native.client.write).toHaveBeenCalledTimes(3);
    expect(native.priority.mock.calls.map(([options]) => options.connectionPriority)).toEqual([1, 0]);
    expect(native.client.requestConnectionPriority).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await link.disconnect();
  });

  it('continues record traffic when the hint is rejected', async () => {
    native.priority.mockRejectedValueOnce(Error('unsupported'));
    const link = new CapacitorBleDirectRecordLink(undefined, true);
    await link.connect(target);
    await link.sendRecord(Uint8Array.of(1));
    expect(native.client.write).toHaveBeenCalledOnce();
    await link.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues record traffic when the native method is absent', async () => {
    const original = BluetoothLe.requestConnectionPriority;
    Reflect.deleteProperty(BluetoothLe, 'requestConnectionPriority');
    try {
      const link = new CapacitorBleDirectRecordLink(undefined, true);
      await link.connect(target);
      await link.sendRecord(Uint8Array.of(1));
      expect(native.client.write).toHaveBeenCalledOnce();
      expect(native.priority).not.toHaveBeenCalled();
      await link.disconnect();
    } finally { Reflect.set(BluetoothLe, 'requestConnectionPriority', original); }
  });

  for (const close of ['disconnect', 'abort', 'remote'] as const) {
    it(`${close} cancels timers and fences a late HIGH response from a successor`, async () => {
      let resolve!: () => void;
      native.priority.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
      const abort = new AbortController();
      const link = new CapacitorBleDirectRecordLink({ signal: abort.signal, assertAcquire() {}, assertActive() {} }, true);
      await link.connect(target);
      if (close === 'disconnect') await link.disconnect();
      else if (close === 'abort') { abort.abort(); await link.disconnect(); }
      else { native.client.connect.mock.calls[0]![1](); await link.disconnect(); }
      const next = new CapacitorBleDirectRecordLink();
      await next.connect(target);
      resolve(); link.finishBootstrap();
      await vi.advanceTimersByTimeAsync(BLE_BOOTSTRAP_PRIORITY_WINDOW_MS);
      expect(native.priority.mock.calls.map(([options]) => options.connectionPriority)).toEqual([1]);
      await next.sendRecord(Uint8Array.of(1));
      await next.disconnect();
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('a reused link generation cannot be retired by an old disconnect callback', async () => {
    const link = new CapacitorBleDirectRecordLink(undefined, true);
    await link.connect(target);
    const oldDisconnect = native.client.connect.mock.calls[0]![1];
    await link.disconnect(); await link.connect(target);
    oldDisconnect(); link.finishBootstrap();
    expect(native.priority.mock.calls.map(([options]) => options.connectionPriority)).toEqual([1, 1, 0]);
    await link.sendRecord(Uint8Array.of(1));
    await link.disconnect();
  });

  it('does not request HIGH if the native GATT contract fails', async () => {
    native.client.startNotifications.mockRejectedValueOnce(Error('GATT_FAILED'));
    const link = new CapacitorBleDirectRecordLink(undefined, true);
    await expect(link.connect(target)).rejects.toThrow('GATT_FAILED');
    expect(native.priority).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
