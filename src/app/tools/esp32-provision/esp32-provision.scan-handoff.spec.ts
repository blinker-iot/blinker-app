import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WiFiProv } from 'capacitor-wifiprov';
import { bleScanner } from '../../core/bluetooth/scan';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), startBleScan: vi.fn(), stopBleScan: vi.fn(),
  selectDevice: vi.fn(), clearState: vi.fn(),
} }));

const turn = async () => { for (let index = 0; index < 24; index++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

const device = { id: 'pending-scan-fixture', name: 'Offline fixture', transport: 'ble' as const };

function setup() {
  const release = vi.fn();
  vi.mocked(bleScanner.acquireExclusive).mockResolvedValue(release);
  const page = new Esp32ProvisionPage({ run: (callback: () => void) => callback() } as any,
    { detectChanges: vi.fn() } as any, {} as any, {} as any, {} as any,
    { auth: { uuid: 'offline-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } as any,
    {} as any, { snapshot: { queryParamMap: { get: () => null } } } as any,
    {} as any, {} as any, { active: new BehaviorSubject(true) } as any);
  Object.defineProperty(page, 'nativeSupported', { value: true });
  // Preserve the real select -> connectSession call boundary, without entering
  // identity, WiFi scanning, network configuration or any real native session.
  const connectSession = vi.spyOn(page as any, 'connectSession').mockResolvedValue(undefined);
  vi.mocked(WiFiProv.selectDevice).mockResolvedValue({ ...device, connected: false, security: 1, capabilities: [] });
  return { page, release, connectSession };
}

async function dispose(page: Esp32ProvisionPage) {
  page.ngOnDestroy();
  await (page as any).releasePlugin().catch(() => undefined);
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.spyOn(bleScanner, 'acquireExclusive');
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' });
  vi.mocked(WiFiProv.startBleScan).mockResolvedValue({ started: true });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('DA-3 WiFiProv scan start -> stop -> selection handoff', () => {
  it('drains the exact pending start and confirms stop before selecting or connecting once', async () => {
    const started = deferred<{ started: boolean }>(), stopped = deferred<void>(), f = setup();
    vi.mocked(WiFiProv.startBleScan).mockReturnValueOnce(started.promise);
    vi.mocked(WiFiProv.stopBleScan).mockReturnValueOnce(stopped.promise);
    const start = f.page.startBleScan(); await turn();
    // A real plugin discovery event may arrive before start's JS promise. The
    // target is already in the page inventory; use the original selection API.
    f.page.devices = [device];
    const selection = f.page.selectBleDevice(device);
    try {
      await turn();
      expect(WiFiProv.stopBleScan).not.toHaveBeenCalled();
      expect(WiFiProv.selectDevice).not.toHaveBeenCalled(); expect(f.connectSession).not.toHaveBeenCalled();
      started.resolve({ started: true }); await turn();
      expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce();
      expect(WiFiProv.selectDevice).not.toHaveBeenCalled(); expect(f.connectSession).not.toHaveBeenCalled();
      stopped.resolve(); await Promise.all([start, selection]);
      expect(WiFiProv.selectDevice).toHaveBeenCalledOnce(); expect(f.connectSession).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      started.resolve({ started: true }); stopped.resolve();
      await Promise.allSettled([start, selection]); await dispose(f.page);
    }
  });

  it('does not let a stopped late start create an old timer, while a successor retains its full 12s budget', async () => {
    const first = deferred<{ started: boolean }>(), next = deferred<{ started: boolean }>(), f = setup();
    vi.mocked(WiFiProv.startBleScan).mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    const start = f.page.startBleScan(); await turn();
    const stop = f.page.stopBleScan();
    let successor: Promise<void> | undefined;
    try {
      first.resolve({ started: true }); await Promise.all([start, stop]);
      expect(vi.getTimerCount()).toBe(0);
      expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(5_000);
      successor = f.page.startBleScan(); await turn();
      expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(7_000);
      expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce();
      next.resolve({ started: true }); await successor;
      await vi.advanceTimersByTimeAsync(11_999);
      expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(WiFiProv.stopBleScan).toHaveBeenCalledTimes(2);
      expect(WiFiProv.selectDevice).not.toHaveBeenCalled(); expect(f.connectSession).not.toHaveBeenCalled();
    } finally {
      first.resolve({ started: true }); next.resolve({ started: true });
      await Promise.allSettled([start, stop, successor]); await dispose(f.page);
    }
  });

  it('shares one pending stop and rejects new scan or selection admission until it confirms', async () => {
    const stopped = deferred<void>(), f = setup();
    await f.page.startBleScan(); f.page.devices = [device];
    vi.mocked(WiFiProv.stopBleScan).mockReturnValueOnce(stopped.promise);
    const firstStop = f.page.stopBleScan(), repeatedStop = f.page.stopBleScan();
    try {
      await turn();
      expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce();
      expect(f.page.operationBusy).toBe(true);
      await f.page.startBleScan(); await f.page.selectBleDevice(device);
      expect(WiFiProv.startBleScan).toHaveBeenCalledOnce();
      expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce();
      expect(WiFiProv.selectDevice).not.toHaveBeenCalled(); expect(f.connectSession).not.toHaveBeenCalled();
      stopped.resolve(); expect(await firstStop).toBe(true); expect(await repeatedStop).toBe(true);
      expect(f.page.operationBusy).toBe(false);
    } finally {
      stopped.resolve(); await Promise.allSettled([firstStop, repeatedStop]); await dispose(f.page);
    }
  });

  it('leaving during the pending handoff never selects and failed physical stop keeps the lease fenced', async () => {
    const started = deferred<{ started: boolean }>(), stopped = deferred<void>(), f = setup();
    vi.mocked(WiFiProv.startBleScan).mockReturnValueOnce(started.promise);
    vi.mocked(WiFiProv.stopBleScan).mockImplementation(() => stopped.promise);
    const start = f.page.startBleScan(); await turn(); f.page.devices = [device];
    const selection = f.page.selectBleDevice(device);
    f.page.ionViewWillLeave();
    const releasing = (f.page as any).releasePlugin().catch((error: Error) => error) as Promise<unknown>;
    try {
      await turn();
      expect(WiFiProv.stopBleScan).not.toHaveBeenCalled(); expect(f.release).not.toHaveBeenCalled();
      started.resolve({ started: true }); await turn();
      expect(WiFiProv.stopBleScan).toHaveBeenCalled(); expect(f.release).not.toHaveBeenCalled();
      expect(WiFiProv.selectDevice).not.toHaveBeenCalled(); expect(f.connectSession).not.toHaveBeenCalled();
      stopped.reject(Error('OFFLINE_FIXTURE_NATIVE_STOP_UNCONFIRMED'));
      await Promise.allSettled([start, selection]);
      expect(await releasing).toMatchObject({ message: 'BLE_SCAN_CLOSE_FAILED' });
      expect(f.page.canOperate).toBe(false); expect(f.release).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      started.resolve({ started: true }); stopped.reject(Error('OFFLINE_FIXTURE_NATIVE_STOP_UNCONFIRMED'));
      await Promise.allSettled([start, selection, releasing]); await dispose(f.page);
    }
  });
});
