import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUiPort, DeviceUiSnapshot } from '../../core/device-v2/device-ui.port';
import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceV2PageLayoutService } from '../../core/services/device-v2-page-layout.service';
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

  it('updates the parent header after Ready finalization without a click or parent detectChanges', async () => {
    const connectionState = new BehaviorSubject('connecting');
    const snapshot = new BehaviorSubject<DeviceUiSnapshot>({ manifestRevision: null, manifestFingerprint: null,
      manifestAccepted: false, stateRevision: null, stateFresh: false, endpoints: [] });
    let finish!: () => void;
    const ready = new Promise<void>(resolve => { finish = resolve; });
    const controller = new AbortController();
    let closed!: () => void;
    const connection = { ready, signal: controller.signal, closed: new Promise<void>(resolve => { closed = resolve; }),
      close: () => { controller.abort(); closed(); } };
    const port = { appActive: new BehaviorSubject(true), isBleDirect: () => true,
      watchConnection: () => connectionState,
      watchConnectivity: () => new BehaviorSubject({ activeTransport: 'ble', directConnectAllowed: true,
        bleAccess: true, bleAdapterEnabled: true, bleState: 'connecting', cloudSessionState: 'idle' }),
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
    fixture.destroy();
  });
});
