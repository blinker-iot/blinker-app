import '@angular/compiler';
import { BehaviorSubject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  stopBleScan: vi.fn(), selectDevice: vi.fn(), connect: vi.fn(), scanWifiNetworks: vi.fn(), clearState: vi.fn(),
} }));
const device = { id: 'AA:BB:CC:DD:EE:FF', name: 'BLINKER_FIXTURE', transport: 'ble' as const };
const turn = async () => { for (let i = 0; i < 20; ++i) await Promise.resolve(); };
function setup() {
  const page = new Esp32ProvisionPage({ run: (cb: () => void) => cb() } as any,
    { detectChanges: vi.fn() } as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, { snapshot: { queryParamMap: { get: () => null } } } as any, {} as any, {} as any,
    { active: new BehaviorSubject(true) } as any);
  Object.defineProperty(page, 'nativeSupported', { value: true });
  return page;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.selectDevice).mockResolvedValue({ ...device, connected: false, security: 1, capabilities: [] });
  vi.mocked(WiFiProv.connect).mockResolvedValue({ ...device, connected: true, security: 1, capabilities: [] });
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('BLE firmware PoP uses the existing WiFiProv selection and connection', () => {
  it('passes the same untrimmed PoP to selection and connect without retaining a new preference', async () => {
    const page = setup(), pop = ' fixture-配网码 ';
    page.provisioningPoP = pop; page.provisioningPoPVisible = true;
    const storage = vi.spyOn(localStorage, 'setItem');
    await page.selectBleDevice(device);
    expect(WiFiProv.selectDevice).toHaveBeenCalledExactlyOnceWith({ id: device.id, security: 1, pop });
    expect(WiFiProv.connect).toHaveBeenCalledExactlyOnceWith({ softApPassword: undefined, pop });
    expect(page.provisioningPoPVisible).toBe(false); expect(page.phase).toBe('ready');
    expect(storage).not.toHaveBeenCalled();
  });

  it('retains the legacy no-PoP BLE contract when firmware has none', async () => {
    const page = setup(); await page.selectBleDevice(device);
    expect(WiFiProv.selectDevice).toHaveBeenCalledExactlyOnceWith({ id: device.id, security: 1 });
    expect(WiFiProv.connect).toHaveBeenCalledExactlyOnceWith({ softApPassword: undefined });
  });

  it.each([' ', 'bad\0pop', 'a'.repeat(65), '码'.repeat(22)])('rejects invalid PoP before any native selection or scan change (%#)', async pop => {
    const page = setup(); page.provisioningPoP = pop;
    await page.selectBleDevice(device);
    expect(page.provisioningPoPError).not.toBe(''); expect(page.phase).toBe('idle');
    expect(WiFiProv.stopBleScan).not.toHaveBeenCalled(); expect(WiFiProv.selectDevice).not.toHaveBeenCalled();
    expect(WiFiProv.connect).not.toHaveBeenCalled();
  });

  it('keeps the validated selection PoP while the native selection is pending', async () => {
    const page = setup(); page.provisioningPoP = 'fixture-original';
    let selected!: (value: any) => void;
    vi.mocked(WiFiProv.selectDevice).mockReturnValue(new Promise(resolve => { selected = resolve; }));
    const pending = page.selectBleDevice(device); await turn();
    page.provisioningPoP = 'fixture-late'; // An external mutation cannot change the already selected connection.
    selected({ ...device, connected: false, security: 1, capabilities: [] }); await pending;
    expect(WiFiProv.connect).toHaveBeenCalledExactlyOnceWith({ softApPassword: undefined, pop: 'fixture-original' });
  });

  it('clears the PoP and never connects after leaving during native selection', async () => {
    const page = setup(); page.provisioningPoP = 'fixture-only'; page.provisioningPoPVisible = true;
    let selected!: (value: any) => void;
    vi.mocked(WiFiProv.selectDevice).mockReturnValue(new Promise(resolve => { selected = resolve; }));
    const pending = page.selectBleDevice(device); await turn(); page.ionViewWillLeave();
    selected({ ...device, connected: false, security: 1, capabilities: [] }); await pending;
    await (page as any).releasePlugin();
    expect(page.provisioningPoP).toBe(''); expect(page.provisioningPoPVisible).toBe(false);
    expect(WiFiProv.connect).not.toHaveBeenCalled();
  });

  it('never automatically retries a failed PoP connection', async () => {
    const page = setup(); page.provisioningPoP = 'fixture-only';
    vi.mocked(WiFiProv.connect).mockRejectedValue(Error('fixture-security-rejected'));
    await page.selectBleDevice(device); await turn();
    expect(page.phase).toBe('error'); expect(WiFiProv.selectDevice).toHaveBeenCalledOnce();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
  });
});
