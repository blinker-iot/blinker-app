import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bc5AcceptanceAdmission } from '../../core/device-v2/ble-direct/bc5-acceptance-client';
import { InitialNetworkCheckpoints, type InitialNetworkAdmission } from '../../core/device-v2/ble-direct/initial-network-checkpoint';
import { InitialNetworkPreflightStop } from '../../core/device-v2/ble-direct/initial-network-run';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { DeviceV2ManagementService } from '../../core/services/device-v2-management.service';
import { Bc5AcceptancePage } from './bc5-acceptance.page';

const native = vi.hoisted(() => ({ getAdmission: vi.fn(), getRecoveryAdmission: vi.fn(), getInitialNetworkAdmission: vi.fn() }));
vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  submitInitialCloudWifi: vi.fn(), closeInitialCloudWifi: vi.fn(),
  getCapabilities: vi.fn(async () => ({ softApProvisioning: true, softApInitialCloudWifiOnly: true })),
  checkPermissions: vi.fn(async () => ({ location: 'granted', nearbyWifi: 'granted' })),
  getProvisioningNetworkState: vi.fn(async () => ({ softApAttempted: false })),
} }));
vi.mock('@capacitor/core', async importOriginal => {
  const real = await importOriginal<typeof import('@capacitor/core')>();
  return Object.assign({}, real, { Capacitor: Object.assign({}, real.Capacitor, { getPlatform: () => 'android',
    isPluginAvailable: (name: string) => name === 'BlinkerBc5Checkpoint' || real.Capacitor.isPluginAvailable(name) }),
    registerPlugin: (name: string, implementations?: Parameters<typeof real.registerPlugin>[1]) => name === 'BlinkerBc5Checkpoint'
      ? native : real.registerPlugin(name, implementations) });
});

const id = (value: number, size = 16) => Buffer.alloc(size, value).toString('base64url');
function profiles() {
  const original: Bc5AcceptanceAdmission = { origin: 'https://network-page.example.test', ownerUserId: 'test-owner',
    tenantId: 'test-tenant', region: 'Development', intentId: id(1), sourceLogicalDeviceId: `ble_${id(2)}`, expiresAt: 1 };
  const operation: InitialNetworkAdmission = { contract: 'blinker.installed-key-initial-network.v1',
    operationId: id(3), sourceLogicalDeviceId: original.sourceLogicalDeviceId, targetLogicalDeviceId: `device_${id(4)}`,
    expectedRoot: { deviceInstanceId: id(5), accessEpoch: 6, controllerId: id(7), credentialVersion: 8,
      adminFingerprint: id(9, 32) }, existingLocator: id(10), expiresAt: Date.now() + 110_000,
    origin: original.origin, region: original.region, tenantId: original.tenantId, ownerUserId: original.ownerUserId,
    cloudCredentialVersion: 1 };
  return { original, operation };
}

