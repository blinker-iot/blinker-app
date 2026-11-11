import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2Channel, DeviceV2Session } from './session';
import type { DeviceV2DemandOwners } from './connection-demand';
import { Bbp2FrameFlag, Bbp2MessageKind } from './types';
import {
  bytesToHex, decodeConnectionDemandBody, decodeConnectionDemandStatusBody,
  decodeDirectPriorityBody, encodeDirectPriorityBody,
  decodeDirectReadyQueryBody, encodeDirectReadyStatusBody, BBP2_FEATURE_DIRECT_READY,
  decodeDeliveryBody, decodeFrame, encodeConnectionDemandBody, encodeConnectionDemandStatusBody,
  encodeDeliveryBody, encodeFrame, hexToBytes,
} from './codec';

const target = 'ble_ASNFZ4mrze8BI0VniavN7w';
const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
const sessions: DeviceV2Session[] = [];
afterEach(async () => { for (const session of sessions.splice(0)) await session.close(); vi.useRealTimers(); });

async function fixture(feature = true, direct = false, interest = false) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const messages = new Set<(frame: Uint8Array) => void>();
  const closes = new Set<() => void>();
  const routes: ReturnType<typeof decodeDeliveryBody>[] = [];
  let requestId = 0;
  const f = { routes, holdWrite: false, replyAutomatically: true };
  const emit = (payload: Uint8Array) => messages.forEach(listener => listener(payload));
  const respond = (request: typeof routes[number], changes: Partial<typeof routes[number]> = {}) => emit(encodeFrame({
    kind: Bbp2MessageKind.Delivery, flags: Bbp2FrameFlag.IsResponse, sequence: 100,
    body: encodeDeliveryBody({ ...request, messageKind: request.messageKind === Bbp2MessageKind.StateInterest
      ? Bbp2MessageKind.StateInterestStatus : request.messageKind === Bbp2MessageKind.DirectReadyQuery
      ? Bbp2MessageKind.DirectReadyStatus : request.messageKind === Bbp2MessageKind.DirectPriority
      ? Bbp2MessageKind.DirectPriorityStatus : Bbp2MessageKind.ConnectionDemandStatus,
      messageFlags: Bbp2FrameFlag.IsResponse,
      messageBody: changes.messageBody ?? (request.messageKind === Bbp2MessageKind.DirectReadyQuery
        ? encodeDirectReadyStatusBody({ ...decodeDirectReadyQueryBody(request.messageBody), status: 'ready', remainingMillis: 30000 })
        : encodeConnectionDemandStatusBody({ ...decodeConnectionDemandBody(request.messageBody),
        status: decodeConnectionDemandBody(request.messageBody).action === 'release' ? 'released' : 'accepted' })), ...changes }),
  }));
  const channel: DeviceV2Channel = {
    publish: payload => {
      const frame = decodeFrame(payload);
      if (frame.kind === Bbp2MessageKind.Hello) {
        emit(encodeFrame({ kind: Bbp2MessageKind.Hello, flags: 2, sequence: frame.sequence,
          body: hexToBytes(interest ? 'a60002018102021a002b1cc303190200041902000904'
            : direct ? 'a60002018102021a000b1cc303190200041902000904'
            : feature ? 'a60002018102021a00011cc303190200041902000904'
            : 'a6000201810202191cc303190200041902000904') }));
        emit(encodeFrame({ kind: Bbp2MessageKind.Ack, flags: 2, sequence: 2, body: hexToBytes('a10001') }));
      } else {
        const route = decodeDeliveryBody(frame.body); routes.push(route);
        if (f.replyAutomatically) respond(route);
        if (f.holdWrite) return new Promise<void>(() => undefined);
      }
      return Promise.resolve();
    },
    onMessage: listener => { messages.add(listener); return () => messages.delete(listener); },
    onClose: listener => { closes.add(listener); return () => closes.delete(listener); },
    close: async () => { closes.forEach(listener => listener()); },
  };
  const session = new DeviceV2Session(channel, undefined, { requestId: () => new Uint8Array(16).fill(++requestId) });
  sessions.push(session); await session.start();
  return { routes, options: f, session, respond,
    disconnect: () => closes.forEach(listener => listener()) };
}

