import '@angular/compiler';
import { BehaviorSubject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), createDevice: vi.fn(), startBleScan: vi.fn(),
} }));
const granted = { bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' } as const;
const pages: Esp32ProvisionPage[] = [];
function setup() {
  const page = new Esp32ProvisionPage({ run: (cb: () => void) => cb() } as any,
    { detectChanges: vi.fn() } as any, {} as any, {} as any, {} as any,
    { auth: { uuid: 'permission-fixture' }, sessionEpoch: 1 } as any, {} as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, {} as any, {} as any,
    { active: new BehaviorSubject(true) } as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  const acquire = vi.spyOn(page as any, 'acquireDiscovery').mockResolvedValue(undefined);
  const connect = vi.spyOn(page as any, 'connectSession').mockResolvedValue(undefined);
  vi.spyOn(page as any, 'releasePlugin').mockResolvedValue(undefined);
  return { page, acquire, connect };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ ...granted });
  vi.mocked(WiFiProv.startBleScan).mockResolvedValue({ started: true });
  vi.mocked(WiFiProv.createDevice).mockResolvedValue({ transport: 'softap' } as any);
});
afterEach(() => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('WiFiProv operation-specific permission prerequisite', () => {
  it('asks for BLE permissions using the operation, not the current UI selector', async () => {
    const f = setup(); f.page.transport = 'softap'; await f.page.startBleScan();
    expect(WiFiProv.requestPermissions).toHaveBeenCalledExactlyOnceWith({ transport: 'ble' });
    expect(f.acquire).toHaveBeenCalledOnce(); expect(WiFiProv.startBleScan).toHaveBeenCalledOnce();
  });

  it('asks for SoftAP permissions before creating its SDK device, independently of the UI selector', async () => {
    const f = setup(); f.page.transport = 'ble'; await f.page.connectSoftAp();
    expect(WiFiProv.requestPermissions).toHaveBeenCalledExactlyOnceWith({ transport: 'softap' });
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(f.connect).toHaveBeenCalledOnce();
    expect(f.acquire).not.toHaveBeenCalled();
  });

  it.each(['denied', 'prompt', 'prompt-with-rationale'])('does not enter SoftAP when a required permission remains %s', async state => {
    const f = setup(); vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ ...granted, location: state } as any);
    await f.page.connectSoftAp();
    expect(f.page.phase).toBe('error'); expect(WiFiProv.createDevice).not.toHaveBeenCalled();
    expect(f.connect).not.toHaveBeenCalled(); expect(WiFiProv.requestPermissions).toHaveBeenCalledOnce();
  });

  it.each([{}, { bluetooth: 'granted' }])('rejects incomplete native permission results %j', async result => {
    const f = setup(); vi.mocked(WiFiProv.requestPermissions).mockResolvedValue(result as any);
    await f.page.startBleScan();
    expect(f.page.phase).toBe('error'); expect(f.acquire).not.toHaveBeenCalled();
    expect(WiFiProv.startBleScan).not.toHaveBeenCalled();
  });

  it('does not enter SoftAP after a permission response arrives following leave', async () => {
    let resolve!: (value: typeof granted) => void;
    vi.mocked(WiFiProv.requestPermissions).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const f = setup(); const work = f.page.connectSoftAp();
    f.page.ionViewWillLeave(); resolve(granted); await work;
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
    expect(WiFiProv.requestPermissions).toHaveBeenCalledOnce();
  });
});
