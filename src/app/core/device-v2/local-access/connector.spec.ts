import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalAccessConnector, LocalAccessConnectorPorts } from './connector';
import { DirectDeviceSession } from '../../protocol/device-v2/direct-session';
import { LocalLanDirectory } from './directory';
import { LocalAccessPreparationError } from './preparation-error';

const id = 'device_11111111-1111-4111-8111-111111111111';
const turn = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((r, fail) => { resolve = r; reject = fail; }),
    resolve: (value: T) => resolve(value), reject: (reason: unknown) => reject(reason) };
}
function harness(delayedScanCleanup = false) {
  let found!: Parameters<LocalAccessConnectorPorts['scan']>[1];
  let closed: (() => void) | undefined;
  const scanEnd = deferred<void>();
  const link = { close: vi.fn(async () => undefined), send: vi.fn(), receive: vi.fn() };
  let sessionLink = link;
  let closeWork: Promise<void> | undefined;
  const session = { state: 'ready', subscribeClosed: (fn: () => void) => { closed = fn; return () => undefined; },
    close: vi.fn(() => {
      session.state = 'closed';
      return closeWork ??= (async () => { await sessionLink.close(); closed?.(); })();
    }) };
  const ports = { context: vi.fn(async () => ({ securityProfile: 1 as const, logicalDeviceId: id, deviceInstanceId: new Uint8Array(16).fill(4), permissions: 3 as 1 | 3, maximumLifetimeMillis: 60000 })),
    scan: vi.fn(async (signal: AbortSignal, callback: typeof found) => {
      found = callback;
      if (!delayedScanCleanup) signal.addEventListener('abort', () => scanEnd.resolve(), { once: true });
      await scanEnd.promise;
    }), link: vi.fn(async () => link), session: vi.fn<LocalAccessConnectorPorts['session']>(async (native, _request, signal) => {
      sessionLink = native as typeof link;
      signal.addEventListener('abort', () => { void session.close().catch(() => undefined); }, { once: true });
      return session as unknown as DirectDeviceSession;
    }), randomId: () => new Uint8Array(16).fill(6) };
  const connector = new LocalAccessConnector(ports), owner = new AbortController();
  const candidate = (host = '192.168.1.2') => found({ host, port: 8920, locator: 'ab'.repeat(16) });
  return { connector, owner, ports, session, link, candidate, scanEnd };
}
afterEach(() => vi.useRealTimers());

