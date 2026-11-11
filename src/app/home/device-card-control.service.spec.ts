import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API } from '../configs/api.config';
import { DeviceUiConnection, DeviceUiEndpoint, DeviceUiPort, DeviceUiSnapshot } from '../core/device-v2/device-ui.port';
import { Bbp2ErrorCode, DeviceV2CommandOutcomeUnknownError, DeviceV2RouteError } from '../core/protocol/device-v2';
import { DirectDeviceProtocolError } from '../core/protocol/device-v2/direct-session';
import { DataService } from '../core/services/data.service';
import { DeviceCardControl } from './device-card-control.service';
import { HomeCardControlIntent } from './device-card-control.models';
import { DeviceCardEditor } from './device-card-editor.service';
import { HomeCardBinding, HomeCardPreferencesStore } from './device-card-preferences';

const id = 'card-test-device';
const power: HomeCardBinding = { key: 'power', kind: 0, type: 0, mode: 'toggle' };
const level: HomeCardBinding = { key: 'level', kind: 0, type: 1, mode: 'range' };
const pulse: HomeCardBinding = { key: 'pulse', kind: 1, type: 0, mode: 'action' };
const authorityDescriptor = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;

function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function snapshot(overrides: Partial<DeviceUiSnapshot> = {}): DeviceUiSnapshot {
  const property = { role: 'property', readable: true, writable: true, notifies: true } as const;
  return { manifestRevision: 1, manifestFingerprint: 'ab'.repeat(32), manifestAccepted: true,
    stateRevision: 4, stateFresh: true, endpoints: [
      { ...property, id: 1, key: 'power', manifestKind: 0, manifestType: 0, valueType: 'boolean', value: false },
      { ...property, id: 2, key: 'level', manifestKind: 0, manifestType: 1, valueType: 'integer', value: 0,
        minimum: 0, maximum: 100, step: 5 },
      { id: 3, key: 'pulse', manifestKind: 1, manifestType: 0, role: 'action', valueType: 'boolean',
        readable: false, writable: true, notifies: false },
    ], ...overrides };
}

function intent(state: DeviceUiSnapshot, binding: HomeCardBinding = power, value?: number): HomeCardControlIntent {
  return { binding, value, manifestFingerprint: state.manifestFingerprint,
    stateRevision: state.stateRevision, stateFresh: state.stateFresh };
}

function changed(state: DeviceUiSnapshot, key: string, overrides: Partial<DeviceUiEndpoint>, revision = state.stateRevision): DeviceUiSnapshot {
  return { ...state, stateRevision: revision, endpoints: state.endpoints.map(field => field.key === key ? { ...field, ...overrides } : field) };
}

// Production controller, editor and preference validation. Only inventory/account,
// browser storage and the existing Port boundary are doubles; no ledger is fabricated.
function harness(options: { initial?: DeviceUiSnapshot; bindings?: HomeCardBinding[]; manualReady?: boolean } = {}) {
  const values = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  vi.stubGlobal('localStorage', storage);
  const data = {
    auth: { uuid: 'card-account' }, sessionEpoch: 1,
    device: { list: [id], dict: { [id]: { deviceName: id, config: { mode: 'bbp2', disabled: false,
      isPreview: false, isShared: false }, data: {} as Record<string, unknown> } } },
    room: { list: [], dict: {} },
    authDataChanged: new Subject<void>(), userDataLoader: new BehaviorSubject(true), deviceDataLoader: new BehaviorSubject(true),
  };
  const bindings = options.bindings ?? [power, level, pulse];
  const seed = () => {
    const store = new HomeCardPreferencesStore(storage, { authority: API.BASE_URL, accountId: data.auth.uuid });
    const base = store.load();
    store.save({ ...base.value, slots: { [id]: bindings } }, base.raw);
  };
  seed();
  const state = new BehaviorSubject(options.initial ?? snapshot());
  const connection = new BehaviorSubject('ready');
  const scopes: Array<DeviceUiConnection & { prepared: ReturnType<typeof deferred>; close: ReturnType<typeof vi.fn> }> = [];
  const sends: Array<{ id: string; key: string; value: unknown; result: ReturnType<typeof deferred> }> = [];
  const ui = {
    watchState: vi.fn(() => state.asObservable()), watchConnection: vi.fn(() => connection.asObservable()),
    openConnection: vi.fn((_id: string, signal: AbortSignal) => {
      const prepared = deferred(), closed = deferred(), controller = new AbortController();
      const close = vi.fn(() => { if (!controller.signal.aborted) { controller.abort(); closed.resolve(); } });
      const abort = () => close();
      signal.addEventListener('abort', abort, { once: true });
      void closed.promise.then(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) close();
      const ready = Promise.race([prepared.promise, closed.promise.then(() => { throw Error('TEST_SCOPE_ABORTED'); })]);
      const scope = { signal: controller.signal, ready, closed: closed.promise, prepared, close };
      scopes.push(scope);
      if (!options.manualReady) prepared.resolve();
      return scope;
    }),
    sendCommand: vi.fn((target: string, key: string, value: unknown) => {
      const result = deferred(); sends.push({ id: target, key, value, result }); return result.promise;
    }),
    disconnect: vi.fn(),
  };
  TestBed.configureTestingModule({ providers: [DeviceCardEditor, DeviceCardControl,
    { provide: DataService, useValue: data }, { provide: DeviceUiPort, useValue: ui }] });
  const editor = TestBed.inject(DeviceCardEditor), service = TestBed.inject(DeviceCardControl);
  service.setVisible(true);
  TestBed.tick();
  return { data, storage, seed, editor, service, ui, state, connection, scopes, sends,
    status: (key = 'power') => service.states(id)[key] };
}

