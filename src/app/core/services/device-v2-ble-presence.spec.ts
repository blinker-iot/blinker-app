import { BleClient } from '@capacitor-community/bluetooth-le';

import { environment } from 'src/environments/environment';
import { localCapabilities } from 'src/environments/deployment';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bleScanner } from '../bluetooth/scan';
import { BleApplicationMode, BleDirectCrypto } from '../device-v2/ble-direct';
import { DeviceV2BleService } from './device-v2-ble.service';

const originalDeployment = environment.deployment;
beforeEach(() => { environment.deployment = localCapabilities; });
afterEach(() => { environment.deployment = originalDeployment; });

describe('BLE presence evidence lifetime', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  const turn = async () => { for (let i = 0; i < 24; ++i) await Promise.resolve(); };
  const harness = () => {
    const data = { auth: { uuid: 'a' }, user: { id: 'a' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
      deviceDataLoader: new BehaviorSubject(false), getDevice: vi.fn() };
    const active = new BehaviorSubject(true);
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any, { active } as any);
    const internal = service as any;
    vi.spyOn(BleClient, 'initialize').mockResolvedValue();
    vi.spyOn(internal, 'credentialStore').mockReturnValue({ load: async () => ({
      source: 'enrollment', state: 'active', logicalDeviceId: 'device', accessEpoch: 1, credentialVersion: 1, permissions: 15,
      deviceInstanceId: new Uint8Array(16).fill(1), controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
      presenceKeys: [{ accessEpoch: 1, version: 1, key: new Uint8Array(16).fill(4) }],
    }) });
    return { data, service, internal, active, close: () => service.ngOnDestroy() };
  };
  const advertisement = (mode = BleApplicationMode.Direct) => ({ device: { deviceId: 'physical-address' },
    serviceData: { '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': new DataView(Uint8Array.of(
      1, mode, 3, 0x51, 0, 1, 2, 3, 4, 9, 9, 9, 9,
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
    return { emit: (mode?: BleApplicationMode) => observe(advertisement(mode), () => undefined),
      finish: () => finish(), fail: (error: Error) => fail(error) };
  };

  const aliasHarness = () => {
    const h = harness();
    const cards = new Map(['device', 'alias', 'other'].map(id => [id, { cloudEnabled: id !== 'device',
      config: { isShared: false, disabled: false, isPreview: false } }]));
    h.data.getDevice.mockImplementation(id => cards.get(id));
    // Preserve the normal fixture's credential, plus a distinct previous key.
    const loadSource = h.internal.credentialStore().load;
    const readBc5NearbySource = vi.fn(async (id: string) => id === 'alias' ? {
      reference: { sourceLogicalDeviceId: 'device', targetLogicalDeviceId: 'alias', accessEpoch: 1,
        presenceVersion: 1, rootBindingId: 'root', bindingRevision: 1 },
      deviceInstanceId: new Uint8Array(16).fill(1), key: new Uint8Array(16).fill(4),
    } : undefined);
    vi.mocked(h.internal.credentialStore).mockReturnValue({ readBc5NearbySource, load: async (id: string) => {
      if (id !== 'device') return undefined;
      const credential = await loadSource();
      credential.presenceKeys[0].state = 'current';
      credential.presenceKeys.push({ state: 'previous', accessEpoch: 1, version: 2, key: new Uint8Array(16).fill(5) });
      return credential;
    } });
    const states: boolean[] = [];
    h.service.watchNearbyAlias('alias').subscribe(value => states.push(value));
    return { ...h, cards, readBc5NearbySource, states };
  };

  it('projects only the exact current Direct observation without connecting the alias or adding a scan/HMAC', async () => {
    const h = aliasHarness(), d = driver();
    const hmac = vi.spyOn(BleDirectCrypto.prototype, 'hmac').mockImplementation(async key =>
      new Uint8Array(32).fill(key[0] === 4 ? 9 : 3));
    const scan = h.service.refreshPresence(['alias', 'other', 'device', 'alias']); await turn();
    d.emit(); await turn();
    expect(h.service.nearbySnapshot('device')).toBe(true);
    expect(h.states).toEqual([false, true]);
    expect(h.service.nearbySnapshot('alias')).toBe(false);
    expect(h.service.connectionSnapshot('alias')).toBe('idle');
    expect(await h.service.hasActiveCredential('alias')).toBe(false);
    expect(hmac).toHaveBeenCalledTimes(2); // current and previous, not alias
    expect(bleScanner.run).toHaveBeenCalledOnce();
    d.finish(); await scan;
    h.active.next(false);
    expect(h.states).toEqual([false, true, false]); h.close();
  });

  it.each(['previous-only', 'different-material', 'source-disabled', 'target-shared', 'target-missing', 'wifi-provisioning'])
  ('does not project a nearby-only alias for %s', async reason => {
    const h = aliasHarness(), d = driver();
    if (reason === 'different-material') {
      const read = h.readBc5NearbySource.getMockImplementation()!;
      h.readBc5NearbySource.mockImplementation(async id => {
        const item = await read(id);
        item?.key.fill(7);
        return item;
      });
    }
    if (reason === 'source-disabled') h.cards.get('device')!.config.disabled = true;
    if (reason === 'target-shared') h.cards.get('alias')!.config.isShared = true;
    if (reason === 'target-missing') h.cards.delete('alias');
    vi.spyOn(BleDirectCrypto.prototype, 'hmac').mockImplementation(async key =>
      new Uint8Array(32).fill(key[0] === (reason === 'previous-only' ? 5 : 4) ? 9 : 3));
    const scan = h.service.refreshPresence(['device', 'alias']); await turn();
    d.emit(reason === 'wifi-provisioning' ? BleApplicationMode.Provisioning : BleApplicationMode.Direct); await turn();
    expect(h.states).toEqual([false]);
    expect(h.service.nearbySnapshot('device')).toBe(reason !== 'wifi-provisioning');
    d.finish(); await scan; h.close();
  });

  it('invalidates an already-published alias when the source leaves inventory', async () => {
    const h = aliasHarness(), d = driver();
    vi.spyOn(BleDirectCrypto.prototype, 'hmac').mockImplementation(async key => new Uint8Array(32).fill(key[0] === 4 ? 9 : 3));
    const scan = h.service.refreshPresence(['device', 'alias']); await turn();
    d.emit(); await turn();
    expect(h.states).toEqual([false, true]);
    h.cards.delete('device'); h.data.deviceDataLoader.next(true);
    expect(h.states).toEqual([false, true, false]);
    d.finish(); await scan; h.close();
  });

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
    expect(h.internal.adapterEnabled.value).toBe(null);
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
