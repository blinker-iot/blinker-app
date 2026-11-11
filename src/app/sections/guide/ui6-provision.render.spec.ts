import { ChangeDetectorRef, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AlertController, NavController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API } from '../../configs/api.config';
import { cloudBetaCapabilities, localCapabilities } from '../../../environments/deployment';
import { DeviceUiPort } from '../../core/device-v2/device-ui.port';
import { DataService } from '../../core/services/data.service';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { DeviceV2ManagementService } from '../../core/services/device-v2-management.service';
import { UserService } from '../../core/services/user.service';
import { AppVisibilityService } from '../../core/services/app-visibility.service';
import { createWiFiProvUnknownCheckpoint, WIFI_PROV_UNKNOWN_TTL_MS } from '../../core/device-v2/provisioning/wifiprov-unknown-checkpoint';
import { wiFiProvCompletionResult } from '../../core/device-v2/provisioning/wifiprov-completion';
import { Esp32ProvisionPage } from '../../tools/esp32-provision/esp32-provision.page';
import { BleDeviceGuidePage } from './ble-device/ble-device.page';
import { GuidePage } from './guide.page';
import { KeyDeviceGuidePage } from './key-device/key-device.page';
import { WifiDeviceGuidePage } from './wifi-device/wifi-device.page';

const originalDeployment = environment.deployment;

async function render<T>(type: Type<T>, query: Record<string, string> = {}) {
  // Native/session behavior has its own existing suites. These real-template
  // cases must never start plugin, storage, permission or network work.
  vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnInit').mockResolvedValue(undefined);
  vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnDestroy').mockImplementation(() => undefined);
  const nav = { navigateForward: vi.fn(async () => true), navigateRoot: vi.fn(async () => true) };
  const management = { createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn() };
  const ble = { pendingEnrollmentLogicalDeviceIds: vi.fn(), discoverProvisioningDevices: vi.fn(), enroll: vi.fn(), resume: vi.fn(),
    accessRegistrationSources: vi.fn().mockResolvedValue([]), accessRegistrationCheckpoints: vi.fn().mockResolvedValue([]) };
  await TestBed.configureTestingModule({ imports: [type], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => query[key] ?? null } } } },
    { provide: DataService, useValue: { auth: { uuid: 'ui6-fixture', accessToken: 'fixture' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } },
    { provide: DeviceV2ManagementService, useValue: management },
    { provide: DeviceV2BleService, useValue: ble },
    { provide: UserService, useValue: { getAllInfo: vi.fn(async () => true) } },
    { provide: DeviceUiPort, useValue: {} }, { provide: NavController, useValue: nav },
    { provide: ToastController, useValue: {} }, { provide: AlertController, useValue: {} },
    { provide: AppVisibilityService, useValue: { active: new BehaviorSubject(true) } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(type);
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, nav, management, ble };
}

