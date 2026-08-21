import '@angular/compiler';

import { BehaviorSubject, Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  DeviceUiEvent,
  DeviceUiSnapshot,
} from '../device-v2/device-ui.port';
import { BlinkerDevice } from '../model/device.model';
import { DeviceService } from './device.service';

const firstId = 'device_11111111-1111-4111-8111-111111111111';
const secondId = 'device_22222222-2222-4222-8222-222222222222';

function makeDevice(id = firstId): BlinkerDevice {
  return {
    id,
    deviceName: id,
    config: {
      broker: 'blinker',
      customName: id,
      mode: 'bbp2',
    },
    data: {},
    storage: {},
    subject: new Subject(),
  };
}

function makeSnapshot(
  values: Readonly<Record<string, boolean | number | bigint | string | null | Uint8Array>>,
  stateFresh = true,
): DeviceUiSnapshot {
  return {
    manifestRevision: 1,
    manifestFingerprint: 'manifest-1',
    manifestAccepted: true,
    stateRevision: 1,
    stateFresh,
    endpoints: Object.entries(values).map(([key, value], index) => ({
      id: index + 1,
      key,
      role: 'property',
      valueType: value instanceof Uint8Array
        ? 'bytes'
        : typeof value === 'bigint'
          ? 'integer'
          : typeof value === 'boolean'
            ? 'boolean'
            : typeof value === 'number'
              ? 'number'
              : value === null
                ? 'null'
                : 'text',
      readable: true,
      writable: true,
      notifies: true,
      value,
    })),
  };
}

function createHarness(devices: BlinkerDevice[] = [makeDevice()]) {
  const stateStreams = new Map<string, Subject<DeviceUiSnapshot>>();
  const eventStreams = new Map<string, Subject<DeviceUiEvent>>();
  const stateStream = (id: string) => {
    let stream = stateStreams.get(id);
    if (!stream) {
      stream = new Subject<DeviceUiSnapshot>();
      stateStreams.set(id, stream);
    }
    return stream;
  };
  const eventStream = (id: string) => {
    let stream = eventStreams.get(id);
    if (!stream) {
      stream = new Subject<DeviceUiEvent>();
      eventStreams.set(id, stream);
    }
    return stream;
  };
  const deviceUi = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue(undefined),
    watchState: vi.fn((id: string) => stateStream(id)),
    watchEvents: vi.fn((id: string) => eventStream(id)),
  };
  const http = {
    get: vi.fn(() => of({ message: 1001 })),
    post: vi.fn(),
  };
  const initCompleted = new BehaviorSubject(false);
  const authDataExpire = new Subject<boolean>();
  const deviceDict = Object.fromEntries(
    devices.map(device => [device.id!, device]),
  );
  const dataService = {
    auth: { uuid: 'user-id', token: 'token' },
    authCheck: new Subject<boolean>(),
    authDataExpire,
    brokers: { list: [], dict: {} },
    device: {
      list: devices.map(device => device.id!),
      dict: deviceDict,
    },
    initCompleted,
  };
  const service = new DeviceService(
    http as never,
    { is: vi.fn(() => false) } as never,
    dataService as never,
    {} as never,
    { enable: false, update: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    deviceUi as never,
  );

  return {
    authDataExpire,
    dataService,
    deviceUi,
    eventStreams,
    http,
    initCompleted,
    service,
    stateStreams,
  };
}

