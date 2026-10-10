import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WiFiProv } from 'capacitor-wifiprov';
import { bleScanner } from '../../core/bluetooth/scan';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), startBleScan: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(),
} }));
const turn = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => { let resolve!: () => void;
  return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() }; };

function fixture() {
  const page = new Esp32ProvisionPage({ run: (cb: () => void) => cb() } as any,
    { detectChanges: vi.fn() } as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, {} as any, {} as any);
  Object.defineProperty(page, 'nativeSupported', { value: true });
  return page;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.spyOn(bleScanner, 'acquireExclusive');
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({} as any);
  vi.mocked(WiFiProv.startBleScan).mockResolvedValue({ started: true });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('WiFiProv discovery ownership', () => {
  it('waits for the central scanner, reuses the page lease, and releases after native close', async () => {
    const drain = deferred(), release = vi.fn(), closed = deferred(), page = fixture();
    vi.mocked(bleScanner.acquireExclusive).mockImplementation(async () => { await drain.promise; return release; });
    const start = page.startBleScan(); await turn();
    expect(WiFiProv.startBleScan).not.toHaveBeenCalled();
    await page.startBleScan(); expect(bleScanner.acquireExclusive).toHaveBeenCalledOnce();
    drain.resolve(); await start; await page.stopBleScan(); await page.startBleScan();
    expect(bleScanner.acquireExclusive).toHaveBeenCalledOnce(); expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(2);
    vi.mocked(WiFiProv.clearState).mockReturnValue(closed.promise);
    page.ngOnDestroy(); await turn(); expect(release).not.toHaveBeenCalled();
    closed.resolve(); await (page as any).releasePlugin(); expect(release).toHaveBeenCalledOnce();
  });

  it('leaving during acquisition never starts WiFiProv and returns the late lease', async () => {
    const drain = deferred(), release = vi.fn(), page = fixture();
    vi.mocked(bleScanner.acquireExclusive).mockImplementation(async () => { await drain.promise; return release; });
    const start = page.startBleScan(); await turn(); page.ngOnDestroy(); drain.resolve();
    await start; await (page as any).releasePlugin();
    expect(WiFiProv.startBleScan).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
  });

  it('leaving during SDK start drains it before stop and release, without a late timer', async () => {
    const started = deferred(), release = vi.fn(), page = fixture();
    vi.mocked(bleScanner.acquireExclusive).mockResolvedValue(release);
    vi.mocked(WiFiProv.startBleScan).mockImplementation(async () => { await started.promise; return { started: true }; });
    const start = page.startBleScan(); await turn(); page.ngOnDestroy(); await turn();
    expect(WiFiProv.stopBleScan).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
    started.resolve(); await start; await (page as any).releasePlugin();
    expect(WiFiProv.stopBleScan).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uncertain native close never releases ownership to Presence or Direct', async () => {
    const release = vi.fn(), page = fixture();
    vi.mocked(bleScanner.acquireExclusive).mockResolvedValue(release);
    await page.startBleScan();
    vi.mocked(WiFiProv.clearState).mockRejectedValue(Error('SDK'));
    page.ngOnDestroy(); await expect((page as any).releasePlugin()).rejects.toThrow('BLE_SCAN_CLOSE_FAILED');
    expect(release).not.toHaveBeenCalled();
  });

  it('permission denial never acquires the scanner', async () => {
    const page = fixture(); vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ bluetooth: 'denied' } as any);
    await page.startBleScan(); expect(page.phase).toBe('error');
    expect(bleScanner.acquireExclusive).not.toHaveBeenCalled(); expect(WiFiProv.startBleScan).not.toHaveBeenCalled();
  });

  it('leaving during permissions prevents late acquisition and SDK start', async () => {
    const permission = deferred(), page = fixture();
    vi.mocked(WiFiProv.requestPermissions).mockImplementation(async () => { await permission.promise; return {} as any; });
    const start = page.startBleScan(); await turn(); page.ngOnDestroy(); permission.resolve(); await start;
    await (page as any).releasePlugin();
    expect(bleScanner.acquireExclusive).not.toHaveBeenCalled(); expect(WiFiProv.startBleScan).not.toHaveBeenCalled();
  });
});
