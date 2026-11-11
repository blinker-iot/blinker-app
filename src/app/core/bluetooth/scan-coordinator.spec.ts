import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanCoordinator, type ScanPort } from './scan-coordinator';

const turn = async () => { for (let i = 0; i < 15; ++i) await Promise.resolve(); };
function fixture() {
  let emit!: (value: number) => void, fail!: (error: Error) => void;
  const port: ScanPort<number> = {
    start: vi.fn(async (_id, _filter, callback, failed) => { emit = callback; fail = failed; }),
    stop: vi.fn(async () => undefined),
  };
  const scanner = new ScanCoordinator(port);
  return { port, scanner, emit: (n: number) => emit(n), fail: (e: Error) => fail(e) };
}
afterEach(() => vi.useRealTimers());

describe('one physical scan, bounded independent observation scopes', () => {
  it('shares compatible filters; one early result cannot stop the other observer', async () => {
    const f = fixture(), first = vi.fn(), second = vi.fn();
    const a = f.scanner.run(['A'], 2000, undefined, (n, done) => { first(n); done(); });
    const b = f.scanner.run(['a'], 2000, undefined, (n, done) => { second(n); if (n === 2) done(); });
    await turn(); f.emit(1); await a;
    expect(f.port.start).toHaveBeenCalledOnce(); expect(f.port.stop).not.toHaveBeenCalled();
    f.emit(2); await b; expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(2);
    expect(f.port.stop).toHaveBeenCalledOnce();
  });
  it('rejects incompatible/full/closing work without stopping another caller', async () => {
    const f = fixture(), abort = new AbortController();
    const runs = Array.from({ length: 8 }, () => f.scanner.run([], 1000, abort.signal, () => {}).catch(e => e));
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    await expect(f.scanner.run(['different'], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    await turn(); abort.abort(); await Promise.all(runs); expect(f.port.stop).toHaveBeenCalledOnce();
  });
  it('cancelling during late SDK start drains start then stop, never stops a successor', async () => {
    const f = fixture(), abort = new AbortController(); let started!: () => void, closed!: () => void;
    f.port.start = vi.fn(() => new Promise<void>(r => { started = r; }));
    f.port.stop = vi.fn(() => new Promise<void>(r => { closed = r; }));
    const work = f.scanner.run([], 1000, abort.signal, () => {}).catch(e => e);
    await turn(); abort.abort(); await turn(); expect(f.port.stop).not.toHaveBeenCalled();
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    started(); await turn(); expect(f.port.stop).toHaveBeenCalledOnce(); closed();
    expect((await work).message).toBe('BLE_SCAN_CANCELLED');
  });
  it('surfaces post-start native throttling to all observers after actual close', async () => {
    const f = fixture();
    const a = f.scanner.run([], 1000, undefined, () => {}).catch(e => e);
    const b = f.scanner.run([], 1000, undefined, () => {}).catch(e => e);
    await turn(); const error = Object.assign(Error('BLE_SCAN_THROTTLED'), { retryAfterMs: 20_000 });
    f.fail(error); expect(await a).toBe(error); expect(await b).toBe(error); expect(f.port.stop).toHaveBeenCalledOnce();
  });
  it('failure before start completion does not deadlock or leave observers', async () => {
    const f = fixture();
    f.port.start = vi.fn(async (_id, _filters, _result, fail) => { fail(Error('BLE_SCAN_PERMISSION')); throw Error('BLE_SCAN_PERMISSION'); });
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_PERMISSION');
    expect(f.port.stop).toHaveBeenCalledOnce();
  });
  it('late events cannot cross generations; background retires all observers', async () => {
    const f = fixture(), first = vi.fn(), second = vi.fn();
    const a = f.scanner.run([], 1000, undefined, first).catch(e => e); await turn();
    const oldEmit = (f.port.start as any).mock.calls[0][2];
    f.scanner.cancel(); expect((await a).message).toBe('BLE_SCAN_CANCELLED');
    const b = f.scanner.run([], 1000, undefined, (n, done) => { second(n); done(); }); await turn();
    oldEmit(1); expect(second).not.toHaveBeenCalled(); f.emit(2); await b;
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledWith(2);
  });
  it('elapsed deadline during suspended JS forbids a late observation', async () => {
    vi.useFakeTimers(); const f = fixture(), seen = vi.fn();
    const work = f.scanner.run([], 100, undefined, seen); await turn();
    await vi.advanceTimersByTimeAsync(100); f.emit(1); await work; expect(seen).not.toHaveBeenCalled();
  });
  it('failed stop fences the resource rather than starting a competing scan', async () => {
    const f = fixture(); f.port.stop = vi.fn(async () => { throw Error('SDK'); });
    const work = f.scanner.run([], 1000, undefined, (_n, done) => done()); await turn(); f.emit(1);
    await expect(work).rejects.toThrow('BLE_SCAN_CLOSE_FAILED');
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
  });
  it('pre-aborted and invalid budgets spend no native start', async () => {
    const f = fixture(), abort = new AbortController(); abort.abort();
    await expect(f.scanner.run([], 100, abort.signal, () => {})).rejects.toThrow('BLE_SCAN_CANCELLED');
    await expect(f.scanner.run([], 30001, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUDGET_INVALID');
    expect(f.port.start).not.toHaveBeenCalled();
  });

  it('hands an external SDK the scanner only after late start and physical close', async () => {
    const f = fixture(); let started!: () => void, closed!: () => void;
    f.port.start = vi.fn(() => new Promise<void>(resolve => { started = resolve; }));
    f.port.stop = vi.fn(() => new Promise<void>(resolve => { closed = resolve; }));
    const work = f.scanner.run([], 1000, undefined, () => {}).catch(error => error);
    await turn();
    let acquired = false;
    const lease = f.scanner.acquireExclusive().then(release => { acquired = true; return release; });
    await turn(); expect(f.port.stop).not.toHaveBeenCalled();
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    started(); await turn(); expect(acquired).toBe(false); expect(f.port.stop).toHaveBeenCalledOnce();
    closed(); const release = await lease;
    expect((await work).message).toBe('BLE_SCAN_CANCELLED');
    await expect(f.scanner.acquireExclusive()).rejects.toThrow('BLE_SCAN_BUSY');
    release();
  });

  it('exclusive release is idempotent and cannot release a later owner', async () => {
    const f = fixture(), first = await f.scanner.acquireExclusive();
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    first(); const second = await f.scanner.acquireExclusive(); first();
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    second();
    const work = f.scanner.run([], 1000, undefined, (_n, finish) => finish());
    await turn(); f.emit(1); await work;
    expect(f.port.start).toHaveBeenCalledOnce();
  });

  it('failed native drain denies external ownership and keeps the scanner fenced', async () => {
    const f = fixture(); f.port.stop = vi.fn(async () => { throw Error('SDK'); });
    const work = f.scanner.run([], 1000, undefined, () => {}).catch(error => error);
    await turn();
    await expect(f.scanner.acquireExclusive()).rejects.toThrow('BLE_SCAN_CLOSE_FAILED');
    expect((await work).message).toBe('BLE_SCAN_CLOSE_FAILED');
    await expect(f.scanner.run([], 1000, undefined, () => {})).rejects.toThrow('BLE_SCAN_BUSY');
    await expect(f.scanner.acquireExclusive()).rejects.toThrow('BLE_SCAN_CLOSE_FAILED');
    expect(f.port.stop).toHaveBeenCalledOnce();
  });

  it('handoff before the queued start avoids spending a native scan attempt', async () => {
    const f = fixture(), work = f.scanner.run([], 1000, undefined, () => {}).catch(error => error);
    const release = await f.scanner.acquireExclusive();
    expect((await work).message).toBe('BLE_SCAN_CANCELLED');
    expect(f.port.start).not.toHaveBeenCalled(); release();
  });
});
