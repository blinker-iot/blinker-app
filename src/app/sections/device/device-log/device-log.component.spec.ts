import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceLogComponent } from './device-log.component';

const DEVICE_ID = 'device_log_test';

function device(config: Partial<BlinkerDevice['config']> = {}, data: unknown = {}): BlinkerDevice {
  return {
    name: '客厅灯', deviceName: DEVICE_ID,
    config: { broker: '', customName: '', mode: 'bbp2', ...config },
    data, storage: {}, subject: new Subject(),
  };
}

// Real production template. The page has no HTTP client or log transport;
// navigation is captured rather than activating the destination's read APIs.
async function render(options: { device?: BlinkerDevice | null; signedOut?: boolean; id?: string } = {}) {
  const item = options.device === undefined ? device() : options.device;
  const data = {
    auth: options.signedOut ? null : { uuid: 'owner' } as { uuid: string } | null,
    user: { id: 'stale-profile-owner' }, sessionEpoch: 1,
    authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(true),
    device: { dict: (item ? { [DEVICE_ID]: item } : {}) as Record<string, BlinkerDevice> },
    getDevice(id: string) { return this.device.dict[id]; },
  };
  const route = { id: options.id === undefined ? DEVICE_ID : options.id };
  const navigation = { navigateForward: vi.fn().mockResolvedValue(true) };
  await TestBed.configureTestingModule({
    imports: [DeviceLogComponent],
    providers: [
      provideRouter([]), provideIonicAngular({ animated: false }),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => route.id } } } },
      { provide: DataService, useValue: data },
      { provide: NavController, useValue: navigation },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(DeviceLogComponent), page = fixture.componentInstance;
  fixture.autoDetectChanges();
  page.ionViewWillEnter();
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, page, element, data, route, navigation };
}

