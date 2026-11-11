import { afterEach, describe, expect, it, vi } from 'vitest';
import { BleOfflineOpportunity } from './offline-opportunity';
import type { BleDirectConnectionAdmission } from './transport';

const turn = async () => { for (let i = 0; i < 40; ++i) await Promise.resolve(); };
function held() { let resolve!: () => void; return { promise: new Promise<void>(r => { resolve = r; }), resolve: () => resolve() }; }
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const budget = new BleOfflineOpportunity(), signal = new AbortController(), retire = vi.fn(), permitted = vi.fn();
  let guard!: BleDirectConnectionAdmission;
  const acquire = vi.fn(async (admission: BleDirectConnectionAdmission) => { guard = admission; guard.onAcquire!(); });
  const release = vi.fn(async (_guard: BleDirectConnectionAdmission) => undefined);
  const open = (abort = signal) => budget.connect(abort.signal, permitted, retire, acquire, release);
  return { budget, signal, retire, permitted, acquire, release, open, guard: () => guard };
}
describe('single offline BLE opportunity over caller and physical cleanup', () => {
  it('starts with a full Hub opportunity and never waits or queues another caller', async () => {
    const f = fixture();
    await expect(f.open()).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    await vi.advanceTimersByTimeAsync(5999); await expect(f.open()).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    await vi.advanceTimersByTimeAsync(1); await f.open();
    await expect(f.open(new AbortController())).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    expect(f.acquire).toHaveBeenCalledOnce(); f.signal.abort(); await turn();
    expect(f.release).toHaveBeenCalledWith(f.guard()); expect(vi.getTimerCount()).toBe(0);
    await expect(f.open(new AbortController())).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
  });
  it('starts occupancy at native acquisition, never refunds on another attempt or traffic', async () => {
    const f = fixture(), scan = held();
    f.acquire.mockImplementationOnce(async g => { await scan.promise; g.onAcquire!(); });
    await vi.advanceTimersByTimeAsync(6000); const open = f.open(); await turn();
    await vi.advanceTimersByTimeAsync(14000); scan.resolve(); await open;
    await vi.advanceTimersByTimeAsync(9999); expect(f.retire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(f.retire).toHaveBeenCalledOnce(); await turn();
    expect(f.release).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('expiry is checked synchronously even when timers were suspended', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); await f.open();
    vi.spyOn(performance, 'now').mockReturnValue(16000);
    expect(() => f.guard().assertActive()).toThrow('BLE_DIRECT_OPPORTUNITY_EXPIRED');
    await turn(); expect(f.release).toHaveBeenCalledOnce();
    expect(() => f.guard().onAcquire!()).toThrow(); vi.restoreAllMocks();
  });
  it('repeated native acquisition cannot extend the first occupied budget', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); await f.open();
    await vi.advanceTimersByTimeAsync(9000); f.guard().onAcquire!(); f.guard().assertActive();
    await vi.advanceTimersByTimeAsync(1000); expect(f.retire).toHaveBeenCalledOnce(); await turn();
  });
  it('starts the quiet period only after actual cleanup, including slow SDK close', async () => {
    const f = fixture(), closing = held(); f.release.mockReturnValueOnce(closing.promise);
    await vi.advanceTimersByTimeAsync(6000); await f.open(); f.signal.abort(); await turn();
    await vi.advanceTimersByTimeAsync(20000);
    await expect(f.open(new AbortController())).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    closing.resolve(); await turn(); await vi.advanceTimersByTimeAsync(5999);
    const next = new AbortController(); await expect(f.open(next)).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    await vi.advanceTimersByTimeAsync(1); await f.open(next); next.abort(); await turn();
  });
  it('failed cleanup never gives a new page/account physical capacity', async () => {
    const f = fixture(); f.release.mockRejectedValueOnce(Error('BLE_DIRECT_NATIVE_RELEASE_FAILED'));
    await vi.advanceTimersByTimeAsync(6000); await f.open(); f.signal.abort(); await turn();
    await vi.advanceTimersByTimeAsync(100000);
    await expect(f.open(new AbortController())).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    expect(f.acquire).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancelled opening must settle its late native work before release and quiet time', async () => {
    const f = fixture(), late = held(); f.acquire.mockReturnValueOnce(late.promise);
    await vi.advanceTimersByTimeAsync(6000); const opening = f.open().catch(e => e); await turn();
    f.signal.abort(); await turn(); expect(f.release).not.toHaveBeenCalled();
    late.resolve(); await opening; expect(f.release).toHaveBeenCalledOnce();
    await expect(f.open(new AbortController())).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
  });
  it('native failure from a retired opening is not erased by a later no-op logical release', async () => {
    const f = fixture(); f.acquire.mockRejectedValueOnce(Error('BLE_DIRECT_NATIVE_RELEASE_FAILED'));
    await vi.advanceTimersByTimeAsync(6000); await expect(f.open()).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
    await vi.advanceTimersByTimeAsync(60000);
    await expect(f.open(new AbortController())).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
  });
  it('loss of permission retires without extending the physical deadline', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); await f.open();
    f.permitted.mockImplementation(() => { throw Error('OFFLINE_LOST'); });
    expect(() => f.guard().assertAcquire()).toThrow('OFFLINE_LOST'); await turn();
    expect(f.retire).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });
});
