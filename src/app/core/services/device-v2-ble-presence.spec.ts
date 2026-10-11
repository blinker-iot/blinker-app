import { BleClient } from '@capacitor-community/bluetooth-le';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bleScanner } from '../bluetooth/scan';
import { BleApplicationMode, BleDirectCrypto } from '../device-v2/ble-direct';
import { DeviceV2BleService } from './device-v2-ble.service';

describe('BLE presence evidence lifetime', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  const turn = async () => { for (let i = 0; i < 24; ++i) await Promise.resolve(); };
  const harness = () => {
    const data = { auth: { uuid: 'a' }, user: { id: 'a' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any);
    const internal = service as any;
    vi.spyOn(BleClient, 'initialize').mockResolvedValue();
    vi.spyOn(internal, 'credentialStore').mockReturnValue({ load: async () => ({
      source: 'enrollment', state: 'active', logicalDeviceId: 'device', accessEpoch: 1, credentialVersion: 1, permissions: 15,
      deviceInstanceId: new Uint8Array(16).fill(1), controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
      presenceKeys: [{ accessEpoch: 1, version: 1, key: new Uint8Array(16).fill(4) }],
    }) });
    return { data, service, internal, close: () => internal.resetAccountSession() };
  };
  const advertisement = () => ({ device: { deviceId: 'physical-address' },
    serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': new DataView(Uint8Array.of(
      1, BleApplicationMode.Direct, 3, 0x51, 0, 1, 2, 3, 4, 9, 9, 9, 9,
    ).buffer) } });
  const driver = () => {
    let observe!: (value: any, finish: () => void) => void;
    let finish!: () => void, fail!: (error: Error) => void;
    vi.spyOn(bleScanner, 'run').mockImplementation((_filters, _timeout, signal, callback) => {
      observe = callback;
      return new Promise<void>((resolve, reject) => {
        finish = resolve; fail = reject;
        signal?.addEventListener('abort', () => reject(Error('BLE_SCAN_CANCELLED')), { once: true });
      });
    });
    return { emit: () => observe(advertisement(), () => undefined), finish: () => finish(), fail: (error: Error) => fail(error) };
  };

  it.each(['miss', 'BLE_SCAN_BUSY', 'BLE_SCAN_THROTTLED'])(
    '%s preserves the original deadline but does not keep a device nearby indefinitely', async outcome => {
      const h = harness(), observed: boolean[] = [];
      const subscription = h.service.watchNearby('device').subscribe(value => observed.push(value));
      const scan = vi.spyOn(bleScanner, 'run');
      if (outcome === 'miss') scan.mockResolvedValue(); else scan.mockRejectedValue(Error(outcome));
      h.internal.markNearby('device'); const deadline = h.internal.connectionStates.get('device').nearbyUntil;
      await vi.advanceTimersByTimeAsync(1000);
      if (outcome === 'miss') await h.service.refreshPresence(['device']);
      else await expect(h.service.refreshPresence(['device'])).rejects.toThrow(outcome);
      expect(h.service.nearbySnapshot('device')).toBe(true);
      expect(h.internal.connectionStates.get('device').nearbyUntil).toBe(deadline);
      await vi.advanceTimersByTimeAsync(14_000);
      expect(h.service.nearbySnapshot('device')).toBe(false); expect(observed).toEqual([false, true, false]);
      subscription.unsubscribe(); h.close();
    },
  );

  it('permission loss immediately invalidates evidence, rather than declaring a missed device', async () => {
    const h = harness(); h.internal.markNearby('device');
    vi.spyOn(bleScanner, 'run').mockRejectedValue(Error('BLE_SCAN_PERMISSION'));
    await expect(h.service.refreshPresence(['device'])).rejects.toThrow('BLE_SCAN_PERMISSION');
    expect(h.service.nearbySnapshot('device')).toBe(false); h.close();
  });

  it('a verified streaming observation is visible before the scan window completes', async () => {
    const h = harness(), d = driver();
    // Identity cryptography has separate real-vector tests. Here a controlled
    // digest makes timing/cancellation deterministic while retaining the
    // locator matcher and logical-device selection.
    vi.spyOn(BleDirectCrypto.prototype, 'hmac').mockResolvedValue(new Uint8Array(32).fill(9));
    const scan = h.service.refreshPresence(['device']); await turn();
    let completed = false; void scan.then(() => { completed = true; });
    d.emit(); await turn();
    expect(h.service.nearbySnapshot('device')).toBe(true); expect(completed).toBe(false);
    d.finish(); await scan; h.close();
  });

  it('cancellation fences a late verifier and drains it before wiping its key', async () => {
    const h = harness(), d = driver(), abort = new AbortController();
    let finishDigest!: (value: Uint8Array) => void, key!: Uint8Array;
    const hmac = vi.spyOn(BleDirectCrypto.prototype, 'hmac').mockImplementation(value => {
      key = value; return new Promise<Uint8Array>(resolve => { finishDigest = resolve; });
    });
    const scan = h.service.refreshPresence(['device'], abort.signal); await turn();
    d.emit(); await turn(); expect(hmac).toHaveBeenCalledOnce();
    abort.abort(); await turn(); expect(key.some(byte => byte !== 0)).toBe(true);
    finishDigest(new Uint8Array(32).fill(9)); await scan;
    expect(key.every(byte => byte === 0)).toBe(true); expect(h.service.nearbySnapshot('device')).toBe(false); h.close();
  });

  it('an old account permission failure cannot erase successor evidence', async () => {
    const h = harness(), d = driver();
    const scan = h.service.refreshPresence(['device']); const rejected = expect(scan).rejects.toThrow('BLE_SCAN_PERMISSION'); await turn();
    h.data.auth = { uuid: 'b' }; h.data.sessionEpoch++;
    h.internal.markNearby('device');
    d.fail(Error('BLE_SCAN_PERMISSION')); await rejected;
    expect(h.service.nearbySnapshot('device')).toBe(true); h.close();
  });

  it('radio loss stops only presence and clears its evidence', async () => {
    const h = harness(), d = driver();
    let enabled!: (value: boolean) => void;
    vi.spyOn(BleClient, 'startEnabledNotifications').mockImplementation(async callback => { enabled = callback; });
    vi.spyOn(BleClient, 'isEnabled').mockResolvedValue(true);
    const subscription = h.service.watchAdapterEnabled().subscribe(); await turn();
    h.internal.markNearby('device');
    const scan = h.service.refreshPresence(['device']); await turn();
    const abort = h.internal.presence.abort;
    enabled(false); await scan;
    expect(abort.signal.aborted).toBe(true); expect(h.service.nearbySnapshot('device')).toBe(false);
    subscription.unsubscribe(); h.close();
  });

  it.each(['initialize', 'snapshot'])('a new visible subscriber retries failed %s without duplicating installed listeners', async phase => {
    const h = harness();
    const initialize = vi.mocked(BleClient.initialize);
    if (phase === 'initialize') initialize.mockRejectedValueOnce(Error('permission denied'));
    const notifications = vi.spyOn(BleClient, 'startEnabledNotifications').mockResolvedValue();
    const enabled = vi.spyOn(BleClient, 'isEnabled').mockResolvedValue(true);
    if (phase === 'snapshot') enabled.mockRejectedValueOnce(Error('permission changed'));
    const first = h.service.watchAdapterEnabled().subscribe(); await turn();
    expect(h.internal.adapterEnabled.value).toBe(false);
    expect(h.internal.adapterMonitoring).toBeUndefined();
    const initCount = initialize.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000); expect(initialize).toHaveBeenCalledTimes(initCount);
    first.unsubscribe(); const resumed = h.service.watchAdapterEnabled().subscribe(); await turn();
    expect(h.internal.adapterEnabled.value).toBe(true); expect(notifications).toHaveBeenCalledOnce();
    resumed.unsubscribe(); h.close();
  });

  it('cancelling an unfound Direct opening does not fabricate nearby evidence', async () => {
    const h = harness(), abort = new AbortController();
    h.internal.opening = { logicalDeviceId: 'device', context: h.internal.accountContext(),
      abort, promise: Promise.resolve() };
    await h.service.disconnect('device');
    expect(abort.signal.aborted).toBe(true); expect(h.service.nearbySnapshot('device')).toBe(false);
    expect(h.internal.connectionStates.get('device').nearbyUntil).toBe(0); h.close();
  });

  it('a late credential read is wiped on account retirement, without spending a scan', async () => {
    const h = harness();
    let finish!: (credential: any) => void;
    vi.mocked(h.internal.credentialStore).mockReturnValue({ load: () => new Promise(resolve => { finish = resolve; }) });
    const scanner = vi.spyOn(bleScanner, 'run');
    const scan = h.service.refreshPresence(['device']);
    const rejected = expect(scan).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED'); await turn();
    h.data.auth = { uuid: 'b' }; h.data.sessionEpoch++;
    const secret = new Uint8Array(32).fill(3), presenceKey = new Uint8Array(16).fill(4);
    finish({ state: 'active', controllerSecret: secret, presenceKeys: [{ key: presenceKey }] });
    await rejected; expect(scanner).not.toHaveBeenCalled();
    expect(secret.every(byte => byte === 0)).toBe(true); expect(presenceKey.every(byte => byte === 0)).toBe(true); h.close();
  });

  it('closing a ready session uses existing evidence without renewing its deadline', async () => {
    const h = harness(); h.internal.markNearby('device');
    const deadline = h.internal.connectionStates.get('device').nearbyUntil;
    h.internal.setConnection('device', 'ready'); await vi.advanceTimersByTimeAsync(1000);
    h.internal.active = { logicalDeviceId: 'device', context: h.internal.accountContext(),
      detachState() {}, detachEvents() {}, detachErrors() {},
      session: { close: async () => undefined, store: { snapshot: () => ({}) } } };
    await h.internal.closeActive();
    expect(h.internal.connectionStates.get('device').nearbyUntil).toBe(deadline);
    await vi.advanceTimersByTimeAsync(14_000); expect(h.service.nearbySnapshot('device')).toBe(false); h.close();
  });
});
