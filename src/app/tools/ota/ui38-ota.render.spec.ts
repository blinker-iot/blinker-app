import 'zone.js';
import { Type, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { bleScanner } from '../../core/bluetooth/scan';
import { BleOtaPage } from '../ble-ota/ble-ota.page';
import { WifiOtaPage } from '../wifi-ota/wifi-ota.page';

// Production templates with local transport sentinels: no scan, GATT, HTTP,
// firmware upload or persistent user settings may escape this test fixture.
const ports = vi.hoisted(() => ({
  ble: Object.fromEntries(['initialize', 'isEnabled', 'requestEnable', 'requestDevice', 'connect',
    'disconnect', 'getMtu', 'requestConnectionPriority', 'startNotifications', 'stopNotifications',
    'writeWithoutResponse', 'requestLEScan', 'stopLEScan'].map(name => [name, vi.fn()])),
  scanner: { run: vi.fn() },
  mdns: { addListener: vi.fn(), watch: vi.fn(), unwatch: vi.fn() },
  http: {
    request: vi.fn(async () => { throw new Error('UI38_HTTP_REQUEST_FORBIDDEN'); }),
    open: vi.fn(() => { throw new Error('UI38_XHR_OPEN_FORBIDDEN'); }),
  },
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: ports.ble, ConnectionPriority: { CONNECTION_PRIORITY_HIGH: 1 },
  ScanMode: { SCAN_MODE_LOW_LATENCY: 2 },
}));
vi.mock('capacitor-mdns', () => ({ Mdns: ports.mdns }));
vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  // A hoisted mock must not reference esbuild's later object-spread helper.
  return Object.assign({}, actual, { CapacitorHttp: { request: ports.http.request, post: ports.http.request } });
});

