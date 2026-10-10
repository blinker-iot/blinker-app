import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DeviceUiPort } from './device-ui.port';
import { DeviceV2DemandOwners } from '../protocol/device-v2/connection-demand';
import { DirectDeviceSession } from '../protocol/device-v2/direct-session';
import { DeviceV2Event, DeviceV2TargetSnapshot, DeviceV2ValueType } from '../protocol/device-v2';
import { LocalAccessPreparationError } from './local-access/preparation-error';

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
  const session = { state: 'ready', store: localStore, command: vi.fn(async () => ({})),
    subscribeErrors: (cb: () => void) => { errors.add(cb); return () => errors.delete(cb); },
    subscribeClosed: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    close: vi.fn(async () => { session.state = 'closed'; for (const cb of listeners) cb(); }) };
  const opening = deferred<{ session: DirectDeviceSession; permissions: 1 | 3 }>();
  let lanSignal!: AbortSignal;
  const lan = { available: vi.fn(() => true), open: vi.fn(async (_id: string, signal: AbortSignal) => {
    lanSignal = signal; signal.addEventListener('abort', () => { void session.close(); }, { once: true });
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
  const data = { sessionEpoch: 1, authDataChanged: new Subject<void>(), deviceDataLoader: new Subject<boolean>(),
    getDevice: (_id: string) => ({ cloudEnabled: true, deviceType: 'diy', config: {} }) };
  const cache = { save: vi.fn() };
  const ui = new DeviceUiPort(cloud as any, ble as any, { run: (f: () => void) => f() } as any,
    visibility as any, data as any, cache as any, undefined, lan as any);
  const promote = async (permissions: 1 | 3 = 3) => { opening.resolve({ session: session as unknown as DirectDeviceSession, permissions }); await turn(); };
  return { ui, cloud, ble, lan, session, visibility, data, promote, opening, cache, errors, raw, stateListeners, eventListeners, signal: () => lanSignal };
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
});
