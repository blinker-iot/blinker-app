import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureValues = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  // Hoisted mock factories must not depend on esbuild's later spread helper.
  return Object.assign({}, actual, {
    Capacitor: Object.assign({}, actual.Capacitor, { isNativePlatform: () => true }),
  });
});
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  keys: vi.fn(async () => [...secureValues.keys()]),
  getItem: vi.fn(async (key: string) => secureValues.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { secureValues.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { secureValues.delete(key); }),
} }));

import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { environment } from 'src/environments/environment';
import { localCapabilities } from 'src/environments/deployment';
import { API } from '../../configs/api.config';
import { bleScanner } from '../bluetooth/scan';
import { BleApplicationMode, BleDirectCrypto } from '../device-v2/ble-direct';
import { CapacitorBleControllerCredentialStore, type BleControllerCredential } from '../device-v2/ble-direct/credential-store';
import { DeviceV2BleService } from './device-v2-ble.service';

// These are valid synthetic local records and controlled advertisement digests,
// not a device install, satellite observation, server credential or real radio.
const id = 'ble_AAECAwQFBgcICQoLDA0ODw';
const otherId = 'device_22222222-2222-4222-8222-222222222222';
const scope = { authority: API.BASE_URL, accountId: 'presence-owner-a' };
const turn = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const credential = (logicalDeviceId = id): BleControllerCredential => ({
  source: 'enrollment', state: 'active', logicalDeviceId,
  deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 1,
  controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
  credentialVersion: 1, permissions: 15,
  presenceKeys: [{ state: 'current', accessEpoch: 1, version: 1, key: new Uint8Array(16).fill(4) }],
  intentId: new Uint8Array(16).fill(5), commitId: new Uint8Array(16).fill(6), receipt: new Uint8Array(16).fill(7),
});
function scannerDriver() {
  const requests: Array<{ observe: (value: any, finish: () => void) => void; signal?: AbortSignal; finish(): void }> = [];
  const run = vi.spyOn(bleScanner, 'run').mockImplementation((_filter, _timeout, signal, observe) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const cancel = () => { if (!settled) { settled = true; reject(Error('BLE_SCAN_CANCELLED')); } };
      const finish = () => { if (!settled) { settled = true; signal?.removeEventListener('abort', cancel); resolve(); } };
      requests.push({ observe, signal, finish });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    }));
  return { run,
    emit() {
      const current = requests.at(-1); expect(current).toBeDefined();
      current!.observe({ device: { deviceId: 'synthetic-presence-radio' }, serviceData: {
        '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': new DataView(Uint8Array.of(
          1, BleApplicationMode.Direct, 3, 0x51, 0, 1, 2, 3, 4, 9, 9, 9, 9,
        ).buffer),
      } }, () => undefined);
    },
    finish() { requests.at(-1)?.finish(); },
    finishAll() { for (const request of requests) request.finish(); },
    signal() { return requests.at(-1)?.signal; },
  };
}