describe('single-slot LAN connector', () => {
  it('waits for an already pending ACL retirement before opening any native link', async () => {
    vi.useFakeTimers(); const h = harness(), context = await h.ports.context(); h.ports.context.mockClear();
    h.ports.context.mockRejectedValueOnce(new LocalAccessPreparationError('pending')).mockResolvedValue(context);
    const opened = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); expect(h.ports.scan).not.toHaveBeenCalled(); expect(h.ports.link).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); h.candidate(); await opened; await h.session.close();
  });
  it('does not restart the total opening deadline after retirement', async () => {
    vi.useFakeTimers(); const h = harness(); const initial = await h.ports.context(); h.ports.context.mockClear();
    h.ports.context.mockResolvedValueOnce(initial).mockRejectedValue(new LocalAccessPreparationError('pending'));
    h.ports.session.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 29000)); throw new LocalAccessPreparationError('handover');
    });
    const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toMatchObject({ name: 'AbortError' });
    await turn(); h.candidate(); await vi.advanceTimersByTimeAsync(30000); await failed;
    expect(h.ports.link).toHaveBeenCalledOnce(); expect(h.ports.session).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('checks elapsed time even when background timer callbacks have not run', async () => {
    vi.useFakeTimers(); const h = harness(), waiting = deferred<Awaited<ReturnType<typeof h.ports.context>>>();
    const context = await h.ports.context(); h.ports.context.mockReturnValue(waiting.promise);
    let tick = 0; const clock = vi.spyOn(performance, 'now').mockImplementation(() => tick);
    try {
      const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toMatchObject({ name: 'AbortError' });
      tick = 30000; waiting.resolve(context); await failed;
      expect(h.ports.scan).not.toHaveBeenCalled(); expect(h.ports.link).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { clock.mockRestore(); }
  });
  it('closes before waiting for exact retirement and opens the same candidate with a fresh request', async () => {
    vi.useFakeTimers(); const h = harness();
    h.ports.session.mockRejectedValueOnce(new LocalAccessPreparationError('handover'));
    const initial = await h.ports.context(); h.ports.context.mockClear();
    h.ports.context.mockResolvedValueOnce(initial).mockRejectedValueOnce(new LocalAccessPreparationError('pending')).mockResolvedValue({ ...initial, permissions: 1 });
    let nextId = 10; h.ports.randomId = () => new Uint8Array(16).fill(nextId++);
    const opened = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate(); await turn();
    expect(h.link.close).toHaveBeenCalledOnce(); expect(h.ports.session).toHaveBeenCalledOnce();
    expect(h.ports.context).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); await opened;
    expect(h.ports.link.mock.calls[0]).toEqual(h.ports.link.mock.calls[1]);
    const requests = h.ports.session.mock.calls.map(call => call[1]);
    expect(requests[0]!.callerSessionId).toEqual(requests[1]!.callerSessionId);
    expect(requests[0]!.requestId).not.toEqual(requests[1]!.requestId);
    expect(requests[1]!.permissions).toBe(1); await h.session.close();
  });
  it('bounds preparation polling and does not mistake dispatch for retirement', async () => {
    vi.useFakeTimers(); const h = harness(); const initial = await h.ports.context(); h.ports.context.mockClear();
    h.ports.context.mockResolvedValueOnce(initial).mockRejectedValue(new LocalAccessPreparationError('pending'));
    h.ports.session.mockRejectedValueOnce(new LocalAccessPreparationError('handover'));
    const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('PENDING');
    await turn(); h.candidate(); await vi.advanceTimersByTimeAsync(7000); await failed;
    expect(h.ports.context).toHaveBeenCalledTimes(9); expect(h.ports.link).toHaveBeenCalledOnce();
    expect(h.ports.session).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['cancel', 'account', 'cleanup', 'identity', 'second-handover'])('stops scope preparation on %s', async reason => {
    vi.useFakeTimers(); const h = harness(); const initial = await h.ports.context(); h.ports.context.mockClear();
    let current = true;
    h.ports.session.mockRejectedValue(new LocalAccessPreparationError('handover'));
    if (reason === 'cleanup') h.link.close.mockRejectedValue(Error('native cleanup failed'));
    h.ports.context.mockResolvedValueOnce(initial).mockRejectedValueOnce(new LocalAccessPreparationError('pending'));
    if (reason === 'identity') h.ports.context.mockResolvedValue({ ...initial, deviceInstanceId: new Uint8Array(16).fill(9) });
    const failed = expect(h.connector.open(id, h.owner.signal, () => { if (!current) throw Error('account changed'); }, new Uint8Array(16).fill(5))).rejects.toThrow();
    await turn(); h.candidate(); await turn();
    if (reason === 'cancel') h.owner.abort();
    if (reason === 'account') current = false;
    await vi.advanceTimersByTimeAsync(1000); await failed;
    expect(h.ports.session).toHaveBeenCalledTimes(reason === 'second-handover' ? 2 : 1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('requires the exact pre-Grant handover marker; other failures never reopen', async () => {
    for (const error of [new LocalAccessPreparationError('pending'), Error('LOCAL_ACCESS_HANDOVER_REQUIRED'), Error('crypto failed')]) {
      const h = harness(); h.ports.session.mockRejectedValue(error);
      const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow();
      await turn(); h.candidate(); await failed; expect(h.ports.session).toHaveBeenCalledOnce(); expect(h.ports.context).toHaveBeenCalledOnce();
    }
  });
  it('does not hide failed native cleanup behind a concurrent owner cancellation', async () => {
    const h = harness();
    h.ports.link.mockImplementation(async () => {
      h.owner.abort();
      throw Object.assign(Error('cleanup failed after cancellation'), { code: 'LOCAL_WS_CLEANUP_FAILED' });
    });
    const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('cleanup failed after cancellation');
    await turn(); h.candidate(); await failed;
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('BUSY');
  });
  it('shares warmed hints without taking the browser from the foreground owner, but still proves identity', async () => {
    const h = harness(); let emit!: Parameters<ConstructorParameters<typeof LocalLanDirectory>[0]>[1];
    let nativeSignal!: AbortSignal;
    const browse = vi.fn((signal: AbortSignal, changed: typeof emit) => {
      nativeSignal = signal; emit = changed;
      return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    const directory = new LocalLanDirectory(browse), home = new AbortController();
    const warm = directory.scan(home.signal, () => undefined); await turn();
    emit({ service: 'wrong-instance', candidates: [{ host: '192.168.1.2', port: 8920, locator: 'a'.repeat(32) }] });
    emit({ service: 'target', candidates: [{ host: '192.168.1.3', port: 8920, locator: 'b'.repeat(32) }] });
    h.ports.scan.mockImplementation((signal, found) => directory.scan(signal, found));
    h.ports.session.mockRejectedValueOnce(Error('LOCAL_ACCESS_DEVICE_MISMATCH'));
    const result = await h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    expect(h.ports.context).toHaveBeenCalledOnce(); expect(h.ports.session).toHaveBeenCalledTimes(2);
    expect(browse).toHaveBeenCalledOnce();
    await result.session.close(); expect(nativeSignal.aborted).toBe(false);
    home.abort(); await warm; await directory.close();
  });
  it('can skip a dead cached address only before any Grant and after confirmed native cleanup', async () => {
    const h = harness();
    h.ports.link.mockRejectedValueOnce(Object.assign(Error('address no longer reachable'), { code: 'LOCAL_ACCESS_CANDIDATE_UNAVAILABLE' }));
    const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate(); h.candidate('192.168.1.3'); await ready;
    expect(h.ports.link).toHaveBeenCalledTimes(2); expect(h.ports.session).toHaveBeenCalledOnce();
    expect(h.ports.session.mock.calls[0]![1].targetDeviceInstanceId).toEqual(new Uint8Array(16).fill(4));
    await h.session.close();
  });
  it('bounds unavailable candidates to four and never applies the marker after session issuance starts', async () => {
    const error = Object.assign(Error('unavailable'), { code: 'LOCAL_ACCESS_CANDIDATE_UNAVAILABLE' });
    const h = harness(); h.ports.link.mockRejectedValue(error);
    const rejected = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('NOT_FOUND');
    await turn(); for (let i = 1; i <= 6; i++) h.candidate(`192.168.1.${i}`);
    await rejected; expect(h.ports.link).toHaveBeenCalledTimes(4); expect(h.ports.session).not.toHaveBeenCalled();
    const other = harness(); other.ports.session.mockRejectedValue(error);
    const failed = expect(other.connector.open(id, other.owner.signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('unavailable');
    await turn(); other.candidate(); other.candidate('192.168.1.3'); await failed;
    expect(other.ports.link).toHaveBeenCalledOnce();
  });
  it('publishes authenticated readiness during scan cleanup but joins cleanup on close', async () => {
    const h = harness(true); let connection: Awaited<ReturnType<LocalAccessConnector['open']>> | undefined;
    const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))
      .then(value => { connection = value; return value; });
    await turn(); h.candidate(); await turn();
    expect(connection?.session).toBe(h.session);
    expect(h.ports.scan.mock.calls[0]![0].aborted).toBe(true);
    expect(h.link.close).not.toHaveBeenCalled();
    let released = false;
    const closing = h.session.close().then(() => { released = true; });
    await turn();
    expect(h.link.close).toHaveBeenCalledOnce(); expect(released).toBe(false);
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('BUSY');
    h.scanEnd.resolve(); await closing; await ready;
    h.ports.context.mockRejectedValue(Error('new owner reached context'));
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('new owner reached context');
  });
  it.each(['LOCAL_DISCOVERY_CLEANUP_FAILED', 'LOCAL_DISCOVERY_FAILED'])('retires a ready lane on late %s', async error => {
    const h = harness(true);
    const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate(); await ready;
    h.scanEnd.reject(Error(error)); await turn();
    expect(h.session.state).toBe('closed'); expect(h.link.close).toHaveBeenCalledOnce();
    h.ports.context.mockRejectedValue(Error('slot released'));
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow(error === 'LOCAL_DISCOVERY_CLEANUP_FAILED' ? 'BUSY' : 'slot released');
    if (error === 'LOCAL_DISCOVERY_CLEANUP_FAILED') await expect(h.session.close()).rejects.toThrow(error);
    else await h.session.close();
  });
  it('owner cancellation closes transport immediately while discovery retirement keeps the slot fenced', async () => {
    const h = harness(true);
    const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate(); await ready;
    h.owner.abort(); await turn();
    expect(h.session.state).toBe('closed'); expect(h.link.close).toHaveBeenCalledOnce();
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('BUSY');
    h.scanEnd.resolve(); await h.session.close();
  });
  it('a native close rejection still waits for scanner cleanup and cannot release the slot', async () => {
    const h = harness(true);
    const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate(); await ready;
    h.link.close.mockRejectedValue(Error('NATIVE_CLOSE_FAILED'));
    let settled = false;
    const closing = h.session.close().catch(error => { settled = true; throw error; });
    const failed = expect(closing).rejects.toThrow('NATIVE_CLOSE_FAILED');
    await turn(); expect(settled).toBe(false);
    h.scanEnd.resolve(); await failed;
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('BUSY');
  });
  it('never publishes a late session after account/network invalidation, and joins failed preparation cleanup', async () => {
    const h = harness(true), session = deferred<DirectDeviceSession>(); let current = true;
    h.ports.session.mockReturnValue(session.promise);
    let settled = false;
    const failed = expect(h.connector.open(id, h.owner.signal, () => { if (!current) throw Error('CHANGED'); },
      new Uint8Array(16).fill(5)).finally(() => { settled = true; })).rejects.toThrow('CHANGED');
    await turn(); h.candidate(); await turn(); current = false;
    session.resolve(h.session as unknown as DirectDeviceSession); await turn();
    expect(settled).toBe(false); expect(h.link.close).toHaveBeenCalledOnce();
    h.scanEnd.resolve(); await failed;
  });
  it('cannot transfer scan ownership to a byte link that already started closing during preparation', async () => {
    const h = harness(true), createSession = h.ports.session.getMockImplementation()!;
    h.ports.session.mockImplementation(async (...args) => {
      const session = await createSession(...args);
      void args[0].close(); // Receive-loop failure may not have reached Session yet.
      return session;
    });
    const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('LOCAL_ACCESS_SESSION_CLOSED');
    await turn(); h.candidate(); await turn();
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5)))
      .rejects.toThrow('BUSY');
    h.scanEnd.resolve(); await failed; expect(h.link.close).toHaveBeenCalledOnce();
  });
  it('a discovery error with confirmed cleanup does not permanently poison the slot', async () => {
    const h = harness(); h.ports.scan.mockRejectedValue(Error('LOCAL_DISCOVERY_FAILED'));
    for (let i = 0; i < 2; i++) await expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('LOCAL_DISCOVERY_FAILED');
    expect(h.ports.context).toHaveBeenCalledTimes(2);
  });
  it('uses server identity and opens immediately on discovery; never waits out the 10s scan', async () => {
    const h = harness(); const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate();
    const result = await ready;
    expect(result.session).toBe(h.session); expect(result.permissions).toBe(3);
    expect(h.ports.session.mock.calls[0]![1]).toMatchObject({ recipientLogicalDeviceId: id,
      targetLogicalDeviceId: '', targetDeviceInstanceId: new Uint8Array(16).fill(4) });
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('LOCAL_ACCESS_BUSY');
    await result.session.close();
  });

  it('tries another candidate only for an instance mismatch before grant issuance', async () => {
    const h = harness(); h.ports.session.mockRejectedValueOnce(Error('LOCAL_ACCESS_DEVICE_MISMATCH'));
    const ready = h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5));
    await turn(); h.candidate(); h.candidate('192.168.1.3');
    await ready;
    expect(h.ports.link).toHaveBeenCalledTimes(2); expect(h.link.close).toHaveBeenCalledOnce();
    expect(h.ports.context).toHaveBeenCalledOnce(); await h.session.close();
  });

  it('grant/Noise failure cannot advance to another device or silently retry', async () => {
    const h = harness(); h.ports.session.mockRejectedValue(Error('LOCAL_ACCESS_FORBIDDEN'));
    const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('LOCAL_ACCESS_FORBIDDEN');
    await turn(); h.candidate(); h.candidate('192.168.1.3'); await failed;
    expect(h.ports.link).toHaveBeenCalledOnce(); expect(h.link.close).toHaveBeenCalledOnce();
  });

  it('fences an account/network change after native open and closes that exact link', async () => {
    const h = harness(), linked = deferred<typeof h.link>(); let current = true;
    h.ports.link.mockReturnValue(linked.promise);
    const failed = expect(h.connector.open(id, h.owner.signal, () => { if (!current) throw Error('CHANGED'); }, new Uint8Array(16).fill(5))).rejects.toThrow('CHANGED');
    await turn(); h.candidate(); await turn(); current = false; linked.resolve(h.link); await failed;
    expect(h.ports.session).not.toHaveBeenCalled(); expect(h.link.close).toHaveBeenCalledOnce();
  });

  it('waits for cancelled preparation cleanup; failed release poisons only the native slot', async () => {
    const h = harness(), closing = deferred<void>();
    h.ports.session.mockRejectedValue(Error('DENIED')); h.link.close.mockReturnValue(closing.promise);
    const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('DENIED');
    await turn(); h.candidate(); await turn();
    await expect(h.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('BUSY');
    closing.resolve(); await failed;
    const h2 = harness(); h2.ports.link.mockRejectedValue(Object.assign(Error('native failed'), { code: 'LOCAL_WS_CLEANUP_FAILED' }));
    const poisoned = expect(h2.connector.open(id, h2.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('native failed');
    await turn(); h2.candidate(); await poisoned;
    await expect(h2.connector.open(id, new AbortController().signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow('BUSY');
  });

  it('bounds empty discovery and does not wait for a candidate after owner cancellation', async () => {
    const h = harness(); const failed = expect(h.connector.open(id, h.owner.signal, () => undefined, new Uint8Array(16).fill(5))).rejects.toThrow();
    await turn(); h.owner.abort(); await failed; expect(h.ports.link).not.toHaveBeenCalled();
  });
});
