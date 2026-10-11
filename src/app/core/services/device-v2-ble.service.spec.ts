import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';

import { BleApplicationMode, deriveBlePresenceLocator } from '../device-v2/ble-direct';
import { bleScanner } from '../bluetooth/scan';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { GatewayHttpError } from '../model/response.model';
import {
  DeviceV2BleService,
  matchAuthorizedBlePresence,
  syncOrAllocateBlePresenceKey,
  unambiguousBlePresenceCandidate,
} from './device-v2-ble.service';

describe('DeviceV2BleService presence identity', () => {
  const data = {
    auth: { uuid: 'account-a' },
    user: { id: 'account-a' },
    sessionEpoch: 1,
    authDataChanged: { subscribe: vi.fn() },
  };

  function realtimeHarness() {
    const account = { ...data, auth: { uuid: 'account-a' }, user: { id: 'account-a' } };
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, account as any);
    const internal = service as any;
    const lease = { close: vi.fn(async () => undefined) };
    const active = { context: internal.accountContext(), logicalDeviceId: 'ble-one',
      session: { state: 'ready', openTelemetry: vi.fn(async () => lease) } };
    internal.active = active;
    const reconnect = vi.spyOn(service, 'ensureReady');
    return { account, service, internal, active, lease, reconnect };
  }

  it('opens realtime only in the authenticated current ready BLE session', async () => {
    const { service, internal, active, lease, reconnect } = realtimeHarness();
    expect(await service.openTelemetryConnected('ble-one', ['temperature'], 1000)).toBe(lease);
    expect(active.session.openTelemetry).toHaveBeenCalledExactlyOnceWith(['temperature'], 1000);
    await expect(service.openTelemetryConnected('ble-two', ['temperature'], 1000))
      .rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    active.session.state = 'closed';
    await expect(service.openTelemetryConnected('ble-one', ['temperature'], 1000))
      .rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    internal.active = undefined;
    await expect(service.openTelemetryConnected('ble-one', ['temperature'], 1000))
      .rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    expect(active.session.openTelemetry).toHaveBeenCalledOnce(); expect(reconnect).not.toHaveBeenCalled();
  });

  it.each(['account', 'session', 'permit'])('retires a late realtime Open after %s changes', async reason => {
    const { account, service, internal, active, lease, reconnect } = realtimeHarness();
    let finish!: (value: any) => void;
    active.session.openTelemetry.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const abort = new AbortController();
    (active as any).admission = { signal: abort.signal, assertActive: vi.fn() };
    const open = service.openTelemetryConnected('ble-one', ['temperature'], 1000);
    const rejected = expect(open).rejects.toThrow();
    if (reason === 'account') account.sessionEpoch++;
    if (reason === 'session') internal.active = { ...active };
    if (reason === 'permit') abort.abort();
    finish(lease); await rejected;
    expect(lease.close).toHaveBeenCalledOnce(); expect(reconnect).not.toHaveBeenCalled();
  });

  it('does not send realtime Open under an expired physical permit', async () => {
    const { service, active, reconnect } = realtimeHarness();
    const abort = new AbortController(); abort.abort();
    (active as any).admission = { signal: abort.signal, assertActive: vi.fn() };
    await expect(service.openTelemetryConnected('ble-one', ['temperature'], 1000)).rejects.toThrow();
    expect(active.session.openTelemetry).not.toHaveBeenCalled(); expect(reconnect).not.toHaveBeenCalled();
  });

  it('loads negotiation candidates only in the account session that created the client', () => {
    const account = { ...data, auth: { uuid: 'account-a' } };
    const cache = { load: vi.fn().mockReturnValue(undefined), save: vi.fn() };
    const service = new DeviceV2BleService({} as any, cache as any, account as any);
    const client = (service as any).client({});
    expect(client.loadManifest('device-one')).toBeUndefined();
    expect(cache.load).toHaveBeenCalledExactlyOnceWith('device-one');
    account.auth = { uuid: 'account-b' }; account.sessionEpoch++;
    expect(() => client.loadManifest('device-one')).toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    expect(cache.load).toHaveBeenCalledOnce();
  });

  it('owns a Direct attempt while draining presence, so page exit cannot start a late scan', async () => {
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any);
    const internal = service as any;
    let finishPresence!: () => void;
    const abort = new AbortController();
    internal.presence = { abort, promise: new Promise<void>(resolve => { finishPresence = resolve; }) };
    const load = vi.fn().mockRejectedValue(Error('Unexpected credential load after cancellation'));
    vi.spyOn(internal, 'credentialStore').mockReturnValue({ load });
    const attempt = service.ensureReady('ble_cancel', 5000);
    const rejected = expect(attempt).rejects.toThrow();
    const ownedWhileDraining = internal.opening?.logicalDeviceId === 'ble_cancel';
    const closing = service.disconnect('ble_cancel');
    internal.presence = undefined;
    finishPresence();
    await closing; await rejected;
    expect(abort.signal.aborted).toBe(true);
    expect(ownedWhileDraining).toBe(true);
    expect(load).not.toHaveBeenCalled();
    expect(internal.opening).toBeUndefined();
    expect(internal.accountLinks.size).toBe(0);
  });

  it('shares one owned Direct attempt while presence cancellation is still pending', async () => {
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any);
    const internal = service as any;
    let finishPresence!: () => void;
    internal.presence = { abort: new AbortController(), promise: new Promise<void>(resolve => { finishPresence = resolve; }) };
    vi.spyOn(internal, 'credentialStore').mockReturnValue({ load: vi.fn().mockRejectedValue(Error('cancelled test')) });
    const first = service.ensureReady('ble_same', 5000);
    const second = service.ensureReady('ble_same', 5000);
    const settled = Promise.allSettled([first, second]);
    const closing = service.disconnect('ble_same');
    internal.presence = undefined;
    finishPresence();
    await closing; await settled;
    expect(first).toBe(second);
    expect(internal.opening).toBeUndefined();
  });

  it('late native snapshots and events cannot populate a successor account or its Manifest cache', () => {
    const source = { ...data }, cache = { save: vi.fn() };
    const service = new DeviceV2BleService({} as any, cache as any, source as any), internal = service as any;
    let publish!: (id: string, snapshot: any) => void, event!: (value: any) => void;
    const snapshot = { manifestAccepted: true, manifest: { revision: 1 } };
    const session = { store: {
      subscribe: callback => { publish = callback; return () => undefined; },
      subscribeEvents: callback => { event = callback; return () => undefined; },
      snapshot: () => snapshot,
    }, subscribeErrors: () => () => undefined };
    const listener = vi.fn(); internal.eventListeners.add(listener);
    internal.attach('ble_one', session, internal.accountContext());
    expect(cache.save).toHaveBeenCalledOnce();
    source.sessionEpoch += 1; source.auth = { uuid: 'account-b' };
    publish('ble_one', snapshot); event({ logicalDeviceId: 'ble_one' });
    expect(cache.save).toHaveBeenCalledOnce(); expect(listener).not.toHaveBeenCalled();
  });

  it('lists only credential-store recovery candidates', async () => {
    const service = new DeviceV2BleService(
      {} as ConstructorParameters<typeof DeviceV2BleService>[0],
      { save: vi.fn() } as unknown as ConstructorParameters<typeof DeviceV2BleService>[1],
      data as unknown as ConstructorParameters<typeof DeviceV2BleService>[2],
    );
    const listPending = vi.fn().mockResolvedValue(['device-pending']);
    vi.spyOn(service as any, 'credentialStore').mockReturnValue({ listPending });

    await expect(service.pendingEnrollmentLogicalDeviceIds())
      .resolves.toEqual(['device-pending']);
    expect(listPending).toHaveBeenCalledOnce();
  });

  it('scan throttling preserves only the original nearby lifetime, without manufacturing new evidence', async () => {
    vi.useFakeTimers();
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any);
    const internal = service as any;
    const scanner = vi.spyOn(bleScanner, 'run').mockRejectedValue(Error('BLE_SCAN_THROTTLED'));
    const initialize = vi.spyOn(BleClient, 'initialize').mockResolvedValue();
    try {
      vi.spyOn(internal, 'credentialStore').mockReturnValue({ load: async () => ({
        source: 'enrollment', state: 'active', logicalDeviceId: 'ble_test', accessEpoch: 1, credentialVersion: 1, permissions: 15,
        deviceInstanceId: new Uint8Array(16).fill(1), controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
        presenceKeys: [{ accessEpoch: 1, version: 1, key: new Uint8Array(16).fill(4) }],
      }) });
      internal.markNearby('ble_test');
      const deadline = internal.connectionStates.get('ble_test').nearbyUntil;
      await vi.advanceTimersByTimeAsync(1000);
      await expect(service.refreshPresence(['ble_test'])).rejects.toThrow('BLE_SCAN_THROTTLED');
      expect(service.connectionSnapshot('ble_test')).toBe('nearby');
      expect(internal.connectionStates.get('ble_test').nearbyUntil).toBe(deadline);
      await vi.advanceTimersByTimeAsync(14_000);
      expect(service.connectionSnapshot('ble_test')).toBe('stopped');
    } finally { internal.resetAccountSession(); scanner.mockRestore(); initialize.mockRestore(); vi.useRealTimers(); }
  });

  it('account retirement clears nearby evidence and its timer', async () => {
    vi.useFakeTimers();
    try {
      const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any), internal = service as any;
      internal.markNearby('ble_test'); internal.resetAccountSession();
      expect(internal.connectionStates.get('ble_test').nearbyUntil).toBe(0);
      await vi.advanceTimersByTimeAsync(20_000); expect(service.connectionSnapshot('ble_test')).toBe('idle');
    } finally { vi.useRealTimers(); }
  });

  it('does not open a recovery window without an authorized PresenceKey', async () => {
    const service = new DeviceV2BleService(
      {} as ConstructorParameters<typeof DeviceV2BleService>[0],
      { save: vi.fn() } as unknown as ConstructorParameters<typeof DeviceV2BleService>[1],
      data as unknown as ConstructorParameters<typeof DeviceV2BleService>[2],
    );
    const controllerSecret = new Uint8Array(32).fill(4);
    const load = vi.fn().mockResolvedValue({
      source: 'enrollment',
      state: 'pending',
      logicalDeviceId: 'device-pending',
      deviceInstanceId: new Uint8Array(16).fill(1),
      accessEpoch: 1,
      controllerId: new Uint8Array(16).fill(2),
      controllerSecret,
      credentialVersion: 1,
      permissions: 0x0f,
      presenceKeys: [],
      intentId: new Uint8Array(16).fill(5),
      commitId: new Uint8Array(16).fill(6),
      receipt: new Uint8Array(16).fill(7),
    });
    vi.spyOn(service as any, 'credentialStore').mockReturnValue({ load });
    const waitForMode = vi.fn();

    await expect(service.resumeUsing(
      { waitForMode } as unknown as Parameters<DeviceV2BleService['resumeUsing']>[0],
      'device-pending',
    )).rejects.toThrow('BLE_DIRECT_PRESENCE_CREDENTIAL_NOT_FOUND');
    expect(waitForMode).not.toHaveBeenCalled();
    expect(controllerSecret).toEqual(new Uint8Array(32));
  });

  it('accepts only one authorized logical-device match', () => {
    expect(unambiguousBlePresenceCandidate(['device-a'])).toBe('device-a');
    expect(unambiguousBlePresenceCandidate(['device-a', 'device-a'])).toBe('device-a');
  });

  it('rejects an authorized locator that ambiguously matches several records', () => {
    expect(unambiguousBlePresenceCandidate(['legacy-ble', 'current-hybrid']))
      .toBeUndefined();
  });

  it('maps Direct v3 only through an authorized current/previous key', async () => {
    const key = Uint8Array.from({ length: 16 }, (_, index) => index);
    const candidate = {
      logicalDeviceId: 'device-a',
      deviceInstanceId: Uint8Array.from(
        { length: 16 }, (_, index) => 0x10 + index,
      ),
      accessEpoch: 0x01020304,
      version: 0x05060708,
      key,
    };
    const profile = {
      mode: BleApplicationMode.Direct,
      wireVersion: 3,
      capabilities: 0x51,
      modeLocator: await deriveBlePresenceLocator(
        key,
        {
          deviceInstanceId: candidate.deviceInstanceId,
          accessEpoch: candidate.accessEpoch,
          presenceKeyVersion: candidate.version,
        },
        Uint8Array.of(0xa0, 0xa1, 0xa2, 0xa3),
      ),
    };

    await expect(matchAuthorizedBlePresence(profile, [candidate]))
      .resolves.toBe('device-a');
    await expect(matchAuthorizedBlePresence(profile, [
      candidate,
      { ...candidate, logicalDeviceId: 'device-b' },
    ])).resolves.toBeUndefined();
  });

  it('matches a previous key while a new current key awaits device confirmation', async () => {
    const previousKey = new Uint8Array(16).fill(2);
    const deviceInstanceId = new Uint8Array(16).fill(3);
    const profile = {
      mode: BleApplicationMode.Direct,
      wireVersion: 3,
      capabilities: 0x51,
      modeLocator: await deriveBlePresenceLocator(
        previousKey,
        { deviceInstanceId, accessEpoch: 7, presenceKeyVersion: 2 },
        Uint8Array.of(1, 2, 3, 4),
      ),
    };

    await expect(matchAuthorizedBlePresence(profile, [
      {
        logicalDeviceId: 'device-a',
        deviceInstanceId,
        accessEpoch: 7,
        version: 3,
        key: new Uint8Array(16).fill(4),
      },
      {
        logicalDeviceId: 'device-a',
        deviceInstanceId,
        accessEpoch: 7,
        version: 2,
        key: previousKey,
      },
    ])).resolves.toBe('device-a');
  });

  it('allocates only when an owner device has no PresenceKey yet', async () => {
    const missing = new GatewayHttpError({
      httpStatus: 404,
      code: 'DEVICE_V2_PRESENCE_NOT_FOUND',
      message: 'PresenceKey was not found',
    });
    const bundle = { logicalDeviceId: 'device-a' } as any;
    const api = {
      sync: vi.fn().mockRejectedValue(missing),
      allocate: vi.fn().mockResolvedValue(bundle),
    };

    await expect(syncOrAllocateBlePresenceKey(api, 'device-a', 'allocate-1'))
      .resolves.toBe(bundle);
    expect(api.allocate).toHaveBeenCalledWith('device-a', 'allocate-1');
  });

  it('does not turn authorization or unrelated 404 failures into allocation', async () => {
    const denied = new GatewayHttpError({
      httpStatus: 403,
      code: 'DEVICE_V2_PRESENCE_OWNER_REQUIRED',
      message: 'Only the owner may allocate',
    });
    const missingDevice = new GatewayHttpError({
      httpStatus: 404,
      code: 'DEVICE_V2_DEVICE_NOT_FOUND',
      message: 'Device was not found',
    });
    const api = {
      sync: vi.fn()
        .mockRejectedValueOnce(denied)
        .mockRejectedValueOnce(missingDevice),
      allocate: vi.fn(),
    };

    await expect(syncOrAllocateBlePresenceKey(api, 'device-a', 'allocate-1'))
      .rejects.toBe(denied);
    await expect(syncOrAllocateBlePresenceKey(api, 'device-a', 'allocate-2'))
      .rejects.toBe(missingDevice);
    expect(api.allocate).not.toHaveBeenCalled();
  });

  it('closes Direct state immediately when the authenticated account changes', async () => {
    const changed = new Subject<void>();
    const account = {
      auth: { uuid: 'account-a' },
      user: { id: 'account-a' },
      sessionEpoch: 1,
      authDataChanged: changed,
    };
    const service = new DeviceV2BleService(
      {} as ConstructorParameters<typeof DeviceV2BleService>[0],
      { save: vi.fn() } as unknown as ConstructorParameters<typeof DeviceV2BleService>[1],
      account as unknown as ConstructorParameters<typeof DeviceV2BleService>[2],
    );
    const close = vi.fn().mockResolvedValue(undefined);
    (service as any).active = {
      context: {
        authority: 'https://api.example.test',
        accountId: 'account-a',
        sessionEpoch: 1,
      },
      logicalDeviceId: 'device-a',
      session: { close },
      detachState: vi.fn(),
      detachEvents: vi.fn(),
      detachErrors: vi.fn(),
    };
    (service as any).snapshots.set('device-a', {});

    account.auth = { uuid: 'account-b' };
    account.user = { id: 'account-b' };
    account.sessionEpoch = 2;
    changed.next();

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect((service as any).active).toBeUndefined();
    expect((service as any).snapshots.size).toBe(0);
  });

  it('closes a page-held enrollment session when the account changes', async () => {
    const changed = new Subject<void>();
    const account = {
      auth: { uuid: 'account-a' },
      user: { id: 'account-a' },
      sessionEpoch: 1,
      authDataChanged: changed,
    };
    const service = new DeviceV2BleService(
      {} as ConstructorParameters<typeof DeviceV2BleService>[0],
      { save: vi.fn() } as unknown as ConstructorParameters<typeof DeviceV2BleService>[1],
      account as unknown as ConstructorParameters<typeof DeviceV2BleService>[2],
    );
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const closed = new Set<() => void>();
    const close = vi.fn().mockImplementation(async () => {
      await disconnect();
      for (const listener of closed) listener();
    });
    const session = {
      close,
      subscribeClosed: (listener: () => void) => {
        closed.add(listener);
        return () => closed.delete(listener);
      },
      store: { snapshot: () => ({}) },
    };
    (service as any).client = () => ({
      enroll: vi.fn().mockResolvedValue({
        logicalDeviceId: 'ble_account_a',
        session,
      }),
    });
    await service.enrollUsing({ disconnect } as any, {} as any, {} as any);

    account.auth = { uuid: 'account-b' };
    account.user = { id: 'account-b' };
    account.sessionEpoch = 2;
    changed.next();

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(disconnect).toHaveBeenCalled();
    expect((service as any).accountSessions.size).toBe(0);
    expect((service as any).accountLinks.size).toBe(0);
  });

  it('rejects an enrollment response from the previous account and clears secrets', async () => {
    const account = {
      auth: { uuid: 'account-a' },
      user: { id: 'account-a' },
      sessionEpoch: 1,
      authDataChanged: { subscribe: vi.fn() },
    };
    const service = new DeviceV2BleService(
      {} as ConstructorParameters<typeof DeviceV2BleService>[0],
      { save: vi.fn() } as unknown as ConstructorParameters<typeof DeviceV2BleService>[1],
      account as unknown as ConstructorParameters<typeof DeviceV2BleService>[2],
    );
    let finish!: (value: any) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    (service as any).api = { issue: vi.fn().mockReturnValue(pending) };
    const context = (service as any).accountContext();
    const result = {
      intentId: new Uint8Array(16).fill(1),
      logicalDeviceId: 'ble_1234567890123456789012',
      grant: new Uint8Array(32).fill(2),
      presenceKeyVersion: 1,
      presenceKey: new Uint8Array(16).fill(3),
      expiresAt: Date.now() + 60_000,
      securityProfile: 1,
      serverKeyId: 1,
      signatureAlgorithm: 1,
      replayed: false,
    };
    const request = (service as any).accountBoundApi(context).issue({});

    account.auth = { uuid: 'account-b' };
    account.user = { id: 'account-b' };
    account.sessionEpoch = 2;
    finish(result);

    await expect(request).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    expect(result.intentId).toEqual(new Uint8Array(16));
    expect(result.grant).toEqual(new Uint8Array(32));
    expect(result.presenceKey).toEqual(new Uint8Array(16));
  });
});
