import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AlertController, NavController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUiPort } from '../../core/device-v2/device-ui.port';
import { wiFiProvCompletionResult, WiFiProvOfficialReceipt, WiFiProvCompletionResult } from '../../core/device-v2/provisioning/wifiprov-completion';
import { DataService } from '../../core/services/data.service';
import { DeviceV2ManagementService } from '../../core/services/device-v2-management.service';
import { UserService } from '../../core/services/user.service';
import { AppVisibilityService } from '../../core/services/app-visibility.service';
import { Esp32ProvisionPage } from './esp32-provision.page';

async function render(receipt: WiFiProvOfficialReceipt, cloud: WiFiProvCompletionResult['cloud'], reason?: WiFiProvCompletionResult['reason']) {
  vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnInit').mockResolvedValue(undefined);
  vi.spyOn(Esp32ProvisionPage.prototype, 'ngOnDestroy').mockImplementation(() => undefined);
  const management = { createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), readProvisioningCloudV2: vi.fn() };
  const nav = { navigateRoot: vi.fn() };
  await TestBed.configureTestingModule({ imports: [Esp32ProvisionPage], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
    { provide: DataService, useValue: { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } },
    { provide: DeviceV2ManagementService, useValue: management }, { provide: UserService, useValue: { getAllInfo: vi.fn() } },
    { provide: DeviceUiPort, useValue: {} }, { provide: NavController, useValue: nav },
    { provide: ToastController, useValue: {} }, { provide: AlertController, useValue: {} },
    { provide: AppVisibilityService, useValue: { active: new BehaviorSubject(true) } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(Esp32ProvisionPage), page = fixture.componentInstance;
  page.completion = wiFiProvCompletionResult(receipt, cloud, reason);
  vi.spyOn(page, 'canCheckCompletion', 'get').mockReturnValue(cloud !== 'checking' && cloud !== 'blocked');
  vi.spyOn(page, 'canOpenCompletion', 'get').mockReturnValue(page.completion.outcome === 'ready');
  const check = vi.spyOn(page, 'checkCompletionCloud').mockResolvedValue(undefined);
  const open = vi.spyOn(page, 'openCompletionDevice').mockResolvedValue(undefined);
  const send = vi.spyOn(page, 'provision').mockResolvedValue(undefined);
  const restart = vi.spyOn(page, 'startOver').mockResolvedValue(undefined);
  fixture.autoDetectChanges(); await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, page, element, card: element.querySelector<HTMLElement>('.completion-card')!, management, nav, check, open, send, restart };
}

describe('onboarding completion real production template', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('shows the same masked, labelled PoP field before selecting a BLE device', async () => {
    const f = await render('confirmed', 'online'); f.page.completion = undefined; f.page.transport = 'ble';
    f.page.devices = [{ id: 'fixture-ble', name: 'BLINKER_FIXTURE', transport: 'ble' }];
    const select = vi.spyOn(f.page, 'selectBleDevice').mockResolvedValue(undefined);
    f.fixture.componentRef.changeDetectorRef.markForCheck(); f.fixture.detectChanges(); await f.fixture.whenStable();
    const input = f.element.querySelector<HTMLInputElement>('#provisioning-pop')!;
    expect(input).not.toBeNull(); expect(f.element.querySelectorAll('#provisioning-pop')).toHaveLength(1);
    expect(input.type).toBe('password'); expect(input.disabled).toBe(false);
    expect(f.element.querySelector('label[for="provisioning-pop"]')?.textContent).toContain('设备配网码');
    expect(input.getAttribute('aria-describedby')).toBe('provisioning-pop-help');
    input.value = 'fixture-only'; input.dispatchEvent(new Event('input')); await f.fixture.whenStable();
    expect(f.page.provisioningPoP).toBe('fixture-only');
    f.element.querySelector<HTMLButtonElement>('.device-row')!.click(); expect(select).toHaveBeenCalledOnce();
  });

  it('disables BLE PoP editing while busy and exposes its inline error on the real field', async () => {
    const f = await render('confirmed', 'online'); f.page.completion = undefined; f.page.transport = 'ble';
    f.page.phase = 'selecting'; f.page.provisioningPoP = 'bad\0pop'; f.page.validateProvisioningPoP();
    f.fixture.componentRef.changeDetectorRef.markForCheck(); f.fixture.detectChanges(); await f.fixture.whenStable();
    const input = f.element.querySelector<HTMLInputElement>('#provisioning-pop')!;
    expect(input).not.toBeNull(); expect(input.disabled).toBe(true); expect(input.type).toBe('password');
    expect(f.element.querySelector<HTMLButtonElement>('.pop-visibility')?.disabled).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('provisioning-pop-help provisioning-pop-error');
    expect(f.element.querySelector('#provisioning-pop-error')?.getAttribute('role')).toBe('alert');
  });

  it('uses one shared optional PoP field outside manual-only details with an explicit visible label', async () => {
    const f = await render('confirmed', 'online'); f.page.completion = undefined; f.page.transport = 'softap';
    f.fixture.componentRef.changeDetectorRef.markForCheck(); f.fixture.detectChanges(); await f.fixture.whenStable();
    const input = f.element.querySelector<HTMLInputElement>('#provisioning-pop')!;
    expect(f.element.querySelectorAll('#provisioning-pop')).toHaveLength(1);
    expect(input.closest('.manual-connection')).toBeNull(); expect(input.closest('details')).toBeNull();
    expect(f.element.querySelector('label[for="provisioning-pop"]')?.textContent).toContain('自动选填');
    expect(f.element.querySelector('label[for="provisioning-pop"]')?.textContent).toContain('手动必填');
    expect(input.type).toBe('password'); expect(input.getAttribute('aria-describedby')).toBe('provisioning-pop-help');
    f.page.validateProvisioningPoP(); expect(f.page.provisioningPoPError).toBe('');
    expect(f.send).not.toHaveBeenCalled();
  });

  it('keeps a required manual PoP error attached to the same shared input without a native action', async () => {
    const f = await render('confirmed', 'online'); f.page.completion = undefined; f.page.transport = 'softap';
    f.page.validateProvisioningPoP(true);
    f.fixture.componentRef.changeDetectorRef.markForCheck(); f.fixture.detectChanges(); await f.fixture.whenStable();
    const input = f.element.querySelector<HTMLInputElement>('#provisioning-pop')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('provisioning-pop-help provisioning-pop-error');
    expect(f.element.querySelector('#provisioning-pop-error')?.getAttribute('role')).toBe('alert');
    expect(f.send).not.toHaveBeenCalled(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'unknown'] as const)('%s plus fresh Cloud evidence presents ready without rewriting the receipt', async receipt => {
    const f = await render(receipt, 'online');
    expect(f.card.querySelector('#completion-title')?.textContent?.trim()).toBe('设备已上线');
    expect(f.card.classList.contains('success')).toBe(true);
    expect(f.card.getAttribute('aria-live')).toBe('polite');
    expect(f.card.getAttribute('aria-busy')).toBe('false');
    expect(f.card.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(f.card.textContent).toContain(receipt === 'unknown' ? '原本地配网回执仍未知' : '设备已确认连接');
    expect(f.page.completion?.officialReceipt).toBe(receipt);
    expect(f.open).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    f.card.querySelector<HTMLButtonElement>('.primary-button')!.click(); expect(f.open).toHaveBeenCalledOnce();
  });

  it.each(['unconfirmed', 'unavailable'] as const)('keeps confirmed WiFi separate from %s Cloud and offers only an explicit read', async cloud => {
    const f = await render('confirmed', cloud, cloud === 'unconfirmed' ? 'timeout' : 'read-error');
    expect(f.card.querySelector('#completion-title')?.textContent).toContain('已连接 Wi-Fi，云端尚未就绪');
    expect(f.card.classList.contains('error')).toBe(false); expect(f.card.classList.contains('success')).toBe(false);
    expect(f.card.querySelector('.primary-button')).toBeNull();
    expect(f.check).not.toHaveBeenCalled();
    f.card.querySelector<HTMLButtonElement>('.retry-button')!.click(); expect(f.check).toHaveBeenCalledOnce();
    expect(f.send).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
  });

  it('does not turn unknown timeout into failure or offer a resend control', async () => {
    const f = await render('unknown', 'unconfirmed', 'timeout');
    expect(f.card.querySelector('#completion-title')?.textContent).toContain('暂未能确认');
    expect(f.card.textContent).toContain('不代表设备联网失败');
    expect(f.element.querySelector('.provision-button')).toBeNull(); expect(f.element.querySelector('.scan-options')).toBeNull();
    expect(f.card.textContent).not.toContain('重新开始'); expect(f.send).not.toHaveBeenCalled();
  });

  it('shows a bounded busy stage and disables repeated manual checks', async () => {
    const f = await render('confirmed', 'checking');
    expect(f.card.getAttribute('aria-busy')).toBe('true');
    expect(f.card.querySelector('#completion-title')?.textContent).toContain('正在确认设备是否上线');
    const button = f.card.querySelector<HTMLButtonElement>('button')!;
    expect(button.disabled).toBe(true); button.click(); expect(f.check).not.toHaveBeenCalled();
  });

  it('keeps blocked conditions explicit, with neither enter nor active read', async () => {
    const f = await render('unknown', 'blocked', 'context-changed');
    expect(f.card.textContent).toContain('核对条件已变化');
    expect(f.card.querySelector('.primary-button')).toBeNull();
    expect(f.card.querySelector<HTMLButtonElement>('.retry-button')?.disabled).toBe(true);
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
  });

  it('gives an explicit device rejection a visible return path without a Cloud or write action', async () => {
    const f = await render('rejected', 'unconfirmed');
    expect(f.card.querySelector('#completion-title')?.textContent).toContain('设备未能连接 Wi-Fi');
    expect(f.card.classList.contains('error')).toBe(true);
    const back = f.card.querySelector<HTMLButtonElement>('[data-action="return-to-devices"]');
    expect(back).not.toBeNull(); expect(back?.textContent).toContain('返回设备列表');
    expect(back?.disabled).toBe(false); back!.click(); await f.fixture.whenStable();
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/home/device');
    expect(f.card.textContent).toContain('设备明确拒绝');
    expect(f.check).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('keeps reset guidance folded and separates restart, network reset and identity erasure', async () => {
    const f = await render('rejected', 'unconfirmed');
    const help = f.element.querySelector<HTMLDetailsElement>('.recovery-help');
    expect(help).not.toBeNull(); expect(help?.open).toBe(false);
    expect(help?.textContent).toContain('重新配网'); expect(help?.textContent).toContain('普通重启');
    expect(help?.textContent).toContain('仅清网络'); expect(help?.textContent).toContain('清除身份');
    expect(help?.textContent).toContain('新设备卡'); expect(help?.textContent).toContain('旧卡');
    expect(help?.querySelector('button')).toBeNull(); expect(f.send).not.toHaveBeenCalled();
  });

  it('offers an exit for an unknown timeout without reopening configuration or discarding its receipt', async () => {
    const f = await render('unknown', 'unconfirmed', 'timeout');
    const receipt = f.page.completion;
    f.card.querySelector<HTMLButtonElement>('[data-action="return-to-devices"]')!.click(); await f.fixture.whenStable();
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/home/device');
    expect(f.page.completion).toBe(receipt); expect(f.send).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
  });

  it('keeps a failed return visible on the original result instead of silently retrying navigation', async () => {
    const f = await render('rejected', 'unconfirmed'); f.nav.navigateRoot.mockResolvedValue(false);
    f.card.querySelector<HTMLButtonElement>('[data-action="return-to-devices"]')!.click(); await f.fixture.whenStable();
    f.fixture.detectChanges();
    expect(f.card.querySelector('.completion-action-message')?.textContent).toContain('暂无法返回');
    expect(f.card.querySelector('.completion-action-message')?.getAttribute('role')).toBe('status');
    expect(f.card.querySelector('#completion-title')?.textContent).toContain('设备未能连接 Wi-Fi');
    expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(f.send).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
  });

  it('renders a navigation failure on the existing ready card without hiding success or offering a resend', async () => {
    const f = await render('confirmed', 'online');
    f.page.completionActionMessage = '设备页面暂无法打开，请核对账号与设备后从列表进入；不会重发配置。';
    f.fixture.componentRef.changeDetectorRef.markForCheck();
    f.fixture.detectChanges(); await f.fixture.whenStable();
    const message = f.card.querySelector('.completion-action-message');
    expect(message?.textContent).toContain('暂无法打开'); expect(message?.getAttribute('role')).toBe('status');
    expect(f.card.querySelector('#completion-title')?.textContent?.trim()).toBe('设备已上线');
    expect(f.card.textContent).toContain('设备已确认连接'); expect(f.page.completion?.officialReceipt).toBe('confirmed');
    expect(f.card.querySelector<HTMLButtonElement>('.primary-button')?.disabled).toBe(false);
    expect(f.element.querySelector('.provision-button')).toBeNull(); expect(f.element.querySelector('.scan-options')).toBeNull();
    expect(f.send).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
  });

  it('keeps the explicit same-root manual action separate from first install and read-only access', async () => {
    const f = await render('confirmed', 'online');
    f.page.completion = undefined; f.page.transport = 'softap';
    vi.spyOn(f.page, 'reconfiguring', 'get').mockReturnValue(true);
    vi.spyOn(f.page, 'canUseWifiReconfigure', 'get').mockReturnValue(true);
    vi.spyOn(f.page, 'canBeginWifiReconfigure', 'get').mockReturnValue(true);
    vi.spyOn(f.page, 'canOperate', 'get').mockReturnValue(true);
    vi.spyOn(f.page, 'operationBusy', 'get').mockReturnValue(false);
    const connect = vi.spyOn(f.page, 'connectWifiReconfigureSoftAp').mockResolvedValue(undefined);
    const first = vi.spyOn(f.page, 'connectFirstInstallSoftAp').mockResolvedValue(undefined);
    f.fixture.componentRef.changeDetectorRef.markForCheck(); f.fixture.detectChanges(); await f.fixture.whenStable();
    const action = f.element.querySelector<HTMLButtonElement>('#wifi-reconfigure-connect')!;
    expect(action.textContent).toContain('已连接原设备热点，重新配网');
    expect(action.getAttribute('aria-describedby')).toBe('wifi-reconfigure-help');
    expect(f.element.querySelector('#first-install-connect')).toBeNull();
    expect(f.element.querySelector('[id="system-connected-help"]')).toBeNull();
    expect(f.element.querySelector('label[for="provisioning-pop"]')?.textContent).toContain('必填');
    action.click(); expect(connect).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it('does not show the new reconfiguration action when the native capability is missing', async () => {
    const f = await render('confirmed', 'online');
    f.page.completion = undefined; f.page.transport = 'softap';
    vi.spyOn(f.page, 'reconfiguring', 'get').mockReturnValue(true);
    vi.spyOn(f.page, 'canUseWifiReconfigure', 'get').mockReturnValue(false);
    f.fixture.componentRef.changeDetectorRef.markForCheck(); f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(f.element.querySelector('#wifi-reconfigure-connect')).toBeNull();
    expect(f.element.querySelector('#first-install-connect')).toBeNull();
    expect(f.send).not.toHaveBeenCalled();
  });
});
