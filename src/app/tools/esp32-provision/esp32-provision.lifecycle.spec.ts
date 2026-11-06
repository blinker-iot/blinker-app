import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { bleScanner } from '../../core/bluetooth/scan';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), getCapabilities: vi.fn(), addListener: vi.fn(), startBleScan: vi.fn(),
  stopBleScan: vi.fn(), clearState: vi.fn(), selectDevice: vi.fn(), createDevice: vi.fn(),
  connect: vi.fn(), scanWifiNetworks: vi.fn(), provision: vi.fn(),
} }));
const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
function deferred<T>() { let resolve!: (v: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (v: T) => resolve(v) }; }
function setup() {
  const release = vi.fn(), visibility = { active: new BehaviorSubject(true) };
  const callbacks = new Map<string, (event: any) => void>(), removes: ReturnType<typeof vi.fn>[] = [];
  vi.mocked(bleScanner.acquireExclusive).mockResolvedValue(release);
  vi.mocked(WiFiProv.addListener).mockImplementation(async (name: any, callback: any) => {
    callbacks.set(name, callback); const remove = vi.fn(async () => undefined); removes.push(remove); return { remove };
  });
  const data = { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const page: Esp32ProvisionPage = new (Esp32ProvisionPage as any)(
    { run: (cb: () => void) => cb() }, { detectChanges: vi.fn() },
    { create: vi.fn(async () => ({ present: vi.fn() })) }, {}, {}, data, {},
    { snapshot: { queryParamMap: { get: () => null } } }, {}, {}, visibility,
  );
  Object.defineProperty(page, 'nativeSupported', { value: true });
  return { page, visibility, callbacks, removes, release, data };
}
function connected(page: Esp32ProvisionPage) {
  page.selectedDevice = { id: 'fixture-device', name: 'Fixture', connected: true, transport: 'ble', security: 1, capabilities: [] };
  page.phase = 'ready'; page.ssid = 'fixture-network';
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.spyOn(bleScanner, 'acquireExclusive');
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' });
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({} as any);
  vi.mocked(WiFiProv.startBleScan).mockResolvedValue({ started: true });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined); vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [] });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('WiFiProv bounded page lifecycle and operation gates', () => {
  it('blocks both the send gate and direct provision call during a WiFi scan', async () => {
    const f = setup(); connected(f.page); f.page.scanningNetworks = true;
    const install = vi.spyOn(f.page as any, 'installBlinkerIdentity').mockResolvedValue(undefined);
    expect(f.page.canProvision).toBe(false); await f.page.provision();
    expect(install).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('does not scan WiFi or change transport while a write is in progress', async () => {
    const f = setup(); connected(f.page); f.page.phase = 'provisioning';
    await f.page.scanWifiNetworks(); f.page.setTransport('softap');
    expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled(); expect(f.page.transport).toBe('ble'); f.page.ngOnDestroy();
  });
  it('releases a cached page only after native close and prepares it on explicit reentry, without scanning', async () => {
    const f = setup(), close = deferred<void>(); await f.page.ngOnInit(); await f.page.startBleScan();
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(close.promise);
    (f.page as any).ionViewWillLeave(); await turn(); expect(f.release).not.toHaveBeenCalled();
    close.resolve(); await (f.page as any).releasePlugin(); expect(f.release).toHaveBeenCalledOnce();
    expect(f.removes.every(remove => remove.mock.calls.length === 1)).toBe(true);
    const starts = vi.mocked(WiFiProv.startBleScan).mock.calls.length;
    await (f.page as any).ionViewWillEnter(); expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(starts);
    await f.page.startBleScan(); expect(bleScanner.acquireExclusive).toHaveBeenCalledTimes(2); f.page.ngOnDestroy();
  });
  it('releases on background but never automatically restarts or reconnects on foreground', async () => {
    const f = setup(); await f.page.ngOnInit(); await f.page.startBleScan();
    f.visibility.active.next(false); await turn(); expect(f.release).toHaveBeenCalledOnce();
    f.visibility.active.next(true); await turn();
    expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(1); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(f.page.phase).toBe('error'); f.page.ngOnDestroy();
  });
  it('does not start after a permission response arrives on a cached hidden page', async () => {
    const f = setup(), permission = deferred<any>(); vi.mocked(WiFiProv.requestPermissions).mockReturnValueOnce(permission.promise);
    const start = f.page.startBleScan(); await turn(); (f.page as any).ionViewWillLeave();
    permission.resolve({ bluetooth: 'granted' }); await start; await turn();
    expect(bleScanner.acquireExclusive).not.toHaveBeenCalled(); expect(WiFiProv.startBleScan).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('does not revive a previous permission request after cached reentry starts a new generation', async () => {
    const f = setup(), permission = deferred<any>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.requestPermissions).mockReturnValueOnce(permission.promise);
    const previous = f.page.startBleScan(); await turn();
    expect(f.page.phase).toBe('permissions');
    f.page.ionViewWillLeave(); await turn(); await f.page.ionViewWillEnter();
    expect(f.page.phase).toBe('idle');
    permission.resolve({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' });
    await previous; await turn();
    expect(f.page.phase).toBe('idle'); expect(f.page.devices).toEqual([]);
    expect(bleScanner.acquireExclusive).not.toHaveBeenCalled(); expect(WiFiProv.startBleScan).not.toHaveBeenCalled();
    await f.page.startBleScan();
    expect(bleScanner.acquireExclusive).toHaveBeenCalledOnce(); expect(WiFiProv.startBleScan).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('keeps immediate cached reentry fenced until the previous native close is confirmed', async () => {
    const f = setup(), close = deferred<void>(); await f.page.ngOnInit(); await f.page.startBleScan();
    const previousConnection = f.callbacks.get('connectionState')!, previousScan = f.callbacks.get('bleScanResult')!;
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(close.promise);
    f.page.ionViewWillLeave(); await turn();
    let returned = false; const returning = f.page.ionViewWillEnter().then(() => { returned = true; }); await turn();
    expect(returned).toBe(false); expect(f.page.canOperate).toBe(false); expect(f.release).not.toHaveBeenCalled();
    expect(WiFiProv.getCapabilities).toHaveBeenCalledOnce();
    await f.page.startBleScan(); expect(WiFiProv.startBleScan).toHaveBeenCalledOnce();
    previousConnection({ state: 'connected', device: { connected: true, name: 'previous-owner' } });
    previousScan({ id: 'previous-device', name: 'previous-owner', transport: 'ble' });
    expect(f.page.sessionReady).toBe(false); expect(f.page.devices).toEqual([]);
    close.resolve(); await returning;
    expect(returned).toBe(true); expect(f.release).toHaveBeenCalledOnce(); expect(f.page.phase).toBe('idle');
    expect(f.page.canOperate).toBe(true); expect(WiFiProv.getCapabilities).toHaveBeenCalledTimes(2);
    previousConnection({ state: 'connected', device: { connected: true, name: 'previous-owner' } });
    previousScan({ id: 'previous-device', name: 'previous-owner', transport: 'ble' });
    expect(f.page.sessionReady).toBe(false); expect(f.page.devices).toEqual([]);
    expect(WiFiProv.startBleScan).toHaveBeenCalledOnce();
    await f.page.startBleScan(); expect(bleScanner.acquireExclusive).toHaveBeenCalledTimes(2);
    expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(2); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('discards a late WiFi list after leaving and cannot re-enable the send button', async () => {
    const f = setup(), scan = deferred<any>(); connected(f.page); vi.mocked(WiFiProv.scanWifiNetworks).mockReturnValueOnce(scan.promise);
    const work = f.page.scanWifiNetworks(); (f.page as any).ionViewWillLeave();
    scan.resolve({ networks: [{ ssid: 'old-fixture', rssi: -30, security: 1 }] }); await work;
    expect(f.page.networks).toEqual([]); expect(f.page.canProvision).toBe(false); f.page.ngOnDestroy();
  });
  it('does not connect when stopping the previous scan was not confirmed', async () => {
    const f = setup(); await f.page.startBleScan(); vi.mocked(WiFiProv.stopBleScan).mockRejectedValueOnce(Error('close failed'));
    await f.page.selectBleDevice({ id: 'fixture-device', name: 'Fixture', transport: 'ble' });
    expect(WiFiProv.selectDevice).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled(); expect(f.page.phase).toBe('error'); f.page.ngOnDestroy();
  });
  it('ignores an old native listener after cached leave, even before listener removal settles', async () => {
    const f = setup(), close = deferred<void>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(close.promise);
    const oldConnection = f.callbacks.get('connectionState')!; (f.page as any).ionViewWillLeave();
    oldConnection({ state: 'connected', device: { connected: true, name: 'old-fixture' } });
    expect(f.page.sessionReady).toBe(false); close.resolve(); await (f.page as any).releasePlugin(); f.page.ngOnDestroy();
  });
  it('discards a late connection and never starts WiFi scanning after cached leave', async () => {
    const f = setup(), connection = deferred<any>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.selectDevice).mockResolvedValue({ connected: false } as any);
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = f.page.selectBleDevice({ id: 'fixture-device', name: 'Fixture', transport: 'ble' }); await turn();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); (f.page as any).ionViewWillLeave(); await turn();
    connection.resolve({ connected: true }); await work;
    expect(f.page.sessionReady).toBe(false); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('keeps a failed native close fenced until an explicit manual retry confirms it', async () => {
    const f = setup(); await f.page.ngOnInit(); await f.page.startBleScan();
    vi.mocked(WiFiProv.clearState).mockRejectedValueOnce(Error('unknown native close'));
    f.visibility.active.next(false); await turn(); f.visibility.active.next(true); await turn();
    expect(f.release).not.toHaveBeenCalled(); expect(f.page.canOperate).toBe(false);
    await f.page.startBleScan(); expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(1);
    await f.page.startOver(); expect(f.release).toHaveBeenCalledOnce(); expect(f.page.canOperate).toBe(true);
    expect(WiFiProv.startBleScan).toHaveBeenCalledTimes(1); f.page.ngOnDestroy();
  });
  it('never continues an old identity completion into a WiFi write after leave and reentry', async () => {
    const f = setup(), identity = deferred<void>(); await f.page.ngOnInit(); connected(f.page);
    vi.spyOn(f.page as any, 'installBlinkerIdentity').mockReturnValueOnce(identity.promise);
    const work = f.page.provision(); (f.page as any).ionViewWillLeave();
    await (f.page as any).ionViewWillEnter(); identity.resolve(); await work;
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.page.phase).toBe('idle'); f.page.ngOnDestroy();
  });
});
