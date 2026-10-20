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
  it('does not mark a residual BLE ready state online when the adapter is disabled', () => {
    let enabled: boolean | null = true;
    const device = { data: { cloudReachable: false } };
    const ble = { adapterEnabledSnapshot: vi.fn(() => enabled), connectionSnapshot: vi.fn(() => 'ready'),
      watchAdapterEnabled: vi.fn(), ensureReady: vi.fn() };
    const port = new DeviceUiPort({} as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, { getDevice: () => device } as any);
    expect(port.isOnline(logicalDeviceId)).toBe(true);
    enabled = false;
    expect(port.isOnline(logicalDeviceId)).toBe(false);
    device.data.cloudReachable = true;
    expect(port.isOnline(logicalDeviceId)).toBe(true);
    expect(ble.watchAdapterEnabled).not.toHaveBeenCalled();
    expect(ble.ensureReady).not.toHaveBeenCalled();
  });

  it.each(['credential', 'radio'])('does not block a ready Cloud page on pending BLE %s', async phase => {
    let finish!: (value?: any) => void;
    const pending = new Promise<any>(resolve => { finish = resolve; });
    const release = vi.fn();
    const interest = { accepted: Promise.resolve(), closed: new Promise<any>(() => undefined), release };
    const service = { acquireStateInterest: vi.fn(async () => interest), waitUntilReady: vi.fn(async () => undefined),
      command: vi.fn(async () => undefined) };
    const ble = { hasActiveCredential: vi.fn(() => phase === 'credential' ? pending : Promise.resolve(true)),
      canManagePresenceCredential: vi.fn(async () => false), ensureReady: vi.fn(() => pending),
      disconnect: vi.fn(async () => undefined), command: vi.fn(async () => undefined) };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    const page = port.openConnection(logicalDeviceId);
    const ready = vi.fn(); void page.ready.then(ready).catch(() => undefined);
    try {
      await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce(), { timeout: 250 });
      expect(port.isBleDirect(logicalDeviceId)).toBe(false);
      await port.sendCommand(logicalDeviceId, 'level', 30);
      expect(service.command).toHaveBeenCalledOnce(); expect(ble.command).not.toHaveBeenCalled();
      expect(service.acquireStateInterest).toHaveBeenCalledOnce();
      page.close(); finish(true);
      await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
      expect(port.isBleDirect(logicalDeviceId)).toBe(false);
      if (phase === 'credential') expect(ble.ensureReady).not.toHaveBeenCalled();
    } finally { page.close(); finish(true); await page.ready.catch(() => undefined); }
  });

  it.each(['cloud-first', 'ble-first'])('retains Direct readiness when Cloud fails: %s', async order => {
    let rejectCloud!: (error: Error) => void, finishBle!: () => void;
    const cloud = new Promise<void>((_, reject) => { rejectCloud = reject; });
    const direct = new Promise<void>(resolve => { finishBle = resolve; });
    const service = { acquireStateInterest: vi.fn(async () => undefined), waitUntilReady: vi.fn(() => cloud) };
    const ble = { hasActiveCredential: vi.fn(async () => true), canManagePresenceCredential: vi.fn(async () => false),
      ensureReady: vi.fn(() => direct), connectionSnapshot: () => 'ready', disconnect: vi.fn(async () => undefined) };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    const page = port.openConnection(logicalDeviceId);
    const result = page.ready.catch(error => error);
    try {
      await vi.waitFor(() => expect(service.waitUntilReady).toHaveBeenCalledOnce(), { timeout: 250 });
      if (order === 'cloud-first') rejectCloud(Error('offline'));
      finishBle(); expect(await result).toBeUndefined();
      if (order === 'ble-first') rejectCloud(Error('offline'));
      await Promise.resolve(); await Promise.resolve();
      expect(port.isBleDirect(logicalDeviceId)).toBe(true); expect(page.signal.aborted).toBe(false);
    } finally { page.close(); finishBle(); rejectCloud(Error('closed')); await result; }
  });

  it('preserves the Cloud error after both hybrid candidates fail', async () => {
    const failure = Error('cloud unavailable');
    const service = { acquireStateInterest: vi.fn(async () => undefined), waitUntilReady: vi.fn(async () => { throw failure; }) };
    const ble = { hasActiveCredential: vi.fn(async () => true), canManagePresenceCredential: vi.fn(async () => false),
      ensureReady: vi.fn(async () => { throw Error('BLE_DIRECT_SCAN_TIMEOUT'); }), disconnect: vi.fn(async () => undefined) };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    const page = port.openConnection(logicalDeviceId);
    expect(await page.ready.catch(error => error)).toBe(failure);
    expect(page.signal.aborted).toBe(true);
  });

  it.each(['page', 'background', 'account'])('retires its late Direct selection without taking root ownership on %s', async reason => {
    let finishBle!: () => void;
    const direct = new Promise<void>(resolve => { finishBle = resolve; });
    const release = vi.fn(), active = new BehaviorSubject(true), authDataChanged = new Subject<void>();
    const data = { ...inventory(), sessionEpoch: 1, authDataChanged };
    const service = { acquireStateInterest: vi.fn(async () => ({ accepted: Promise.resolve(),
      closed: new Promise<any>(() => undefined), release })), waitUntilReady: vi.fn(async () => undefined) };
    const ble = { hasActiveCredential: vi.fn(async () => true), canManagePresenceCredential: vi.fn(async () => false),
      ensureReady: vi.fn(() => direct), connectionSnapshot: () => 'ready', disconnect: vi.fn(async () => undefined) };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active } as any, data as any);
    const page = port.openConnection(logicalDeviceId);
    try {
      await page.ready;
      await vi.waitFor(() => expect(ble.ensureReady).toHaveBeenCalledOnce());
      if (reason === 'background') active.next(false);
      else if (reason === 'account') { data.sessionEpoch++; authDataChanged.next(); }
      else page.close();
      finishBle(); await page.closed;
      await Promise.resolve(); await Promise.resolve();
      // Root lifecycle teardown is covered by the BLE service boundary tests.
      expect(ble.disconnect).not.toHaveBeenCalled();
      expect(page.signal.aborted).toBe(true); expect(release).toHaveBeenCalledOnce();
      expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    } finally { page.close(); finishBle(); }
  });

  it.each(['ready', 'failed', 'cancelled'])('keeps Cloud selected until a Direct candidate is proved: %s', async outcome => {
    let resolve!: () => void, reject!: (reason: Error) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const service = { command: vi.fn(async () => undefined),
      acquireStateInterest: vi.fn(async () => undefined), waitUntilReady: vi.fn(async () => undefined) };
    const ble = { hasActiveCredential: vi.fn(async () => true),
      canManagePresenceCredential: vi.fn(async () => false), ensureReady: vi.fn(() => pending),
      connectionSnapshot: () => 'ready',
      disconnect: vi.fn(async () => undefined), command: vi.fn(async () => undefined) };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    const page = port.openConnection(logicalDeviceId), result = page.ready.catch(error => error);
    try {
      await vi.waitFor(() => expect(ble.ensureReady).toHaveBeenCalledOnce());
      expect(port.isBleDirect(logicalDeviceId)).toBe(false);
      await port.sendCommand(logicalDeviceId, 'level', 30);
      expect(service.command).toHaveBeenCalledOnce(); expect(ble.command).not.toHaveBeenCalled();
      if (outcome === 'cancelled') { page.close(); await result; }
      if (outcome === 'failed') reject(Error('BLE_DIRECT_SCAN_TIMEOUT')); else resolve();
      await result; await Promise.resolve(); await Promise.resolve();
      expect(port.isBleDirect(logicalDeviceId)).toBe(outcome === 'ready');
      expect(service.command).toHaveBeenCalledOnce(); expect(ble.command).not.toHaveBeenCalled();
    } finally { page.close(); resolve(); await result; }
  });

  it.each(['idle', 'nearby', 'scanning', 'connecting', 'stopped', 'ready'])('discovery state %s cannot replace fresh Cloud unless Direct is ready', async state => {
    const raw = rawSnapshot();
    const service = { snapshot: () => raw, store: { subscribe: () => () => undefined } };
    const ble = { refreshPresence: vi.fn(async () => undefined), connectionSnapshot: () => state,
      snapshot: () => ({ ...raw, stateFresh: false, stateRevision: null, values: {} }), subscribe: () => () => undefined };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    await port.refreshBlePresence([logicalDeviceId]);
    expect(port.isBleDirect(logicalDeviceId)).toBe(state === 'ready');
    const snapshot = await firstValueFrom(port.watchState(logicalDeviceId).pipe(take(1)));
    if (state !== 'ready') { expect(snapshot.stateFresh).toBe(true); expect(snapshot.endpoints[0].value).toBe(25); }
  });

  it('does not start a late Cloud fallback after the page cancels a BLE connection attempt', async () => {
    const service = { acquireStateInterest: vi.fn(async () => undefined), waitUntilReady: vi.fn(), snapshot: () => rawSnapshot() };
    let rejectBle!: (reason: unknown) => void;
    const ble = {
      hasActiveCredential: vi.fn(async () => true),
      canManagePresenceCredential: vi.fn(async () => false),
      ensureReady: vi.fn(() => new Promise<void>((_resolve, reject) => { rejectBle = reject; })),
      disconnect: vi.fn(async () => undefined),
    };
    const port = new DeviceUiPort(service as any, ble as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    const controller = new AbortController();
    const connecting = port.connect(logicalDeviceId, controller.signal).catch(error => error);
    await vi.waitFor(() => expect(ble.ensureReady).toHaveBeenCalledOnce());
    controller.abort();
    await port.disconnect(logicalDeviceId);
    rejectBle(new Error('late BLE failure'));
    expect(await connecting).toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    expect(service.waitUntilReady).not.toHaveBeenCalled();
  });
  it.each([true, false, null])('keeps cached endpoint values but gates UI freshness on Presence=%s', async reachable => {
    const raw = { ...rawSnapshot(), cloudReachable: reachable };
    let publish: ((id: string, snapshot: DeviceV2TargetSnapshot) => void) | undefined;
    const service = {
      snapshot: () => raw,
      store: { subscribe: (listener: typeof publish) => { publish = listener; return () => undefined; } },
    };
    const port = new DeviceUiPort(
      service as any,
      { subscribe: () => () => undefined } as any,
      { run: (callback: () => void) => callback() } as any,
      { active: new BehaviorSubject(true) } as any,
      inventory() as any,
    );
    const snapshots: { stateFresh: boolean; endpoints: { value?: unknown }[] }[] = [];
    const subscription = port.watchState(logicalDeviceId).subscribe(value => snapshots.push(value));
    expect(snapshots.at(-1)?.stateFresh).toBe(reachable !== false);
    expect(snapshots.at(-1)?.endpoints[0].value).toBe(25);
    expect(raw.stateFresh).toBe(true);
    publish?.(logicalDeviceId, { ...raw, cloudReachable: true });
    expect(snapshots.at(-1)?.stateFresh).toBe(true);
    subscription.unsubscribe();
  });

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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue({ acknowledgedSequence: 1 }),
      openTelemetry: vi.fn().mockResolvedValue({
        snapshot: {
          active: true,
          visible: true,
          streamId: 1,
          epoch: 2,
          effectiveIntervalMs: 1000,
          sampleSequence: 7,
          sampleMonotonicMs: 6000,
          receivedAtMs: 1700000000000,
          receivedMonotonicMs: 8000,
          missedSamples: 2,
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
      openTelemetryConnected: vi.fn().mockRejectedValue(new Error('BLE_DIRECT_SESSION_NOT_READY')),
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
        manifestKind: DeviceV2EndpointKind.Property,
        manifestType: DeviceV2ValueType.UnsignedInteger,
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
    expect(service.waitUntilReady).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
    expect(service.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 30);

    const telemetry = await port.openTelemetry(logicalDeviceId, ['temperature'], 1000);
    expect(telemetry.snapshot).toEqual({
      active: true,
      source: 'cloud',
      streamId: 1,
      epoch: 2,
      effectiveIntervalMs: 1000,
      sampleSequence: 7,
      sampleMonotonicMs: 6000,
      receivedAtMs: 1700000000000,
      receivedMonotonicMs: 8000,
      missedSamples: 2,
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
      .rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
  });

  it('pins realtime to the existing BLE lease without acquiring or silently falling back to Cloud', async () => {
    const snapshot: DeviceV2TelemetrySnapshot = { active: true, visible: true, streamId: 2, epoch: 3,
      effectiveIntervalMs: 2000, missedSamples: 0, values: {} };
    const lease = { snapshot, subscribe: vi.fn(listener => { listener(snapshot); return () => undefined; }),
      setVisible: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const service = { openTelemetry: vi.fn() };
    const ble = { refreshPresence: vi.fn(async () => undefined), connectionSnapshot: () => 'ready',
      openTelemetryConnected: vi.fn(async () => lease), ensureReady: vi.fn() };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    await port.refreshBlePresence([logicalDeviceId]);
    const realtime = await port.openTelemetry(logicalDeviceId, ['temperature'], 1000);
    expect(ble.openTelemetryConnected).toHaveBeenCalledExactlyOnceWith(logicalDeviceId, ['temperature'], 1000);
    expect(realtime.snapshot.source).toBe('ble');
    (port as any).transport(logicalDeviceId).next('cloud');
    const observed = vi.fn();
    realtime.subscribe(observed);
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({ source: 'ble' }));
    await realtime.setVisible(false); await realtime.close();
    expect(lease.setVisible).toHaveBeenCalledWith(false); expect(lease.close).toHaveBeenCalledOnce();
    expect(ble.ensureReady).not.toHaveBeenCalled(); expect(service.openTelemetry).not.toHaveBeenCalled();
    (port as any).transport(logicalDeviceId).next('ble');
    ble.openTelemetryConnected.mockRejectedValueOnce(Error('DIRECT_TELEMETRY_NOT_SUPPORTED'));
    await expect(port.openTelemetry(logicalDeviceId, ['temperature'], 1000))
      .rejects.toThrow('DIRECT_TELEMETRY_NOT_SUPPORTED');
    expect(service.openTelemetry).not.toHaveBeenCalled();
  });

  it('rejects LAN-selected realtime without a ready page-owned session instead of masquerading Cloud', async () => {
    const lease = { snapshot: { active: true, streamId: 1, epoch: 1,
      effectiveIntervalMs: 1000, missedSamples: 0, values: {} } };
    const service = { openTelemetry: vi.fn(async () => lease) }, ble = { openTelemetryConnected: vi.fn() };
    const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any, inventory() as any);
    (port as any).transport(logicalDeviceId).next('lan');
    await expect(port.openTelemetry(logicalDeviceId, ['temperature'], 1000)).rejects.toThrow('LOCAL_ACCESS_SESSION_NOT_READY');
    expect(service.openTelemetry).not.toHaveBeenCalled(); expect(ble.openTelemetryConnected).not.toHaveBeenCalled();
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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
    expect(service.waitUntilReady).not.toHaveBeenCalled();
    expect(port.isBleDirect(directId)).toBe(true);
  });

  it.each(['diy', 'ble'])('syncs PresenceKey and selects ordinary Direct for native WiFi of original type %s', async deviceType => {
    const connection = new BehaviorSubject<any>('idle');
    const service = {
      state: new BehaviorSubject('ready'),
      snapshot: vi.fn(() => rawSnapshot()),
      store: {
        subscribe: vi.fn(() => () => undefined),
        subscribeEvents: vi.fn(() => () => undefined),
      },
      ensureReady: vi.fn().mockResolvedValue(undefined),
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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

    vi.spyOn((port as any).data, 'getDevice').mockReturnValue({ deviceType, cloudEnabled: true, gatewayRouted: false });
    const connectivity: any[] = [];
    const connectivitySubscription = port.watchConnectivity(logicalDeviceId).subscribe(
      value => connectivity.push(value),
    );
    await port.connect(logicalDeviceId);
    expect(port.isBleDirect(logicalDeviceId)).toBe(true);
    expect(ble.syncPresenceCredential).toHaveBeenCalledWith(logicalDeviceId);
    expect(ble.ensureReady).toHaveBeenCalledWith(logicalDeviceId, 5_000);
    expect(service.waitUntilReady).not.toHaveBeenCalled();
    expect(connectivity.at(-1)).toEqual({
      activeTransport: 'ble',
      directConnectAllowed: true,
      bleAccess: true,
      bleAdapterEnabled: true,
      bleNearby: false,
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

  it.each([false, true])('WiFiProv handoff follows topology, not the BLE-origin type (gateway=%s)', async gatewayRouted => {
    const ble = { hasActiveCredential: vi.fn(async () => true),
      canManagePresenceCredential: vi.fn(async () => false), ensureReady: vi.fn(async () => undefined) };
    const port = new DeviceUiPort({} as any, ble as any, { run: f => f() } as any,
      { active: new BehaviorSubject(true) } as any,
      { getDevice: () => ({ deviceType: 'ble', cloudEnabled: true, gatewayRouted }) } as any);
    await port.startDirectHandoff(logicalDeviceId);
    expect(ble.ensureReady).toHaveBeenCalledTimes(gatewayRouted ? 0 : 1);
    expect(port.isBleDirect(logicalDeviceId)).toBe(!gatewayRouted);
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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

    expect(service.waitUntilReady).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
    expect(service.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 45);
    expect(ble.ensureReady).not.toHaveBeenCalled();
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
  });

  it('never treats absent gateway Presence as permission to take over Direct', async () => {
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      acquireConnectionDemand: vi.fn(async () => ({ accepted: Promise.resolve(), closed: new Promise(() => undefined), release: vi.fn() })),
      reserveDirectPriority: vi.fn(async () => { throw Error('Direct priority/Ready is not negotiated'); }),
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

    expect(service.waitUntilReady).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
    expect(ble.ensureReady).not.toHaveBeenCalled();
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    expect(connectivity.at(-1).directConnectAllowed).toBe(false);

    device.data.cloudReachable = false;
    presence.next({ cloudReachable: false });
    await port.connect(logicalDeviceId);

    expect(ble.ensureReady).not.toHaveBeenCalled();
    expect(service.reserveDirectPriority).not.toHaveBeenCalled();
    // The connectivity observer may read local access for display; neither
    // of the two connection callers waits on it or starts Direct acquisition.
    expect(ble.hasActiveCredential).toHaveBeenCalledOnce();
    expect(service.acquireConnectionDemand).toHaveBeenCalledTimes(2);
    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    expect(connectivity.at(-1).directConnectAllowed).toBe(false);
    subscription.unsubscribe();
  });

  it('ignores a stale Direct credential for an Edge Hub BLE central', async () => {
    const service = {
      state: new BehaviorSubject('ready'),
      ensureReady: vi.fn().mockResolvedValue(undefined),
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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

    expect(service.waitUntilReady).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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
    expect(service.waitUntilReady).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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

    expect(service.waitUntilReady).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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
    expect(service.ensureReady).not.toHaveBeenCalled();
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
      acquireStateInterest: vi.fn(async () => undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
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
    expect(service.ensureReady).not.toHaveBeenCalled();

    expect(port.isBleDirect(logicalDeviceId)).toBe(false);
    expect(states.at(-1)).toBe('ready');
    await port.sendCommand(logicalDeviceId, 'level', 50);
    expect(service.command).toHaveBeenCalledWith(logicalDeviceId, 'level', 50);
    expect(ble.command).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
