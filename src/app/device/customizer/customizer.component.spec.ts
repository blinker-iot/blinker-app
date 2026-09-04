import { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Subject } from 'rxjs';

import { BlinkerDevice } from '../../core/model/device.model';
import { CloudStorageService } from '../../core/services/cloudStorage.service';
import { DeviceService } from '../../core/services/device.service';
import {
  DEVICE_UI_PROTOCOL_VERSION,
  type DeviceHostContext,
} from './customizer-bridge';
import { Customizer } from './customizer.component';

const penpalMock = vi.hoisted(() => {
  class CallOptions {
    constructor(readonly options: Record<string, unknown> = {}) {}
  }

  const WindowMessenger = vi.fn(function (
    this: Record<string, unknown>,
    options: Record<string, unknown>
  ) {
    Object.assign(this, options);
  });

  return {
    CallOptions,
    WindowMessenger,
    connect: vi.fn(),
    ErrorCode: {
      ConnectionDestroyed: 'CONNECTION_DESTROYED',
    },
  };
});

const ionicMock = vi.hoisted(() => {
  class IonicStub {}
  return new Proxy(
    {},
    {
      get: (_target, property: string | symbol) => {
        if (property === 'then' || typeof property === 'symbol')
          return undefined;
        return IonicStub;
      },
    }
  );
});

vi.mock('penpal', () => penpalMock);
vi.mock('@ionic/angular', () => ionicMock);
vi.mock('@ionic/angular/standalone', () => ionicMock);

