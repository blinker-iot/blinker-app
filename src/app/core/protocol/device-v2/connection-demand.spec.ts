import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2DemandOwners, DeviceV2DemandReply, DeviceV2DemandRequest } from './connection-demand';

const turn = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const reply = (r: DeviceV2DemandRequest): DeviceV2DemandReply => ({ ownerId: r.ownerId, revision: r.revision,
  status: r.action === 'release' ? 'released' : 'accepted' });
function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const send = vi.fn(async (r: DeviceV2DemandRequest, _signal: AbortSignal) => reply(r));
  const query = vi.fn(async (r: { ownerId: number; revision: number; target: string }) =>
    ({ ...r, status: 'ready' as const, remainingMillis: 30000 }));
  return { send, query, owners: new DeviceV2DemandOwners(send, query) };
}

describe('session-local connection demand ownership', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('shares one owner allocator while preserving Direct purpose on acquire, renew and release', async () => {
    const f = fixture();
    const cloud = f.owners.acquire('ble_child');
    const direct = f.owners.acquire('ble_child', undefined, 'direct');
    await Promise.all([cloud.accepted, direct.accepted]);
    await vi.advanceTimersByTimeAsync(10000);
    direct.release(); await turn();
    expect(f.send.mock.calls.filter(c => c[0].ownerId === 2).map(c => [c[0].action, c[0].purpose]))
      .toEqual([['acquire', 'direct'], ['renew', 'direct'], ['release', 'direct']]);
    expect(f.send.mock.calls.filter(c => c[0].ownerId === 1).every(c => c[0].purpose === undefined)).toBe(true);
    cloud.release(); await turn(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the exact Direct owner during a pending response without falling back to cloud', async () => {
    const f = fixture(), h = held<DeviceV2DemandReply>(), abort = new AbortController();
    f.send.mockImplementationOnce(() => h.promise);
    const direct = f.owners.acquire('ble_child', abort.signal, 'direct');
    const accepted = direct.accepted.catch(error => error);
    await turn(); abort.abort(); await turn();
    expect((await accepted).reason).toBe('cancelled');
    expect(f.send.mock.calls.map(c => [c[0].action, c[0].purpose]))
      .toEqual([['acquire', 'direct'], ['release', 'direct']]);
    h.resolve(reply(f.send.mock.calls[0][0])); await vi.advanceTimersByTimeAsync(60000);
    expect(f.send).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry or turn rejected Direct priority into a cloud demand', async () => {
    const f = fixture(); f.send.mockImplementationOnce(async r => ({ ...reply(r), status: 'busy' }));
    const direct = f.owners.acquire('ble_child', undefined, 'direct');
    await expect(direct.accepted).rejects.toMatchObject({ reason: 'rejected' });
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.send.mock.calls.map(c => c[0].action)).toEqual(['acquire', 'release']);
    expect(f.send.mock.calls.every(c => c[0].purpose === 'direct')).toBe(true);
    expect(() => f.owners.acquire('ble_child', undefined, 'mesh' as 'direct')).toThrow('purpose');
  });

  it('does not send until explicitly acquired, renews and releases independent same-target owners', async () => {
    const f = fixture(); expect(f.send).not.toHaveBeenCalled();
    const a = f.owners.acquire('ble_child'), b = f.owners.acquire('ble_child');
    await Promise.all([a.accepted, b.accepted]);
    a.release(); expect(await a.closed).toBe('cancelled'); await turn();
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.send.mock.calls.map(c => [c[0].ownerId, c[0].action])).toEqual([[1, 'acquire'], [2, 'acquire'], [1, 'release'], [2, 'renew']]);
    b.release(); await turn(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancellation while acquire is in flight releases the exact owner and ignores late acknowledgment', async () => {
    const f = fixture(), h = held<DeviceV2DemandReply>(), abort = new AbortController();
    f.send.mockImplementationOnce(() => h.promise);
    const a = f.owners.acquire('ble_child', abort.signal), result = a.accepted.catch(e => e);
    await turn(); abort.abort();
    expect((await result).reason).toBe('cancelled'); expect(await a.closed).toBe('cancelled');
    await turn(); expect(f.send.mock.calls[0][1].aborted).toBe(true);
    expect(f.send.mock.calls[1][0]).toEqual({ ownerId: 1, revision: 2, action: 'release', target: 'ble_child' });
    h.resolve(reply(f.send.mock.calls[0][0])); await vi.advanceTimersByTimeAsync(60000);
    expect(f.send).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });

  it('session retirement never adopts old owners into a new account sender', async () => {
    const f = fixture(), h = held<DeviceV2DemandReply>(); f.send.mockImplementationOnce(() => h.promise);
    const a = f.owners.acquire('ble_child'), result = a.accepted.catch(e => e); await turn();
    f.owners.close(); expect((await result).reason).toBe('session-ended');
    expect(await a.closed).toBe('session-ended');
    expect(() => f.owners.acquire('ble_child')).toThrow('session-ended');
    h.resolve(reply(f.send.mock.calls[0][0])); await vi.advanceTimersByTimeAsync(60000);
    expect(f.send).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('a hung request times out at 5 s, with one release and no acquire retry queue', async () => {
    const f = fixture(), h = held<DeviceV2DemandReply>(); f.send.mockImplementationOnce(() => h.promise);
    const a = f.owners.acquire('ble_child'), result = a.accepted.catch(e => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await result).reason).toBe('timeout'); expect(await a.closed).toBe('timeout');
    h.resolve(reply(f.send.mock.calls[0][0])); await vi.advanceTimersByTimeAsync(60000);
    expect(f.send.mock.calls.map(c => c[0].action)).toEqual(['acquire', 'release']);
  });

  it.each(['denied', 'stale', 'capacity', 'busy'] as const)('explicit %s reply closes the owner, never fabricates readiness', async status => {
    const f = fixture(); f.send.mockImplementationOnce(async r => ({ ...reply(r), status }));
    const a = f.owners.acquire('ble_child');
    await expect(a.accepted).rejects.toMatchObject({ reason: 'rejected' });
    expect(await a.closed).toBe('rejected'); await turn(); expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects wrong owner/revision replies and a failed renew closes an accepted owner', async () => {
    const f = fixture(); f.send.mockImplementationOnce(async r => ({ ...reply(r), ownerId: 9 }));
    const bad = f.owners.acquire('ble_child'); await expect(bad.accepted).rejects.toMatchObject({ reason: 'rejected' });
    await turn();
    const a = f.owners.acquire('ble_child'); await a.accepted;
    f.send.mockImplementationOnce(async r => ({ ...reply(r), revision: 99 }));
    await vi.advanceTimersByTimeAsync(10000);
    expect(await a.closed).toBe('rejected'); expect(vi.getTimerCount()).toBe(0);
  });

  it('browser suspension cannot issue a renew after the local lease has expired', async () => {
    const f = fixture(); const a = f.owners.acquire('ble_child'); await a.accepted;
    vi.spyOn(performance, 'now').mockReturnValue(31000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await a.closed).toBe('timeout');
    expect(f.send.mock.calls.map(c => c[0].action)).toEqual(['acquire', 'release']);
  });

  it.each([undefined, 'direct'] as const)('keeps the %s owner scheduled when a timer fires before its monotonic deadline', async purpose => {
    const f = fixture();
    const owner = purpose ? f.owners.acquire('ble_child', undefined, purpose) : f.owners.acquire('ble_child');
    await owner.accepted;
    await vi.advanceTimersByTimeAsync(9999);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(9999.5);
    await vi.advanceTimersByTimeAsync(1);
    // Timer precision is not permission to renew/query early or lose the timer.
    expect(f.send.mock.calls.map(c => c[0].action)).toEqual(['acquire']);
    expect(f.query).toHaveBeenCalledTimes(purpose ? 1 : 0);
    clock.mockRestore();
    await vi.advanceTimersByTimeAsync(30001);
    expect(f.send.mock.calls.map(c => c[0].action)).toEqual(['acquire', 'renew', 'renew', 'renew', 'renew']);
    owner.release(); await turn(); expect(vi.getTimerCount()).toBe(0);
  });

  it('a late reply is rejected before its delayed timeout callback runs', async () => {
    const f = fixture(), h = held<DeviceV2DemandReply>(); f.send.mockImplementationOnce(() => h.promise);
    const a = f.owners.acquire('ble_child'), result = a.accepted.catch(e => e); await turn();
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    h.resolve(reply(f.send.mock.calls[0][0])); await turn();
    expect((await result).reason).toBe('timeout');
    await vi.advanceTimersByTimeAsync(5000); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel churn cannot evade the limit when the sender ignores AbortSignal', async () => {
    const f = fixture(), h = held<DeviceV2DemandReply>(); f.send.mockImplementation(() => h.promise);
    for (let i = 0; i < 8; ++i) {
      const a = f.owners.acquire('ble_child'), result = a.accepted.catch(e => e);
      await turn(); a.release(); await result; await turn();
    }
    expect(f.send).toHaveBeenCalledTimes(16);
    expect(() => f.owners.acquire('ble_child')).toThrow('capacity');
    f.owners.close(); h.resolve({ ownerId: 1, revision: 1, status: 'accepted' }); await turn();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces owner capacity and pre-cancel validation without sending', async () => {
    const f = fixture(), abort = new AbortController(); abort.abort();
    expect(() => f.owners.acquire('ble_child', abort.signal)).toThrow('cancelled');
    expect(() => f.owners.acquire('../bad')).toThrow('Invalid');
    expect(() => f.owners.acquire('ble_child\n')).toThrow('Invalid');
    expect(f.send).not.toHaveBeenCalled();
    const all = Array.from({ length: 16 }, () => f.owners.acquire('ble_child'));
    await Promise.all(all.map(a => a.accepted));
    expect(() => f.owners.acquire('ble_child')).toThrow('capacity');
    f.owners.close(); expect(vi.getTimerCount()).toBe(0);
  });
});
