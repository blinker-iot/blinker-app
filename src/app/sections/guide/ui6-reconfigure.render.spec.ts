import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AlertController, NavController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { DeviceUiPort } from '../../core/device-v2/device-ui.port';
import { AppVisibilityService } from '../../core/services/app-visibility.service';
import { DataService } from '../../core/services/data.service';
import { DeviceV2ManagementService } from '../../core/services/device-v2-management.service';
import { UserService } from '../../core/services/user.service';
import { Esp32ProvisionPage } from '../../tools/esp32-provision/esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  getProvisioningNetworkState: vi.fn(), getCapabilities: vi.fn(), addListener: vi.fn(),
  stopBleScan: vi.fn(), clearState: vi.fn(), startBleScan: vi.fn(), connect: vi.fn(),
  provision: vi.fn(), sendCustomData: vi.fn(),
} }));
const id = 'device_11111111-1111-4111-8111-111111111111';
const context = { logicalDeviceId: id, credentialVersion: 7, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const turn = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}

async function renderColdReconfigure(authenticated: boolean) {
  const read = deferred<typeof context>();
  const management = { readDeviceContextV2: vi.fn((_id: string, _signal: AbortSignal) => read.promise),
    createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), rotateDeviceKeyV2: vi.fn() };
  const data = { auth: authenticated ? { uuid: 'qa01-owner' } as { uuid: string } | null : null,
    user: {}, sessionEpoch: authenticated ? 1 : 0, authDataChanged: new Subject<void>(), getDevice: vi.fn() };
  const user = { getAllInfo: vi.fn() };
  // Observe the real async lifecycle; unlike the UI-only suite, do not replace it.
  const initialize = vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnInit');
  await TestBed.configureTestingModule({ imports: [Esp32ProvisionPage], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: {
      get: (key: string) => key === 'mode' ? 'reconfigure' : key === 'logicalDeviceId' ? id : null,
    } } } },
    { provide: DataService, useValue: data }, { provide: DeviceV2ManagementService, useValue: management },
    { provide: UserService, useValue: user }, { provide: DeviceUiPort, useValue: {} },
    { provide: NavController, useValue: {} }, { provide: ToastController, useValue: {} },
    { provide: AlertController, useValue: {} },
    { provide: AppVisibilityService, useValue: { active: new BehaviorSubject(true) } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(Esp32ProvisionPage);
  fixture.autoDetectChanges(); await turn(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement,
    management, data, user, read, initialized: initialize.mock.results[0].value as Promise<void> };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.getProvisioningNetworkState).mockResolvedValue({ softApAttempted: false });
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ platform: 'android' } as any);
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
});
afterEach(async () => {
  TestBed.resetTestingModule(); await turn(); vi.restoreAllMocks();
});

function expectNoProvisioning(f: Awaited<ReturnType<typeof renderColdReconfigure>>) {
  expect(f.data.getDevice).not.toHaveBeenCalled(); expect(f.user.getAllInfo).not.toHaveBeenCalled();
  expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
  expect(WiFiProv.startBleScan).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
  expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
}

describe('QA-1 real-template cold owner context and explicit reentry', () => {
  it('waits for initial account restoration, then renders the single fresh read without a directory refresh', async () => {
    const f = await renderColdReconfigure(false);
    const scan = f.element.querySelector<HTMLButtonElement>('.scan-options button')!;
    expect(f.element.querySelector('ion-title')?.textContent).toContain('设备重新配网');
    expect(f.element.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    expect(scan.disabled).toBe(true); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    f.data.auth = { uuid: 'qa01-owner' }; f.data.sessionEpoch = 1; f.data.authDataChanged.next();
    await turn(); await f.fixture.whenStable();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledExactlyOnceWith(id, expect.any(AbortSignal));
    expect(scan.disabled).toBe(true); expect(WiFiProv.addListener).not.toHaveBeenCalled();
    f.read.resolve(context); await f.initialized; await f.fixture.whenStable();
    expect(f.element.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
    expect(scan.disabled).toBe(false); expect(WiFiProv.getCapabilities).toHaveBeenCalledOnce();
    expectNoProvisioning(f);
  });

  it('cancels the old read on leave and only the original restart button reads again after cached reentry', async () => {
    const f = await renderColdReconfigure(true);
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    const oldSignal = f.management.readDeviceContextV2.mock.calls[0][1];
    f.page.ionViewWillLeave(); expect(oldSignal.aborted).toBe(true);
    f.read.resolve({ ...context, credentialVersion: 8 }); await f.initialized; await turn();
    await f.page.ionViewWillEnter(); await f.fixture.whenStable();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    expect(f.element.querySelector<HTMLButtonElement>('.scan-options button')!.disabled).toBe(true);
    expect(WiFiProv.addListener).not.toHaveBeenCalled();
    const restart = f.element.querySelector<HTMLButtonElement>('.status-card > .retry-button')!;
    expect(restart.textContent).toContain('重新开始'); expect(restart.disabled).toBe(false);
    const freshRead = deferred<typeof context>();
    f.management.readDeviceContextV2.mockReturnValueOnce(freshRead.promise);
    restart.click(); await turn(); await f.fixture.whenStable();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(2);
    expect(f.management.readDeviceContextV2.mock.calls[1][0]).toBe(id);
    expect(f.management.readDeviceContextV2.mock.calls[1][1].aborted).toBe(false);
    expect(f.element.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    freshRead.resolve(context); await turn(); await f.fixture.whenStable();
    expect(f.element.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
    expect(f.element.querySelector<HTMLButtonElement>('.scan-options button')!.disabled).toBe(false);
    expect(f.element.querySelector('.status-card')).toBeNull();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(2);
    expect(WiFiProv.getCapabilities).toHaveBeenCalledOnce();
    expectNoProvisioning(f);
  });
});
