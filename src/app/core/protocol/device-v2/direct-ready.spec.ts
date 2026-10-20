import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2DemandOwners, DeviceV2DirectReadyQuery, DeviceV2DirectReadyReply } from './connection-demand';
import { DeviceUiConnectionScope } from '../../device-v2/connection-scope';

const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const ready = (r: DeviceV2DirectReadyQuery): DeviceV2DirectReadyReply => ({ ownerId: r.ownerId, revision: r.revision,
  status: 'ready', remainingMillis: 25000 });
const pending = (r: DeviceV2DirectReadyQuery): DeviceV2DirectReadyReply => ({ ...ready(r), status: 'pending', remainingMillis: 0 });
function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const send = vi.fn(async r => ({ ...r, status: r.action === 'release' ? 'released' : 'accepted' }));
  const query = vi.fn(async (r: DeviceV2DirectReadyQuery & { target: string }, _signal: AbortSignal) => ready(r));
  const owners = new DeviceV2DemandOwners(send, query);
  return { owners, send, query, open: (signal?: AbortSignal) => owners.acquire('ble_child', signal, 'direct') };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Direct Ready consumes the original bounded owner, not a second lease engine', () => {
  it('accepted/pending cannot open BLE, positive Ready permits acquisition and scope owns teardown', async () => {
    const f = fixture(); f.query.mockImplementationOnce(async r => pending(r));
    const connect = vi.fn(), owner = f.open();
    const scope = new DeviceUiConnectionScope(async s => { await s.hold(owner); connect(); });
    await owner.accepted; await vi.advanceTimersByTimeAsync(0);
    expect(connect).not.toHaveBeenCalled(); expect(() => owner.assertReady()).toThrow();
    await vi.advanceTimersByTimeAsync(1000); await scope.ready;
    expect(connect).toHaveBeenCalledOnce(); owner.assertReady();
    scope.close(); await scope.closed; await turn();
    expect(f.send.mock.calls.map(([r]) => r.action)).toEqual(['acquire', 'release']);
    expect(() => owner.assertReady()).toThrow(); expect(vi.getTimerCount()).toBe(0);
  });

  it('first Ready wait is bounded at the original 30 s despite accepted renewals', async () => {
    const f = fixture(); f.query.mockImplementation(async r => pending(r));
    const owner = f.open(), result = owner.ready.catch(e => e);
    await owner.accepted; await vi.advanceTimersByTimeAsync(30000);
    expect((await result).reason).toBe('timeout'); expect(await owner.closed).toBe('timeout');
    expect(f.send.mock.calls.map(([r]) => r.action)).toEqual(['acquire', 'renew', 'renew', 'release']);
    expect(f.query.mock.calls.length).toBeLessThanOrEqual(30); expect(vi.getTimerCount()).toBe(0);
  });

  it('accepted renew cannot extend a previous physical promise without a new Ready', async () => {
    const f = fixture(), owner = f.open(); await owner.accepted; await vi.advanceTimersByTimeAsync(0); await owner.ready;
    f.query.mockImplementation(async r => pending(r));
    await vi.advanceTimersByTimeAsync(10000); expect(() => owner.assertReady()).toThrow();
    await vi.advanceTimersByTimeAsync(15000); expect(await owner.closed).toBe('timeout');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('new exact Ready on renew sustains the same owner and closes its UI on session retirement', async () => {
    const f = fixture(), owner = f.open(), scope = new DeviceUiConnectionScope(s => s.hold(owner));
    await owner.accepted; await vi.advanceTimersByTimeAsync(0); await scope.ready;
    await vi.advanceTimersByTimeAsync(60001); owner.assertReady(); expect(scope.signal.aborted).toBe(false);
    expect(new Set(f.query.mock.calls.map(([r]) => r.ownerId)).size).toBe(1);
    expect(f.query.mock.calls.map(([r]) => r.revision)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    f.owners.close(); await scope.closed;
    expect(scope.signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([4000, 10000, 30000])('renews the same owner before a %i ms physical promise expires', async remainingMillis => {
    const f = fixture(); f.query.mockImplementation(async r => ({ ...ready(r), remainingMillis }));
    const owner = f.open(); await owner.accepted; await vi.advanceTimersByTimeAsync(0); await owner.ready;
    const interval = Math.min(10000, remainingMillis / 2);
    await vi.advanceTimersByTimeAsync(interval - 1); expect(f.send).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(f.send.mock.calls.at(-1)![0].action).toBe('renew');
    await vi.advanceTimersByTimeAsync(30001); owner.assertReady();
    expect(new Set(f.send.mock.calls.map(([r]) => r.ownerId)).size).toBe(1);
    owner.release(); await turn(); expect(vi.getTimerCount()).toBe(0);
  });

  it('short promise renewal acceptance cannot extend the old deadline without fresh Ready', async () => {
    const f = fixture(); f.query.mockImplementationOnce(async r => ({ ...ready(r), remainingMillis: 10000 }));
    f.query.mockImplementation(async r => pending(r));
    const owner = f.open(); await owner.accepted; await vi.advanceTimersByTimeAsync(0); await owner.ready;
    await vi.advanceTimersByTimeAsync(5000); expect(f.send.mock.calls.at(-1)![0].action).toBe('renew');
    expect(() => owner.assertReady()).toThrow(); owner.assertActive();
    await vi.advanceTimersByTimeAsync(5000); expect(await owner.closed).toBe('timeout');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('network latency consumes send-time remaining, never extends from receipt time', async () => {
    const f = fixture(), h = held<DeviceV2DirectReadyReply>();
    f.query.mockImplementation(async r => pending(r)); f.query.mockImplementationOnce(() => h.promise);
    const owner = f.open(); await owner.accepted; await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    h.resolve({ ...ready(f.query.mock.calls[0][0]), remainingMillis: 2000 }); await turn(); await owner.ready;
    await vi.advanceTimersByTimeAsync(999); owner.assertActive();
    await vi.advanceTimersByTimeAsync(1); expect(await owner.closed).toBe('timeout');
  });

  it('delayed JS scheduling cannot use an already expired Ready or extend after suspension', async () => {
    const f = fixture(), h = held<DeviceV2DirectReadyReply>(); f.query.mockImplementationOnce(() => h.promise);
    const owner = f.open(), result = owner.ready.catch(e => e); await owner.accepted; await vi.advanceTimersByTimeAsync(0);
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    h.resolve({ ...ready(f.query.mock.calls[0][0]), remainingMillis: 1000 }); await turn();
    expect((await result).reason).toBe('timeout'); expect(() => owner.assertReady()).toThrow();
    f.owners.close();
  });

  for (const mutation of [{ ownerId: 2 }, { revision: 2 }, { status: 'stale' }, { status: 'denied' },
    { status: 'pending', remainingMillis: 1 }, { remainingMillis: 0 }, { remainingMillis: 30001 }, { remainingMillis: 1.5 }]) {
    it(`rejects mismatched Ready ${JSON.stringify(mutation)} without connection or cloud fallback`, async () => {
      const f = fixture(); f.query.mockImplementation(async r => ({ ...ready(r), ...mutation }) as DeviceV2DirectReadyReply);
      const owner = f.open(), result = owner.ready.catch(e => e); await owner.accepted; await vi.advanceTimersByTimeAsync(0);
      expect((await result).reason).toBe('rejected'); await turn();
      expect(f.send.mock.calls.map(([r]) => [r.action, r.purpose])).toEqual([['acquire', 'direct'], ['release', 'direct']]);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('cancel during query aborts exact request and ignores late positive response', async () => {
    const f = fixture(), h = held<DeviceV2DirectReadyReply>(); f.query.mockImplementation(() => h.promise);
    const owner = f.open(), result = owner.ready.catch(e => e); await owner.accepted; await vi.advanceTimersByTimeAsync(0);
    owner.release(); expect((await result).reason).toBe('cancelled'); expect(f.query.mock.calls[0][1].aborted).toBe(true);
    h.resolve(ready(f.query.mock.calls[0][0])); await vi.advanceTimersByTimeAsync(60000);
    expect(f.query).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('ignored query cancellation retains the existing shared request quota until real settlement', async () => {
    const f = fixture(), h = held<DeviceV2DirectReadyReply>(); f.query.mockImplementation(() => h.promise);
    for (let i = 0; i < 16; ++i) {
      const owner = f.open(); await owner.accepted; await vi.advanceTimersByTimeAsync(0); owner.release(); await turn();
    }
    expect(() => f.owners.acquire('another_child')).toThrow('capacity');
    expect(f.query).toHaveBeenCalledTimes(16);
    await vi.advanceTimersByTimeAsync(60000); expect(() => f.open()).toThrow('capacity');
    h.resolve(ready({ ownerId: 1, revision: 1 })); await turn();
    const cloud = f.owners.acquire('another_child'); await cloud.accepted; f.owners.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a non-cooperative Ready query times out at 5 s, not at a new owner lease', async () => {
    const f = fixture(), h = held<DeviceV2DirectReadyReply>(); f.query.mockImplementation(() => h.promise);
    const owner = f.open(), result = owner.ready.catch(e => e); await owner.accepted;
    await vi.advanceTimersByTimeAsync(5000); expect((await result).reason).toBe('timeout');
    expect(f.send.mock.calls.map(([r]) => r.action)).toEqual(['acquire', 'release']);
    h.resolve(ready(f.query.mock.calls[0][0])); await turn(); expect(vi.getTimerCount()).toBe(0);
  });
});