async function flush(): Promise<void> {
  await Promise.resolve(); await Promise.resolve(); TestBed.tick(); await Promise.resolve();
}

afterEach(() => {
  TestBed.resetTestingModule();
  Object.defineProperty(API, 'BASE_URL', authorityDescriptor);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('page-owned device card controls', () => {
  it('uses a stale first gesture only to prepare; requires a second fresh witness before toggling', async () => {
    const stale = snapshot({ stateFresh: false });
    const h = harness({ initial: stale, manualReady: true });
    const first = h.service.control(id, intent(stale));
    expect(h.ui.openConnection).toHaveBeenCalledOnce(); expect(h.ui.sendCommand).not.toHaveBeenCalled();
    h.state.next(snapshot()); h.scopes[0].prepared.resolve(); await first;
    expect(h.status().phase).toBe('ready'); expect(h.ui.sendCommand).not.toHaveBeenCalled();
    const second = h.service.control(id, intent(h.state.value)); await flush();
    expect(h.ui.openConnection).toHaveBeenCalledOnce();
    expect(h.ui.sendCommand).toHaveBeenCalledExactlyOnceWith(id, 'power', true);
    h.sends[0].result.resolve(); await second;
  });

  it('opens its own scope even for a fresh witness, then dispatches exactly once with no queue', async () => {
    const h = harness({ manualReady: true });
    const work = h.service.control(id, intent(h.state.value));
    expect(h.ui.openConnection).toHaveBeenCalledOnce(); expect(h.ui.sendCommand).not.toHaveBeenCalled();
    h.scopes[0].prepared.resolve(); await flush();
    expect(h.status().phase).toBe('pending');
    await h.service.control(id, intent(h.state.value));
    await h.service.control(id, intent(h.state.value, level, 25));
    expect(h.ui.sendCommand).toHaveBeenCalledOnce();
    h.sends[0].result.resolve(); await work;
    expect(h.ui.sendCommand).toHaveBeenCalledOnce();
  });

  it.each([{ type: 0, valueType: 'boolean', expected: true }, { type: 9, valueType: 'null', expected: null }] as const)(
    'uses only the supported Action payload for Manifest type $type', async ({ type, valueType, expected }) => {
      const initial = changed(snapshot(), 'pulse', { manifestType: type, valueType });
      const binding: HomeCardBinding = { ...pulse, type };
      const h = harness({ initial, bindings: [binding] });
      const work = h.service.control(id, intent(initial, binding)); await flush();
      expect(h.ui.sendCommand).toHaveBeenCalledExactlyOnceWith(id, 'pulse', expected);
      h.sends[0].result.resolve(); await work;
      expect(h.status('pulse').phase).toBe('accepted'); expect(h.scopes[0].signal.aborted).toBe(true);
    });

  it('does not send an unsupported Action type or silently substitute another binding', async () => {
    const initial = changed(snapshot(), 'pulse', { manifestType: 1, valueType: 'integer' });
    const h = harness({ initial });
    await h.service.control(id, intent(initial, pulse));
    expect(h.ui.openConnection).not.toHaveBeenCalled(); expect(h.ui.sendCommand).not.toHaveBeenCalled();
    expect(h.status('pulse').phase).toBe('rejected');
  });

  it('rejects an illegal integer step before the Port and accepts an explicit legal range value', async () => {
    const h = harness();
    await h.service.control(id, intent(h.state.value, level, 22));
    expect(h.status('level').phase).toBe('rejected'); expect(h.ui.sendCommand).not.toHaveBeenCalled();
    const valid = h.service.control(id, intent(h.state.value, level, 25)); await flush();
    expect(h.ui.sendCommand).toHaveBeenCalledExactlyOnceWith(id, 'level', 25);
    h.sends[0].result.resolve(); await valid;
  });

  it.each(['viewer', 'endpoint-filter'] as const)('denies shared %s access before opening a connection', async restriction => {
    const h = harness();
    const device = h.data.device.dict[id]; device.config.isShared = true;
    device.data = restriction === 'viewer' ? { canCommand: false, commandEndpointKeys: null }
      : { canCommand: true, commandEndpointKeys: ['level'] };
    await h.service.control(id, intent(h.state.value));
    expect(h.status().phase).toBe('rejected');
    expect(h.ui.openConnection).not.toHaveBeenCalled(); expect(h.ui.sendCommand).not.toHaveBeenCalled();
  });

  it.each(['fingerprint', 'type', 'revision'] as const)('does not supplement a stale gesture after its %s changes', async kind => {
    const initial = snapshot(); const h = harness({ initial, manualReady: true });
    const work = h.service.control(id, intent(initial));
    h.state.next(kind === 'fingerprint' ? { ...initial, manifestFingerprint: 'cd'.repeat(32) }
      : kind === 'type' ? changed(initial, 'power', { manifestType: 1, valueType: 'integer', value: 0 })
      : { ...initial, stateRevision: 5 });
    h.scopes[0].prepared.resolve(); await work;
    expect(h.ui.sendCommand).not.toHaveBeenCalled();
    expect(h.status().phase).toBe(kind === 'type' ? 'rejected' : 'ready');
  });

  it('does not mutate State on ACK; only a new fresh matching revision completes synchronization', async () => {
    const initial = snapshot(); const h = harness({ initial });
    const work = h.service.control(id, intent(initial)); await flush();
    h.sends[0].result.resolve(); await work;
    expect(h.status()).toMatchObject({ phase: 'accepted', busy: true, blocked: false });
    expect(h.state.value).toBe(initial); expect(initial.endpoints[0].value).toBe(false);
    h.state.next(changed(initial, 'power', { value: true }, 4));
    expect(h.status().phase).toBe('accepted');
    h.state.next({ ...changed(initial, 'power', { value: true }, 5), stateFresh: false });
    expect(h.status().phase).toBe('accepted');
    h.state.next(changed(initial, 'power', { value: false }, 5));
    expect(h.status().phase).toBe('accepted');
    h.state.next(changed(initial, 'power', { value: true }, 6));
    expect(h.status()).toMatchObject({ phase: 'synced', busy: false, blocked: false });
    expect(h.scopes[0].signal.aborted).toBe(true);
  });

  it.each(['conflicting', 'stale'] as const)(
    'rechecks a newer %s State before interpreting a later ACK', async kind => {
      const initial = snapshot(); const h = harness({ initial });
      const work = h.service.control(id, intent(initial)); await flush();
      h.state.next(changed(initial, 'power', { value: true }, 5));
      expect(h.status().phase).toBe('pending');
      h.state.next(kind === 'conflicting' ? changed(initial, 'power', { value: false }, 6)
        : { ...changed(initial, 'power', { value: true }, 6), stateFresh: false });
      h.sends[0].result.resolve(); await work;
      expect(h.status()).toMatchObject({ phase: 'accepted', busy: true, blocked: false });
      expect(h.scopes[0].signal.aborted).toBe(false);
      h.state.next(changed(initial, 'power', { value: true }, 7));
      expect(h.status()).toMatchObject({ phase: 'synced', busy: false, blocked: false });
      expect(h.scopes[0].signal.aborted).toBe(true);
    });

  it.each([Error('plain Direct transport failed'), new DeviceV2CommandOutcomeUnknownError()])(
    'locks an unconfirmed result without retrying, queueing or clearing it on later State', async failure => {
      const h = harness(); const work = h.service.control(id, intent(h.state.value)); await flush();
      h.sends[0].result.reject(failure); await work;
      expect(h.status()).toMatchObject({ phase: 'unknown', blocked: true, busy: false });
      h.state.next(changed(h.state.value, 'power', { value: true }, 5));
      await h.service.control(id, intent(h.state.value));
      expect(h.ui.sendCommand).toHaveBeenCalledOnce(); expect(h.ui.openConnection).toHaveBeenCalledOnce();
      expect(h.status().phase).toBe('unknown');
    });

  it.each([
    { carrier: 'Cloud', code: Bbp2ErrorCode.CommandRejected, create: () => new DeviceV2RouteError(Bbp2ErrorCode.CommandRejected) },
    { carrier: 'Direct', code: Bbp2ErrorCode.CommandRejected, create: () => new DirectDeviceProtocolError(Bbp2ErrorCode.CommandRejected) },
  ])('keeps known $carrier CommandRejected distinct from an uncertain outcome', async ({ create }) => {
    const h = harness(); const work = h.service.control(id, intent(h.state.value)); await flush();
    h.sends[0].result.reject(create()); await work;
    expect(h.status()).toMatchObject({ phase: 'rejected', blocked: false, busy: false });
    expect(h.scopes[0].signal.aborted).toBe(true); expect(h.ui.sendCommand).toHaveBeenCalledOnce();
  });

  it.each([
    { carrier: 'Cloud', code: Bbp2ErrorCode.Internal, create: () => new DeviceV2RouteError(Bbp2ErrorCode.Internal) },
    { carrier: 'Direct', code: Bbp2ErrorCode.Internal, create: () => new DirectDeviceProtocolError(Bbp2ErrorCode.Internal) },
    { carrier: 'Cloud', code: 255, create: () => new DeviceV2RouteError(255 as Bbp2ErrorCode) },
    { carrier: 'Direct', code: 255, create: () => new DirectDeviceProtocolError(255 as Bbp2ErrorCode) },
  ])('locks $carrier wire error $code as UNKNOWN without supplementing the command', async ({ create }) => {
    const h = harness(); const work = h.service.control(id, intent(h.state.value)); await flush();
    h.sends[0].result.reject(create()); await work;
    expect(h.status()).toMatchObject({ phase: 'unknown', blocked: true, busy: false });
    await h.service.control(id, intent(h.state.value));
    expect(h.ui.sendCommand).toHaveBeenCalledOnce(); expect(h.ui.openConnection).toHaveBeenCalledOnce();
  });

  it.each(['edit', 'background', 'hidden', 'navigation'] as const)(
    'releases only its own preparing scope on %s and ignores a late ready', async boundary => {
      const h = harness({ manualReady: true }); const unrelated = new AbortController();
      const work = h.service.control(id, intent(h.state.value));
      if (boundary === 'edit') expect(h.editor.begin(undefined, [id], id)).toBe(true);
      if (boundary === 'background') h.editor.setActive(false);
      if (boundary === 'hidden') h.service.setVisible(false);
      if (boundary === 'navigation') h.service.stop();
      TestBed.tick(); await flush();
      expect(h.scopes[0].signal.aborted).toBe(true);
      h.scopes[0].prepared.resolve(); await work;
      expect(h.ui.sendCommand).not.toHaveBeenCalled(); expect(h.ui.disconnect).not.toHaveBeenCalled();
      expect(unrelated.signal.aborted).toBe(false);
    });

  it.each(['account', 'authority'] as const)('isolates a late ACK from a successor %s session', async boundary => {
    const h = harness();
    const old = h.service.control(id, intent(h.state.value)); await flush();
    if (boundary === 'account') { h.data.auth.uuid = 'other-account'; h.data.sessionEpoch += 1; }
    else Object.defineProperty(API, 'BASE_URL', { value: 'https://other.example', configurable: true });
    h.seed(); h.data.authDataChanged.next(); TestBed.tick();
    expect(h.scopes[0].signal.aborted).toBe(true);
    const next = h.service.control(id, intent(h.state.value)); await flush();
    expect(h.ui.sendCommand).toHaveBeenCalledTimes(2); expect(h.status().phase).toBe('pending');
    h.sends[0].result.resolve(); await old;
    expect(h.status().phase).toBe('pending'); expect(h.scopes[1].signal.aborted).toBe(false);
    h.sends[1].result.resolve(); await next;
    expect(h.status().phase).toBe('accepted');
  });

  it('does not emit commands in an editing session or while its card settings are open', async () => {
    const h = harness(); expect(h.editor.begin(undefined, [id], id)).toBe(true);
    TestBed.tick(); await h.service.control(id, intent(h.state.value));
    h.editor.openSettings(id); TestBed.tick(); await h.service.control(id, intent(h.state.value));
    expect(h.ui.openConnection).not.toHaveBeenCalled(); expect(h.ui.sendCommand).not.toHaveBeenCalled();
  });

  it('bounds a prepared no-command scope to fifteen seconds', async () => {
    vi.useFakeTimers();
    const initial = snapshot(); const h = harness();
    await h.service.control(id, { ...intent(initial), stateFresh: false });
    expect(h.status().phase).toBe('ready');
    await vi.advanceTimersByTimeAsync(14_999); expect(h.scopes[0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(h.scopes[0].signal.aborted).toBe(true);
    expect(h.ui.sendCommand).not.toHaveBeenCalled(); expect(h.status().phase).toBe('idle');
  });

  it('bounds post-ACK State waiting to five seconds without converting acceptance into success or replay', async () => {
    vi.useFakeTimers(); const h = harness();
    const work = h.service.control(id, intent(h.state.value)); await flush();
    h.sends[0].result.resolve(); await work;
    await vi.advanceTimersByTimeAsync(4_999); expect(h.scopes[0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(h.scopes[0].signal.aborted).toBe(true);
    expect(h.status()).toMatchObject({ phase: 'accepted', blocked: true, busy: false });
    await h.service.control(id, intent(h.state.value)); expect(h.ui.sendCommand).toHaveBeenCalledOnce();
  });
});
