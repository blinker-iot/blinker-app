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
      {
        connectDevice: vi.fn(),
        disconnectDevice: vi.fn(),
        queryDevice: vi.fn(),
      } as never,
      dataService,
      { devicePageIsRoot: false } as never,
      { init: vi.fn(), end: vi.fn() } as unknown as DebugService,
      { create: vi.fn() } as never,
      { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
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
});
