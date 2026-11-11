import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { LanDiscoveryPage } from './lan-discovery.page';

// Production template/lifecycle, but never a native plugin, live network,
// clipboard, or mDNS watch. Results below are explicitly local render fixtures.
const native = vi.hoisted(() => ({
  status: vi.fn(), networkListen: vi.fn(), appListen: vi.fn(),
  networkRemove: vi.fn(), appRemove: vi.fn(),
  watch: vi.fn(), unwatch: vi.fn(), mdnsListen: vi.fn(), clipboard: vi.fn(),
}));
vi.mock('@capacitor/network', () => ({ Network: { getStatus: native.status, addListener: native.networkListen } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: native.appListen } }));
vi.mock('capacitor-mdns', () => ({ Mdns: { watch: native.watch, unwatch: native.unwatch, addListener: native.mdnsListen } }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { write: native.clipboard } }));

const service = (id: string, name: string, resolved = true) => ({
  id, name, resolved, domain: 'local.', type: '_http._tcp.', port: 8080,
  hostname: `${id}.local.`, ipv4Addresses: ['192.0.2.10'], ipv6Addresses: [],
  txtRecord: { path: '/local-fixture', model: 'FIXTURE' },
});

async function render(supported = true) {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(supported);
  const initialization = vi.spyOn(LanDiscoveryPage.prototype, 'ngOnInit');
  native.status.mockResolvedValue({ connected: true, connectionType: 'wifi' });
  native.networkRemove.mockResolvedValue(undefined); native.appRemove.mockResolvedValue(undefined);
  native.networkListen.mockResolvedValue({ remove: native.networkRemove });
  native.appListen.mockResolvedValue({ remove: native.appRemove });
  const toasts = { create: vi.fn() };
  await TestBed.configureTestingModule({ imports: [LanDiscoveryPage], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ToastController, useValue: toasts },
  ] }).overrideProvider(ToastController, { useValue: toasts }).compileComponents();
  const fixture = TestBed.createComponent(LanDiscoveryPage);
  fixture.autoDetectChanges();
  // Angular does not await an async lifecycle hook. Wait for the original hook
  // itself, not merely the template scheduler: it performs two awaited mock
  // listener registrations before subscribing to App state.
  expect(initialization).toHaveBeenCalledOnce();
  await initialization.mock.results[0].value;
  expect(fixture.componentInstance.nativeSupported).toBe(supported);
  expect(fixture.componentInstance.networkStatus).toEqual({ connected: true, connectionType: 'wifi' });
  fixture.detectChanges(); await fixture.whenStable();
  const update = async () => {
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable();
  };
  return { fixture, update, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, toasts };
}

