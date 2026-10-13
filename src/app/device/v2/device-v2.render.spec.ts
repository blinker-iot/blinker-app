import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUiConnectivitySnapshot, DeviceUiPort, DeviceUiSnapshot } from '../../core/device-v2/device-ui.port';
import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceV2PageLayoutService } from '../../core/services/device-v2-page-layout.service';
import { generateDefaultPageLayout } from '../../core/device-v2/page-layout';
import { DeviceUiConnectionScope } from '../../core/device-v2/connection-scope';
import { DeviceV2Page } from './device-v2.page';

// Retain the production child/render lifecycle, with an OnPush parent reading
// its label exactly as the dynamic DevicePage header does. No device/network I/O.
@Component({ imports: [DeviceV2Page], changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="shell-state">{{ child()?.stateLabel }}</span><app-device-v2-page [device]="device" [embedded]="true" />' })
class EmbeddedDeviceHost {
  readonly child = signal<DeviceV2Page | undefined>(undefined);
  device = { deviceName: 'test-device', config: { mode: 'bbp2', customName: '测试设备' }, data: {} } as BlinkerDevice;
}

describe('embedded DeviceV2 asynchronous status rendering', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('registers rendered controls and sends property writes from their events', async () => {
    const current: DeviceUiSnapshot = {
      manifestRevision: 2,
      manifestFingerprint: '00'.repeat(32),
      manifestAccepted: true,
      stateRevision: 1,
      stateFresh: true,
      endpoints: [
        { id: 1, key: 'power', role: 'property', valueType: 'boolean',
          readable: true, writable: true, notifies: true, value: false },
        { id: 2, key: 'level', role: 'property', valueType: 'integer',
          readable: true, writable: true, notifies: true, value: 100,
          minimum: 0, maximum: 100, step: 1 },
        { id: 3, key: 'statusText', role: 'property', valueType: 'text',
          readable: true, writable: true, notifies: true, value: 'ready', maxLength: 48 },
      ],
    };
    const layout = generateDefaultPageLayout(current);
    const sendCommand = vi.fn().mockResolvedValue(undefined);
    const connectionState = new BehaviorSubject('ready');
    const port = {
      appActive: new BehaviorSubject(true), isBleDirect: () => false,
      watchConnection: () => connectionState,
      watchConnectivity: () => new BehaviorSubject<DeviceUiConnectivitySnapshot>({
        activeTransport: 'cloud', directConnectAllowed: false, bleAccess: false,
        bleAdapterEnabled: null, bleState: 'idle', cloudSessionState: 'ready',
      }),
      watchState: () => new BehaviorSubject(current), watchEvents: () => new Subject(),
      openConnection: (_id: string, signal: AbortSignal) =>
        new DeviceUiConnectionScope(async () => undefined, signal),
      sendCommand,
    };
    await TestBed.configureTestingModule({ imports: [EmbeddedDeviceHost], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }),
      { provide: DeviceUiPort, useValue: port },
      { provide: DeviceV2PageLayoutService, useValue: { get: async () => ({
        logicalDeviceId: 'test-device', revision: 1,
        manifestFingerprint: current.manifestFingerprint, layout, createdAt: 0, updatedAt: 0,
      }) } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(EmbeddedDeviceHost);
    fixture.autoDetectChanges();
    const page = fixture.debugElement.query(By.directive(DeviceV2Page)).componentInstance as DeviceV2Page;
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    const toggle = fixture.nativeElement.querySelector('ion-toggle') as HTMLElement & { disabled: boolean };
    const range = fixture.nativeElement.querySelector('ion-range') as HTMLElement & { disabled: boolean };
    const input = fixture.nativeElement.querySelector('ion-input') as HTMLElement;
    for (const control of [toggle, range, input]) {
      expect(control).not.toBeNull();
      expect(customElements.get(control.localName)).toBeDefined();
    }
    expect(toggle.disabled).toBe(false);
    expect(range.disabled).toBe(false);
    toggle.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: true } }));
    await vi.waitFor(() => expect(sendCommand).toHaveBeenCalledWith('test-device', 'power', true));
    range.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 25 } }));
    await vi.waitFor(() => expect(sendCommand).toHaveBeenCalledWith('test-device', 'level', 25));
    connectionState.next('stopped');
    await vi.waitFor(() => {
      expect(toggle.disabled).toBe(true);
      expect(range.disabled).toBe(true);
    });
    fixture.destroy();
  });

  it('updates the parent header after Ready finalization without a click or parent detectChanges', async () => {
    const connectionState = new BehaviorSubject('connecting');
    const snapshot = new BehaviorSubject<DeviceUiSnapshot>({ manifestRevision: null, manifestFingerprint: null,
      manifestAccepted: false, stateRevision: null, stateFresh: false, endpoints: [] });
    let finish!: () => void;
    const ready = new Promise<void>(resolve => { finish = resolve; });
    const controller = new AbortController();
    const connectivity = new BehaviorSubject<DeviceUiConnectivitySnapshot>({ activeTransport: 'ble', directConnectAllowed: true,
      bleAccess: true, bleAdapterEnabled: true, bleState: 'connecting', cloudSessionState: 'idle' });
    let closed!: () => void;
    const connection = { ready, signal: controller.signal, closed: new Promise<void>(resolve => { closed = resolve; }),
      close: () => { controller.abort(); closed(); } };
    const port = { appActive: new BehaviorSubject(true), isBleDirect: () => true,
      watchConnection: () => connectionState,
      watchConnectivity: () => connectivity,
      watchState: () => snapshot, watchEvents: () => new Subject(), openConnection: () => connection };
    await TestBed.configureTestingModule({ imports: [EmbeddedDeviceHost], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), { provide: DeviceUiPort, useValue: port },
      { provide: DeviceV2PageLayoutService, useValue: { get: async () => null } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(EmbeddedDeviceHost);
    fixture.autoDetectChanges();
    // DevicePage similarly retains the dynamically created child instance.
    fixture.componentInstance.child.set(fixture.debugElement.query(By.directive(DeviceV2Page)).componentInstance);
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toContain('正在连接并同步'));
    connectionState.next('ready');
    snapshot.next({ ...snapshot.value, stateFresh: true });
    finish();
    await vi.waitFor(() => expect(fixture.componentInstance.child()!.canControl).toBe(true));
    expect(fixture.componentInstance.child()!.stateLabel).toBe('蓝牙已连接');
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toBe('蓝牙已连接'));
    for (const [activeTransport, label] of [['lan', '局域网已连接'], ['cloud', '云端已连接']] as const) {
      connectivity.next({ ...connectivity.value, activeTransport });
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toBe(label));
    }
    snapshot.next({ ...snapshot.value, stateFresh: false });
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toBe('设备状态未同步'));
    connectionState.next('retrying');
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toBe('正在重连'));
    fixture.componentInstance.device.data.cloudReachable = true;
    connectionState.next('stopped');
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toBe('离线'));
    fixture.destroy();
  });
});