describe('UI6 production provisioning templates and retained gates', () => {
  it('AR-4t renders bounded local recovery with explicit read and expired read disabled', async () => {
    const f = await render(Esp32ProvisionPage), attemptedAt = Date.now();
    const entry = (name: string, time: number, suffix: string) => ({ requestId: 'wifiprov-' + suffix.repeat(32), name,
      context: { logicalDeviceId: 'device_' + suffix, credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' },
      deviceInstanceId: new Uint8Array(16).fill(1), checkpoint: createWiFiProvUnknownCheckpoint(time), availability: 'available' as const });
    const active = entry('客厅灯', attemptedAt, 'a'), expired = entry('旧测试灯', attemptedAt - WIFI_PROV_UNKNOWN_TTL_MS - 1, 'b');
    const recover = vi.spyOn(f.page, 'recoverUnknownWiFi').mockResolvedValue(undefined);
    const dismiss = vi.spyOn(f.page, 'dismissUnknownRecovery').mockResolvedValue(undefined);
    f.page.unknownRecoveries = [active, expired]; f.fixture.changeDetectorRef.markForCheck(); await f.fixture.whenStable();
    const section = f.element.querySelector<HTMLElement>('[aria-labelledby="unknown-recoveries-title"]')!;
    expect(section.textContent).toContain('待核对的配网'); expect(section.textContent).toContain('24小时');
    const groups = section.querySelectorAll<HTMLElement>('[role="group"]');
    const button = groups[0].querySelector<HTMLButtonElement>('.primary-button')!;
    expect(button.textContent).toContain('核对云状态'); expect(button.disabled).toBe(false);
    expect(groups[1].querySelector<HTMLButtonElement>('.primary-button')!.disabled).toBe(true);
    expect(recover).not.toHaveBeenCalled(); button.click(); expect(recover).toHaveBeenCalledExactlyOnceWith(active);
    groups[1].querySelector<HTMLButtonElement>('.retry-button')!.click(); expect(dismiss).toHaveBeenCalledExactlyOnceWith(expired);
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('AR-4t recovery read failure stays a manual local action and uncertain saving is visible', async () => {
    const f = await render(Esp32ProvisionPage);
    f.page.unknownRecoveryError = '暂无法读取配网核对记录';
    const load = vi.spyOn(f.page, 'reloadUnknownRecoveries').mockResolvedValue(undefined);
    f.fixture.changeDetectorRef.markForCheck(); await f.fixture.whenStable();
    const status = f.element.querySelector<HTMLElement>('section.notice[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(load).not.toHaveBeenCalled(); status.querySelector<HTMLButtonElement>('button')!.click(); expect(load).toHaveBeenCalledOnce();
    f.page.unknownRecoveryError = ''; f.page.phase = 'error'; f.page.wifiCheckpointState = 'unconfirmed';
    f.page.completion = wiFiProvCompletionResult('unknown', 'unconfirmed');
    (f.page as any).unknownWiFi = { attemptedAt: Date.now(),
      account: { authority: API.BASE_URL, accountId: 'ui6-fixture', sessionEpoch: 1 } };
    f.fixture.changeDetectorRef.markForCheck(); await f.fixture.whenStable();
    expect(f.element.querySelector('.status-card')?.textContent).toContain('恢复记录保存未确认');
    expect(f.element.querySelector('.provision-button')).toBeNull();
  });

  it('AR-4r separates UNKNOWN from an explicit read and online observation without offering resend', async () => {
    const f = await render(Esp32ProvisionPage);
    (f.page as any).unknownWiFi = { attemptedAt: Date.now(),
      account: { authority: API.BASE_URL, accountId: 'ui6-fixture', sessionEpoch: 1 } };
    f.page.phase = 'error'; f.page.statusMessage = 'original native failure';
    f.page.completion = wiFiProvCompletionResult('unknown', 'unconfirmed');
    f.page.selectedDevice = { name: 'fixture', connected: true, transport: 'softap', security: 1 } as any;
    const check = vi.spyOn(f.page, 'checkCompletionCloud').mockResolvedValue(undefined);
    const open = vi.spyOn(f.page, 'openCompletionDevice').mockResolvedValue(undefined);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const card = f.element.querySelector<HTMLElement>('.status-card')!;
    expect(card.getAttribute('role')).toBe('status'); expect(card.getAttribute('aria-live')).toBe('polite');
    expect(card.querySelector('#completion-title')?.textContent).toContain('暂未能确认'); expect(card.textContent).not.toContain('重新开始');
    expect(f.element.querySelector('.provision-button')).toBeNull();
    const button = card.querySelector<HTMLButtonElement>('.retry-button')!;
    expect(button.textContent).toContain('再次检查状态'); button.click(); expect(check).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    f.page.wifiCloudState = 'checking';
    f.page.completion = wiFiProvCompletionResult('unknown', 'checking');
    f.fixture.changeDetectorRef.markForCheck(); await f.fixture.whenStable();
    expect(button.disabled).toBe(true); expect(card.getAttribute('aria-busy')).toBe('true');
    f.page.wifiCloudState = 'online';
    f.page.completion = wiFiProvCompletionResult('unknown', 'online');
    f.fixture.changeDetectorRef.markForCheck(); await f.fixture.whenStable();
    expect(card.classList.contains('success')).toBe(true); expect(card.querySelector('#completion-title')?.textContent).toContain('设备已上线');
    expect(card.textContent).toContain('原本地配网回执仍未知'); expect(card.querySelectorAll('.primary-button')).toHaveLength(1);
    expect(f.page.result).toBeUndefined(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    card.querySelector<HTMLButtonElement>('.primary-button')!.click(); expect(open).toHaveBeenCalledOnce();
  });

  afterEach(() => {
    TestBed.resetTestingModule(); vi.restoreAllMocks();
    environment.deployment = originalDeployment;
  });

  it('AR-4n exposes a negotiated labelled masked PoP entry without upgrading the ordinary read-only action', async () => {
    const f = await render(Esp32ProvisionPage); f.page.transport = 'softap';
    Object.defineProperty(f.page, 'nativeSupported', { value: true });
    f.page.capabilities = { platform: 'android', softApProvisioning: true, softApSystemConnectedReadOnly: true,
      softApSystemConnectedConfigInfoRead: true, softApSystemConnectedFirstInstall: true } as any;
    const connect = vi.spyOn(f.page, 'connectFirstInstallSoftAp').mockResolvedValue(undefined);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const input = f.element.querySelector<HTMLInputElement>('#provisioning-pop')!;
    expect(input.type).toBe('password'); expect(input.value).toBe('');
    expect(f.element.querySelector('label[for="provisioning-pop"]')?.textContent).toContain('设备配网码');
    expect(input.getAttribute('aria-describedby')).toBe('provisioning-pop-help');
    expect(f.element.querySelector('#provisioning-pop-help')?.textContent).toContain('不是热点密码');
    f.page.validateProvisioningPoP(); f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(f.element.querySelector('#provisioning-pop-error')?.getAttribute('role')).toBe('alert');
    f.page.provisioningPoP = 'fixture-only';
    f.element.querySelector<HTMLButtonElement>('.pop-visibility')!.click();
    f.fixture.detectChanges(); await f.fixture.whenStable(); expect(input.type).toBe('text');
    f.element.querySelector<HTMLButtonElement>('#first-install-connect')!.click();
    expect(connect).toHaveBeenCalledOnce(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(f.element.querySelector('.manual-connection > .system-connected-button')?.textContent).toContain('只读');
    f.page.capabilities = { ...f.page.capabilities, softApSystemConnectedFirstInstall: false } as any;
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('#provisioning-pop')).toBeNull(); expect(f.element.querySelector('#first-install-connect')).toBeNull();
  });

  it('AR-4n clears temporary PoP on suspension without clearing retained request references', async () => {
    const f = await render(Esp32ProvisionPage);
    vi.spyOn(f.page as any, 'releasePlugin').mockResolvedValue(undefined);
    f.page.provisioningPoP = 'fixture-only'; f.page.provisioningPoPVisible = true;
    (f.page as any).softApSpec = { name: 'fixture', transport: 'softap', security: 1,
      pop: 'fixture-only', softApPurpose: 'blinker-first-install' };
    (f.page as any).rotationIdempotencyKey = 'original-UNKNOWN';
    (f.page as any).suspendPage('fixture-background');
    expect(f.page.provisioningPoP).toBe(''); expect(f.page.provisioningPoPVisible).toBe(false);
    expect((f.page as any).softApSpec).toBeUndefined();
    expect((f.page as any).rotationIdempotencyKey).toBe('original-UNKNOWN');
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('AR-4g exposes only negotiated explicit manual read-only entry and keeps old plugins disabled', async () => {
    const f = await render(Esp32ProvisionPage); f.page.transport = 'softap';
    f.page.capabilities = { platform: 'android', softApProvisioning: true } as any;
    const connect = vi.spyOn(f.page, 'connectSoftAp').mockResolvedValue(undefined);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const manual = f.element.querySelector<HTMLButtonElement>('.system-connected-button')!;
    expect(manual.disabled).toBe(true); expect(manual.textContent).toContain('只读');
    expect(manual.getAttribute('aria-describedby')).toBe('system-connected-help');
    manual.click(); expect(connect).not.toHaveBeenCalled();
    f.page.capabilities = { ...f.page.capabilities, softApSystemConnectedReadOnly: true } as any;
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(manual.disabled).toBe(false); manual.click();
    expect(connect).toHaveBeenCalledExactlyOnceWith('system-connected');
    f.page.phase = 'connecting'; f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(manual.disabled).toBe(true);
    f.page.phase = 'error'; f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(manual.disabled).toBe(true);
    expect(f.element.querySelector('.manual-connection')?.textContent).toContain('重新开始');
  });

  it('AR-4g manual results are non-selectable and hide identity, password and send controls', async () => {
    const f = await render(Esp32ProvisionPage);
    (f.page as any).selectedSoftApMode = 'system-connected';
    f.page.selectedDevice = { name: 'fixture', connected: true, transport: 'softap', security: 1 } as any;
    f.page.phase = 'ready'; f.page.ssid = 'router'; f.page.password = 'original draft';
    f.page.networks = [{ ssid: 'router', rssi: -40, security: 1 }];
    const send = vi.spyOn(f.page, 'provision').mockResolvedValue(undefined);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('h2')?.textContent).toContain('只读');
    expect(f.element.querySelector<HTMLButtonElement>('.network-row')?.disabled).toBe(true);
    expect(f.element.querySelector('.network-row.selected')).toBeNull();
    for (const selector of ['#blinker-device-name', '#wifi-ssid', '#wifi-password', '.remember-row', '.provision-button']) {
      expect(f.element.querySelector(selector)).toBeNull();
    }
    expect(f.element.querySelector<HTMLButtonElement>('.refresh-button')?.disabled).toBe(false);
    expect(f.page.canProvision).toBe(false); expect(f.page.password).toBe('original draft');
    expect(send).not.toHaveBeenCalled(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it.each(['cloud', 'local'] as const)('AR-3f explicit %s phase keeps inputs fenced and offers continue/cancel', async stage => {
    const f = await render(Esp32ProvisionPage);
    const stages = { continue: vi.fn(), cancel: vi.fn(), state: `await-${stage}` };
    (f.page as any).softApStages = stages;
    vi.spyOn(f.page as any, 'releasePlugin').mockResolvedValue(undefined);
    f.page.phase = 'provisioning'; f.page.handoffWaiting = stage;
    f.page.statusMessage = '等待手动继续';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.transport-switch')).toBeNull();
    expect(f.element.querySelector('.fa-spin')).toBeNull();
    expect(f.element.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    const buttons = f.element.querySelectorAll<HTMLButtonElement>('.handoff-actions button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].disabled).toBe(false); expect(buttons[1].disabled).toBe(false);
    expect(buttons[0].textContent).toContain(stage === 'cloud' ? '继续云端步骤' : '重连原设备并继续');
    buttons[0].click(); expect(stages.continue).toHaveBeenCalledOnce();
    buttons[1].click(); expect(stages.cancel).toHaveBeenCalledOnce();
    expect(f.page.handoffWaiting).toBeUndefined();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('AR-4b keeps the system-dialog result pending until an explicit foreground continue', async () => {
    const f = await render(Esp32ProvisionPage);
    const acquisition = { continue: vi.fn(), cancel: vi.fn() };
    (f.page as any).localAcquisition = acquisition;
    vi.spyOn(f.page as any, 'releasePlugin').mockResolvedValue(undefined);
    f.page.phase = 'connecting'; f.page.acquisitionWaiting = true;
    f.page.statusMessage = '请继续核对热点连接';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('.transport-switch')).toBeNull();
    expect(f.element.querySelector('.wifi-card')).toBeNull();
    expect(f.element.querySelector('.fa-spin')).toBeNull();
    const buttons = f.element.querySelectorAll<HTMLButtonElement>('.acquisition-actions button');
    expect(buttons).toHaveLength(2); expect(buttons[0].disabled).toBe(false);
    buttons[0].click(); expect(acquisition.continue).toHaveBeenCalledOnce();
    buttons[1].click(); expect(acquisition.cancel).toHaveBeenCalledOnce();
    expect(f.page.acquisitionWaiting).toBe(false);
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('AR-4b selects a network without sending and fences password/remember controls during scan', async () => {
    const f = await render(Esp32ProvisionPage);
    f.page.selectedDevice = { name: 'fixture', connected: true, transport: 'softap', security: 1 } as any;
    f.page.phase = 'ready'; f.page.password = 'unchanged draft';
    f.page.networks = [{ ssid: 'fixture network', rssi: -40, security: 1 }];
    const send = vi.spyOn(f.page, 'provision').mockResolvedValue(undefined);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const row = f.element.querySelector<HTMLButtonElement>('.network-row')!;
    row.click(); f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.page.ssid).toBe('fixture network'); expect(f.page.password).toBe('unchanged draft');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(f.element.querySelector('.network-row .fa-circle-check')).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
    f.page.scanningNetworks = true; f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(row.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.remember-row')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.inline-action')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLInputElement>('#wifi-password')!.type).toBe('password');
    expect(f.element.querySelector<HTMLButtonElement>('.provision-button')!.disabled).toBe(true);
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('AR-3f confirmed WiFi cannot start a second final handoff while its run is pending', async () => {
    const f = await render(Esp32ProvisionPage);
    f.page.phase = 'success'; (f.page as any).provisioningGeneration = 0;
    f.page.result = { success: true } as any;
    const open = vi.spyOn(f.page, 'openProvisionedDevice').mockResolvedValue(undefined);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const button = f.element.querySelector<HTMLButtonElement>('.status-card > .retry-button')!;
    expect(button.disabled).toBe(true); button.click();
    expect(open).not.toHaveBeenCalled();
  });

  it.each(['context', 'error'] as const)('AR-2 production context gate retains reconfigure title during %s', async phase => {
    const f = await render(Esp32ProvisionPage, { mode: 'reconfigure',
      logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111' });
    Object.defineProperty(f.page, 'nativeSupported', { value: true });
    f.page.phase = phase; f.page.statusMessage = phase === 'context' ? '正在读取原设备' : '读取失败，请手动重新开始';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('ion-title')?.textContent).toContain('设备重新配网');
    expect(f.element.querySelector('.notice.warning')?.textContent).toContain('不创建第二个设备');
    expect(f.element.querySelector<HTMLButtonElement>('.scan-options button')!.disabled).toBe(true);
    expect(f.element.querySelector('main')?.getAttribute('aria-busy')).toBe(String(phase === 'context'));
    expect(f.element.querySelector('.status-card')?.textContent).toContain(f.page.statusMessage);
    expect(f.element.querySelector('.retry-button') !== null).toBe(phase === 'error');
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it.each(['wifi-scan', 'write'] as const)('AR-1 native operation gates disable original controls during %s', async operation => {
    const f = await render(Esp32ProvisionPage);
    f.page.selectedDevice = { name: 'fixture', connected: true, transport: 'ble', security: 1 } as any;
    f.page.ssid = 'fixture-network'; f.page.phase = operation === 'write' ? 'provisioning' : 'ready';
    f.page.scanningNetworks = operation === 'wifi-scan';
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector<HTMLButtonElement>('.provision-button')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.refresh-button')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.connected-card button')!.disabled).toBe(true);
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
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
    expect(tips.open).toBe(false); expect(tips.textContent).toContain('PoP');
    expect(f.element.querySelector('.protocol-chip')?.textContent).toContain('Security 1');
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
