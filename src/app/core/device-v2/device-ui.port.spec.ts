import { BehaviorSubject, firstValueFrom, take } from 'rxjs';

import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2Event,
  DeviceV2TargetSnapshot,
  DeviceV2TelemetrySnapshot,
  DeviceV2ValueType,
} from '../protocol/device-v2';
import { DeviceUiPort } from './device-ui.port';

const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';

function rawSnapshot(): DeviceV2TargetSnapshot {
  return {
    manifest: {
      revision: 3,
      fingerprint: 'ab'.repeat(32),
      fields: [
        {
          id: 1,
          key: 'level',
          kind: DeviceV2EndpointKind.Property,
          type: DeviceV2ValueType.UnsignedInteger,
          access: DeviceV2EndpointAccess.Read
            | DeviceV2EndpointAccess.Write
            | DeviceV2EndpointAccess.Notify,
          constraints: { minimum: 0, maximum: 100, step: 5, unit: '%' },
        },
      ],
    },
    manifestAccepted: true,
    stateRevision: 9,
    stateFresh: true,
    values: {
      level: {
        type: DeviceV2ValueType.UnsignedInteger,
        value: 25,
        cbor: new Uint8Array([0x18, 0x19]),
      },
    },
    eventInterrupted: false,
  };
}

describe('DeviceUiPort', () => {
  it('maps protocol snapshots to the small UI contract', async () => {
    let stateListener: ((id: string, snapshot: DeviceV2TargetSnapshot) => void) | undefined;
    let eventListener: ((event: DeviceV2Event) => void) | undefined;
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn((listener) => {
          stateListener = listener;
          return () => { stateListener = undefined; };
        }),
        subscribeEvents: vi.fn((listener) => {
          eventListener = listener;
          return () => { eventListener = undefined; };
        }),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue({ acknowledgedSequence: 1 }),
      openTelemetry: vi.fn().mockResolvedValue({
        snapshot: {
          active: true,
          visible: true,
          streamId: 1,
          epoch: 2,
          effectiveIntervalMs: 1000,
          values: {
            temperature: {
              type: DeviceV2ValueType.Float32,
              value: 21.5,
              cbor: new Uint8Array([0xfa, 0x41, 0xac, 0x00, 0x00]),
            },
          },
        },
        subscribe: vi.fn(function (listener: (snapshot: DeviceV2TelemetrySnapshot) => void) {
          listener(this.snapshot);
          return () => undefined;
        }),
        setVisible: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const ble = {
      state: new BehaviorSubject('idle'),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      ensureReady: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const appActive = new BehaviorSubject(true);
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: appActive } as any,
    );

    expect(await firstValueFrom(port.appActive.pipe(take(1)))).toBe(true);

    const snapshot = await firstValueFrom(port.watchState(logicalDeviceId).pipe(take(1)));
    expect(snapshot).toEqual({
      manifestRevision: 3,
      manifestFingerprint: 'ab'.repeat(32),
      manifestAccepted: true,
      stateRevision: 9,
      stateFresh: true,
      endpoints: [{
        id: 1,
        key: 'level',
        role: 'property',
        valueType: 'integer',
        readable: true,
        writable: true,
        notifies: true,
        value: 25,
        minimum: 0,
        maximum: 100,
        step: 5,
        maxLength: undefined,
        unit: '%',
        choices: undefined,
        telemetryMinimumIntervalMs: undefined,
      }],
    });
    expect(stateListener).toBeUndefined();

    let eventValue: unknown;
    const subscription = port.watchEvents(logicalDeviceId).subscribe(event => eventValue = event.values['alarm']);
    eventListener?.({
      logicalDeviceId,
      values: {
        alarm: { type: DeviceV2ValueType.Boolean, value: true, cbor: new Uint8Array([0xf5]) },
      },
    });
    expect(eventValue).toBe(true);
    subscription.unsubscribe();
    expect(eventListener).toBeUndefined();

    await port.connect(logicalDeviceId);
    await port.sendCommand(logicalDeviceId, 'level', 30);
    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    expect(service.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 30);

    const telemetry = await port.openTelemetry(logicalDeviceId, ['temperature'], 1000);
    expect(telemetry.snapshot).toEqual({
      active: true,
      effectiveIntervalMs: 1000,
      values: { temperature: 21.5 },
    });
    await telemetry.setVisible(false);
    await telemetry.close();
    expect(service.openTelemetry).toHaveBeenCalledWith(
      logicalDeviceId,
      ['temperature'],
      1000,
    );

    const directId = 'ble_0123456789abcdefghijkl';
    await port.connect(directId);
    await port.sendCommand(directId, 'level', 35);
    await port.disconnect(directId);
    expect(ble.ensureReady).toHaveBeenCalledWith(directId);
    expect(ble.command).toHaveBeenCalledWith(directId, 'level', 35);
    expect(ble.disconnect).toHaveBeenCalledWith(directId);
    await expect(port.openTelemetry(directId, ['temperature'], 1000))
      .rejects.toThrow('BLE_DIRECT_TELEMETRY_NOT_ENABLED');
  });
});
