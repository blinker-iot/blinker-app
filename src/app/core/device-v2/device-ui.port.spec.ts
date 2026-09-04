import { BehaviorSubject, firstValueFrom, Subject, take } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

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
    cloudReachable: true,
    cloudLastSeenAt: 100,
  };
}

function inventory() {
  return {
    getDevice: (id: string) => ({ cloudEnabled: id === logicalDeviceId }),
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
      watchConnection: vi.fn(() => new BehaviorSubject('idle')),
      watchAdapterEnabled: vi.fn(() => new BehaviorSubject(true)),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
      connectionSnapshot: vi.fn(() => 'idle'),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(false),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
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
      inventory() as any,
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
    await port.refreshBlePresence([logicalDeviceId, directId]);
    expect(ble.refreshPresence).toHaveBeenCalledWith([logicalDeviceId, directId]);
    await expect(port.openTelemetry(directId, ['temperature'], 1000))
      .rejects.toThrow('BLE_DIRECT_TELEMETRY_NOT_ENABLED');
  });

  it('uses a verified Manifest cache for an offline page without treating state as fresh', async () => {
    const empty: DeviceV2TargetSnapshot = {
      manifest: null,
      manifestAccepted: false,
      stateRevision: null,
      stateFresh: false,
      values: {},
      eventInterrupted: true,
      cloudReachable: null,
      cloudLastSeenAt: null,
    };
    const appActive = new BehaviorSubject(true);
    const port = new DeviceUiPort(
      {
        state: new BehaviorSubject('stopped'),
        snapshot: () => empty,
        store: { subscribe: () => () => undefined, subscribeEvents: () => () => undefined },
      } as any,
      { watchConnection: () => new BehaviorSubject('idle') } as any,
      { run: (callback: () => void) => callback() } as any,
      { active: appActive } as any,
      inventory() as any,
      { load: () => rawSnapshot().manifest } as any,
    );

    const snapshot = await firstValueFrom(port.watchState(logicalDeviceId).pipe(take(1)));
    expect(snapshot.manifestAccepted).toBe(true);
    expect(snapshot.manifestFingerprint).toBe('ab'.repeat(32));
    expect(snapshot.stateFresh).toBe(false);
    expect(snapshot.endpoints.map(endpoint => endpoint.key)).toEqual(['level']);
  });

  it('syncs an owner PresenceKey before proving a pure BLE credential', async () => {
    const service = {
      state: new BehaviorSubject('stopped'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => new BehaviorSubject('idle')),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
      connectionSnapshot: vi.fn(() => 'idle'),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      canManagePresenceCredential: vi.fn().mockResolvedValue(true),
      syncPresenceCredential: vi.fn().mockResolvedValue(undefined),
      ensureReady: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );
    const directId = 'ble_0123456789abcdefghijkl';

    await port.connect(directId);

    expect(ble.syncPresenceCredential).toHaveBeenCalledWith(directId);
    expect(ble.ensureReady).toHaveBeenCalledWith(directId);
    expect(service.ensureReady).not.toHaveBeenCalled();
    expect(port.isBleDirect(directId)).toBe(true);
  });

  it('syncs an owner PresenceKey before proving a hybrid Direct credential', async () => {
    const connection = new BehaviorSubject<any>('idle');
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => connection),
      watchAdapterEnabled: vi.fn(() => new BehaviorSubject(true)),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
      connectionSnapshot: vi.fn(() => connection.value),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(true),
      syncPresenceCredential: vi.fn().mockResolvedValue(undefined),
      ensureReady: vi.fn(async () => connection.next('ready')),
      disconnect: vi.fn(async () => connection.next('nearby')),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );

    const connectivity: any[] = [];
    const connectivitySubscription = port.watchConnectivity(logicalDeviceId).subscribe(
      value => connectivity.push(value),
    );
    await port.connect(logicalDeviceId);
    expect(port.isBleDirect(logicalDeviceId)).toBe(true);
    expect(ble.syncPresenceCredential).toHaveBeenCalledWith(logicalDeviceId);
    expect(ble.ensureReady).toHaveBeenCalledWith(logicalDeviceId, 5_000);
    expect(service.ensureReady).not.toHaveBeenCalled();
    expect(connectivity.at(-1)).toEqual({
      activeTransport: 'ble',
      directConnectAllowed: true,
      bleAccess: true,
      bleAdapterEnabled: true,
      bleState: 'ready',
      cloudSessionState: 'ready',
    });

    await port.sendCommand(logicalDeviceId, 'level', 40);
    expect(ble.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 40);
    expect(service.command).not.toHaveBeenCalled();

    await port.disconnect(logicalDeviceId);
    expect(ble.disconnect).toHaveBeenCalledWith(logicalDeviceId);
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    connectivitySubscription.unsubscribe();
  });

  it('uses cloud for a hybrid device without a local Direct credential', async () => {
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => new BehaviorSubject('idle')),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
      connectionSnapshot: vi.fn(() => 'idle'),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(false),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );

    await port.connect(logicalDeviceId);
    await port.sendCommand(logicalDeviceId, 'level', 45);

    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    expect(service.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 45);
    expect(ble.ensureReady).not.toHaveBeenCalled();
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
  });

  it('does not contend with an online gateway for a BLE child connection', async () => {
    const presence = new Subject<unknown>();
    const device = {
      cloudEnabled: true,
      deviceType: 'ble',
      data: { cloudReachable: true },
      subject: presence,
    };
    const connection = new BehaviorSubject<any>('nearby');
    const service = {
      state: new BehaviorSubject('ready'),
      ensureReady: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => connection),
      watchAdapterEnabled: vi.fn(() => new BehaviorSubject(true)),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
      connectionSnapshot: vi.fn(() => connection.value),
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn(async () => connection.next('ready')),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      { getDevice: () => device } as any,
    );
    const connectivity: any[] = [];
    const subscription = port.watchConnectivity(logicalDeviceId).subscribe(
      value => connectivity.push(value),
    );

    await port.connect(logicalDeviceId);
    await port.refreshBlePresence([logicalDeviceId]);

    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    expect(ble.ensureReady).not.toHaveBeenCalled();
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    expect(connectivity.at(-1).directConnectAllowed).toBe(false);

    device.data.cloudReachable = false;
    presence.next({ cloudReachable: false });
    await port.connect(logicalDeviceId);

    expect(ble.ensureReady).toHaveBeenCalledWith(logicalDeviceId, 5_000);
    expect(port.isBleDirect(logicalDeviceId)).toBe(true);
    expect(connectivity.at(-1).directConnectAllowed).toBe(true);
    subscription.unsubscribe();
  });

  it('ignores a stale Direct credential for an Edge Hub BLE central', async () => {
    const service = {
      state: new BehaviorSubject('ready'),
      ensureReady: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(true),
      syncPresenceCredential: vi.fn().mockResolvedValue(undefined),
      ensureReady: vi.fn().mockResolvedValue(undefined),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      {
        getDevice: () => ({ cloudEnabled: true, deviceType: 'edge-hub' }),
      } as any,
    );

    await port.connect(logicalDeviceId);
    await port.refreshBlePresence([logicalDeviceId]);

    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    expect(ble.hasActiveCredential).not.toHaveBeenCalled();
    expect(ble.syncPresenceCredential).not.toHaveBeenCalled();
    expect(ble.ensureReady).not.toHaveBeenCalled();
    expect(ble.refreshPresence).not.toHaveBeenCalled();
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
  });

  it('falls back to cloud when bounded hybrid Method 2 cannot connect', async () => {
    const connection = new BehaviorSubject<any>('idle');
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => connection),
      connectionSnapshot: vi.fn(() => connection.value),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn().mockRejectedValue(new Error('BLE_DIRECT_SCAN_TIMEOUT')),
      disconnect: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );

    await port.connect(logicalDeviceId);

    expect(ble.ensureReady).toHaveBeenCalledWith(logicalDeviceId, 5_000);
    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);

    await port.disconnect(logicalDeviceId);
    expect(ble.disconnect).toHaveBeenCalledWith(logicalDeviceId);
  });

  it('keeps Cloud usable while one WiFiProv-to-Direct handoff scan runs', async () => {
    let finishDirect!: () => void;
    const directReady = new Promise<void>(resolve => { finishDirect = resolve; });
    const connection = new BehaviorSubject<any>('connecting');
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => connection),
      connectionSnapshot: vi.fn(() => connection.value),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn(() => directReady),
      disconnect: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );

    const handoff = port.startDirectHandoff(logicalDeviceId);
    await Promise.resolve();
    await port.connect(logicalDeviceId);

    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    expect(ble.ensureReady).toHaveBeenCalledWith(logicalDeviceId, 15_000);
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);

    finishDirect();
    await handoff;
    expect(port.isBleDirect(logicalDeviceId)).toBe(true);
  });

  it('returns a hybrid device to BLE when a retry reaches ready after a transient stop', async () => {
    const connection = new BehaviorSubject<any>('nearby');
    const service = {
      state: new BehaviorSubject('connecting'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => connection),
      connectionSnapshot: vi.fn(() => connection.value),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn(async () => {
        connection.next('stopped');
        await Promise.resolve();
        connection.next('ready');
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );

    const states: string[] = [];
    const subscription = port.watchConnection(logicalDeviceId).subscribe(
      state => states.push(state),
    );
    await port.connect(logicalDeviceId);

    expect(port.isBleDirect(logicalDeviceId)).toBe(true);
    expect(states.at(-1)).toBe('ready');
    expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId);
    subscription.unsubscribe();
  });

  it('falls back to cloud when an active hybrid Direct session stops', async () => {
    const connection = new BehaviorSubject<any>('nearby');
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const ble = {
      watchConnection: vi.fn(() => connection),
      refreshPresence: vi.fn().mockResolvedValue(undefined),
      connectionSnapshot: vi.fn(() => connection.value),
      snapshot: vi.fn(() => rawSnapshot()),
      subscribe: vi.fn(() => () => undefined),
      subscribeEvents: vi.fn(() => () => undefined),
      hasActiveCredential: vi.fn().mockResolvedValue(true),
      canManagePresenceCredential: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn(async () => connection.next('ready')),
      disconnect: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(undefined),
    };
    const port = new DeviceUiPort(
      service as any,
      ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );

    const states: string[] = [];
    const subscription = port.watchConnection(logicalDeviceId).subscribe(
      state => states.push(state),
    );
    await port.connect(logicalDeviceId);
    expect(port.isBleDirect(logicalDeviceId)).toBe(true);

    connection.next('stopped');
    await vi.waitFor(() => expect(service.ensureReady).toHaveBeenCalledWith(logicalDeviceId));

    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    expect(states.at(-1)).toBe('ready');
    await port.sendCommand(logicalDeviceId, 'level', 50);
    expect(service.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 50);
    expect(ble.command).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