describe('UI38 LAN discovery production template without scanning', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    expect(native.watch).not.toHaveBeenCalled();
    expect(native.unwatch).not.toHaveBeenCalled();
    expect(native.mdnsListen).not.toHaveBeenCalled();
    expect(native.clipboard).not.toHaveBeenCalled();
    TestBed.resetTestingModule(); vi.restoreAllMocks();
  });

  it('keeps the existing initial scope and visible empty state without automatically discovering', async () => {
    const f = await render();
    expect(f.element.querySelector('ion-header')?.classList).toContain('control-page-header');
    expect((f.element.querySelector('ion-back-button') as HTMLElement & { defaultHref: string }).defaultHref).toBe('/home/tools');
    expect(f.element.querySelectorAll('.type-presets button')).toHaveLength(7);
    expect(f.element.querySelector('.scan-status[role="status"]')?.textContent).toContain('选择服务类型后开始发现');
    expect(f.element.querySelector('.empty-state')?.textContent).toContain('还没有发现结果');
    expect(native.status).toHaveBeenCalledOnce();
    expect(native.networkListen).toHaveBeenCalledOnce();
    expect(native.appListen).toHaveBeenCalledOnce();
    expect(f.toasts.create).not.toHaveBeenCalled();
  });

  it('keeps browser preview unavailable rather than presenting discovery as enabled', async () => {
    const f = await render(false);
    expect(f.element.querySelector('.notice.warning')?.textContent).toContain('请在手机 App 中使用');
    expect(f.element.querySelector<HTMLButtonElement>('.scan-button')!.disabled).toBe(true);
    expect(native.appListen).not.toHaveBeenCalled();
  });

  it.each([
    { connected: false, connectionType: 'none', label: '未连接网络' },
    { connected: true, connectionType: 'cellular', label: '当前为移动网络' },
  ])('retains the $label gate and original retry preparation', async ({ connected, connectionType, label }) => {
    const f = await render();
    f.page.networkStatus = { connected, connectionType }; await f.update();
    expect(f.element.querySelector('.notice.warning')?.textContent).toContain(label);
    expect(f.element.querySelector<HTMLButtonElement>('.scan-button')!.disabled).toBe(true);
    f.page.networkStatus = { connected: true, connectionType: 'wifi' }; await f.update();
    expect(f.element.querySelector('.notice.warning')).toBeNull();
    expect(f.element.querySelector<HTMLButtonElement>('.scan-button')!.disabled).toBe(false);
  });

  it('changes only the local preset/input and clears old results without a watch', async () => {
    const f = await render();
    f.page.services = [service('old-fixture', '旧结果')]; await f.update();
    const mqtt = Array.from(f.element.querySelectorAll<HTMLButtonElement>('.type-presets button'))
      .find(button => button.textContent?.includes('MQTT'))!;
    mqtt.click(); await f.update();
    expect(f.page.serviceType).toBe('_mqtt._tcp.');
    expect(f.page.services).toEqual([]);
    expect(mqtt.getAttribute('aria-pressed')).toBe('true');
    const input = f.element.querySelector<HTMLInputElement>('#service-type')!;
    input.value = '_fixture._udp.'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await f.update();
    expect(f.page.serviceType).toBe('_fixture._udp.');
  });

  it('renders the existing scanning lock and elapsed result count from local state', async () => {
    const f = await render();
    f.page.isScanning = true; f.page.scanElapsed = 8;
    f.page.statusMessage = '正在发现本地测试服务'; await f.update();
    expect(f.element.querySelector('.scan-button')?.textContent).toContain('停止发现');
    expect(f.element.querySelector('.scan-button')?.textContent).toContain('8 秒');
    expect(f.element.querySelector('.scan-status')?.classList).toContain('active');
    expect(f.element.querySelector<HTMLInputElement>('#service-type')!.disabled).toBe(true);
    for (const button of f.element.querySelectorAll<HTMLButtonElement>('.type-presets button')) expect(button.disabled).toBe(true);
  });

  it('keeps the original error readable, then presents recovered results without fake success', async () => {
    const f = await render();
    f.page.errorMessage = '本地权限测试错误'; f.page.statusMessage = '发现已停止'; await f.update();
    expect(f.element.querySelector('.scan-status[role="status"]')?.textContent).toContain('本地权限测试错误');
    expect(f.element.querySelector('.scan-status')?.classList).toContain('error');
    f.page.errorMessage = ''; f.page.services = [service('fixture', '本地已解析服务')];
    f.page.statusMessage = '发现已停止，共找到 1 项'; await f.update();
    expect(f.element.querySelector('.scan-status')?.textContent).toContain('发现已停止，共找到 1 项');
    expect(f.element.querySelector('.scan-status')?.classList).not.toContain('error');
    expect(f.element.querySelector('.service-state')?.textContent).toContain('已解析');
  });

  it('filters and expands local results, retaining the exact address and TXT detail', async () => {
    const f = await render();
    f.page.services = [service('first-fixture', '本地灯'), service('second-fixture', '本地温度计', false)];
    await f.update();
    const search = f.element.querySelector<HTMLInputElement>('.result-search input')!;
    search.value = '温度'; search.dispatchEvent(new Event('input', { bubbles: true })); await f.update();
    expect(f.element.querySelectorAll('.service-card')).toHaveLength(1);
    const row = f.element.querySelector<HTMLButtonElement>('.service-main')!;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.textContent).toContain('解析中');
    row.click(); await f.update();
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const details = f.element.querySelector('.service-details')!;
    expect(details.textContent).toContain('second-fixture.local.');
    expect(details.textContent).toContain('192.0.2.10');
    expect(details.textContent).toContain('/local-fixture');
    f.element.querySelector<HTMLButtonElement>('.result-search button')!.click(); await f.update();
    expect(f.element.querySelectorAll('.service-card')).toHaveLength(2);
  });

  it('retains the scan event binding but replaces its handler before any interaction', async () => {
    const f = await render();
    const toggle = vi.spyOn(f.page, 'toggleScan').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.scan-button')!.click(); await f.update();
    expect(toggle).toHaveBeenCalledOnce();
    expect(f.toasts.create).not.toHaveBeenCalled();
  });

  it('releases only mocked lifecycle listeners when the page is destroyed', async () => {
    const f = await render();
    f.fixture.destroy();
    await vi.waitFor(() => {
      expect(native.networkRemove).toHaveBeenCalledOnce();
      expect(native.appRemove).toHaveBeenCalledOnce();
    });
  });
});
