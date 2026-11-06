import { IsolatedWiFiProvOwner } from './wifiprov-softap-stages';
import { WiFiProvSoftApAcquisition } from './wifiprov-softap-acquisition';

const session = '11111111-1111-4111-8111-111111111111';
const otherSession = '22222222-2222-4222-8222-222222222222';
const owner = (): IsolatedWiFiProvOwner => ({ kind: 'isolated-softap', version: 1, session });
const device = (id = session) => ({ name: 'fixture', transport: 'softap', security: 1, connected: true,
  capabilities: [], localOwner: { ...owner(), session: id } });
const turn = async () => { for (let i = 0; i < 20; ++i) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
const instances: WiFiProvSoftApAcquisition[] = [];
function setup() {
  const abort = new AbortController(), contextError = Error('fixture-account-or-generation-changed');
  const foregroundError = Error('fixture-not-foreground'), environment = { foreground: true, context: true };
  const ports = { signal: abort.signal, waiting: vi.fn(),
    assertContext: vi.fn(() => { if (!environment.context) throw contextError; }),
    assertForeground: vi.fn(() => { if (!environment.foreground) throw foregroundError; }) };
  const metadata = owner(), acquisition = new WiFiProvSoftApAcquisition(metadata, ports); instances.push(acquisition);
  const native = deferred<unknown>(), connected = device(), refreshed = device();
  const connect = vi.fn(() => native.promise), refresh = vi.fn(async () => refreshed);
  const start = () => { const result = acquisition.run(connect, refresh); void result.catch(() => undefined); return result; };
  return { abort, acquisition, ports, metadata, native, connect, refresh, connected, refreshed,
    environment, contextError, foregroundError, start };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const instance of instances.splice(0)) instance.cancel(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('isolated SoftAP pause-only Local acquisition', () => {
  it('keeps the normal foreground path one-shot without a second native info call', async () => {
    const f = setup(); expect(f.acquisition.pause()).toBe(false);
    const work = f.start(); expect(f.connect).toHaveBeenCalledOnce(); expect(f.acquisition.pending).toBe(true);
    f.native.resolve(f.connected); expect(await work).toBe(f.connected);
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.ports.waiting).not.toHaveBeenCalled();
    expect(f.acquisition.pending).toBe(false); expect(f.acquisition.pause()).toBe(false);
    await expect(f.start()).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_BUSY' });
    expect(f.connect).toHaveBeenCalledOnce();
  });

  it('buffers a paused result until foreground explicit continue, then refreshes the same owner once', async () => {
    const f = setup(), work = f.start();
    f.environment.foreground = false; expect(f.acquisition.pause()).toBe(true);
    f.native.resolve(f.connected); await turn();
    expect(f.acquisition.waiting).toBe(true); expect(f.acquisition.pending).toBe(true);
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.ports.waiting).toHaveBeenCalledWith(true);
    f.environment.foreground = true; await turn();
    expect(f.refresh).not.toHaveBeenCalled(); // Returning alone grants nothing.
    f.acquisition.continue(); f.acquisition.continue();
    expect(await work).toBe(f.refreshed); expect(f.refresh).toHaveBeenCalledOnce();
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.acquisition.waiting).toBe(false);
    expect(f.ports.waiting).toHaveBeenLastCalledWith(false);
  });

  it('does not prepay continue while connect is still pending or before run', async () => {
    const f = setup(); f.acquisition.continue();
    const work = f.start(); f.acquisition.pause(); f.acquisition.continue();
    f.native.resolve(f.connected); await turn();
    expect(f.acquisition.waiting).toBe(true); expect(f.refresh).not.toHaveBeenCalled();
    f.acquisition.continue(); await work; expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('a true stop/caller abort rejects pending connect and discards its late result', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause();
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    f.abort.abort(); await rejected;
    f.native.resolve(f.connected); await turn(); f.acquisition.continue();
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.pending).toBe(false);
    expect(f.acquisition.waiting).toBe(false); expect(f.connect).toHaveBeenCalledOnce();
  });

  it('cancels an explicit wait without refreshing or turning connect cancellation into UNKNOWN', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause(); f.native.resolve(f.connected); await turn();
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    f.acquisition.cancel(); await rejected; f.acquisition.continue();
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.waiting).toBe(false);
  });

  it('cannot accept continue while the strict foreground guard is false', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause(); f.native.resolve(f.connected); await turn();
    f.environment.foreground = false;
    const rejected = expect(work).rejects.toBe(f.foregroundError); f.acquisition.continue(); await rejected;
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.pending).toBe(false);
  });

  it('checks the captured context before calling native and consumes no native operation on failure', async () => {
    const f = setup(); f.environment.context = false;
    await expect(f.start()).rejects.toBe(f.contextError); expect(f.connect).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('rejects a stale account/generation outcome instead of capturing a new context after connect', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause(); f.environment.context = false;
    const rejected = expect(work).rejects.toBe(f.contextError); f.native.resolve(f.connected); await rejected;
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.waiting).toBe(false);
  });

  it('rechecks context at explicit continue before requesting fresh info', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause(); f.native.resolve(f.connected); await turn();
    f.environment.context = false;
    const rejected = expect(work).rejects.toBe(f.contextError); f.acquisition.continue(); await rejected;
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('rejects late refresh after stop without accepting its result', async () => {
    const f = setup(), fresh = deferred<ReturnType<typeof device>>(); f.refresh.mockReturnValueOnce(fresh.promise);
    const work = f.start(); f.acquisition.pause(); f.native.resolve(f.connected); await turn();
    f.acquisition.continue(); await turn(); expect(f.refresh).toHaveBeenCalledOnce();
    expect(f.acquisition.pause()).toBe(false); // Refresh is not another connect exception.
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    f.abort.abort(); await rejected; fresh.resolve(f.refreshed); await turn();
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.acquisition.pending).toBe(false);
  });

  it('preserves the original native UNKNOWN object without retry or status substitution', async () => {
    const f = setup(), work = f.start(), error = Object.assign(Error('fixture-unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
    const rejected = expect(work).rejects.toBe(error); f.native.reject(error); await rejected;
    f.acquisition.cancel(); await expect(f.start()).rejects.toBe(error);
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.refresh).not.toHaveBeenCalled();
  });

  it('fails the whole JS guard at 90 seconds and ignores a late success', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause();
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_SOFTAP_ACQUISITION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(89_999);
    expect(f.acquisition.pending).toBe(true); expect(f.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    f.native.resolve(f.connected); await turn(); f.acquisition.continue();
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.pending).toBe(false);
  });

  it('does not reset the deadline when waiting for explicit user continuation', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause();
    await vi.advanceTimersByTimeAsync(89_000); f.native.resolve(f.connected); await turn();
    expect(f.acquisition.waiting).toBe(true);
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_SOFTAP_ACQUISITION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1_000); await rejected;
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.waiting).toBe(false);
  });

  it('allows a delayed OS decision but never continues from elapsed time or foreground return', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause();
    await vi.advanceTimersByTimeAsync(25_200);
    expect(f.acquisition.pending).toBe(true); expect(f.refresh).not.toHaveBeenCalled();
    f.native.resolve(f.connected); await turn();
    expect(f.acquisition.waiting).toBe(true); expect(f.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.connect).toHaveBeenCalledOnce();
    f.acquisition.continue(); expect(await work).toBe(f.refreshed);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('still cancels immediately during the longer network-decision budget', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause();
    await vi.advanceTimersByTimeAsync(45_000);
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    f.abort.abort(); await rejected;
    f.native.resolve(f.connected); await turn(); f.acquisition.continue();
    expect(f.acquisition.pending).toBe(false); expect(f.refresh).not.toHaveBeenCalled();
    expect(f.connect).toHaveBeenCalledOnce();
  });

  it('does not start when already aborted', async () => {
    const f = setup(); f.abort.abort();
    await expect(f.start()).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    expect(f.connect).not.toHaveBeenCalled(); expect(f.acquisition.pause()).toBe(false);
  });

  it.each([
    { ...device(), localOwner: undefined }, { ...device(), localOwner: { ...owner(), session: otherSession } },
    { ...device(), connected: false }, { ...device(), transport: 'ble' }, { ...device(), security: 2 },
  ])('cannot accept an unconfirmed/foreign native connect result %j', async value => {
    const f = setup(), work = f.start(); f.native.resolve(value);
    await expect(work).rejects.toThrow(); expect(f.refresh).not.toHaveBeenCalled();
  });

  it('requires fresh matching ownership after explicit continuation, not the cached successful connect', async () => {
    const f = setup(), work = f.start(); f.acquisition.pause(); f.native.resolve(f.connected); await turn();
    f.refresh.mockResolvedValueOnce(device(otherSession));
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_ISOLATED_OWNER_REQUIRED' });
    f.acquisition.continue(); await rejected; expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('uses an immutable owner snapshot even if its caller mutates the metadata', async () => {
    const f = setup(); f.metadata.session = otherSession;
    const work = f.start(); f.native.resolve(f.connected); expect(await work).toBe(f.connected);
  });

  it('handles synchronous cancellation from the waiting notification without a stray rejection', async () => {
    const f = setup(); f.ports.waiting.mockImplementation(value => { if (value) f.acquisition.cancel(); });
    const work = f.start(); f.acquisition.pause();
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    f.native.resolve(f.connected); await rejected;
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.acquisition.waiting).toBe(false);
  });
});
