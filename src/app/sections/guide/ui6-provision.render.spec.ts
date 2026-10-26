import { ChangeDetectorRef, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AlertController, NavController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { cloudBetaCapabilities, localCapabilities } from '../../../environments/deployment';
import { DeviceUiPort } from '../../core/device-v2/device-ui.port';
import { DataService } from '../../core/services/data.service';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { DeviceV2ManagementService } from '../../core/services/device-v2-management.service';
import { UserService } from '../../core/services/user.service';
import { Esp32ProvisionPage } from '../../tools/esp32-provision/esp32-provision.page';
import { BleDeviceGuidePage } from './ble-device/ble-device.page';
import { GuidePage } from './guide.page';
import { KeyDeviceGuidePage } from './key-device/key-device.page';
import { WifiDeviceGuidePage } from './wifi-device/wifi-device.page';

const originalDeployment = environment.deployment;

async function render<T>(type: Type<T>) {
  // Native/session behavior has its own existing suites. These real-template
  // cases must never start plugin, storage, permission or network work.
  vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnInit').mockResolvedValue(undefined);
  vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnDestroy').mockImplementation(() => undefined);
  const nav = { navigateForward: vi.fn(async () => true), navigateRoot: vi.fn(async () => true) };
  const management = { createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn() };
  const ble = { pendingEnrollmentLogicalDeviceIds: vi.fn(), discoverProvisioningDevices: vi.fn(), enroll: vi.fn(), resume: vi.fn() };
  await TestBed.configureTestingModule({ imports: [type], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
    { provide: DataService, useValue: { auth: { uuid: 'ui6-fixture', accessToken: 'fixture' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } },
    { provide: DeviceV2ManagementService, useValue: management },
    { provide: DeviceV2BleService, useValue: ble },
    { provide: UserService, useValue: { getAllInfo: vi.fn(async () => true) } },
    { provide: DeviceUiPort, useValue: {} }, { provide: NavController, useValue: nav },
    { provide: ToastController, useValue: {} }, { provide: AlertController, useValue: {} },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(type);
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, nav, management, ble };
}

describe('UI6 production provisioning templates and retained gates', () => {
  afterEach(() => {
    TestBed.resetTestingModule(); vi.restoreAllMocks();
    environment.deployment = originalDeployment;
  });

  it('keeps all deployed methods in the settings list and omits the genuinely empty migration group', async () => {
    environment.deployment = localCapabilities;
    const f = await render(GuidePage);
    expect(f.element.querySelectorAll('.menu-list--settings')).toHaveLength(1);
    expect(f.element.querySelectorAll('.menu-row')).toHaveLength(3);
    expect(f.element.querySelectorAll('.section-label')).toHaveLength(1);
    (f.element.querySelectorAll('.menu-row')[1] as HTMLButtonElement).click(); await f.fixture.whenStable();
    expect(f.nav.navigateForward).toHaveBeenCalledExactlyOnceWith('/guide/wifi');
  });

  it('retains the existing deployment gate rather than advertising direct access when closed', async () => {
    environment.deployment = cloudBetaCapabilities;
    const f = await render(GuidePage);
    expect(f.element.querySelectorAll('.menu-row')).toHaveLength(1);
    expect(f.element.textContent).toContain('DEVICE_GUIDE.KEY_METHOD_TITLE');
    expect(f.element.textContent).not.toContain('DEVICE_GUIDE.BLE_TITLE');
    await f.page.selectMethod({ id: 'wifi', title: 'not deployed', route: '/guide/wifi' });
    expect(f.nav.navigateForward).not.toHaveBeenCalled();
  });

  it('keeps WiFi preparation and its one existing provisioning navigation', async () => {
    const f = await render(WifiDeviceGuidePage);
    expect(f.element.querySelectorAll('.setup-steps li')).toHaveLength(3);
    expect(f.element.querySelector('.method-tip')).not.toBeNull();
    f.element.querySelector<HTMLButtonElement>('.primary-action')!.click(); await f.fixture.whenStable();
    expect(f.nav.navigateForward).toHaveBeenCalledExactlyOnceWith('/tools/esp32-provision');
  });

  it('keeps BLE recovery, exact identity and failure visible without beginning another enrollment', async () => {
    const f = await render(BleDeviceGuidePage);
    f.page.phase = 'failed'; f.page.error = '请核对原设备再手动恢复'; f.page.pendingEnrollments = ['original-identity'];
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.ble-recovery')?.textContent).toContain('original-identity');
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain(f.page.error);
    expect(f.element.querySelector('.primary-action')?.textContent).toContain('DEVICE_GUIDE.BLE_RETRY');
    const recover = vi.spyOn(f.page, 'resumeEnrollment').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.ble-recovery button')!.click(); await f.fixture.whenStable();
    expect(recover).toHaveBeenCalledExactlyOnceWith('original-identity');
    expect(f.ble.enroll).not.toHaveBeenCalled(); expect(f.ble.discoverProvisioningDevices).not.toHaveBeenCalled();
  });

  it('keeps busy BLE inputs disabled and presents ready identity separately from preparation', async () => {
    const f = await render(BleDeviceGuidePage);
    f.page.phase = 'recovering'; f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector<HTMLInputElement>('.device-name input')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.primary-action')!.disabled).toBe(true);
    f.page.phase = 'ready'; f.page.logicalDeviceId = 'ble-original'; f.page.endpointCount = 2;
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.setup-steps')).toBeNull();
    expect(f.element.querySelector('.ready[role="status"]')?.textContent).toContain('ble-original');
    expect(f.element.querySelectorAll('dd')[1]?.textContent).toBe('2');
  });

  it('keeps Key creation busy gate and associates the name help without changing input', async () => {
    const f = await render(KeyDeviceGuidePage);
    f.page.phase = 'creating'; f.page.deviceName = '  exact draft name  ';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const input = f.element.querySelector<HTMLInputElement>('#key-device-name')!;
    expect(input.value).toBe('  exact draft name  '); expect(input.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('form button')!.disabled).toBe(true);
    expect(f.element.querySelector(`#${input.getAttribute('aria-describedby')}`)).not.toBeNull();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('keeps a revealed Key concealed, allows the original visibility action and progressively shows only the code example', async () => {
    const f = await render(KeyDeviceGuidePage);
    f.page.phase = 'revealed'; f.page.secretKey = '  exact-Key+/=  ';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.key-value-row code')?.textContent).not.toContain('exact-Key');
    const reveal = f.element.querySelector<HTMLButtonElement>('.key-visibility')!;
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
    reveal.click(); f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.key-value-row code')?.textContent).toBe('  exact-Key+/=  ');
    expect(reveal.getAttribute('aria-pressed')).toBe('true');
    const example = f.element.querySelector<HTMLDetailsElement>('.setup-example')!;
    expect(example.open).toBe(false); expect(example.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
    expect(example.textContent).toContain('REPLACE_WITH_DEVICE_KEY');
    expect(example.textContent).not.toContain(f.page.secretKey);
    expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('keeps native unavailability and reconfigure consequences outside the technical disclosure', async () => {
    const f = await render(Esp32ProvisionPage);
    Object.defineProperty(f.page, 'nativeSupported', { value: false });
    (f.page as any).reconfigureContext = { logicalDeviceId: 'original-device' };
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelectorAll('.notice.warning')).toHaveLength(2);
    expect(f.element.querySelector('.notice.warning')?.textContent).toContain('使旧云端凭据失效');
    expect(f.element.querySelector<HTMLButtonElement>('.scan-options button')!.disabled).toBe(true);
    expect(f.element.querySelector('.wifi-card')).toBeNull();
    const tips = f.element.querySelector<HTMLDetailsElement>('details.tips')!;
    expect(tips.open).toBe(false); expect(tips.textContent).toContain('Security 1');
  });

  it('retains BLE/SoftAP selection and exact password drafts before a connected session exists', async () => {
    const f = await render(Esp32ProvisionPage);
    Object.defineProperty(f.page, 'nativeSupported', { value: true });
    f.page.transport = 'softap'; f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelectorAll('.transport-switch button')[1].getAttribute('aria-pressed')).toBe('true');
    expect(f.element.querySelector('#device-prefix')).toBeNull();
    const password = f.element.querySelector<HTMLInputElement>('#softap-password')!;
    password.value = '  exact SoftAP password  '; password.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    expect(f.page.softApPassword).toBe('  exact SoftAP password  ');
    expect(f.element.querySelector('.wifi-card')).toBeNull();
    expect(f.element.querySelector('.status-card.success')).toBeNull();
  });

  it('separates a connected provisioning session from success and preserves canProvision plus exact WiFi drafts', async () => {
    const f = await render(Esp32ProvisionPage);
    f.page.selectedDevice = { name: 'matching-device', connected: true, transport: 'ble', security: 1 } as any;
    f.page.phase = 'ready'; f.page.ssid = ''; f.page.password = '  unchanged WiFi password  ';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.connected-card')?.textContent).toContain('安全会话已连接');
    expect(f.element.querySelector('.status-card.success')).toBeNull();
    expect(f.element.querySelector<HTMLButtonElement>('.provision-button')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLInputElement>('#wifi-password')!.value).toBe('  unchanged WiFi password  ');
    const ssid = f.element.querySelector<HTMLInputElement>('#wifi-ssid')!;
    ssid.value = '  WiFi SSID  '; ssid.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    expect(f.page.ssid).toBe('  WiFi SSID  ');
    expect(f.element.querySelector<HTMLButtonElement>('.provision-button')!.disabled).toBe(false);
    f.page.phase = 'provisioning';
    f.fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck(); await f.fixture.whenStable();
    expect(f.element.querySelector<HTMLButtonElement>('.provision-button')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLInputElement>('#wifi-password')!.disabled).toBe(true);
    expect(f.page.password).toBe('  unchanged WiFi password  ');
  });

  it('keeps failure recovery explicit and success navigation on the original two different handlers', async () => {
    const f = await render(Esp32ProvisionPage);
    const reset = vi.spyOn(f.page, 'startOver').mockResolvedValue(undefined);
    const open = vi.spyOn(f.page, 'openProvisionedDevice').mockResolvedValue(undefined);
    f.page.phase = 'error'; f.page.statusMessage = '只读错误，手动重新开始'; f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.status-card.error[role="status"]')?.textContent).toContain(f.page.statusMessage);
    f.element.querySelector<HTMLButtonElement>('.retry-button')!.click(); await f.fixture.whenStable();
    expect(reset).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
    f.page.phase = 'success'; f.page.statusMessage = '网络配置完成';
    f.fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck(); await f.fixture.whenStable();
    f.element.querySelector<HTMLButtonElement>('.retry-button')!.click(); await f.fixture.whenStable();
    expect(open).toHaveBeenCalledOnce(); expect(reset).toHaveBeenCalledOnce();
    expect(f.element.querySelectorAll('.status-card.success')).toHaveLength(1);
  });
});
