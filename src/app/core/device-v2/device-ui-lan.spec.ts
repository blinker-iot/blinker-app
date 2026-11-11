import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DeviceUiPort } from './device-ui.port';
import { DeviceV2DemandOwners } from '../protocol/device-v2/connection-demand';
import { DirectDeviceSession } from '../protocol/device-v2/direct-session';
import { DeviceV2Event, DeviceV2TargetSnapshot, DeviceV2TelemetryLease, DeviceV2ValueType } from '../protocol/device-v2';
import { LocalAccessPreparationError } from './local-access/preparation-error';
import { API } from '../../configs/api.config';

const id = 'device_11111111-1111-4111-8111-111111111111';
const turn = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((r, j) => { resolve = r; reject = j; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}
function harness() {
  const raw = { manifest: { revision: 1, fingerprint: 'aa'.repeat(32), fields: [] }, manifestAccepted: true,
    stateRevision: 1, stateFresh: true, values: {}, eventInterrupted: false, cloudReachable: null, cloudLastSeenAt: null } as DeviceV2TargetSnapshot;
  const listeners = new Set<() => void>(), errors = new Set<() => void>();
  const stateListeners = new Set<(id: string, value: DeviceV2TargetSnapshot) => void>();
  const eventListeners = new Set<(event: DeviceV2Event) => void>();
  const localStore = { snapshot: () => raw,
    subscribe: vi.fn((cb: (id: string, value: DeviceV2TargetSnapshot) => void) => { stateListeners.add(cb); return () => { stateListeners.delete(cb); }; }),
    subscribeEvents: vi.fn((cb: (event: DeviceV2Event) => void) => { eventListeners.add(cb); return () => { eventListeners.delete(cb); }; }) };
  const lease = { snapshot: { active: true, visible: true, streamId: 1, epoch: 2,
    effectiveIntervalMs: 2000, missedSamples: 0, values: {} },
    subscribe: vi.fn(listener => { listener(lease.snapshot); return () => undefined; }),
    setVisible: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  const session = { state: 'ready', store: localStore, command: vi.fn(async () => ({})),
    openTelemetry: vi.fn(async () => lease as unknown as DeviceV2TelemetryLease),
    subscribeErrors: (cb: () => void) => { errors.add(cb); return () => errors.delete(cb); },
    subscribeClosed: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    close: vi.fn(async () => { session.state = 'closed'; for (const cb of listeners) cb(); }) };
  const opening = deferred<{ session: DirectDeviceSession; permissions: 1 | 3 }>();
  let lanSignal!: AbortSignal;
  const lan = { available: vi.fn(() => true), open: vi.fn(async (_id: string, signal: AbortSignal) => {
    lanSignal = signal; signal.addEventListener('abort', () => { void session.close().catch(() => undefined); }, { once: true });
    return opening.promise;
  }) };
  const cloud = { state: new BehaviorSubject('ready'), store: { subscribe: () => () => undefined, subscribeEvents: () => () => undefined }, snapshot: () => raw,
    acquireStateInterest: vi.fn(async () => undefined),
    waitUntilReady: vi.fn(async () => undefined), command: vi.fn(async () => undefined),
    stop: vi.fn(), start: vi.fn(), openTelemetry: vi.fn() };
  const ble = { connectionSnapshot: () => 'idle', watchConnection: () => new BehaviorSubject('idle'),
    watchAdapterEnabled: () => new BehaviorSubject(true), subscribe: () => () => undefined,
    subscribeEvents: () => () => undefined, hasActiveCredential: async () => false, disconnect: vi.fn(async () => undefined),
    ensureReady: vi.fn(), refreshPresence: vi.fn(async () => undefined), snapshot: () => raw };
  const visibility = { active: new BehaviorSubject(true) };
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), deviceDataLoader: new Subject<boolean>(),
    getDevice: (_id: string) => ({ cloudEnabled: true, deviceType: 'diy', config: {} }) };
  const cache = { save: vi.fn() };
  const networkEvidence = new BehaviorSubject({ connected: true, wifi: true, generation: 1 });
  const network = { get current() { return networkEvidence.value; }, changes: networkEvidence.asObservable() };
  const ui = new DeviceUiPort(cloud as any, ble as any, { run: (f: () => void) => f() } as any,
    visibility as any, data as any, cache as any, network as any, lan as any);
  const promote = async (permissions: 1 | 3 = 3) => { opening.resolve({ session: session as unknown as DirectDeviceSession, permissions }); await turn(); };
  return { ui, cloud, ble, lan, session, lease, visibility, data, promote, opening, cache, errors, raw, stateListeners, eventListeners,
    networkEvidence, signal: () => lanSignal };
}