describe('Customizer Penpal host', () => {
  const setHostContext = vi.fn().mockResolvedValue({ ok: true });
  const updateDevice = vi.fn().mockResolvedValue({ ok: true });
  const updateViewport = vi.fn().mockResolvedValue({ ok: true });
  const destroy = vi.fn();
  const sendData = vi.fn();
  const getTimeSeriesData = vi.fn().mockResolvedValue(true);
  const bypassSecurityTrustResourceUrl = vi.fn((value: string) => value);
  const markForCheck = vi.fn();
  const detectChanges = vi.fn();

  let device: BlinkerDevice;
  let component: Customizer;

  beforeEach(() => {
    vi.clearAllMocks();
    penpalMock.connect.mockReturnValue({
      promise: Promise.resolve({
        setHostContext,
        updateDevice,
        updateViewport,
        ping: vi.fn().mockResolvedValue('pong'),
      }),
      destroy,
    });

    device = {
      id: 'device-1',
      deviceName: 'device-1',
      deviceType: '环境监测器',
      config: {
        broker: 'blinker',
        customName: '客厅环境管家',
        mode: 'mqtt',
        showSwitch: true,
        authKey: 'must-not-cross-the-bridge',
      },
      data: {
        enable: true,
        state: 'online',
        temperature: 23.8,
        history: {
          temperature: { '1h': [{ date: 100, value: 20 }] },
        },
      },
      storage: { secret: true },
      subject: new Subject(),
    };

    const hostNativeElement = {
      getBoundingClientRect: () => ({ width: 390, height: 720 }),
      closest: () => ({
        querySelector: () => ({
          getBoundingClientRect: () => ({ bottom: 64 }),
        }),
      }),
    } as unknown as HTMLElement;

    component = new Customizer(
      new ElementRef(hostNativeElement),
      { sendData } as unknown as DeviceService,
      {
        bypassSecurityTrustResourceUrl,
      } as unknown as DomSanitizer,
      {
        getTimeSeriesData,
      } as unknown as CloudStorageService,
      { run: (callback: () => unknown) => callback() } as unknown as NgZone,
      { markForCheck, detectChanges } as unknown as ChangeDetectorRef
    );
    component.device = device;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('loads the bundled device-template for a bare Customizer config', () => {
    component.ngOnInit();

    const frameUrl = new URL(bypassSecurityTrustResourceUrl.mock.calls[0][0]);
    expect(frameUrl.pathname).toBe('/device-template/index.html');
    expect(frameUrl.searchParams.get('blinkerParentOrigin')).toBe(
      window.location.origin
    );
    expect(frameUrl.searchParams.get('blinkerBundled')).toBe('1');
  });

  it('uses the trusted local-window origin mode for the bundled template', () => {
    component.ngOnInit();
    const childWindow = {} as Window;
    component.onFrameLoad({
      target: { contentWindow: childWindow },
    } as unknown as Event);

    expect(penpalMock.WindowMessenger).toHaveBeenCalledWith({
      remoteWindow: childWindow,
      allowedOrigins: ['*'],
    });
  });

  it('connects on iframe load with the exact child origin', () => {
    component.customizerUrl = 'https://device-ui.example.com/dashboard';
    component.ngOnInit();
    const childWindow = {} as Window;

    component.onFrameLoad({
      target: { contentWindow: childWindow },
    } as unknown as Event);

    expect(penpalMock.WindowMessenger).toHaveBeenCalledWith({
      remoteWindow: childWindow,
      allowedOrigins: ['https://device-ui.example.com'],
    });
  });

  it('reveals the iframe when Penpal connects and exposes a sanitized snapshot', async () => {
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);

    expect(component.loading).toBe(true);
    await vi.waitFor(() => expect(component.loading).toBe(false));
    expect(component.loaded).toBe(true);
    expect(detectChanges).toHaveBeenCalled();

    const methods = penpalMock.connect.mock.calls[0][0].methods;
    const context = methods.getHostContext() as DeviceHostContext;
    expect(context.device.name).toBe('客厅环境管家');
    expect(context.device.data['temperature']).toBe(23.8);
    expect(context.device.data['history']).toBeUndefined();
    expect(context.device).not.toHaveProperty('authKey');
    expect(context.device).not.toHaveProperty('storage');

    expect(
      methods.childReady({ protocolVersion: DEVICE_UI_PROTOCOL_VERSION })
    ).toEqual({ ok: true });
    expect(component.loaded).toBe(true);
    expect(component.loading).toBe(false);
    expect(setHostContext).toHaveBeenCalled();
  });

  it('keeps the iframe visible when initial context sync times out', async () => {
    setHostContext.mockRejectedValueOnce(
      Object.assign(new Error('Method call setHostContext() timed out'), {
        code: 'METHOD_CALL_TIMEOUT',
      })
    );
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);

    await vi.waitFor(() => expect(setHostContext).toHaveBeenCalled());
    await Promise.resolve();
    expect(component.loaded).toBe(true);
    expect(component.isFailed).toBe(false);
  });

  it('does not restore the error overlay for a late child error', async () => {
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);
    await vi.waitFor(() => expect(component.loaded).toBe(true));
    const methods = penpalMock.connect.mock.calls[0][0].methods;
    methods.childReady({ protocolVersion: DEVICE_UI_PROTOCOL_VERSION });

    expect(
      methods.childError({
        message: 'Method call childReady() timed out after 5000ms',
      })
    ).toEqual({ ok: true });
    expect(component.loaded).toBe(true);
    expect(component.isFailed).toBe(false);
  });

  it('pushes device subject updates to the connected child', async () => {
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);
    await Promise.resolve();
    const methods = penpalMock.connect.mock.calls[0][0].methods;
    methods.childReady({ protocolVersion: DEVICE_UI_PROTOCOL_VERSION });

    device.data.temperature = 24.5;
    device.subject.next({ key: 'temperature', value: 24.5 });

    await vi.waitFor(() => expect(updateDevice).toHaveBeenCalled());
    expect(updateDevice.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        revision: 1,
        device: expect.objectContaining({
          data: expect.objectContaining({ temperature: 24.5 }),
        }),
      })
    );
  });

  it('keeps the iframe visible when a device update acknowledgement times out', async () => {
    updateDevice.mockRejectedValueOnce(
      Object.assign(new Error('Method call updateDevice() timed out'), {
        code: 'METHOD_CALL_TIMEOUT',
      })
    );
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);
    await Promise.resolve();
    const methods = penpalMock.connect.mock.calls[0][0].methods;
    methods.childReady({ protocolVersion: DEVICE_UI_PROTOCOL_VERSION });

    device.data.temperature = 24.5;
    device.subject.next({ key: 'temperature', value: 24.5 });

    await vi.waitFor(() => expect(updateDevice).toHaveBeenCalled());
    await Promise.resolve();
    expect(component.loaded).toBe(true);
    expect(component.isFailed).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('validates commands before forwarding them to DeviceService', () => {
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);
    const methods = penpalMock.connect.mock.calls[0][0].methods;

    expect(methods.sendDeviceCommand({ switch: 'on' })).toEqual({
      accepted: true,
    });
    expect(sendData).toHaveBeenCalledWith(device, '{"switch":"on"}');
    expect(methods.sendDeviceCommand('switch-on')).toEqual({
      accepted: false,
      reason: 'invalid-command',
    });
  });

  it('keeps shared viewers read-only across capabilities and commands', () => {
    device.config.mode = 'bbp2';
    device.config.isShared = true;
    device.data.canCommand = false;
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);
    const methods = penpalMock.connect.mock.calls[0][0].methods;

    const context = methods.getHostContext() as DeviceHostContext;
    expect(context.capabilities.commands).toBe(false);
    expect(methods.sendDeviceCommand({ switch: 'on' })).toEqual({
      accepted: false,
      reason: 'read-only',
    });
    expect(sendData).not.toHaveBeenCalled();
  });

  it('keeps the existing connection for a repeated load from the same iframe', () => {
    component.ngOnInit();
    const childWindow = {} as Window;
    const childDocument = {} as Document;
    component.onFrameLoad({
      target: { contentWindow: childWindow, contentDocument: childDocument },
    } as unknown as Event);
    component.onFrameLoad({
      target: { contentWindow: childWindow, contentDocument: childDocument },
    } as unknown as Event);

    expect(destroy).not.toHaveBeenCalled();
    expect(penpalMock.connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects when the same iframe WindowProxy navigates to a new document', () => {
    component.ngOnInit();
    const childWindow = {} as Window;
    component.onFrameLoad({
      target: { contentWindow: childWindow, contentDocument: {} },
    } as unknown as Event);
    component.onFrameLoad({
      target: { contentWindow: childWindow, contentDocument: {} },
    } as unknown as Event);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(penpalMock.connect).toHaveBeenCalledTimes(2);
  });

  it('rejects prototype keys and keys absent from current device data', async () => {
    component.ngOnInit();
    component.onFrameLoad({
      target: { contentWindow: {} },
    } as unknown as Event);
    const methods = penpalMock.connect.mock.calls[0][0].methods;

    await expect(
      methods.getHistory({ key: '__proto__', quickCode: '1h' })
    ).resolves.toEqual({ ok: false, error: '历史数据请求格式无效' });
    await expect(
      methods.getHistory({ key: 'unknown', quickCode: '1h' })
    ).resolves.toEqual({ ok: false, error: '历史数据请求格式无效' });
    expect(getTimeSeriesData).not.toHaveBeenCalled();
  });
});
