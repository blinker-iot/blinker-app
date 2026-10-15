import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUiConnectivitySnapshot, DeviceUiPort, DeviceUiSnapshot } from '../../core/device-v2/device-ui.port';
import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceV2PageLayoutService } from '../../core/services/device-v2-page-layout.service';
import { DeviceConsoleService } from '../../core/services/device-console.service';
import { DEVICE_CONSOLE_HOST } from '../../core/device-v2/console-host';
import { DeviceV2Page } from './device-v2.page';

// Retain the production child/render lifecycle, with an OnPush parent reading
// its label exactly as the dynamic DevicePage header does. No device/network I/O.
@Component({ imports: [DeviceV2Page], changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="shell-state">{{ child()?.stateLabel }}</span><app-device-v2-page [device]="device" [embedded]="true" />' })
class EmbeddedDeviceHost {
  readonly child = signal<DeviceV2Page | undefined>(undefined);
  device = { deviceName: 'test-device', config: { mode: 'bbp2', customName: '测试设备' },
    data: {}, subject: new Subject() } as BlinkerDevice;
}

describe('embedded DeviceV2 asynchronous status rendering', () => {
  afterEach(() => TestBed.resetTestingModule());

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
      { provide: DeviceConsoleService, useValue: {} },
      { provide: DEVICE_CONSOLE_HOST, useValue: { sessionVersion: 0 } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(EmbeddedDeviceHost);
    fixture.autoDetectChanges();
    // DevicePage similarly retains the dynamically created child instance.
    fixture.componentInstance.child.set(fixture.debugElement.query(By.directive(DeviceV2Page)).componentInstance);
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.shell-state').textContent).toContain('正在连接并同步'));
    connectionState.next('ready');
    // Ready includes the authenticated Manifest and State, not only a fresh flag.
    snapshot.next({ ...snapshot.value, manifestAccepted: true, manifestRevision: 1,
      manifestFingerprint: 'ab'.repeat(32), stateRevision: 1, stateFresh: true });
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
