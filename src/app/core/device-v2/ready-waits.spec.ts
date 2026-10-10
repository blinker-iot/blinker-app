import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bbp2ErrorCode, DeviceV2RouteError, DeviceV2Session, DeviceV2TargetSnapshot,
  DeviceV2TargetUnavailableError } from '../protocol/device-v2';
import { DeviceV2ReadyWaits } from './ready-waits';

const id = 'device_01234567-89ab-cdef-0123-456789abcdef';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
async function drain() { for (let i = 0; i < 12; ++i) await Promise.resolve(); }
function harness() {
  let snapshot = { cloudReachable: false, stateFresh: false, manifestAccepted: true } as DeviceV2TargetSnapshot;
  const stores = new Set<(id: string, value: DeviceV2TargetSnapshot) => void>();
  const states = new Set<(state: DeviceV2Session['state']) => void>();
  const store = {
    snapshot: () => snapshot,
    subscribe: (listener: (id: string, value: DeviceV2TargetSnapshot) => void) => {
      stores.add(listener); return () => { stores.delete(listener); };
    },
  };
  const session = {
    state: 'ready' as DeviceV2Session['state'],
    subscribeState: (listener: (state: DeviceV2Session['state']) => void) => {
      states.add(listener); return () => { states.delete(listener); };
    },
    subscribePresence: vi.fn(async () => true),
    ensureReady: vi.fn(async () => { snapshot = { ...snapshot, stateFresh: true }; }),
  };
  const prepare = vi.fn(async () => session);
  const waits = new DeviceV2ReadyWaits(prepare, store);
  const online = () => {
    snapshot = { ...snapshot, cloudReachable: true };
    for (const listener of stores) listener(id, snapshot);
  };
  return { waits, prepare, session, stores, states, online };
}

describe('shared read-only ready preparation', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('coalesces callers and sends one read-only sync only after Presence becomes online', async () => {
    const h = harness();
    const first = h.waits.wait(id), second = h.waits.wait(id);
    await drain();
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(h.session.subscribePresence).toHaveBeenCalledOnce();
    expect(h.session.ensureReady).not.toHaveBeenCalled();
    h.online();
    await Promise.all([first, second]);
    expect(h.session.ensureReady).toHaveBeenCalledOnce();
    expect(h.stores.size + h.states.size).toBe(0);
  });

  it('cancels one consumer without stopping the other or the account session', async () => {
    const h = harness(), controller = new AbortController();
    const first = h.waits.wait(id, controller.signal).catch(error => error);
    const second = h.waits.wait(id);
    await drain();
    controller.abort();
    expect(await first).toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    expect(h.stores.size).toBe(1);
    h.online();
    await second;
    expect(h.session.state).toBe('ready');
  });

  it('last cancellation releases listeners and fences late read responses from a new wait', async () => {
    const h = harness(), controller = new AbortController(), late = deferred<void>();
    const pending = h.waits.wait(id, controller.signal).catch(error => error);
    h.session.ensureReady.mockImplementationOnce(() => late.promise);
    await drain();
    h.online();
    await drain();
    controller.abort();
    expect(await pending).toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    expect(h.stores.size + h.states.size).toBe(0);
    const fresh = h.waits.wait(id);
    late.resolve();
    await fresh;
    expect(h.prepare).toHaveBeenCalledTimes(2);
    expect(h.session.ensureReady).toHaveBeenCalledTimes(2);
  });

  it('later callers share the original 30 s deadline and cannot renew it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = harness();
    const first = h.waits.wait(id).catch(error => error);
    await vi.advanceTimersByTimeAsync(20_000);
    const second = h.waits.wait(id).catch(error => error);
    await vi.advanceTimersByTimeAsync(10_000);
    for (const result of await Promise.all([first, second])) expect(result.code).toBe('DEVICE_V2_READY_TIMEOUT');
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.stores.size + h.states.size).toBe(0);
  });

  it.each(['account', 'presence', 'state'])('includes a hung %s operation in the absolute deadline', async stage => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = harness(), held = deferred<any>();
    if (stage === 'account') h.prepare.mockReturnValueOnce(held.promise);
    if (stage === 'presence') h.session.subscribePresence.mockReturnValueOnce(held.promise);
    if (stage === 'state') { h.online(); h.session.ensureReady.mockReturnValueOnce(held.promise); }
    const result = h.waits.wait(id).catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'DEVICE_V2_READY_TIMEOUT' });
    held.resolve(stage === 'account' ? h.session : true);
    await drain();
    expect(h.stores.size + h.states.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects late success after suspension even before the timeout callback runs', async () => {
    const h = harness(), held = deferred<void>();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    h.online();
    h.session.ensureReady.mockReturnValueOnce(held.promise);
    const result = h.waits.wait(id).catch(error => error);
    await drain();
    now = 30_001;
    held.resolve();
    expect(await result).toMatchObject({ code: 'DEVICE_V2_READY_TIMEOUT' });
    expect(h.stores.size + h.states.size).toBe(0);
  });

  it.each([new DeviceV2TargetUnavailableError(), new DeviceV2RouteError(Bbp2ErrorCode.NegotiationRequired)])(
    'waits for real online evidence after transient readiness failure, without a polling loop', async error => {
      const h = harness();
      h.online();
      h.session.ensureReady.mockRejectedValueOnce(error);
      const result = h.waits.wait(id);
      await drain();
      expect(h.session.ensureReady).toHaveBeenCalledOnce();
      h.online(); // A subsequent authority update permits another read-only attempt.
      await result;
      expect(h.session.ensureReady).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['presence', 'state'])('surfaces %s permission failure immediately without retiring the account', async stage => {
    const h = harness(), error = new DeviceV2RouteError(Bbp2ErrorCode.CommandRejected);
    h.online();
    if (stage === 'presence') h.session.subscribePresence.mockRejectedValueOnce(error);
    else h.session.ensureReady.mockRejectedValueOnce(error);
    await expect(h.waits.wait(id)).rejects.toBe(error);
    expect(h.session.state).toBe('ready');
    expect(h.stores.size + h.states.size).toBe(0);
  });

  it.each(['session', 'account'])('retires waits when the %s changes', async source => {
    const h = harness();
    const result = h.waits.wait(id).catch(error => error);
    await drain();
    if (source === 'account') h.waits.retire();
    else { h.session.state = 'closed'; for (const listener of h.states) listener('closed'); }
    expect(await result).toMatchObject({ code: 'DEVICE_V2_READY_RETIRED' });
    h.online();
    expect(h.session.ensureReady).not.toHaveBeenCalled();
    expect(h.stores.size + h.states.size).toBe(0);
  });

  it('rejects an already cancelled caller without preparing an account', async () => {
    const h = harness(), controller = new AbortController();
    controller.abort();
    await expect(h.waits.wait(id, controller.signal)).rejects.toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it('bounds distinct target waits at 16 and releases capacity on retirement', async () => {
    const h = harness();
    const pending = Array.from({ length: 16 }, (_, i) => h.waits.wait(
      `device_${i.toString(16).padStart(8, '0')}-89ab-cdef-0123-456789abcdef`,
    ).catch(error => error));
    await expect(h.waits.wait(id)).rejects.toMatchObject({ code: 'DEVICE_V2_READY_CAPACITY' });
    h.waits.retire();
    expect((await Promise.all(pending)).every(error => error.code === 'DEVICE_V2_READY_RETIRED')).toBe(true);
    expect(h.stores.size + h.states.size).toBe(0);
  });
});
