import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: { provision: vi.fn() } }));

const pages: Esp32ProvisionPage[] = [];
const network = { ssid: 'fixture-network', rssi: -42, security: 1 };
let setItemSpy: MockInstance<Storage['setItem']>;
let removeItemSpy: MockInstance<Storage['removeItem']>;

function setup() {
  const user = { getAllInfo: vi.fn() };
  const page = new Esp32ProvisionPage(
    { run: (work: () => void) => work() } as any,
    { detectChanges: vi.fn() } as any,
    {} as any, {} as any, user as any,
    { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1 } as any,
    {} as any, { snapshot: { queryParamMap: { get: () => null } } } as any,
    {} as any, {} as any, { active: new BehaviorSubject(true) } as any,
  );
  pages.push(page);
  vi.spyOn(page as any, 'releasePlugin').mockResolvedValue(undefined);
  page.selectedDevice = { name: 'fixture-device', connected: true, transport: 'ble', security: 1, capabilities: [] };
  page.phase = 'ready';
  page.ssid = 'previous-fixture-network';
  page.password = 'fixture-password-draft';
  return { page, user };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(WiFiProv.provision).mockResolvedValue({ success: false });
  // test-setup supplies MemoryStorage, not the browser Storage prototype.
  // Observe its actual instance without changing another suite's values.
  setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => undefined);
  removeItemSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  vi.restoreAllMocks();
});

describe('AR-4 network selection and exact WiFi input boundary', () => {
  it('selects only the SSID, preserving the password draft without sending or remembering it', () => {
    const { page, user } = setup();
    page.selectNetwork(network);
    expect(page.ssid).toBe(network.ssid);
    expect(page.password).toBe('fixture-password-draft');
    expect(page.rememberNetwork).toBe(false);
    expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(user.getAllInfo).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it('cannot select another network or change remembered preferences while provisioning', () => {
    const { page } = setup();
    page.phase = 'provisioning';
    page.selectNetwork(network);
    page.toggleRemember();
    expect(page.ssid).toBe('previous-fixture-network');
    expect(page.password).toBe('fixture-password-draft');
    expect(page.rememberNetwork).toBe(false);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('blocks empty or whitespace-only SSID before identity work or native sending', async () => {
    const { page } = setup();
    const identity = vi.spyOn(page as any, 'installBlinkerIdentity').mockResolvedValue(undefined);
    for (const ssid of ['', '   ']) {
      page.ssid = ssid;
      expect(page.canProvision).toBe(false);
      await page.provision();
    }
    expect(identity).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('passes a selected SSID with significant edge spaces and the exact password to the original native port', async () => {
    const { page, user } = setup();
    const ssid = '  fixture SSID  ', password = '  fixture password  ';
    page.selectNetwork({ ...network, ssid }); page.password = password;
    // Identity is explicitly treated as already confirmed. This is an input
    // boundary test, not Bootstrap, authentication, GATT, or device acceptance.
    const identity = vi.spyOn(page as any, 'installBlinkerIdentity').mockResolvedValue(undefined);
    const open = vi.spyOn(page, 'openProvisionedDevice');
    expect(page.canProvision).toBe(true);
    await page.provision();
    expect(identity).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).toHaveBeenCalledExactlyOnceWith({ ssid, password });
    expect(open).not.toHaveBeenCalled(); expect(user.getAllInfo).not.toHaveBeenCalled();
    expect(page.phase).toBe('error'); // Explicit device failure; never infer Cloud success.
  });

  it('remembers WiFi only after an explicit click when the operation is no longer busy', () => {
    const { page } = setup(); page.ssid = network.ssid;
    page.scanningNetworks = true; page.toggleRemember();
    expect(page.rememberNetwork).toBe(false); expect(setItemSpy).not.toHaveBeenCalled();
    page.scanningNetworks = false;
    expect(setItemSpy).not.toHaveBeenCalled();
    page.toggleRemember();
    expect(page.rememberNetwork).toBe(true);
    expect(setItemSpy).toHaveBeenCalledExactlyOnceWith('wifiProvNetwork', JSON.stringify({
      ssid: network.ssid, password: 'fixture-password-draft', remember: true,
    }));
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });
});
