import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2Channel, DeviceV2RouteError, DeviceV2Session } from './session';
import { DeviceV2Store } from './store';
import { Bbp2ErrorCode, Bbp2MessageKind as Kind } from './types';
import {
  bytesToHex, decodeConnectionDemandBody, decodeDeliveryBody, decodeFrame, decodeManifestChangedBody,
  encodeCanonicalArray as array, encodeCanonicalByteString as bytes, encodeCanonicalManifestPrefix,
  encodeCanonicalMap as map, encodeCanonicalUnsigned as uint, encodeConnectionDemandStatusBody,
  encodeDeliveryBody, encodeFrame, hexToBytes, logicalDevicePeerId,
} from './codec';

const target = 'device_01234567-89ab-cdef-0123-456789abcdef';
const other = 'ble_ASNFZ4mrze8BI0VniavN7g';
const hash = (input: Uint8Array) => new Uint8Array(createHash('sha256').update(input).digest());
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => [...p]));
const turn = async () => { for (let i = 0; i < 60; ++i) await Promise.resolve(); };
function deferred<T = void>() { let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function model(revision: number) {
  const field = hexToBytes('a50065706f7765720100020003030401');
  const fingerprint = hash(concat(encodeCanonicalManifestPrefix(revision, 1), field));
  return { revision, fingerprint, page: map([[0, uint(revision)], [1, bytes(fingerprint)],
    [2, uint(0)], [3, uint(1)], [4, uint(1)], [5, array([field])]]) };
}
const a = model(1), b = model(2), c = model(3);
const notice = (previous = a, next = b) => map([[0, bytes(previous.fingerprint)],
  [1, bytes(next.fingerprint)], [2, uint(next.revision)]]);
const sessions: DeviceV2Session[] = [];
afterEach(async () => { for (const s of sessions.splice(0)) await s.close(); vi.useRealTimers(); });

describe('finite target observation recovery', () => {
  const recoverable = () => fixture(true, async input => hash(input), true);
  const acquires = (f: Awaited<ReturnType<typeof fixture>>, id = target) => f.routes.filter(r => r.messageKind === Kind.StateInterest
    && bytesToHex(r.peerId) === bytesToHex(logicalDevicePeerId(id)) && decodeConnectionDemandBody(r.messageBody).action === 'acquire');

  it('shares one lease among callers, immediately fences loss, restores fresh State and ignores old loss', async () => {
    const f = await recoverable(), a = await f.open(), b = await f.open();
    await f.open(other); expect(acquires(f)).toHaveLength(1);
    const event = vi.spyOn(f.session.store, 'applyEvent');
    f.lost();
    expect(f.session.store.snapshot(target).stateFresh).toBe(false);
    f.deliver({ peerKind: 0, peerId: logicalDevicePeerId(target), messageKind: Kind.Event,
      messageFlags: 4, messageBody: hexToBytes('a101f5') });
    expect(event).not.toHaveBeenCalled(); expect(f.session.store.snapshot(other).stateFresh).toBe(true);
    await turn(); await vi.advanceTimersByTimeAsync(1);
    expect(acquires(f)).toHaveLength(2);
    expect(f.session.store.snapshot(target).stateFresh).toBe(true);
    f.lost('stale', { ownerId: 1, revision: 1 }); await vi.advanceTimersByTimeAsync(1);
    expect(acquires(f)).toHaveLength(2); expect(f.session.store.snapshot(target).stateFresh).toBe(true);
    a.release(); expect(f.session.store.snapshot(target).stateFresh).toBe(true);
    b.release(); expect(f.session.store.snapshot(target).stateFresh).toBe(false);
    expect(f.session.state).toBe('ready'); expect(f.count(Kind.Command)).toBe(0);
  });

  it('does not recover a fresh denial or an unnegotiated loss, and leaves other devices ready', async () => {
    const f = await recoverable(), owner = await f.open(); await f.open(other);
    f.lost('denied'); expect(await owner.closed).toBe('rejected');
    await vi.advanceTimersByTimeAsync(4000); expect(acquires(f)).toHaveLength(1);
    expect(f.session.store.snapshot(other).stateFresh).toBe(true); expect(f.session.state).toBe('ready');
    const old = await fixture(); await old.open(); const errors: Error[] = [];
    old.session.subscribeErrors(e => errors.push(e)); old.lost();
    expect(errors.some(e => e.message.includes('not negotiated'))).toBe(true);
    expect(acquires(old)).toHaveLength(1);
  });

  it('success does not refill the shared three-attempt recovery budget', async () => {
    const f = await recoverable(), owner = await f.open();
    for (let i = 0; i < 3; i++) { f.lost(); await turn(); await vi.advanceTimersByTimeAsync(1); }
    expect(acquires(f)).toHaveLength(4);
    f.lost(); expect(await owner.closed).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(4000); expect(acquires(f)).toHaveLength(4);
    const next = await f.open(); expect(acquires(f)).toHaveLength(5); next.release();
  });

  it('failed reacquisition uses 1/3 s backoff, stops, and does not replay a business action', async () => {
    const f = await recoverable(), owner = await f.open(); f.options.interestStatus = 'stale';
    f.lost(); await turn(); await vi.advanceTimersByTimeAsync(1); expect(acquires(f)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(999); expect(acquires(f)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); expect(acquires(f)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2999); expect(acquires(f)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1); expect(acquires(f)).toHaveLength(4);
    expect(await owner.closed).toBe('unavailable'); expect(f.count(Kind.Command)).toBe(0);
    await vi.advanceTimersByTimeAsync(20000); expect(acquires(f)).toHaveLength(4);
  });

  it('a timed out renewal restores observation using the same bounded owner engine', async () => {
    const f = await recoverable(); await f.open();
    f.options.hold = kind => kind === Kind.StateInterest;
    await vi.advanceTimersByTimeAsync(10000); f.options.hold = () => false;
    await vi.advanceTimersByTimeAsync(5001);
    expect(acquires(f)).toHaveLength(2); expect(f.session.store.snapshot(target).stateFresh).toBe(true);
    for (const reply of f.options.held) reply(); await turn();
    expect(acquires(f)).toHaveLength(2); expect(f.session.state).toBe('ready');
  });

  it('loss for the accepted revision cancels a pending renewal, but not a later accepted revision', async () => {
    const f = await recoverable(); await f.open();
    await vi.advanceTimersByTimeAsync(10000); // revision 2 is accepted
    f.lost('stale', { ownerId: 1, revision: 1 }); await vi.advanceTimersByTimeAsync(1);
    expect(acquires(f)).toHaveLength(1);
    f.options.hold = kind => kind === Kind.StateInterest;
    await vi.advanceTimersByTimeAsync(10000); // revision 3 is pending, accepted revision is still 2
    f.lost('stale', { ownerId: 1, revision: 2 }); f.options.hold = () => false;
    await turn(); await vi.advanceTimersByTimeAsync(1); expect(acquires(f)).toHaveLength(2);
    for (const reply of f.options.held) reply(); await turn();
    expect(f.session.store.snapshot(target).stateFresh).toBe(true);
  });

  it('exit during a held recovery cancels only that target and cannot resurrect a late grant', async () => {
    const f = await recoverable(), owner = await f.open(); await f.open(other);
    f.options.hold = kind => kind === Kind.StateInterest;
    f.lost(); await turn(); await vi.advanceTimersByTimeAsync(1); expect(acquires(f)).toHaveLength(2);
    owner.release(); expect(await owner.closed).toBe('cancelled');
    f.options.hold = () => false; for (const reply of f.options.held) reply();
    await vi.advanceTimersByTimeAsync(4000);
    expect(acquires(f)).toHaveLength(2); expect(f.session.store.snapshot(target).stateFresh).toBe(false);
    expect(f.session.store.snapshot(other).stateFresh).toBe(true); expect(f.session.state).toBe('ready');
  });

  it('does not turn an initial rejected acquire into hidden permanent retries', async () => {
    const f = await recoverable(); f.options.interestStatus = 'stale';
    const owner = f.session.acquireStateInterest(target)!;
    await expect(owner.accepted).rejects.toMatchObject({ reason: 'unavailable' });
    expect(await owner.closed).toBe('unavailable'); await vi.advanceTimersByTimeAsync(20000);
    expect(acquires(f)).toHaveLength(1);
  });

  it('model recovery and observation recovery consume the same budget', async () => {
    const f = await recoverable(); await f.open();
    f.options.model = b; f.notify(a, b); await vi.advanceTimersByTimeAsync(1);
    f.options.model = c; f.notify(b, c); await vi.advanceTimersByTimeAsync(1);
    f.lost(); await turn(); await vi.advanceTimersByTimeAsync(1); expect(acquires(f)).toHaveLength(2);
    f.lost(); await turn(); await vi.advanceTimersByTimeAsync(4000); expect(acquires(f)).toHaveLength(2);
  });

  it('owner recovery shares the four actual recovery slots and caller count stays bounded', async () => {
    const f = await recoverable();
    const ids = Array.from({ length: 5 }, (_, i) => `device_01234567-89ab-cdef-0123-456789abcde${i}`);
    const owners = [];
    for (const id of ids) owners.push(await f.open(id));
    f.options.hold = kind => kind === Kind.StateInterest;
    for (const id of ids) f.lost('stale', undefined, id);
    await turn(); await vi.advanceTimersByTimeAsync(1);
    expect(ids.map(id => acquires(f,id).length)).toEqual([2,2,2,2,1]);
    owners[0].release(); await turn(); await vi.advanceTimersByTimeAsync(1);
    expect(acquires(f,ids[4])).toHaveLength(2);
    const live = await fixture();
    const callers = Array.from({ length: 16 }, () => live.session.acquireStateInterest(target)!);
    await Promise.all(callers.map(x => x.accepted));
    expect(acquires(live)).toHaveLength(1);
    expect(() => live.session.acquireStateInterest(target)).toThrow('capacity');
    callers.forEach(x => x.release());
  });

  it('a loss during pending model synchronization survives its old task completing', async () => {
    const f = await recoverable(); await f.open(); f.options.model = b;
    f.options.hold = kind => kind === Kind.StateRequest;
    f.notify(a,b); await vi.advanceTimersByTimeAsync(1); expect(f.options.held.length).toBeGreaterThan(0);
    f.lost(); await turn(); f.options.hold = () => false;
    for (const reply of f.options.held) reply(); await turn(); await vi.advanceTimersByTimeAsync(1);
    expect(acquires(f)).toHaveLength(2); expect(f.session.store.snapshot(target).stateFresh).toBe(true);
    expect(f.count(Kind.Command)).toBe(0);
  });

  it('never treats unsolicited accepted/released/busy/capacity as loss or a grant', async () => {
    for (const status of ['accepted', 'released', 'busy', 'capacity'] as const) {
      const f = await recoverable(); await f.open(); const errors: Error[] = [];
      f.session.subscribeErrors(e => errors.push(e));
      f.deliver({ peerKind:0,peerId:logicalDevicePeerId(target),messageKind:Kind.StateInterestStatus,messageFlags:2,
        messageBody:encodeConnectionDemandStatusBody({ ownerId:1,revision:1,status }) });
      expect(errors.some(e => e.message.includes('Invalid observation loss'))).toBe(true);
      expect(acquires(f)).toHaveLength(1);
    }
  });
});

async function fixture(features = true, digest: (input: Uint8Array) => Promise<Uint8Array> = async input => hash(input), recovery = false) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const listeners = new Set<(payload: Uint8Array) => void>();
  const routes: Array<ReturnType<typeof decodeDeliveryBody> & { sequence: number }> = [];
  const f = { model: a, hold: (_kind: Kind) => false, held: [] as Array<() => void>, routes,
    interestStatus: 'accepted' as 'accepted' | 'stale' | 'denied' };
  let sequence = 100, requestId = 0;
  const emit = (payload: Uint8Array) => listeners.forEach(listener => listener(payload));
  const delivery = (body: Parameters<typeof encodeDeliveryBody>[0]) => emit(encodeFrame({
    kind: Kind.Delivery, flags: 2, sequence: ++sequence, body: encodeDeliveryBody(body) }));
  const channel: DeviceV2Channel = {
    publish: async payload => {
      const frame = decodeFrame(payload);
      if (frame.kind === Kind.Hello) {
        emit(encodeFrame({ kind: Kind.Hello, flags: 2, sequence: frame.sequence,
          body: hexToBytes(recovery ? 'a60002018102021a00e11cc303190200041902000904'
            : features ? 'a60002018102021a00611cc303190200041902000904'
            : 'a60002018102021a00211cc303190200041902000904') }));
        emit(encodeFrame({ kind: Kind.Ack, flags: 2, sequence: ++sequence, body: map([[0, uint(frame.sequence)]]) }));
        return;
      }
      const r = { ...decodeDeliveryBody(frame.body), sequence: frame.sequence }; routes.push(r);
      const interest = r.messageKind === Kind.StateInterest ? decodeConnectionDemandBody(r.messageBody) : undefined;
      const reply = { ...r, messageKind: interest ? Kind.StateInterestStatus : r.messageKind === Kind.ManifestRequest
        ? Kind.Manifest : r.messageKind === Kind.StateRequest ? Kind.StatePage : Kind.Ack,
        messageFlags: r.messageKind === Kind.StateRequest ? 6 : 2,
        messageBody: interest ? encodeConnectionDemandStatusBody({ ...interest,
          status: interest.action === 'release' ? 'released' : f.interestStatus })
          : r.messageKind === Kind.ManifestRequest ? f.model.page
          : r.messageKind === Kind.StateRequest ? hexToBytes('a5000201000201030104a101f5')
          : map([[0, uint(frame.sequence)]]) };
      if (f.hold(r.messageKind)) f.held.push(() => delivery(reply)); else delivery(reply);
    },
    onMessage: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    onClose: () => () => undefined,
  };
  const session = new DeviceV2Session(channel, new DeviceV2Store(digest), {
    requestId: () => new Uint8Array(16).fill(++requestId), routeRetries: 0,
  });
  sessions.push(session); await session.start();
  return { ...f, options: f, session,
    deliver: delivery,
    lost: (status: 'stale' | 'denied' = 'stale', identity?: { ownerId: number; revision: number }, id = target) => {
      const r = [...routes].reverse().find(r => r.messageKind === Kind.StateInterest
        && bytesToHex(r.peerId) === bytesToHex(logicalDevicePeerId(id))
        && decodeConnectionDemandBody(r.messageBody).action !== 'release')!;
      delivery({ peerKind: 0, peerId: logicalDevicePeerId(id), messageKind: Kind.StateInterestStatus, messageFlags: 2,
        messageBody: encodeConnectionDemandStatusBody({ ...decodeConnectionDemandBody(r.messageBody), ...identity, status }) });
    },
    notify: (previous = a, next = b, id = target, flags = 0) => delivery({ peerKind: 0,
      peerId: logicalDevicePeerId(id), messageKind: Kind.ManifestChanged, messageFlags: flags, messageBody: notice(previous, next) }),
    open: async (id = target) => { const owner = session.acquireStateInterest(id)!; await owner.accepted;
      await session.ensureReady(id); return owner; },
    count: (kind: Kind) => routes.filter(r => r.messageKind === kind).length,
  };
}

describe('Manifest change observation recovery', () => {
  it('uses a strict canonical, bounded hint, not a replacement Manifest', () => {
    expect(notice().length).toBe(73);
    expect(bytesToHex(notice())).toBe('a3005820' + bytesToHex(a.fingerprint) + '015820' + bytesToHex(b.fingerprint) + '0202');
    expect(decodeManifestChangedBody(notice())).toEqual({ previous: bytesToHex(a.fingerprint),
      fingerprint: bytesToHex(b.fingerprint), revision: 2 });
    for (const bad of [notice().slice(0, -1), concat(notice(), uint(0)), notice(a, a),
      map([[0, bytes(a.fingerprint.slice(1))], [1, bytes(b.fingerprint)], [2, uint(2)]]),
      map([[0, bytes(a.fingerprint)], [1, bytes(b.fingerprint)], [2, uint(0x100000000n)]]),
      hexToBytes(bytesToHex(notice()).replace(/0202$/, '021802'))]) {
      expect(() => decodeManifestChangedBody(bad)).toThrow();
    }
    expect(decodeManifestChangedBody(notice(b, a)).revision).toBe(1); // Firmware rollback is valid.
  });

  it('resynchronizes only an observed target without reconnecting or replaying a Command', async () => {
    const f = await fixture(); await f.open(); await f.open(other);
    f.options.model = b; f.notify(); f.notify();
    expect(f.session.store.snapshot(target).manifestAccepted).toBe(false);
    expect(f.session.store.snapshot(other).stateFresh).toBe(true);
    await f.session.command(other, 'power', false);
    await vi.advanceTimersByTimeAsync(10);
    expect(f.session.store.snapshot(target)).toMatchObject({ manifestAccepted: true, stateFresh: true,
      manifest: { fingerprint: bytesToHex(b.fingerprint) } });
    expect(f.count(Kind.ManifestRequest)).toBe(3); expect(f.count(Kind.Command)).toBe(1);
    f.notify(); await vi.advanceTimersByTimeAsync(50);
    expect(f.count(Kind.ManifestRequest)).toBe(3); expect(f.session.state).toBe('ready');
  });

  it('ignores wrong previous fingerprints and inactive targets', async () => {
    const f = await fixture(), owner = await f.open();
    f.notify(c, b); await vi.advanceTimersByTimeAsync(10);
    expect(f.session.store.snapshot(target).manifestAccepted).toBe(true);
    owner.release(); f.notify(); await vi.advanceTimersByTimeAsync(10);
    expect(f.count(Kind.ManifestRequest)).toBe(1); expect(f.session.state).toBe('ready');
  });

  for (const heldKind of [Kind.ManifestAccept, Kind.StateRequest]) {
    it(`fences the old ${Kind[heldKind]} reply during a model change`, async () => {
      const f = await fixture(); const owner = f.session.acquireStateInterest(target)!; await owner.accepted;
      const accepted = vi.spyOn(f.session.store, 'markManifestAccepted');
      const state = vi.spyOn(f.session.store, 'applyStatePage');
      f.options.hold = kind => kind === heldKind;
      const task = f.session.ensureReady(target); await turn(); expect(f.held).toHaveLength(1);
      f.options.model = b; f.notify(); f.options.hold = () => false; f.held.shift()!();
      await task; await vi.advanceTimersByTimeAsync(10);
      expect(f.session.store.snapshot(target)).toMatchObject({ manifestAccepted: true, stateFresh: true,
        manifest: { fingerprint: bytesToHex(b.fingerprint) } });
      expect(f.count(Kind.ManifestRequest)).toBe(2); expect(f.count(Kind.Command)).toBe(0);
      expect(state).toHaveBeenCalledOnce();
      if (heldKind === Kind.ManifestAccept) expect(accepted).toHaveBeenCalledOnce();
    });
  }

  it('fences async hash completion and accepts only the newly verified model', async () => {
    const hold = deferred<Uint8Array>(); let first = true;
    const f = await fixture(true, async input => { if (first) { first = false; return hold.promise; } return hash(input); });
    await f.session.acquireStateInterest(target)!.accepted;
    const task = f.session.ensureReady(target); await turn();
    f.options.model = b; f.notify(); hold.resolve(a.fingerprint); await task;
    expect(f.session.store.snapshot(target).manifest?.fingerprint).toBe(bytesToHex(b.fingerprint));
    expect(f.count(Kind.ManifestAccept)).toBe(1); expect(f.session.state).toBe('ready');
  });

  it('budgets at most three automatic recoveries; retries back off and renewal never refills', async () => {
    const f = await fixture(); await f.open(); const errors: Error[] = []; f.session.subscribeErrors(e => errors.push(e));
    const ensure = vi.spyOn(f.session, 'ensureReady').mockRejectedValue(new Error('target offline'));
    f.notify(); await vi.advanceTimersByTimeAsync(1); expect(ensure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999); expect(ensure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(ensure).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000); expect(ensure).toHaveBeenCalledTimes(3);
    f.notify(a, c); await vi.advanceTimersByTimeAsync(30000);
    expect(ensure).toHaveBeenCalledTimes(3); expect(errors).toHaveLength(1);
    expect(f.session.state).toBe('ready');
  });

  it('authoritative denial ends automatic recovery for this observation interval', async () => {
    const f = await fixture(); await f.open();
    const ensure = vi.spyOn(f.session, 'ensureReady').mockRejectedValue(new DeviceV2RouteError(Bbp2ErrorCode.AuthenticationRequired));
    f.notify(); await vi.advanceTimersByTimeAsync(1); f.notify(a, c);
    await vi.advanceTimersByTimeAsync(30000); expect(ensure).toHaveBeenCalledOnce();
    expect(f.session.state).toBe('ready');
  });

  it('holds actual concurrency slots until settlement, even after observers leave', async () => {
    const f = await fixture(), ids = Array.from({ length: 5 }, (_, i) => `device_01234567-89ab-cdef-0123-456789abcde${i}`);
    const owners = [];
    for (const id of ids) owners.push(await f.open(id));
    const held = deferred(), ensure = vi.spyOn(f.session, 'ensureReady').mockReturnValue(held.promise);
    ids.forEach(id => f.notify(a, b, id)); await vi.advanceTimersByTimeAsync(1);
    expect(ensure).toHaveBeenCalledTimes(4);
    owners.slice(0, 4).forEach(o => o.release()); await vi.advanceTimersByTimeAsync(50);
    expect(ensure).toHaveBeenCalledTimes(4);
    held.resolve(); await turn(); await vi.advanceTimersByTimeAsync(1); expect(ensure).toHaveBeenCalledTimes(5);
    owners[4].release(); await vi.advanceTimersByTimeAsync(5000); expect(ensure).toHaveBeenCalledTimes(5);
  });

  it('leaving a page cancels its delayed retry; a new observation gets an independent budget', async () => {
    const f = await fixture(), owner = await f.open();
    const held = deferred(), ensure = vi.spyOn(f.session, 'ensureReady').mockReturnValueOnce(held.promise)
      .mockRejectedValue(new Error('offline'));
    f.notify(); await vi.advanceTimersByTimeAsync(1); owner.release();
    const next = f.session.acquireStateInterest(target)!; await next.accepted;
    f.notify(a, c); await vi.advanceTimersByTimeAsync(1); expect(ensure).toHaveBeenCalledTimes(2);
    next.release(); held.resolve(); await vi.advanceTimersByTimeAsync(10000);
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it('a notice arriving while recovery settles is not lost', async () => {
    const f = await fixture(); await f.open(); f.options.model = b;
    const real = f.session.ensureReady.bind(f.session), held = deferred(); let first = true;
    vi.spyOn(f.session, 'ensureReady').mockImplementation(async id => {
      await real(id); if (first) { first = false; await held.promise; }
    });
    f.notify(); await vi.advanceTimersByTimeAsync(1);
    expect(f.session.store.snapshot(target).manifest?.fingerprint).toBe(bytesToHex(b.fingerprint));
    f.options.model = c; f.notify(b, c); held.resolve(); await vi.advanceTimersByTimeAsync(1100);
    expect(f.session.store.snapshot(target)).toMatchObject({ manifestAccepted: true, stateFresh: true,
      manifest: { fingerprint: bytesToHex(c.fingerprint) } });
    expect(f.count(Kind.ManifestRequest)).toBe(3);
  });

  for (const features of [false, true]) {
    it(`rejects ${features ? 'ID-mode' : 'unnegotiated'} Manifest change metadata`, async () => {
      const f = await fixture(features); await f.open(); f.notify(a, b, target, features ? 4 : 0);
      expect(f.session.state).toBe('closed');
    });
  }
});