describe('Device runtime log availability production template', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('explains the missing log interface without fake records, counts, timestamps or refresh success', async () => {
    const f = await render();
    expect(f.element.querySelector('ion-title')?.textContent).toBe('运行日志');
    expect(f.element.querySelector('h1')?.textContent).toBe('运行日志尚未接入');
    expect(f.element.textContent).toContain('不显示演示记录');
    expect(f.element.querySelector('.device-name')?.textContent).toContain('客厅灯');
    expect(f.element.querySelectorAll('.log-row, time, .summary-grid, ion-spinner')).toHaveLength(0);
    expect(f.element.querySelector('[aria-label="刷新日志"]')).toBeNull();
    expect(f.element.textContent).not.toContain('记录总数');
    expect(f.element.textContent).not.toContain('日志刷新完成');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    f.data.deviceDataLoader.next(true); f.data.deviceDataLoader.next(true);
    await f.fixture.whenStable();
    expect(f.element.querySelectorAll('.log-row, time')).toHaveLength(0);
    expect(f.element.querySelector('h1')?.textContent).toBe('运行日志尚未接入');
  });

  it('never reads arbitrary legacy log arrays or fabricates a current timestamp from malformed entries', async () => {
    const data = {};
    for (const key of ['runtimeLogs', 'logs', 'log']) Object.defineProperty(data, key, {
      get: () => { throw Error('Legacy log data must not be accessed'); },
    });
    const f = await render({ device: device({}, data) });
    expect(f.element.querySelector('h1')?.textContent).toBe('运行日志尚未接入');
    expect(f.element.querySelectorAll('.log-row, time')).toHaveLength(0);
  });

  it('ignores plausible but unverified legacy records rather than displaying them as device events', async () => {
    const unverified = [{ title: '私有伪造事件', detail: '不能显示的旧数据', timestamp: 'invalid' }];
    const f = await render({ device: device({}, { runtimeLogs: unverified, logs: unverified, log: unverified }) });
    expect(f.element.textContent).not.toContain('私有伪造事件');
    expect(f.element.textContent).not.toContain('不能显示的旧数据');
    expect(f.element.querySelectorAll('time')).toHaveLength(0);
  });

  it('navigates to existing read pages only on explicit user action and distinguishes them from operation logs', async () => {
    const f = await render();
    expect(f.element.textContent).toContain('不是用户操作或设备执行日志');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    f.element.querySelector<HTMLButtonElement>('[data-history="storage"]')!.click();
    expect(f.navigation.navigateForward).toHaveBeenLastCalledWith(`/device-manager/${DEVICE_ID}/storage`);
    f.element.querySelector<HTMLButtonElement>('[data-history="trends"]')!.click();
    expect(f.navigation.navigateForward).toHaveBeenLastCalledWith(`/device-manager/${DEVICE_ID}/trends`);
    expect(f.navigation.navigateForward).toHaveBeenCalledTimes(2);
  });

  it('offers only the same read navigation for a shared device, without owner actions or diagnostic data', async () => {
    const f = await render({ device: device({ isShared: true }) });
    expect(f.element.querySelectorAll('button')).toHaveLength(2);
    expect(f.element.querySelector('[data-history="storage"]')).not.toBeNull();
    expect(f.element.querySelector('[data-history="trends"]')).not.toBeNull();
    expect(f.element.textContent).not.toMatch(/清除日志|开启调试|原始请求|执行账本/);
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null, '设备不存在或当前不可用'],
    ['disabled', device({ disabled: true }), '设备不存在或当前不可用'],
    ['preview', device({ isPreview: true }), '预览设备没有运行日志'],
    ['legacy', device({ mode: 'mqtt' }), '当前设备暂不支持此入口'],
  ] as const)('shows a terminal explanation for %s instead of permanent loading or fake logs', async (_kind, item, title) => {
    const f = await render({ device: item });
    expect(f.element.querySelector('h1')?.textContent).toBe(title);
    expect(f.element.querySelector('ion-spinner')).toBeNull();
    expect(f.element.querySelectorAll('[data-history], .device-name, .log-row, time')).toHaveLength(0);
    f.page.openHistory('storage');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it('requires a restored authenticated identity rather than a stale user profile', async () => {
    const f = await render({ signedOut: true });
    expect(f.element.querySelector('h1')?.textContent).toBe('请先登录当前账号');
    expect(f.element.querySelectorAll('[data-history], .device-name')).toHaveLength(0);
    f.page.openHistory('trends');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it('rejects an absent route identity without showing another device or navigation', async () => {
    const f = await render({ id: '' });
    expect(f.element.querySelector('h1')?.textContent).toBe('设备不存在或当前不可用');
    expect(f.element.querySelector('.device-name')).toBeNull();
    expect(f.element.querySelectorAll('[data-history]')).toHaveLength(0);
  });

  it.each(['deleted', 'disabled'] as const)('clears the device presentation and refuses stale clicks when the device is %s', async kind => {
    const f = await render();
    const staleButton = f.element.querySelector<HTMLButtonElement>('[data-history="storage"]')!;
    if (kind === 'deleted') delete f.data.device.dict[DEVICE_ID];
    else f.data.device.dict[DEVICE_ID].config.disabled = true;
    // Navigation rechecks current inventory even before its loader emits.
    staleButton.click();
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    f.data.deviceDataLoader.next(true); await f.fixture.whenStable();
    expect(f.element.querySelector('h1')?.textContent).toBe('设备不存在或当前不可用');
    expect(f.element.textContent).not.toContain('客厅灯');
    expect(f.element.querySelectorAll('[data-history]')).toHaveLength(0);
  });

  it('clears account-scoped content immediately on account change and does not adopt a new account in place', async () => {
    const f = await render();
    f.data.auth = { uuid: 'other' }; f.data.sessionEpoch += 1; f.data.authDataChanged.next();
    await f.fixture.whenStable();
    expect(f.element.querySelector('h1')?.textContent).toBe('登录账号已变化');
    expect(f.element.textContent).not.toContain('客厅灯');
    expect(f.element.querySelectorAll('[data-history]')).toHaveLength(0);
    f.data.deviceDataLoader.next(true); f.page.openHistory('storage');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it('keeps the same authenticated identity available on an ordinary token refresh notification', async () => {
    const f = await render();
    f.data.auth = { uuid: 'owner' }; f.data.authDataChanged.next();
    await f.fixture.whenStable();
    expect(f.element.querySelector('h1')?.textContent).toBe('运行日志尚未接入');
    expect(f.element.querySelector('.device-name')?.textContent).toBe('客厅灯');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it('clears the current presentation on sign-out without falling back to a stale user profile', async () => {
    const f = await render();
    f.data.auth = null; f.data.sessionEpoch += 1; f.data.authDataChanged.next();
    await f.fixture.whenStable();
    expect(f.element.querySelector('h1')?.textContent).toBe('请先登录当前账号');
    expect(f.element.querySelectorAll('[data-history], .device-name')).toHaveLength(0);
    f.page.openHistory('storage');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it('does not reuse an account-scoped presentation after the API authority changes', async () => {
    const f = await render(), originalAuthority = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;
    try {
      Object.defineProperty(API, 'BASE_URL', { ...originalAuthority, value: 'https://other-gateway.example.invalid' });
      f.data.authDataChanged.next(); await f.fixture.whenStable();
      expect(f.element.querySelector('h1')?.textContent).toBe('登录账号已变化');
      expect(f.element.querySelectorAll('[data-history], .device-name')).toHaveLength(0);
      f.page.openHistory('trends');
      expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    } finally { Object.defineProperty(API, 'BASE_URL', originalAuthority); }
  });

  it.each(['deleted', 'retired', 'pending'])('rejects an explicit non-active device lifecycle state (%s)', async state => {
    const item = Object.assign(device(), { state });
    const f = await render({ device: item });
    expect(f.element.querySelector('h1')?.textContent).toBe('设备不存在或当前不可用');
    expect(f.element.querySelectorAll('[data-history], .device-name')).toHaveLength(0);
    f.page.openHistory('storage');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });

  it('clears cached-route context on leave and captures the new route only when explicitly reentered', async () => {
    const f = await render();
    f.page.ionViewWillLeave(); await f.fixture.whenStable();
    expect(f.element.textContent).not.toContain('客厅灯');
    expect(f.element.querySelectorAll('[data-history]')).toHaveLength(0);
    f.data.deviceDataLoader.next(true); f.page.openHistory('storage');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    f.route.id = 'device_other'; f.data.device.dict['device_other'] = { ...device(), name: '书房灯' };
    f.page.ionViewWillEnter(); await f.fixture.whenStable();
    expect(f.element.querySelector('.device-name')?.textContent).toBe('书房灯');
    f.element.querySelector<HTMLButtonElement>('[data-history="storage"]')!.click();
    expect(f.navigation.navigateForward).toHaveBeenCalledWith('/device-manager/device_other/storage');
  });

  it('unsubscribes on destruction and never restores device content or navigation afterward', async () => {
    const f = await render();
    expect(f.data.authDataChanged.observers).toHaveLength(1);
    expect(f.data.deviceDataLoader.observers).toHaveLength(1);
    f.fixture.destroy();
    expect(f.data.authDataChanged.observers).toHaveLength(0);
    expect(f.data.deviceDataLoader.observers).toHaveLength(0);
    f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true);
    f.page.ionViewWillEnter(); f.page.openHistory('storage');
    expect(f.page.deviceName()).toBe('');
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });
});