describe('BLE presence local credential and observation lifetime', () => {
  const originalDeployment = environment.deployment;
  const harnesses: Array<{ service: DeviceV2BleService; driver: ReturnType<typeof scannerDriver>;
    work: Promise<void>[]; releaseDigests(): void }> = [];

  beforeEach(() => {
    secureValues.clear(); environment.deployment = localCapabilities;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.spyOn(BleClient, 'initialize').mockResolvedValue();
  });
  afterEach(async () => {
    for (const h of harnesses.splice(0)) {
      const internal = h.service as any;
      const closing = typeof internal.ngOnDestroy === 'function'
        ? internal.ngOnDestroy() : internal.resetAccountSession();
      h.releaseDigests(); h.driver.finishAll();
      await Promise.allSettled(h.work); await closing;
    }
    vi.restoreAllMocks(); vi.useRealTimers(); environment.deployment = originalDeployment; secureValues.clear();
  });

  async function harness() {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(credential());
    const data = { auth: { uuid: scope.accountId }, user: { id: scope.accountId }, sessionEpoch: 1,
      authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(false), getDevice: vi.fn() };
    const visibility = new BehaviorSubject(true), driver = scannerDriver();
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any, { active: visibility } as any);
    const digest = vi.spyOn(BleDirectCrypto.prototype, 'hmac').mockResolvedValue(new Uint8Array(32).fill(9));
    const work: Promise<void>[] = [], pending: Array<(value: Uint8Array) => void> = [], keys: Uint8Array[] = [];
    const track = (promise: Promise<void>) => { work.push(promise); void promise.catch(() => undefined); return promise; };
    const h = { store, data, visibility, driver, service, digest, work, keys,
      start() { return track(Promise.resolve().then(() => service.refreshPresence([id]))); },
      deferDigest() {
        digest.mockImplementationOnce(key => { keys.push(key); return new Promise(resolve => { pending.push(resolve); }); });
      },
      releaseDigests() { for (const finish of pending.splice(0)) finish(new Uint8Array(32).fill(9)); },
      async verifyNearby() {
        const scan = h.start(); await turn(); driver.emit(); await turn();
        expect(service.nearbySnapshot(id)).toBe(true);
        driver.finish(); await scan;
      },
    };
    harnesses.push(h); return h;
  }

  function activeLink(service: DeviceV2BleService, close = vi.fn(async (): Promise<void> => undefined), admission?: object) {
    const internal = service as any, context = internal.accountContext();
    const link = { context, logicalDeviceId: id, session: { close, store: { snapshot: () => ({}) } },
      detachState: vi.fn(), detachEvents: vi.fn(), detachErrors: vi.fn(), admission };
    internal.active = link;
    return link;
  }

  it('waits for a dispatched command and rechecks a successor before retiring the ordinary link', async () => {
    const h = await harness(), link = activeLink(h.service);
    vi.spyOn(h.service, 'ensureReady').mockResolvedValue();
    let ack!: () => void;
    const command = vi.spyOn(h.service, 'commandConnected').mockImplementation(() => new Promise<void>(resolve => { ack = resolve; }));
    const send = h.service.command(id, 'power', true);
    let inUse = false;
    const release = h.service.releaseIdleOrdinary(id, () => inUse);
    await turn();
    expect(command).toHaveBeenCalledOnce();
    expect(link.session.close).not.toHaveBeenCalled();
    inUse = true; ack(); await send; await release;
    expect(link.session.close).not.toHaveBeenCalled();
    inUse = false; await h.service.releaseIdleOrdinary(id, () => inUse);
    expect(link.session.close).toHaveBeenCalledOnce();
    expect(h.service.connectionSnapshot(id)).toBe('stopped');
  });

  it('waits for the physical disconnect before satisfying a new homepage scan demand', async () => {
    const h = await harness();
    let drained!: () => void;
    const link = activeLink(h.service, vi.fn(() => new Promise<void>(resolve => { drained = resolve; })));
    const release = h.service.releaseIdleOrdinary(id, () => false);
    const scan = h.start(); await turn();
    expect(link.session.close).toHaveBeenCalledOnce();
    expect(h.driver.run).not.toHaveBeenCalled();
    drained(); await release; await turn();
    expect(h.driver.run).toHaveBeenCalledOnce();
    h.driver.finish(); await scan;
  });

  it('cancels a retired opening without taking ownership of an offline admission', async () => {
    const h = await harness(), internal = h.service as any, abort = new AbortController();
    let settle!: () => void;
    const pending = new Promise<void>(resolve => { settle = resolve; }).finally(() => { internal.opening = undefined; });
    internal.opening = { logicalDeviceId: id, context: internal.accountContext(), promise: pending, abort };
    const release = h.service.releaseIdleOrdinary(id, () => false);
    expect(abort.signal.aborted).toBe(true);
    settle(); await release;
    const exclusive = activeLink(h.service, undefined, { onClosed: vi.fn() });
    await h.service.releaseIdleOrdinary(id, () => false);
    expect(exclusive.session.close).not.toHaveBeenCalled();
  });

  it('does not reopen homepage scanning after a cancelled opening cannot prove native release', async () => {
    const h = await harness(), internal = h.service as any, abort = new AbortController();
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, fail) => { reject = fail; }).finally(() => { internal.opening = undefined; });
    internal.opening = { logicalDeviceId: id, context: internal.accountContext(), promise: pending, abort };
    const release = expect(h.service.releaseIdleOrdinary(id, () => false)).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
    reject(Error('BLE_DIRECT_NATIVE_RELEASE_FAILED')); await release;
    await expect(h.start()).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
    expect(h.driver.run).not.toHaveBeenCalled();
  });

  it('clears verified streaming evidence immediately on background and does not scan on return', async () => {
    const h = await harness(); await h.verifyNearby();
    h.visibility.next(false);
    expect(h.service.nearbySnapshot(id)).toBe(false);
    h.visibility.next(true); await vi.advanceTimersByTimeAsync(20_000);
    expect(h.service.nearbySnapshot(id)).toBe(false); expect(h.driver.run).toHaveBeenCalledOnce();
  });

  it('rejects explicit background presence acquisition before reading storage or starting a scan', async () => {
    const h = await harness(); vi.mocked(SecureStorage.getItem).mockClear();
    h.visibility.next(false);
    const work = h.start(), rejected = expect(work).rejects.toThrow('BLE_SCAN_BACKGROUND');
    await turn(); h.driver.finish(); await rejected;
    expect(SecureStorage.getItem).not.toHaveBeenCalled(); expect(h.driver.run).not.toHaveBeenCalled();
  });

  it('does not publish an observation whose HMAC completes after its fifteen-second lifetime', async () => {
    const h = await harness(); h.deferDigest();
    const scan = h.start(); await turn(); h.driver.emit(); await turn();
    await vi.advanceTimersByTimeAsync(2500); h.driver.finish(); await turn();
    await vi.advanceTimersByTimeAsync(12_501); h.releaseDigests(); await scan;
    expect(h.service.nearbySnapshot(id)).toBe(false);
    expect(h.keys.length).toBe(1); expect(h.keys[0].every(byte => byte === 0)).toBe(true);
  });

  it('gives a five-second verifier only the remaining ten seconds, not a fresh fifteen seconds', async () => {
    const h = await harness(); h.deferDigest();
    const scan = h.start(); await turn(); h.driver.emit(); await turn();
    await vi.advanceTimersByTimeAsync(2500); h.driver.finish();
    await vi.advanceTimersByTimeAsync(2500); h.releaseDigests(); await scan;
    expect(h.service.nearbySnapshot(id)).toBe(true);
    await vi.advanceTimersByTimeAsync(9999); expect(h.service.nearbySnapshot(id)).toBe(true);
    await vi.advanceTimersByTimeAsync(1); expect(h.service.nearbySnapshot(id)).toBe(false);
  });

  const mutations = ['remove', 'pending', 'epoch', 'presence-rotation'] as const;
  it.each(mutations)('a successful same-account %s invalidates evidence and fences its old verifier', async mutation => {
    const h = await harness(); await h.verifyNearby(); h.deferDigest();
    const scan = h.start(); await turn(); h.driver.emit(); await turn();
    expect(h.keys).toHaveLength(1);
    if (mutation === 'remove') await h.store.remove(id);
    else if (mutation === 'pending') await h.store.save({ ...credential(), state: 'pending' });
    else if (mutation === 'epoch') await h.store.save({ ...credential(), accessEpoch: 2,
      presenceKeys: [{ state: 'current', accessEpoch: 2, version: 2, key: new Uint8Array(16).fill(8) }] });
    else await h.store.replacePresenceKeys(id, [
      { state: 'current', accessEpoch: 1, version: 2, key: new Uint8Array(16).fill(8) },
      { state: 'previous', accessEpoch: 1, version: 1, key: new Uint8Array(16).fill(4) },
    ]);
    expect(h.service.nearbySnapshot(id)).toBe(false);
    expect(h.keys[0].some(byte => byte !== 0), 'pending HMAC must drain before its captured key is wiped').toBe(true);
    h.releaseDigests(); h.driver.finish(); await scan;
    expect(h.service.nearbySnapshot(id)).toBe(false);
    expect(h.keys[0].every(byte => byte === 0)).toBe(true); expect(h.driver.run).toHaveBeenCalledTimes(2);
  });

  it('ignores other scopes or ids and failed storage writes without cancelling a valid observer', async () => {
    const h = await harness(); await h.verifyNearby(); h.deferDigest();
    const scan = h.start(); await turn(); h.driver.emit(); await turn();
    const otherAccount = new CapacitorBleControllerCredentialStore(() => ({ ...scope, accountId: 'presence-owner-b' }));
    const otherAuthority = new CapacitorBleControllerCredentialStore(() => ({ ...scope, authority: 'https://other-presence.invalid' }));
    const isolated = [() => otherAccount.save(credential()), () => otherAuthority.save(credential()), () => h.store.save(credential(otherId))];
    for (const write of isolated) {
      await write(); expect(h.service.nearbySnapshot(id)).toBe(true); expect(h.driver.signal()?.aborted).toBe(false);
    }
    vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(Error('SYNTHETIC_SET_FAILURE'));
    await expect(h.store.save({ ...credential(), state: 'pending' })).rejects.toThrow('SYNTHETIC_SET_FAILURE');
    vi.mocked(SecureStorage.removeItem).mockRejectedValueOnce(Error('SYNTHETIC_REMOVE_FAILURE'));
    await expect(h.store.remove(id)).rejects.toThrow('SYNTHETIC_REMOVE_FAILURE');
    expect(h.service.nearbySnapshot(id)).toBe(true); expect(h.driver.signal()?.aborted).toBe(false);
    h.releaseDigests(); h.driver.finish(); await scan;
    expect(h.service.nearbySnapshot(id)).toBe(true); expect(h.keys[0].every(byte => byte === 0)).toBe(true);
    expect(h.driver.run).toHaveBeenCalledTimes(2);
  });

  it('uses the real account-change event to clear evidence and reject a late verifier', async () => {
    const h = await harness(); await h.verifyNearby(); h.deferDigest();
    const scan = h.start(); await turn(); h.driver.emit(); await turn();
    h.data.auth = { uuid: 'presence-owner-b' }; h.data.user = { id: 'presence-owner-b' }; h.data.sessionEpoch++;
    h.data.authDataChanged.next();
    expect(h.service.nearbySnapshot(id)).toBe(false);
    h.releaseDigests(); h.driver.finish(); await Promise.allSettled([scan]);
    expect(h.service.nearbySnapshot(id)).toBe(false); expect(h.keys[0].every(byte => byte === 0)).toBe(true);
    expect(h.driver.run).toHaveBeenCalledTimes(2);
  });

  it('notifies the fixed persisted record after a delayed storage write, not a mutated caller id', async () => {
    const h = await harness(); await h.verifyNearby();
    let finish!: () => void;
    vi.mocked(SecureStorage.setItem).mockImplementationOnce((key, encoded) => new Promise<void>(resolve => {
      finish = () => { secureValues.set(key, encoded); resolve(); };
    }));
    const input = credential();
    const write = h.store.save(input);
    input.logicalDeviceId = otherId;
    expect(h.service.nearbySnapshot(id)).toBe(true); // No success notification yet.
    await turn(); // The account-scoped mutation queue starts its controlled write asynchronously.
    finish(); await write;
    expect(h.service.nearbySnapshot(id)).toBe(false);
    expect(h.driver.run).toHaveBeenCalledOnce();
  });
});