describe('private installed-Key initial-network page (mock service, not radio proof)', () => {
  let fixture: ComponentFixture<Bc5AcceptancePage>;
  let current: ReturnType<typeof profiles>;
  const run = vi.fn<DeviceV2BleService['runInstalledKeyInitialNetwork']>();
  const inspect = vi.fn<DeviceV2BleService['inspectInstalledKeyInitialNetwork']>();
  const oldInstall = vi.fn(), oldRecovery = vi.fn();

  beforeEach(async () => {
    current = profiles();
    run.mockReset().mockResolvedValue({ apply: 'apply-queued', cloud: 'online', checkpoint: 'recorded' });
    inspect.mockReset().mockResolvedValue({ checkpoint: undefined, cloud: 'not-checked' });
    oldInstall.mockReset(); oldRecovery.mockReset();
    native.getAdmission.mockReset().mockRejectedValue(Error('old install mode is unavailable'));
    native.getRecoveryAdmission.mockReset().mockResolvedValue(current.original);
    native.getInitialNetworkAdmission.mockReset().mockResolvedValue(current.operation);
    await TestBed.configureTestingModule({ imports: [Bc5AcceptancePage], providers: [provideRouter([]),
      provideIonicAngular({ animated: false }),
      { provide: DeviceV2BleService, useValue: { runInstalledKeyInitialNetwork: run,
        inspectInstalledKeyInitialNetwork: inspect, runBc5Acceptance: oldInstall, recoverBc5Acceptance: oldRecovery } },
      { provide: DeviceV2ManagementService, useValue: { readProvisioningCloudV2: vi.fn() } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(Bc5AcceptancePage);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  async function render(message: string): Promise<HTMLElement> {
    const host = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('[role="status"]')?.textContent).toContain(message);
    });
    return host;
  }
  function button(host: HTMLElement, text: string): HTMLIonButtonElement {
    const found = Array.from(host.querySelectorAll<HTMLIonButtonElement>('ion-button')).find(item => item.textContent?.includes(text));
    expect(found).toBeDefined(); return found!;
  }
  function click(value: HTMLElement): void { value.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  function fill(host: HTMLElement): void {
    host.querySelector<HTMLInputElement>('#bc5-network')!.value = 'TEST-NETWORK';
    host.querySelector<HTMLInputElement>('#bc5-password')!.value = 'not-a-real-network-password';
  }

  it('reuses the WiFi form with one network-only action and hides old Key installation and identifiers', async () => {
    const host = await render('就绪');
    expect(host.querySelector('ion-title')?.textContent).toContain('继续首次联网');
    expect(host.querySelectorAll('input')).toHaveLength(2);
    expect(host.querySelector('label[for="bc5-network"]')).not.toBeNull();
    expect(host.querySelector('label[for="bc5-password"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-atomic')).toBe('true');
    expect(host.textContent).not.toContain('开始一次验收');
    for (const value of [current.operation.operationId, current.operation.sourceLogicalDeviceId,
      current.operation.targetLogicalDeviceId, current.operation.expectedRoot.adminFingerprint]) expect(host.textContent).not.toContain(value);
    expect(run).not.toHaveBeenCalled(); expect(oldInstall).not.toHaveBeenCalled();
    fill(host);
    const start = button(host, '连接目标 Wi-Fi'); click(start); click(start);
    await render('设备已接收 Wi-Fi 提交；云端新鲜状态已确认');
    expect(run).toHaveBeenCalledExactlyOnceWith(current.operation, current.original,
      { ssid: 'TEST-NETWORK', password: 'not-a-real-network-password' }, expect.any(AbortSignal),
      expect.any(Function), expect.any(Function), expect.anything());
    expect(host.querySelector<HTMLInputElement>('#bc5-password')?.value).toBe('');
    expect(start.disabled).toBe(true);
    expect(oldInstall).not.toHaveBeenCalled(); expect(oldRecovery).not.toHaveBeenCalled();
  });

  it('keeps the explicit read action inspection-only and never falls back to old installation recovery', async () => {
    inspect.mockResolvedValueOnce({ checkpoint: { phase: 'wifi-unknown' } as never, cloud: 'online' });
    const host = await render('就绪');
    click(button(host, '只读查询本次结果'));
    await render('Wi-Fi 结果未知；云端新鲜状态已确认。没有重发。');
    expect(inspect).toHaveBeenCalledExactlyOnceWith(current.operation, expect.any(AbortSignal), expect.any(Function));
    expect(run).not.toHaveBeenCalled(); expect(oldInstall).not.toHaveBeenCalled(); expect(oldRecovery).not.toHaveBeenCalled();
  });

  it('requires both native admissions and offers no form if the old read-only checkpoint scope is unavailable', async () => {
    native.getRecoveryAdmission.mockRejectedValueOnce(Error('private native detail'));
    const host = await render('原安装记录入口不可用');
    expect(host.querySelector('input')).toBeNull(); expect(host.querySelector('ion-button')).toBeNull();
    expect(host.textContent).not.toContain('private native detail');
    expect(native.getAdmission).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });

  it('does not start or consume the form on empty network input', async () => {
    const host = await render('就绪');
    click(button(host, '连接目标 Wi-Fi'));
    await render('请输入目标 Wi-Fi 名称');
    expect(run).not.toHaveBeenCalled(); expect(button(host, '连接目标 Wi-Fi').disabled).toBe(false);
  });

  it('shows a fixed pre-dispatch reason without an automatic retry or a device failure claim', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    run.mockRejectedValueOnce(new InitialNetworkPreflightStop('source'));
    const host = await render('就绪'); fill(host); click(button(host, '连接目标 Wi-Fi'));
    await render('核对未完成，尚未发送本次设备配置');
    expect(warning).toHaveBeenCalledExactlyOnceWith('INITIAL_NETWORK_PREFLIGHT_STOP', 'source');
    expect(host.textContent).not.toContain('配网失败');
    expect(button(host, '连接目标 Wi-Fi').disabled).toBe(true);
    expect(button(host, '只读查询本次结果').disabled).toBe(false);
    expect(run).toHaveBeenCalledOnce(); expect(inspect).not.toHaveBeenCalled();
    expect(oldInstall).not.toHaveBeenCalled(); expect(oldRecovery).not.toHaveBeenCalled();
  });

  it('aborts on leaving, ignores the late result and cannot repeat the original submission', async () => {
    let finish!: (value: Awaited<ReturnType<DeviceV2BleService['runInstalledKeyInitialNetwork']>>) => void;
    run.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const host = await render('就绪'); fill(host);
    click(button(host, '连接目标 Wi-Fi')); fixture.detectChanges();
    fixture.componentInstance.ionViewWillLeave();
    expect(run.mock.calls[0][3].aborted).toBe(true);
    finish({ apply: 'apply-queued', cloud: 'online', checkpoint: 'recorded' });
    await render('已停止等待');
    click(button(host, '连接目标 Wi-Fi')); fixture.detectChanges();
    expect(run).toHaveBeenCalledOnce(); expect(button(host, '连接目标 Wi-Fi').disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).not.toContain('云端新鲜状态已确认');
  });

  it('preserves a mock accepted WiFi result when local evidence is unconfirmed and directs the user to read only', async () => {
    run.mockResolvedValueOnce({ apply: 'apply-queued', cloud: 'unavailable', checkpoint: 'unconfirmed' });
    const host = await render('就绪'); fill(host); click(button(host, '连接目标 Wi-Fi'));
    await render('设备已接收 Wi-Fi 提交；云端上线未确认。本机记录未确认，请只读查询，不要重复发送。');
    expect(run).toHaveBeenCalledOnce(); expect(button(host, '连接目标 Wi-Fi').disabled).toBe(true);
    expect(button(host, '只读查询本次结果').disabled).toBe(false);
  });

  it('selects the original BLE administrator in the actual Service consumer, not the opposite Cloud source', async () => {
    // The coordinator and Service-created selection remain real. Mock read-only
    // prerequisites, then stop at the target port: no journal write or radio.
    const checkpointRead = vi.spyOn(InitialNetworkCheckpoints.prototype, 'inspect').mockResolvedValue(undefined);
    const prepare = vi.spyOn(InitialNetworkCheckpoints.prototype, 'prepare').mockRejectedValue(Error('unexpected prepare'));
    for (const source of ['enrollment', undefined, 'wifiprov'] as const) {
      const root = current.operation.expectedRoot;
      const credential = { state: 'active', source, logicalDeviceId: current.operation.sourceLogicalDeviceId,
        deviceInstanceId: new Uint8Array(Buffer.from(root.deviceInstanceId, 'base64url')),
        accessEpoch: root.accessEpoch, controllerId: new Uint8Array(Buffer.from(root.controllerId, 'base64url')),
        controllerSecret: new Uint8Array(32).fill(11), credentialVersion: root.credentialVersion, permissions: 15,
        intentId: new Uint8Array(16).fill(12), commitId: new Uint8Array(16).fill(13), receipt: new Uint8Array(32).fill(14),
        ...(source === 'wifiprov' ? { cloudContext: { credentialVersion: 1, locator: current.operation.existingLocator } } : {}) };
      const stop = new AbortController(), disconnect = vi.fn(async () => {}), link = { disconnect };
      const registrationTarget = vi.fn(async () => { throw Error('TEST_TARGET_REACHED'); });
      const load = vi.fn(async () => credential), request = vi.fn();
      const getDevice = vi.fn(() => { throw Error('display catalog is unavailable on a cold private route'); });
      const context = { authority: current.operation.origin, accountId: current.operation.ownerUserId, sessionEpoch: 1 };
      const issued = { ownerUserId: current.operation.ownerUserId, tenantId: current.operation.tenantId,
        sourceLogicalDeviceId: current.operation.sourceLogicalDeviceId, targetLogicalDeviceId: current.operation.targetLogicalDeviceId,
        expectedRoot: root, intentId: current.original.intentId,
        targetKey: { credentialVersion: current.operation.cloudCredentialVersion, locator: current.operation.existingLocator } };
      const service = Object.create(DeviceV2BleService.prototype) as DeviceV2BleService;
      Object.assign(service, { accountLinks: new Set([link]), assertInitialNetworkAccount: () => {},
        registrationOperation: (_signal: AbortSignal, _radio: boolean,
          work: (accountContext: typeof context, current: () => void, signal: AbortSignal, assertContext: () => void) => Promise<unknown>) =>
          work(context, () => {}, stop.signal, () => {}),
        bc5Authority: () => ({ authority: { readExactCommitted: async () => ({ checkpoint: { issued } }) } }),
        data: { getDevice },
        assertBc5Cloud: async () => {}, trackLink: () => link, client: () => ({ requestInstalledKeyInitialNetwork: request }),
        credentialStore: () => ({ load }), registrationTarget });
      const result = service.runInstalledKeyInitialNetwork(current.operation, current.original, { ssid: 'TEST-NETWORK' },
        stop.signal, async () => { throw Error('unexpected Cloud read'); }, () => {}, {} as never);
      await expect(result).rejects.toMatchObject({ stage: 'source', message: 'INITIAL_NETWORK_PREFLIGHT_STOP' });
      if (source === 'wifiprov') {
        expect(registrationTarget).not.toHaveBeenCalled();
      } else {
        expect(registrationTarget).toHaveBeenCalledExactlyOnceWith(current.operation.sourceLogicalDeviceId,
          credential, stop.signal, expect.any(Function));
      }
      expect(load).toHaveBeenCalledExactlyOnceWith(current.operation.sourceLogicalDeviceId);
      expect(credential.controllerSecret.every(value => value === 0)).toBe(true);
      expect(disconnect).toHaveBeenCalledOnce();
      expect(request).not.toHaveBeenCalled();
      expect(getDevice).not.toHaveBeenCalled();
    }
    expect(checkpointRead).toHaveBeenCalledTimes(3);
    expect(prepare).not.toHaveBeenCalled();
  });
});
