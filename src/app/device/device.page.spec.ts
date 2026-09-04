import { ChangeDetectorRef, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';

import { deviceComponentDict } from '../configs/components.config';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DebugService } from '../debug/debug.service';
import { DevicePage } from './device.page';

const ionicMock = vi.hoisted(() => {
  class IonicStub {}
  return new Proxy(
    { IonicModule: IonicStub, ModalController: IonicStub },
    {
      get: (target, property: string | symbol) => {
        if (property === 'then' || typeof property === 'symbol') return undefined;
        return target[property as keyof typeof target] ?? IonicStub;
      },
    },
  );
});

vi.mock('@ionic/angular', () => ionicMock);
vi.mock('@ionic/angular/standalone', () => ionicMock);

describe('DevicePage component switching', () => {
  let device: BlinkerDevice;
  let page: DevicePage;
  let createComponent: ReturnType<typeof vi.fn>;
  let componentRefs: Array<{
    instance: Record<string, unknown>;
    setInput: ReturnType<typeof vi.fn>;
    changeDetectorRef: { detectChanges: ReturnType<typeof vi.fn> };
    destroy: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    device = {
      id: 'device-1',
      deviceName: 'device-1',
      config: {
        broker: 'blinker',
        customName: '测试设备',
        mode: 'mqtt',
        component: 'Layouter2Component',
        isPreview: true,
      },
      data: {},
      storage: {},
      subject: new Subject(),
    };

    componentRefs = [];
    createComponent = vi.fn(() => {
      const ref = {
        instance: {},
        setInput: vi.fn(),
        changeDetectorRef: { detectChanges: vi.fn() },
        destroy: vi.fn(),
      };
      componentRefs.push(ref);
      return ref;
    });

    const route = {
      paramMap: new BehaviorSubject({
        get: (key: string) => (key === 'id' ? 'device-1' : null),
      }),
    } as unknown as ActivatedRoute;
    const dataService = {
      device: { dict: { 'device-1': device } },
      initCompleted: new BehaviorSubject(false),
    } as unknown as DataService;

    page = new DevicePage(
      route,
      { url: '/device/device-1', events: new Subject() } as never,
      {
        connectDevice: vi.fn(),
        disconnectDevice: vi.fn(),
        queryDevice: vi.fn(),
      } as never,
      dataService,
      { devicePageIsRoot: false } as never,
      { init: vi.fn(), end: vi.fn() } as unknown as DebugService,
      { create: vi.fn() } as never,
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    );

    page.ngOnInit();
    page.deviceView = {
      clear: vi.fn(),
      createComponent,
    } as unknown as ViewContainerRef;
  });

  afterEach(() => {
    page.ngOnDestroy();
  });

  it('rebuilds the cached device view when the component event is emitted', () => {
    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['Layouter2Component'],
    );

    device.config.component = 'Customizer';
    device.subject.next({ key: 'component', value: 'Customizer' });

    expect(createComponent).toHaveBeenCalledTimes(2);
    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['Customizer'],
    );
    expect(componentRefs[1].setInput).toHaveBeenCalledWith(
      'customizerUrl',
      '',
    );
  });

  it('does not rebuild for unrelated device data events', () => {
    device.subject.next({ key: 'switch', value: true });

    expect(createComponent).toHaveBeenCalledTimes(1);
  });

  it('reloads a changed component when re-entering an Ionic cached page', () => {
    device.config.component = 'TestDashboard';

    page.ionViewWillEnter();

    expect(createComponent).toHaveBeenCalledTimes(2);
    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['TestDashboard'],
    );
  });

  it('passes the URL from a legacy Customizer configuration', () => {
    device.config.component = 'Customizer?https://example.com/device-ui';

    page.ionViewWillEnter();

    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['Customizer'],
    );
    expect(componentRefs[1].setInput).toHaveBeenCalledWith(
      'customizerUrl',
      'https://example.com/device-ui',
    );
  });

  it('uses the embedded Device V2 page for bbp2 devices without an explicit component', () => {
    device.config.mode = 'bbp2';
    delete device.config.component;

    page.ionViewWillEnter();

    expect(page.usesV2DevicePage).toBe(true);
    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['DeviceV2'],
    );
    expect(componentRefs[1].setInput).toHaveBeenCalledWith('device', device);
    expect(componentRefs[1].setInput).toHaveBeenCalledWith('embedded', true);
  });

  it('keeps an explicit component authoritative for a bbp2 device', () => {
    device.config.mode = 'bbp2';
    device.config.component = 'TestDashboard';

    page.ionViewWillEnter();

    expect(page.usesV2DevicePage).toBe(false);
    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['TestDashboard'],
    );
    expect(componentRefs[1].setInput).not.toHaveBeenCalledWith(
      'embedded',
      true,
    );
  });

  it('falls back to DeviceV2 when a bbp2 component is unknown', () => {
    device.config.mode = 'bbp2';
    device.config.component = 'RetiredDashboard';

    page.ionViewWillEnter();

    expect(page.usesV2DevicePage).toBe(true);
    expect(createComponent).toHaveBeenLastCalledWith(
      deviceComponentDict['DeviceV2'],
    );
  });

  it('bridges the Device V2 state label from the loaded component to the shell', () => {
    device.config.mode = 'bbp2';
    delete device.config.component;
    page.ionViewWillEnter();
    componentRefs[1].instance['stateLabel'] = '\u5728\u7ebf';

    expect(page.deviceStateLabel).toBe('\u5728\u7ebf');

    device.config.component = 'TestDashboard';
    page.ionViewWillEnter();

    expect(page.deviceStateLabel).toBe('离线');

    device.data.state = 'waiting';
    expect(page.deviceStateLabel).toBe('正在连接');
    device.data.enable = true;
    expect(page.deviceStateLabel).toBe('在线');
  });
});