describe('connection demand exact Session wire', () => {
  it('an observation gap fences an in-flight State read before applying it, with only the existing bounded restart', async () => {
    const f = await fixture(true, false, true), owner = f.session.acquireStateInterest(target)!;
    await owner.accepted;
    const original = f.session.store.snapshot(target);
    vi.spyOn(f.session.store, 'snapshot').mockReturnValue({ ...original, manifestAccepted: true, stateFresh: false,
      manifest: { revision: 1, fingerprint: 'aa'.repeat(32), fields: [{ key: 'power', id: 1, kind: 0, type: 0, access: 3 }] } } as any);
    vi.spyOn(f.session.store, 'beginState').mockImplementation(() => undefined);
    const apply = vi.spyOn(f.session.store, 'applyStatePage').mockReturnValue({ complete: true, nextCursor: 1, revision: 2 });
    f.options.replyAutomatically = false;
    const reading = f.session.ensureReady(target); await turn();
    const before = f.routes.find(r => r.messageKind === Bbp2MessageKind.StateRequest)!;
    owner.release(); await turn();
    const reply = (r: typeof before) => f.respond(r, { messageKind: Bbp2MessageKind.StatePage,
      messageFlags: Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode, messageBody: hexToBytes('a5000201000201030104a101f5') });
    reply(before); await turn(); expect(apply).not.toHaveBeenCalled();
    const reads = f.routes.filter(r => r.messageKind === Bbp2MessageKind.StateRequest);
    expect(reads).toHaveLength(2); reply(reads[1]); await reading;
    expect(apply).toHaveBeenCalledOnce(); expect(f.session.state).toBe('ready');
  });
  it('another caller borrows the accepted observation without another acquire or a false gap', async () => {
    const f = await fixture(true, false, true), a = f.session.acquireStateInterest(target)!;
    await a.accepted;
    f.options.replyAutomatically = false;
    const b = f.session.acquireStateInterest(target)!, result = b.accepted.catch(error => error);
    await result; expect(f.routes).toHaveLength(1);
    const interrupt = vi.spyOn(f.session.store, 'interruptNotifications');
    a.release(); expect(interrupt).not.toHaveBeenCalled();
    b.release(); expect(interrupt).toHaveBeenCalledOnce();
  });

  it('no accepted State owner means late Event is ignored, while solicited owner ACK still uses the same account', async () => {
    const f = await fixture(true, false, true), owner = f.session.acquireStateInterest(target)!;
    await owner.accepted;
    const old = f.routes[0];
    const manifest = { revision: 1, fingerprint: 'aa'.repeat(32), fields: [{ key: 'alarm', id: 1, kind: 2, type: 0, access: 8 }] };
    const original = f.session.store.snapshot(target);
    vi.spyOn(f.session.store, 'snapshot').mockReturnValue({ ...original, manifest, manifestAccepted: true, stateFresh: true } as any);
    const event = vi.spyOn(f.session.store, 'applyEvent').mockImplementation(() => undefined);
    const emit = () => f.respond(old, { requestId: undefined, messageKind: Bbp2MessageKind.Event,
      messageFlags: Bbp2FrameFlag.IdMode, messageBody: hexToBytes('a101f5') });
    emit(); expect(event).toHaveBeenCalledOnce();
    owner.release(); emit(); expect(event).toHaveBeenCalledOnce();
    expect(f.session.state).toBe('ready');
  });
  it('State observation is independently negotiated and uses no wake or Direct request', async () => {
    const old = await fixture(); expect(old.session.acquireStateInterest(target)).toBeUndefined();
    expect(old.routes).toHaveLength(0);
    const f = await fixture(true, true, true);
    const a = f.session.acquireStateInterest(target)!, b = f.session.acquireStateInterest(target)!;
    await Promise.all([a.accepted, b.accepted]);
    expect(f.routes.map(r => r.messageKind)).toEqual([Bbp2MessageKind.StateInterest]);
    expect(bytesToHex(f.routes[0].messageBody)).toBe('8401010100');
    const interrupt = vi.spyOn(f.session.store, 'interruptNotifications');
    a.release(); await turn(); expect(interrupt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000);
    expect(decodeConnectionDemandBody(f.routes.at(-1)!.messageBody)).toMatchObject({ ownerId: 1, revision: 2, action: 'renew' });
    b.release(); await turn(); expect(interrupt).toHaveBeenCalledOnce();
    expect(f.session.state).toBe('ready');
    const c = f.session.acquireStateInterest(target)!; await c.accepted;
    expect(interrupt).toHaveBeenCalledTimes(2); c.release();
  });

  it('State status cannot be replaced by wake status and retirement never relays to a new session', async () => {
    const f = await fixture(true, false, true); f.options.replyAutomatically = false;
    const owner = f.session.acquireStateInterest(target)!, result = owner.accepted.catch(error => error);
    await turn(); f.respond(f.routes[0], { messageKind: Bbp2MessageKind.ConnectionDemandStatus });
    expect((await result).reason).toBe('rejected');
    expect(f.routes.every(r => r.messageKind === Bbp2MessageKind.StateInterest)).toBe(true);
    f.options.replyAutomatically = true;
    const next = f.session.acquireStateInterest(target)!; await next.accepted;
    await f.session.close(); const count = f.routes.length;
    next.release(); await vi.advanceTimersByTimeAsync(60000); expect(f.routes).toHaveLength(count);
  });
  it('negotiates reservation and Ready independently through the same owner allocator', async () => {
    const f = await fixture(true, true);
    const cloud = f.session.acquireConnectionDemand(target);
    const direct = f.session.reserveDirectPriority(target);
    await Promise.all([cloud.accepted, direct.accepted]);
    expect(f.routes.map(r => r.messageKind)).toEqual([Bbp2MessageKind.ConnectionDemand, Bbp2MessageKind.DirectPriority]);
    expect(decodeDirectPriorityBody(f.routes[1].messageBody)).toEqual({ ownerId: 2, revision: 1, action: 'acquire', purpose: 'direct' });
    expect(() => direct.assertReady()).toThrow();
    await vi.advanceTimersByTimeAsync(0);
    await direct.ready; direct.assertReady();
    expect(f.routes.at(-1)!.messageKind).toBe(Bbp2MessageKind.DirectReadyQuery);
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.routes.filter(r => r.messageKind === Bbp2MessageKind.DirectPriority).map(r => decodeDirectPriorityBody(r.messageBody).action))
      .toEqual(['acquire', 'renew']);
    direct.release(); await turn();
    expect(f.routes.at(-1)!.messageKind).toBe(Bbp2MessageKind.DirectPriority);
    expect(decodeDirectPriorityBody(f.routes.at(-1)!.messageBody).action).toBe('release');
    expect(cloud).not.toHaveProperty('ready');
    cloud.release(); await turn();
    expect(f.routes.at(-1)!.messageKind).toBe(Bbp2MessageKind.ConnectionDemand);
  });

  it('does not send an unnegotiated Direct reservation or accept a cloud status for Direct', async () => {
    const old = await fixture();
    expect(() => old.session.reserveDirectPriority(target)).toThrow('not negotiated');
    expect(old.routes).toHaveLength(0);
    const f = await fixture(true, true); f.options.replyAutomatically = false;
    const direct = f.session.reserveDirectPriority(target), result = direct.accepted.catch(error => error);
    await turn(); f.respond(f.routes[0], { messageKind: Bbp2MessageKind.ConnectionDemandStatus });
    expect((await result).reason).toBe('rejected');
    expect(f.routes.every(r => r.messageKind === Bbp2MessageKind.DirectPriority)).toBe(true);
  });

  it('uses the independent Direct codec without silently adding purpose to cloud bytes', () => {
    const request = { ownerId: 1, revision: 1, action: 'acquire' as const, purpose: 'direct' as const };
    expect(bytesToHex(encodeDirectPriorityBody(request))).toBe('8401010100');
    expect(decodeDirectPriorityBody(encodeDirectPriorityBody(request))).toEqual(request);
    expect(() => encodeDirectPriorityBody({ ...request, purpose: undefined })).toThrow();
    expect(() => decodeDirectPriorityBody(hexToBytes('840101010000'))).toThrow();
  });

  it('a reservation-only peer cannot silently authorize physical Direct', async () => {
    const f = await fixture(true, true);
    (f.session as unknown as { negotiatedFeatures: number }).negotiatedFeatures &= ~BBP2_FEATURE_DIRECT_READY;
    expect(() => f.session.reserveDirectPriority(target)).toThrow('not negotiated'); expect(f.routes).toHaveLength(0);
  });

  for (const bad of ['owner', 'revision', 'flags', 'kind', 'peer', 'request'] as const) {
    it(`Ready rejects mismatched ${bad} through the actual Session Route`, async () => {
      const f = await fixture(true, true), owner = f.session.reserveDirectPriority(target);
      const result = owner.ready.catch(error => error);
      await owner.accepted; f.options.replyAutomatically = false; await vi.advanceTimersByTimeAsync(0);
      const query = f.routes.at(-1)!;
      expect(query.messageKind).toBe(Bbp2MessageKind.DirectReadyQuery);
      const change: Partial<typeof query> = bad === 'flags' ? { messageFlags: 0 }
        : bad === 'kind' ? { messageKind: Bbp2MessageKind.DirectPriorityStatus }
        : bad === 'peer' ? { peerId: new Uint8Array(16).fill(3) }
        : bad === 'request' ? { requestId: new Uint8Array(16).fill(77) }
        : { messageBody: encodeDirectReadyStatusBody({ ownerId: bad === 'owner' ? 2 : 1,
          revision: bad === 'revision' ? 2 : 1, status: 'ready', remainingMillis: 30000 }) };
      f.respond(query, change); await vi.advanceTimersByTimeAsync(5000);
      expect((await result).reason).toBe(bad === 'request' ? 'timeout' : 'rejected');
      expect(() => owner.assertReady()).toThrow();
      expect(f.routes.some(r => r.messageKind === Bbp2MessageKind.Command)).toBe(false);
    });
  }
  it('encodes fixed canonical goldens and rejects malformed bodies', () => {
    expect(bytesToHex(encodeConnectionDemandBody({ ownerId: 1, revision: 1, action: 'acquire' }))).toBe('8401010100');
    expect(bytesToHex(encodeConnectionDemandStatusBody({ ownerId: 0xffffffff, revision: 256, status: 'capacity' })))
      .toBe('84011affffffff19010005');
    for (const body of ['83010101', '8400010100', '8401000100', '8401010000', '8401010103',
      '840101010000', '840118010100', '9f01010100ff', '84011b00000001000000000100']) {
      expect(() => decodeConnectionDemandBody(hexToBytes(body))).toThrow();
    }
    expect(() => decodeConnectionDemandStatusBody(hexToBytes('8401010106'))).toThrow();
  });

  it('cannot silently encode Direct priority as the existing cloud-only wire request', () => {
    expect(() => encodeConnectionDemandBody({ ownerId: 1, revision: 1, action: 'acquire', purpose: 'direct' }))
      .toThrow('cloud-only');
  });

  it('the current production Session cannot downgrade an internal Direct intent into cloud traffic', async () => {
    const f = await fixture();
    // Deliberately bypass the public API to test a future adapter wiring error.
    // No Direct public entry/feature is enabled by this fixture.
    const owners = (f.session as unknown as { connectionDemands: DeviceV2DemandOwners }).connectionDemands;
    const direct = owners.acquire(target, undefined, 'direct');
    await expect(direct.accepted).rejects.toMatchObject({ reason: 'rejected' });
    await turn();
    expect(f.routes).toHaveLength(0); // Neither acquire nor cleanup leaks into cloud.
  });

  it('requires explicit feature negotiation and sends nothing on an old server', async () => {
    const f = await fixture(false);
    expect(() => f.session.acquireConnectionDemand(target)).toThrow('not negotiated');
    expect(f.routes).toHaveLength(0);
  });

  it('acquires, renews and releases without implicit Manifest/State/Command', async () => {
    const f = await fixture(), owner = f.session.acquireConnectionDemand(target);
    await owner.accepted;
    expect(f.session.store.snapshot(target).manifestAccepted).toBe(false);
    await vi.advanceTimersByTimeAsync(10000); owner.release(); await turn();
    expect(f.routes.map(r => decodeConnectionDemandBody(r.messageBody).action)).toEqual(['acquire', 'renew', 'release']);
    expect(f.routes.every(r => r.messageKind === Bbp2MessageKind.ConnectionDemand && r.messageFlags === 0)).toBe(true);
    expect(new Set(f.routes.map(r => bytesToHex(r.requestId!))).size).toBe(3);
  });

  it('cancel removes the waiting Route and late acceptance cannot restart renewal', async () => {
    const f = await fixture(); f.options.replyAutomatically = false;
    const controller = new AbortController(), owner = f.session.acquireConnectionDemand(target, controller.signal);
    const result = owner.accepted.catch(error => error);
    await turn(); controller.abort(); await turn();
    expect((await result).reason).toBe('cancelled');
    expect(f.routes.map(r => decodeConnectionDemandBody(r.messageBody).action)).toEqual(['acquire', 'release']);
    f.respond(f.routes[0]); f.respond(f.routes[1]);
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.routes).toHaveLength(2);
  });

  it('pre-cancel never allocates a wire request', async () => {
    const f = await fixture(), controller = new AbortController(); controller.abort();
    expect(() => f.session.acquireConnectionDemand(target, controller.signal)).toThrow();
    await turn(); expect(f.routes).toHaveLength(0);
  });

  it('a hung channel publish is bounded and cancelled work cannot create orphan sends', async () => {
    const f = await fixture(); f.options.replyAutomatically = false; f.options.holdWrite = true;
    for (let i = 0; i < 64; ++i) {
      try {
        const owner = f.session.acquireConnectionDemand(target), result = owner.accepted.catch(error => error);
        await turn(); owner.release(); await result; await turn();
      } catch { /* Explicit capacity is expected, not an extra send queue. */ }
    }
    expect(f.routes.length).toBeLessThanOrEqual(32);
    expect(f.routes.filter(r => decodeConnectionDemandBody(r.messageBody).action === 'acquire').length).toBeLessThanOrEqual(16);
    const acquires = f.routes.filter(r => decodeConnectionDemandBody(r.messageBody).action === 'acquire').length;
    await vi.advanceTimersByTimeAsync(30000);
    // Timeouts clear logical waits, but unresolved underlying writes still own capacity.
    for (let i = 0; i < 64; ++i) {
      const owner = f.session.acquireConnectionDemand(target), result = owner.accepted.catch(error => error);
      await turn(); owner.release(); await result; await turn();
    }
    // Remaining reserved release credits may be used, never new acquire capacity.
    expect(f.routes.length).toBeLessThanOrEqual(32);
    expect(f.routes.filter(r => decodeConnectionDemandBody(r.messageBody).action === 'acquire')).toHaveLength(acquires);
  });

  it('absolute request timeout works even when publish never completes', async () => {
    const f = await fixture(); f.options.replyAutomatically = false; f.options.holdWrite = true;
    const owner = f.session.acquireConnectionDemand(target), result = owner.accepted.catch(error => error);
    await turn(); await vi.advanceTimersByTimeAsync(5000);
    expect((await result).reason).toBe('timeout');
    expect(decodeConnectionDemandBody(f.routes[1].messageBody).action).toBe('release');
  });

  it('disconnect retires old owners; a new session may start again at owner one', async () => {
    const old = await fixture(), owner = old.session.acquireConnectionDemand(target); await owner.accepted;
    old.disconnect(); expect(await owner.closed).toBe('session-ended');
    const next = await fixture(), replacement = next.session.acquireConnectionDemand(target); await replacement.accepted;
    expect(decodeConnectionDemandBody(next.routes[0].messageBody).ownerId).toBe(1);
    await vi.advanceTimersByTimeAsync(10000); expect(old.routes).toHaveLength(1);
  });

  for (const bad of ['owner', 'revision', 'flags', 'kind', 'peer'] as const) {
    it(`rejects mismatched ${bad} response without declaring accepted`, async () => {
      const f = await fixture(); f.options.replyAutomatically = false;
      const owner = f.session.acquireConnectionDemand(target), result = owner.accepted.catch(error => error);
      await turn();
      const changes: Partial<typeof f.routes[number]> = bad === 'flags' ? { messageFlags: 0 }
        : bad === 'kind' ? { messageKind: Bbp2MessageKind.Presence }
        : bad === 'peer' ? { peerId: new Uint8Array(16).fill(3) }
        : { messageBody: encodeConnectionDemandStatusBody({ ownerId: bad === 'owner' ? 2 : 1,
          revision: bad === 'revision' ? 2 : 1, status: 'accepted' }) };
      f.respond(f.routes[0], changes); expect((await result).reason).toBe('rejected');
    });
  }
});