describe('DeviceService bbp2 state bridge', () => {
  it('maps snapshots and events into legacy device data using JSON-safe values', () => {
    const device = makeDevice();
    device.data.history = { existing: true };
    const notifications: Array<{ key: string; source?: string }> = [];
    device.subject.subscribe(event => notifications.push(event));
    const { eventStreams, service, stateStreams } = createHarness([device]);

    service.queryDevice(device);
    stateStreams.get(firstId)!.next(makeSnapshot({
      switch: true,
      counter: 9007199254740993n,
      payload: new Uint8Array([1, 2, 3]),
    }));

    expect(device.data).toMatchObject({
      switch: true,
      counter: '9007199254740993',
      payload: [1, 2, 3],
      state: 'online',
      enable: true,
      history: { existing: true },
    });
    expect(() => JSON.stringify(device.data)).not.toThrow();
    expect(notifications.at(-1)).toMatchObject({
      key: 'loaded',
      source: 'bbp2-state',
    });

    eventStreams.get(firstId)!.next({
      logicalDeviceId: firstId,
      values: {
        switch: false,
        payload: new Uint8Array([9]),
      },
    });

    expect(device.data.switch).toBe(false);
    expect(device.data.payload).toEqual([9]);
    expect(notifications.at(-1)).toMatchObject({
      key: 'loaded',
      source: 'bbp2-event',
    });

    stateStreams.get(firstId)!.next(makeSnapshot({ counter: 7 }, false));

    expect(device.data.switch).toBeUndefined();
    expect(device.data.payload).toBeUndefined();
    expect(device.data.history).toEqual({ existing: true });
    expect(device.data).toMatchObject({
      counter: 7,
      state: 'waiting',
      enable: false,
    });
  });

  it('deduplicates watchers and rebinds a refreshed device object', () => {
    const original = makeDevice();
    const {
      deviceUi,
      eventStreams,
      service,
      stateStreams,
    } = createHarness([original]);

    service.queryDevice(original);
    service.queryDevice(original);
    stateStreams.get(firstId)!.next(makeSnapshot({ switch: true }));

    const refreshed = makeDevice();
    service.queryDevice(refreshed);

    expect(deviceUi.watchState).toHaveBeenCalledTimes(1);
    expect(deviceUi.watchEvents).toHaveBeenCalledTimes(1);
    expect(refreshed.data.switch).toBe(true);

    eventStreams.get(firstId)!.next({
      logicalDeviceId: firstId,
      values: { switch: false },
    });

    expect(refreshed.data.switch).toBe(false);
    expect(original.data.switch).toBe(true);
  });

  it('keeps devices isolated and disposes bridge subscriptions on auth expiry', () => {
    const first = makeDevice(firstId);
    const second = makeDevice(secondId);
    const {
      authDataExpire,
      eventStreams,
      service,
      stateStreams,
    } = createHarness([first, second]);
    service.init();

    service.queryDevice(first);
    service.queryDevice(second);
    stateStreams.get(firstId)!.next(makeSnapshot({ temperature: 21 }));
    stateStreams.get(secondId)!.next(makeSnapshot({ temperature: 30 }));

    expect(first.data.temperature).toBe(21);
    expect(second.data.temperature).toBe(30);

    authDataExpire.next(true);
    eventStreams.get(firstId)!.next({
      logicalDeviceId: firstId,
      values: { temperature: 99 },
    });

    expect(first.data.temperature).toBe(21);
    expect(second.data.temperature).toBe(30);
  });

  it('connects for realtime queries without sending an rt endpoint command', () => {
    const device = makeDevice();
    const { deviceUi, service } = createHarness([device]);

    service.queryRealtimeData(device, { rt: ['temperature'] });

    expect(deviceUi.connect).toHaveBeenCalledOnce();
    expect(deviceUi.connect).toHaveBeenCalledWith(firstId);
    expect(deviceUi.sendCommand).not.toHaveBeenCalled();
  });

  it('restores the saved UI component on startup without replacing V2 transport fields', async () => {
    const device = makeDevice();
    const notifications: Array<{ key: string; source?: string }> = [];
    device.subject.subscribe(event => notifications.push(event));
    const {
      http,
      initCompleted,
      service,
    } = createHarness([device]);
    http.get.mockReturnValue(of({
      message: 1000,
      detail: {
        component: 'Customizer',
        image: 'saved-image',
        mode: 'mqtt',
        broker: 'legacy-broker',
      },
    }));

    service.init();
    initCompleted.next(true);

    await vi.waitFor(() => {
      expect(device.config.component).toBe('Customizer');
    });
    expect(device.config).toMatchObject({
      component: 'Customizer',
      image: 'saved-image',
      mode: 'bbp2',
      broker: 'blinker',
    });
    expect(notifications.at(-1)).toMatchObject({
      key: 'component',
      source: 'config',
    });
    expect(http.get).toHaveBeenCalledWith(
      expect.any(String),
      {
        params: {
          uuid: 'user-id',
          token: 'token',
          deviceName: firstId,
        },
      },
    );
  });
});