// Independent carrier ownership: an old close callback must not retire the
// successor. Reuse the same protocol/store shape, not the old physical session.
function successor(h: ReturnType<typeof harness>) {
  const closed = new Set<() => void>(), errors = new Set<() => void>();
  const session = { ...h.session, state: 'ready', command: vi.fn(async () => ({})),
    subscribeClosed: (cb: () => void) => { closed.add(cb); return () => closed.delete(cb); },
    subscribeErrors: (cb: () => void) => { errors.add(cb); return () => errors.delete(cb); },
    close: vi.fn(async () => { session.state = 'closed'; for (const cb of closed) cb(); }) };
  h.lan.open.mockImplementation(async (_id: string, signal: AbortSignal) => {
    signal.addEventListener('abort', () => { void session.close().catch(() => undefined); }, { once: true });
    return { session: session as unknown as DirectDeviceSession, permissions: 3 };
  });
  return session;
}

describe('existing page owner with background LAN candidate and one account MQTT', () => {
  it('keeps the ready page and original cloud after LAN exhausts its pending-ACK budget', async () => {
    const h = harness(), page = h.ui.openConnection(id);
    await page.ready; await h.ui.sendCommand(id, 'power', true);
    h.opening.reject(new LocalAccessPreparationError('pending')); await turn();
    expect(page.signal.aborted).toBe(false); expect(h.signal().aborted).toBe(true);
    await h.ui.sendCommand(id, 'power', false);
    expect(h.cloud.command).toHaveBeenCalledTimes(2); expect(h.session.command).not.toHaveBeenCalled();
    expect(h.lan.open).toHaveBeenCalledOnce(); // No background reacquisition from another command.
    expect(h.cloud.start).not.toHaveBeenCalled(); expect(h.cloud.stop).not.toHaveBeenCalled();
    page.close(); await turn();
  });
  it('maps current cloud offline/lost-presence facts to a stale UI snapshot', async () => {
    const h = harness(), states = vi.fn();
    const watch = h.ui.watchState(id).subscribe(states);
    expect(states.mock.lastCall![0].stateFresh).toBe(true); watch.unsubscribe();
    for (const change of [{ cloudReachable: false }, { cloudReachable: null, cloudPresenceLost: true }]) {
      Object.assign(h.raw, change);
      const next = h.ui.watchState(id).subscribe(states);
      expect(states.mock.lastCall![0].stateFresh).toBe(false); next.unsubscribe();
    }
  });
  it('retiring Cloud State observation does not close verified LAN or the account MQTT', async () => {
    const h = harness();
    const observers = new DeviceV2DemandOwners(async request => ({ ...request, status: 'accepted' }));
    h.cloud.acquireStateInterest.mockImplementation(async (_id?: string, signal?: AbortSignal) =>
      observers.acquire(id, signal) as any);
    const page = h.ui.openConnection(id); await page.ready; await h.promote();
    observers.close(); await turn();
    expect(page.signal.aborted).toBe(false); expect(h.signal().aborted).toBe(false);
    await h.ui.sendCommand(id, 'power', true); expect(h.session.command).toHaveBeenCalledOnce();
    page.close(); await turn(); expect(h.signal().aborted).toBe(true); expect(h.cloud.stop).not.toHaveBeenCalled();
  });
  it('feeds LAN state/events through the existing UI port and caches only verified capability changes', async () => {
    const h = harness(), page = h.ui.openConnection(id), states = vi.fn(), events = vi.fn();
    const stateWatch = h.ui.watchState(id).subscribe(states), eventWatch = h.ui.watchEvents(id).subscribe(events);
    await page.ready; await h.promote();
    const changed = { ...h.raw, stateRevision: 2, manifest: { ...h.raw.manifest!, fingerprint: 'bb'.repeat(32) } };
    for (const cb of h.stateListeners) cb(id, changed);
    expect(states.mock.lastCall![0].stateRevision).toBe(2); expect(h.cache.save).toHaveBeenCalledTimes(2);
    for (const cb of h.stateListeners) cb(id, changed);
    expect(h.cache.save).toHaveBeenCalledTimes(2);
    const event = { logicalDeviceId: id, values: { power: { type: DeviceV2ValueType.Boolean, value: true, cbor: new Uint8Array([0xf5]) } } } as DeviceV2Event;
    for (const cb of h.eventListeners) cb(event);
    expect(events).toHaveBeenCalledWith({ logicalDeviceId: id, values: { power: true } });
    page.close(); await turn(); stateWatch.unsubscribe(); eventWatch.unsubscribe();
    expect(h.stateListeners.size).toBe(0); expect(h.eventListeners.size).toBe(0);
  });
  it('allows cloud immediately; promotes verified LAN without creating/stopping MQTT', async () => {
    const h = harness(), page = h.ui.openConnection(id);
    await page.ready; await h.ui.sendCommand(id, 'power', true);
    expect(h.cloud.command).toHaveBeenCalledOnce(); expect(h.session.command).not.toHaveBeenCalled();
    await h.promote(); await h.ui.sendCommand(id, 'button', 1);
    expect(h.session.command).toHaveBeenCalledWith('button', 1);
    expect(h.cloud.waitUntilReady).toHaveBeenCalledOnce(); expect(h.cloud.stop).not.toHaveBeenCalled();
    expect(h.cloud.start).not.toHaveBeenCalled(); expect(h.cache.save).toHaveBeenCalledOnce();
    page.close(); await turn(); expect(h.signal().aborted).toBe(true);
  });

  it('shares one LAN owner across two pages, closing only after the last leaves', async () => {
    const h = harness(), first = h.ui.openConnection(id), second = h.ui.openConnection(id);
    await Promise.all([first.ready, second.ready]); await h.promote();
    expect(h.lan.open).toHaveBeenCalledOnce(); first.close(); await turn();
    expect(h.signal().aborted).toBe(false); await h.ui.sendCommand(id, 'power', false);
    expect(h.session.command).toHaveBeenCalledOnce(); second.close(); await turn(); expect(h.signal().aborted).toBe(true);
  });

  it.each(['page', 'account', 'background', 'removed'])('discards late LAN completion after %s exit', async cause => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready;
    if (cause === 'page') page.close();
    if (cause === 'account') { h.data.sessionEpoch++; h.data.authDataChanged.next(); }
    if (cause === 'background') h.visibility.active.next(false);
    if (cause === 'removed') { h.data.getDevice = () => undefined as any; h.data.deviceDataLoader.next(true); }
    await turn(); await h.promote();
    expect(h.signal().aborted).toBe(true); expect(h.cache.save).not.toHaveBeenCalled();
    expect(h.session.command).not.toHaveBeenCalled(); expect(h.cloud.stop).not.toHaveBeenCalled();
  });

  it('does not reroute an uncertain local Action; later explicit commands can use cloud', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    h.session.command.mockImplementation(async () => { for (const cb of h.errors) cb(); throw Error('UNCERTAIN'); });
    await expect(h.ui.sendCommand(id, 'button', 1)).rejects.toThrow('UNCERTAIN');
    expect(h.cloud.command).not.toHaveBeenCalled();
    await h.ui.sendCommand(id, 'power', false); expect(h.cloud.command).toHaveBeenCalledOnce(); page.close();
  });

  it('keeps endpoint-filtered/Observe-only writes on cloud before sending any local command', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote(1);
    await h.ui.sendCommand(id, 'power', true);
    expect(h.cloud.command).toHaveBeenCalledOnce(); expect(h.session.command).not.toHaveBeenCalled(); page.close();
  });

  it('does not let passive presence refresh replace an active LAN route', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    await h.ui.refreshBlePresence([id]); await h.ui.sendCommand(id, 'power', true);
    expect(h.session.command).toHaveBeenCalledOnce(); page.close();
  });

  it('one-shot/passive reads do not start mDNS or native LAN', async () => {
    const h = harness(); await h.ui.connect(id); expect(h.lan.open).not.toHaveBeenCalled();
  });

  it.each([1, 3] as const)('uses the ready LAN session for an Observe grant %s, fixing source to that lease', async permissions => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote(permissions);
    const realtime = await h.ui.openTelemetry(id, ['temperature'], 1000);
    expect(h.session.openTelemetry).toHaveBeenCalledExactlyOnceWith(['temperature'], 1000);
    expect(realtime.snapshot).toMatchObject({ source: 'lan', effectiveIntervalMs: 2000 });
    (h.ui as any).transport(id).next('cloud');
    const observed = vi.fn(); realtime.subscribe(observed);
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({ source: 'lan' }));
    await realtime.setVisible(false); await realtime.close();
    expect(h.lease.setVisible).toHaveBeenCalledWith(false); expect(h.lease.close).toHaveBeenCalledOnce();
    expect(h.lan.open).toHaveBeenCalledOnce(); expect(h.cloud.openTelemetry).not.toHaveBeenCalled();
    expect(h.ble.ensureReady).not.toHaveBeenCalled(); page.close(); await turn();
  });

  it('keeps old peers unsupported and invalid permissions rejected, without reopening or Cloud fallback', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    h.session.openTelemetry.mockRejectedValueOnce(Error('DIRECT_TELEMETRY_NOT_SUPPORTED'));
    await expect(h.ui.openTelemetry(id, ['temperature'], 1000)).rejects.toThrow('DIRECT_TELEMETRY_NOT_SUPPORTED');
    (h.ui as any).connections.get(id).lan.permissions = 2;
    await expect(h.ui.openTelemetry(id, ['temperature'], 1000)).rejects.toThrow('DIRECT_TELEMETRY_OBSERVE_REQUIRED');
    expect(h.session.openTelemetry).toHaveBeenCalledOnce(); expect(h.cloud.openTelemetry).not.toHaveBeenCalled();
    expect(h.session.close).not.toHaveBeenCalled(); expect(h.lan.open).toHaveBeenCalledOnce();
    await h.ui.sendCommand(id, 'power', true); expect(h.cloud.command).toHaveBeenCalledOnce();
    page.close(); await turn();
  });

  it.each(['page', 'background', 'account', 'identity', 'carrier', 'session', 'replacement', 'permissions'])(
    'closes only a late LAN lease after %s invalidates its owner', async cause => {
      const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
      const pending = deferred<DeviceV2TelemetryLease>(); h.session.openTelemetry.mockReturnValueOnce(pending.promise);
      const opened = h.ui.openTelemetry(id, ['temperature'], 1000), rejected = expect(opened).rejects.toThrow();
      if (cause === 'page') page.close();
      if (cause === 'background') h.visibility.active.next(false);
      if (cause === 'account') { h.data.sessionEpoch++; h.data.authDataChanged.next(); }
      if (cause === 'identity') h.data.auth.uuid = 'another-owner';
      if (cause === 'carrier') (h.ui as any).transport(id).next('cloud');
      if (cause === 'session') h.session.state = 'closed';
      if (cause === 'replacement') (h.ui as any).connections.get(id).lan.session = { ...h.session };
      if (cause === 'permissions') (h.ui as any).connections.get(id).lan.permissions = 2;
      await turn(); pending.resolve(h.lease as unknown as DeviceV2TelemetryLease); await rejected;
      expect(h.lease.close).toHaveBeenCalledOnce(); expect(h.lease.subscribe).not.toHaveBeenCalled();
      expect(h.lan.open).toHaveBeenCalledOnce(); expect(h.cloud.openTelemetry).not.toHaveBeenCalled();
      page.close(); await turn();
    },
  );

  it('rejects a changed account or authority before sending any telemetry request', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    h.data.auth.uuid = 'changed-owner';
    await expect(h.ui.openTelemetry(id, ['temperature'], 1000)).rejects.toThrow('ACCOUNT_CONTEXT_CHANGED');
    h.data.auth.uuid = 'owner';
    const originalAuthority = API.BASE_URL;
    try {
      Object.assign(API, { BASE_URL: 'https://different-authority.test' });
      await expect(h.ui.openTelemetry(id, ['temperature'], 1000)).rejects.toThrow('LOCAL_ACCESS_ACCOUNT_CHANGED');
    } finally { Object.assign(API, { BASE_URL: originalAuthority }); }
    expect(h.session.openTelemetry).not.toHaveBeenCalled(); expect(h.cloud.openTelemetry).not.toHaveBeenCalled();
    page.close(); await turn();
  });

  it('does not classify a business Close rejection as a failed LAN transport or retry work', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    const realtime = await h.ui.openTelemetry(id, ['temperature'], 1000);
    h.lease.close.mockRejectedValueOnce(Error('TELEMETRY_CLOSE_REJECTED'));
    await expect(realtime.close()).rejects.toThrow('TELEMETRY_CLOSE_REJECTED');
    await h.ui.sendCommand(id, 'power', true); expect(h.session.command).toHaveBeenCalledOnce();
    expect(h.session.close).not.toHaveBeenCalled(); expect(h.cloud.command).not.toHaveBeenCalled();
    expect(h.lan.open).toHaveBeenCalledOnce(); page.close(); await turn();
  });

  it('recovers a resume candidate cancelled by a later native network generation exactly once', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await turn();
    const next = successor(h);
    h.networkEvidence.next({ connected: true, wifi: true, generation: 2 });
    await turn(); expect(h.lan.open).toHaveBeenCalledOnce(); // Old preparation/cleanup still pending.
    h.opening.reject(new DOMException('signal is aborted without reason', 'AbortError')); await turn();
    expect(h.signal().aborted).toBe(true); expect(h.lan.open).toHaveBeenCalledTimes(2);
    await h.ui.sendCommand(id, 'power', true); expect(next.command).toHaveBeenCalledOnce();
    h.networkEvidence.next({ connected: true, wifi: true, generation: 2 }); await turn();
    expect(h.lan.open).toHaveBeenCalledTimes(2); expect(h.cloud.command).not.toHaveBeenCalled();
    page.close(); await turn();
  });

  it('waits for actual old session close before acquiring the new network generation', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    const closed = deferred<void>(), next = successor(h);
    h.session.close.mockImplementation(() => closed.promise);
    h.networkEvidence.next({ connected: true, wifi: true, generation: 2 }); await turn();
    expect(h.lan.open).toHaveBeenCalledOnce();
    await h.ui.sendCommand(id, 'power', false); expect(h.cloud.command).toHaveBeenCalledOnce();
    closed.resolve(); await turn(); expect(h.lan.open).toHaveBeenCalledTimes(2);
    await h.ui.sendCommand(id, 'power', true); expect(next.command).toHaveBeenCalledOnce();
    // A delayed event from the superseded carrier cannot demote its successor.
    for (const cb of h.errors) cb(); await turn();
    await h.ui.sendCommand(id, 'power', false); expect(next.command).toHaveBeenCalledTimes(2);
    expect(h.cloud.command).toHaveBeenCalledOnce(); page.close(); await turn();
  });

  it('only acquires the latest generation when native freshness changes during cleanup', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
    const closed = deferred<void>(), next = successor(h);
    h.session.close.mockImplementation(() => closed.promise);
    h.networkEvidence.next({ connected: true, wifi: true, generation: 2 }); await turn();
    h.networkEvidence.next({ connected: true, wifi: true, generation: 3 }); await turn();
    expect(h.lan.open).toHaveBeenCalledOnce(); closed.resolve(); await turn();
    expect(h.lan.open).toHaveBeenCalledTimes(2);
    expect((h.ui as any).connections.get(id).lan.generation).toBe(3);
    await h.ui.sendCommand(id, 'power', true); expect(next.command).toHaveBeenCalledOnce();
    expect(h.session.command).not.toHaveBeenCalled(); page.close(); await turn();
  });

  it('does not retry a same-generation business failure or replay a command', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready;
    h.opening.reject(Error('LOCAL_ACCESS_GRANT_REJECTED')); await turn();
    h.networkEvidence.next({ connected: true, wifi: true, generation: 1 }); await turn();
    await h.ui.sendCommand(id, 'button', 1);
    expect(h.lan.open).toHaveBeenCalledOnce(); expect(h.cloud.command).toHaveBeenCalledExactlyOnceWith(id, 'button', 1);
    expect(h.session.command).not.toHaveBeenCalled(); page.close(); await turn();
  });

  it.each(['page', 'background', 'account'])(
    'does not acquire a successor after %s exits while waiting for old cleanup', async cause => {
      const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote();
      const closed = deferred<void>(); successor(h); h.session.close.mockImplementation(() => closed.promise);
      h.networkEvidence.next({ connected: true, wifi: true, generation: 2 }); await turn();
      if (cause === 'page') page.close();
      if (cause === 'background') h.visibility.active.next(false);
      if (cause === 'account') { h.data.sessionEpoch++; h.data.authDataChanged.next(); }
      closed.resolve(); await turn(); expect(h.lan.open).toHaveBeenCalledOnce();
      page.close(); await turn();
    },
  );

  it.each(['LOCAL_DISCOVERY_CLEANUP_FAILED', 'LOCAL_WS_CLEANUP_FAILED'])(
    'fails closed when old preparation reports %s, including later generations', async code => {
      const h = harness(), page = h.ui.openConnection(id); await page.ready; await turn(); successor(h);
      h.networkEvidence.next({ connected: true, wifi: true, generation: 2 });
      h.opening.reject(Object.assign(Error(code), { code })); await turn();
      h.networkEvidence.next({ connected: true, wifi: true, generation: 3 }); await turn();
      expect(h.lan.open).toHaveBeenCalledOnce(); await h.ui.sendCommand(id, 'power', true);
      expect(h.cloud.command).toHaveBeenCalledOnce(); page.close(); await turn();
    },
  );

  it('does not hide an old ready session cleanup failure before opening a successor', async () => {
    const h = harness(), page = h.ui.openConnection(id); await page.ready; await h.promote(); successor(h);
    h.session.close.mockRejectedValue(Object.assign(Error('native close failed'), { code: 'LOCAL_WS_CLEANUP_FAILED' }));
    h.networkEvidence.next({ connected: true, wifi: true, generation: 2 }); await turn();
    h.networkEvidence.next({ connected: true, wifi: true, generation: 3 }); await turn();
    expect(h.lan.open).toHaveBeenCalledOnce(); page.close(); await turn();
  });

  it.each(['no-page', 'background', 'unavailable', 'not-wifi'])(
    'does not acquire a new native lane for %s network evidence', async cause => {
      const h = harness();
      const page = cause === 'no-page' ? undefined : h.ui.openConnection(id);
      if (page) { await page.ready; await h.promote(); }
      if (cause === 'background') h.visibility.active.next(false);
      if (cause === 'unavailable') h.lan.available.mockReturnValue(false);
      h.networkEvidence.next({ connected: true, wifi: cause !== 'not-wifi', generation: 2 }); await turn();
      expect(h.lan.open).toHaveBeenCalledTimes(page ? 1 : 0); page?.close(); await turn();
    },
  );
});