describe('DevicePage delayed BLE connection lifecycle', () => {
  let page: DevicePage | undefined;
  let routeParams: BehaviorSubject<{ get: (key: string) => string | null }>;
  let deviceDict: Record<string, BlinkerDevice>;
  let connectDevice: ReturnType<typeof vi.fn>;
  let disconnectDevice: ReturnType<typeof vi.fn>;
  let queryDevice: ReturnType<typeof vi.fn>;
  let resolveBleConnection: (connected: boolean) => void;
  let bleConnection: Promise<boolean>;

  const makeDevice = (
    id: string,
    mode: string,
    component?: string,
  ): BlinkerDevice => ({
    id,
    deviceName: id,
    config: {
      broker: 'blinker',
      customName: id,
      mode,
      component,
    },
    data: {},
    storage: {},
    subject: new Subject(),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    const bleDevice = makeDevice('ble-device', 'ble', 'Layouter2Component');
    deviceDict = { [bleDevice.id!]: bleDevice };
    routeParams = new BehaviorSubject({
      get: (key: string) => (key === 'id' ? bleDevice.id! : null),
    });
    bleConnection = new Promise<boolean>((resolve) => {
      resolveBleConnection = resolve;
    });
    connectDevice = vi.fn((target: BlinkerDevice) =>
      target === bleDevice ? bleConnection : Promise.resolve(true),
    );
    disconnectDevice = vi.fn();
    queryDevice = vi.fn();

    page = new DevicePage(
      { paramMap: routeParams } as unknown as ActivatedRoute,
      { url: '/device/ble-device', events: new Subject() } as never,
      { connectDevice, disconnectDevice, queryDevice } as never,
      {
        device: { dict: deviceDict },
        initCompleted: new BehaviorSubject(false),
      } as unknown as DataService,
      { devicePageIsRoot: false } as never,
      { init: vi.fn(), end: vi.fn() } as unknown as DebugService,
      { create: vi.fn() } as never,
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    );
    page.ngOnInit();
  });

  afterEach(() => {
    page?.ngOnDestroy();
    vi.useRealTimers();
  });

  it('does not query or start a heartbeat after switching devices while BLE connects', async () => {
    const v2Device = makeDevice('v2-device', 'bbp2');
    deviceDict[v2Device.id!] = v2Device;

    routeParams.next({
      get: (key: string) => (key === 'id' ? v2Device.id! : null),
    });
    resolveBleConnection(true);
    await bleConnection;
    await Promise.resolve();
    vi.advanceTimersByTime(60_000);

    expect(disconnectDevice).toHaveBeenCalledWith(deviceDict['ble-device']);
    expect(queryDevice).not.toHaveBeenCalled();
  });

  it('does not query or start a heartbeat when destroyed while BLE connects', async () => {
    const destroyedPage = page!;
    destroyedPage.ngOnDestroy();
    page = undefined;

    resolveBleConnection(true);
    await bleConnection;
    await Promise.resolve();
    vi.advanceTimersByTime(60_000);

    expect(disconnectDevice).toHaveBeenCalledWith(deviceDict['ble-device']);
    expect(queryDevice).not.toHaveBeenCalled();
  });
});