const targetKey = 'wifiOtaTarget';
async function render<T>(component: Type<T>) {
  const toast = { present: vi.fn(async () => undefined) };
  const toastController = { create: vi.fn(async () => toast) };
  await TestBed.configureTestingModule({ imports: [component], providers: [
    provideZoneChangeDetection(), provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ToastController, useValue: toastController },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(component);
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, toastController };
}

async function update(f: Awaited<ReturnType<typeof render>>) {
  f.fixture.detectChanges(); await f.fixture.whenStable();
}

describe('UI38 OTA production templates retain transport and draft boundaries', () => {
  let savedTarget: string | null;
  beforeEach(() => {
    savedTarget = localStorage.getItem(targetKey);
    localStorage.removeItem(targetKey);
    vi.clearAllMocks();
    vi.spyOn(bleScanner, 'run').mockImplementation(ports.scanner.run);
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(ports.http.open);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const spy of [...Object.values(ports.ble), ...Object.values(ports.scanner), ...Object.values(ports.mdns), ...Object.values(ports.http)]) {
      expect(spy).not.toHaveBeenCalled();
    }
    if (savedTarget === null) localStorage.removeItem(targetKey);
    else localStorage.setItem(targetKey, savedTarget);
    vi.restoreAllMocks();
  });

  it('renders BLE preparation without starting scan or upgrade and preserves the busy back guard', async () => {
    const f = await render(BleOtaPage);
    expect(f.element.querySelectorAll('.ota-card')).toHaveLength(2);
    expect(f.element.textContent).toContain('最大 32 MB');
    expect(f.element.querySelector<HTMLInputElement>('.file-input')!.accept).toBe('.bin,application/octet-stream');
    expect(f.element.querySelector<HTMLButtonElement>('.primary-button')!.disabled).toBe(true);
    expect(f.element.querySelector('.ota-status')).toBeNull();
    f.page.state = 'uploading'; await update(f);
    expect((f.element.querySelector('ion-back-button') as any).disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.secondary-button')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.file-picker')!.disabled).toBe(true);
    expect(f.element.querySelectorAll('.mode-selector button:disabled')).toHaveLength(2);
  });

  it('changes only the BLE partition draft and uses the existing explicit scan handler', async () => {
    const f = await render(BleOtaPage);
    const scan = vi.spyOn(f.page, 'toggleScan').mockResolvedValue(undefined);
    f.element.querySelectorAll<HTMLButtonElement>('.mode-selector button')[1].click(); await update(f);
    expect(f.page.updateType).toBe('filesystem');
    expect(f.element.querySelectorAll('.mode-selector button')[1].getAttribute('aria-pressed')).toBe('true');
    f.element.querySelector<HTMLButtonElement>('.secondary-button')!.click(); await update(f);
    expect(scan).toHaveBeenCalledOnce();
  });

  it('keeps real BLE target selection, full identity, RSSI and canUpload conditions', async () => {
    const f = await render(BleOtaPage);
    const device = { deviceId: 'fixture-device-with-a-long-local-identity', localName: '本地模板目标设备', rssi: -77, lastSeen: 0 };
    f.page.devices = [device]; f.page.firmwareFile = new File(['fixture'], 'local-template.bin');
    await update(f);
    f.element.querySelector<HTMLButtonElement>('.result-row')!.click(); await update(f);
    expect(f.page.selectedDevice).toBe(device);
    expect(f.element.querySelector('.result-row')!.getAttribute('aria-pressed')).toBe('true');
    expect(f.element.querySelector('.result-copy')!.textContent).toContain('local-template.bin');
    expect(f.element.querySelector('.result-row')!.textContent).toContain(device.deviceId);
    expect(f.element.querySelector('.result-meta')!.textContent).toContain('-77 dBm');
    expect(f.element.querySelector<HTMLButtonElement>('.primary-button')!.disabled).toBe(false);
    const upload = vi.spyOn(f.page, 'upload').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.primary-button')!.click(); await update(f);
    expect(upload).toHaveBeenCalledOnce();
  });

  it('retains BLE failure details and cancellation through their existing handlers', async () => {
    const f = await render(BleOtaPage);
    f.page.state = 'error'; f.page.statusMessage = '本地测试失败';
    f.page.statusDetail = '保留完整错误说明与目标身份，不折叠为无法查看的省略号'; f.page.progress = 34;
    await update(f);
    expect(f.element.querySelector('.ota-status.error .status-copy')!.textContent).toContain(f.page.statusDetail);
    expect(f.element.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('34');
    expect(f.element.querySelector('.cancel-button')).toBeNull();
    f.page.state = 'uploading'; f.page.bytesSent = 128; await update(f);
    const cancel = vi.spyOn(f.page, 'cancelUpload').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.cancel-button')!.click(); await update(f);
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.element.querySelector('.progress-meta')).not.toBeNull();
  });

  it('restores exact WiFi parameters without persisting or revealing the password', async () => {
    const original = { host: 'fixture.invalid', port: 65280, uploadPath: '/firmware', username: '  local-user  ', useHttps: true, timeoutSeconds: 90 };
    localStorage.setItem(targetKey, JSON.stringify(original));
    const f = await render(WifiOtaPage);
    f.page.password = 'local-fixture-unpersisted-password'; await update(f);
    expect(f.element.querySelectorAll('.ota-card')).toHaveLength(3);
    expect(f.element.textContent).toContain('最大 64 MB');
    expect(f.page.host).toBe(original.host); expect(f.page.username).toBe(original.username);
    const field = f.element.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    expect(field.type).toBe('password');
    const toggle = f.element.querySelector<HTMLButtonElement>('.inline-button')!;
    expect(toggle.getAttribute('aria-label')).toBe('显示密码');
    toggle.click(); await update(f);
    expect(field.type).toBe('text'); expect(toggle.getAttribute('aria-label')).toBe('隐藏密码');
    toggle.click(); await update(f);
    expect(field.type).toBe('password');
    expect(localStorage.getItem(targetKey)).toBe(JSON.stringify(original));
    expect(f.element.querySelector('.target-preview')!.textContent).not.toContain(f.page.password);
  });

  it('keeps exact WiFi input drafts, local HTTPS selection and existing numeric limits', async () => {
    const f = await render(WifiOtaPage);
    const host = f.element.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
    host.value = '  fixture.invalid  '; host.dispatchEvent(new Event('input', { bubbles: true })); await update(f);
    expect(f.page.host).toBe('  fixture.invalid  ');
    f.element.querySelector<HTMLButtonElement>('.toggle-chip')!.click(); await update(f);
    expect(f.page.useHttps).toBe(true);
    expect(f.element.querySelector('.toggle-chip')!.getAttribute('aria-pressed')).toBe('true');
    const port = f.element.querySelector<HTMLInputElement>('.port-field input')!;
    expect(port.min).toBe('1'); expect(port.max).toBe('65535');
    const timeout = f.element.querySelector<HTMLInputElement>('.timeout-field input')!;
    expect(timeout.min).toBe('10'); expect(timeout.max).toBe('600');
    expect(f.element.querySelector<HTMLButtonElement>('.primary-button')!.disabled).toBe(true);
    expect(localStorage.getItem(targetKey)).toBeNull();
  });

  it('reuses WiFi target selection without discovery or uploading and masks target credentials', async () => {
    const f = await render(WifiOtaPage);
    const target = { id: 'fixture-target', name: '本地 OTA 目标', host: 'fixture.invalid', port: 8080,
      uploadPath: '/sketch', username: 'fixture-user', password: 'local-fixture-password', txt: {} };
    f.page.targets = [target]; await update(f);
    f.element.querySelector<HTMLButtonElement>('.result-row')!.click(); await update(f);
    expect(f.page.selectedTargetId).toBe(target.id); expect(f.page.password).toBe(target.password);
    expect(f.element.querySelector('.result-row')!.getAttribute('aria-pressed')).toBe('true');
    expect(f.element.querySelector('.target-preview')!.textContent).not.toContain(target.password);
    expect(f.element.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!.type).toBe('password');
    const discovery = vi.spyOn(f.page, 'toggleDiscovery').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.secondary-button')!.click(); await update(f);
    expect(discovery).toHaveBeenCalledOnce();
    expect(localStorage.getItem(targetKey)).toBeNull();
  });

  it('preserves WiFi busy guards and does not advertise cancellation without a cancellable request', async () => {
    const f = await render(WifiOtaPage);
    f.page.state = 'uploading'; f.page.statusMessage = '本地传输状态'; f.page.statusDetail = '未调用网络的完整状态说明';
    await update(f);
    expect(f.element.querySelector('.ota-status .status-copy')!.textContent).toContain(f.page.statusDetail);
    expect((f.element.querySelector('ion-back-button') as any).disabled).toBe(true);
    for (const field of f.element.querySelectorAll<HTMLInputElement>('input:not([type="file"])')) expect(field.disabled).toBe(true);
    for (const selector of ['.file-picker', '.secondary-button', '.toggle-chip', '.primary-button']) {
      expect(f.element.querySelector<HTMLButtonElement>(selector)!.disabled).toBe(true);
    }
    expect(f.element.querySelector('.cancel-button')).toBeNull();
  });

  it('preserves existing BLE and WiFi file-size validation without reading or uploading the file', async () => {
    const ble = await render(BleOtaPage);
    await ble.page.chooseFirmware({ target: { files: [{ name: 'too-large.bin', size: 32 * 1024 * 1024 + 1 }], value: 'local' } } as unknown as Event);
    expect(ble.toastController.create).toHaveBeenCalledWith(expect.objectContaining({ message: '固件文件不能超过 32 MB' }));
    expect(ble.page.firmwareFile).toBeUndefined();
    ble.fixture.destroy(); TestBed.resetTestingModule();
    const wifi = await render(WifiOtaPage);
    await wifi.page.chooseFirmware({ target: { files: [{ name: 'too-large.bin', size: 64 * 1024 * 1024 + 1 }], value: 'local' } } as unknown as Event);
    expect(wifi.toastController.create).toHaveBeenCalledWith(expect.objectContaining({ message: '固件文件不能超过 64 MB' }));
    expect(wifi.page.firmwareFile).toBeUndefined();
  });
});
