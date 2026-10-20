import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeLocalAccessLink } from './native-link';

function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function backend() { return { open: vi.fn().mockResolvedValue(undefined), send: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn().mockResolvedValue({ data: 'AQID' }), close: vi.fn().mockResolvedValue(undefined) }; }
const owner = () => new AbortController();
afterEach(() => vi.useRealTimers());

describe('restricted native LocalAccess message adapter', () => {
  it('marks an unavailable candidate only after native open failure cleanup has completed', async () => {
    const port = backend(), pending = deferred<void>();
    port.open.mockRejectedValue(Error('LOCAL_WS_OPEN_FAILED')); port.close.mockReturnValue(pending.promise);
    let settled = false;
    const opening = NativeLocalAccessLink.open('192.168.4.2', 8920, owner().signal, port)
      .finally(() => { settled = true; });
    const rejected = expect(opening).rejects.toMatchObject({ code: 'LOCAL_ACCESS_CANDIDATE_UNAVAILABLE' });
    await vi.waitFor(() => expect(port.close).toHaveBeenCalledOnce()); expect(settled).toBe(false);
    pending.resolve(); await rejected; expect(port.send).not.toHaveBeenCalled();
  });
  it.each(['cleanup', 'cancel', 'unsupported'])('does not mark %s as a safely retired candidate', async cause => {
    const port = backend(), scope = owner();
    port.open.mockRejectedValue(Error(cause === 'unsupported' ? 'LOCAL_WS_UNAVAILABLE' : 'LOCAL_WS_OPEN_FAILED'));
    if (cause === 'cleanup') port.close.mockRejectedValue(Error('failed cleanup'));
    if (cause === 'cancel') scope.abort();
    try { await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port); throw Error('Expected failure'); }
    catch (error) {
      expect(error).not.toHaveProperty('code', 'LOCAL_ACCESS_CANDIDATE_UNAVAILABLE');
      if (cause === 'cleanup') expect(error).toHaveProperty('code', 'LOCAL_WS_CLEANUP_FAILED');
    }
  });
  it('close waits for the exact native cleanup and repeated close preserves failure', async () => {
    const port = backend(), scope = owner(), pending = deferred<void>();
    port.close.mockReturnValue(pending.promise);
    const link = await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
    const released = vi.fn(), closing = link.close(); void closing.then(released);
    expect(link.close()).toBe(closing);
    await Promise.resolve(); expect(released).not.toHaveBeenCalled();
    pending.resolve(); await closing; expect(released).toHaveBeenCalledOnce();

    const failing = backend(); failing.close.mockRejectedValue(new Error('NATIVE_CLOSE_FAILED'));
    const other = await NativeLocalAccessLink.open('192.168.4.2', 8920, owner().signal, failing);
    await expect(other.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    await expect(other.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    expect(failing.close).toHaveBeenCalledOnce();
  });

  it('uses exact native owner, binary records and closes idempotently without creating MQTT', async () => {
    const port = backend(), scope = owner();
    const link = await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
    expect(port.open).toHaveBeenCalledWith({ host: '192.168.4.2', port: 8920, id: expect.stringMatching(/^[a-f0-9]{32}$/) });
    const { id } = port.open.mock.calls[0]![0];
    await link.send(Uint8Array.of(1, 2, 3), scope.signal);
    expect(port.send).toHaveBeenCalledWith({ id, data: 'AQID' });
    expect(await link.receive(scope.signal)).toEqual(Uint8Array.of(1, 2, 3));
    scope.abort(); link.close(); expect(port.close).toHaveBeenCalledExactlyOnceWith({ id });
    await expect(link.receive(owner().signal)).rejects.toThrow('LOCAL_WS_CLOSED_OR_BUSY');
  });

  it('cancellation rejects immediately and late native open never resurrects an owner', async () => {
    const port = backend(), pending = deferred<void>(), scope = owner();
    port.open.mockReturnValue(pending.promise);
    const opening = NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
    const rejection = expect(opening).rejects.toThrow('LOCAL_WS_CLOSED');
    scope.abort(); await rejection;
    pending.resolve(); await Promise.resolve(); expect(port.close).toHaveBeenCalledTimes(1);
    const next = await NativeLocalAccessLink.open('192.168.4.2', 8920, owner().signal, backend()); next.close();
  });

  it('pre-abort never opens; open/send deadlines close only this native session', async () => {
    vi.useFakeTimers();
    const cancelled = owner(); cancelled.abort(); const unused = backend();
    await expect(NativeLocalAccessLink.open('192.168.4.2', 8920, cancelled.signal, unused)).rejects.toThrow();
    expect(unused.open).not.toHaveBeenCalled();
    const pending = deferred<void>(), openingPort = backend(); openingPort.open.mockReturnValue(pending.promise);
    const opening = NativeLocalAccessLink.open('192.168.4.2', 8920, owner().signal, openingPort);
    const rejected = expect(opening).rejects.toThrow('LOCAL_WS_CLOSED');
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    pending.resolve();
    const port = backend(), scope = owner();
    const link = await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
    port.send.mockReturnValue(new Promise(() => undefined));
    const sent = expect(link.send(Uint8Array.of(1), scope.signal)).rejects.toThrow('LOCAL_WS_CLOSED');
    await vi.advanceTimersByTimeAsync(3000); await sent;
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it('allows one concurrent send and receive, not an unbounded queue', async () => {
    const port = backend(), tx = deferred<void>(), rx = deferred<{ data: string }>(), scope = owner();
    const link = await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
    port.send.mockReturnValue(tx.promise); port.receive.mockReturnValue(rx.promise);
    const sending = link.send(Uint8Array.of(1), scope.signal), receiving = link.receive(scope.signal);
    await expect(link.send(Uint8Array.of(2), scope.signal)).rejects.toThrow('LOCAL_WS_CLOSED_OR_BUSY');
    await expect(link.receive(scope.signal)).rejects.toThrow('LOCAL_WS_CLOSED_OR_BUSY');
    tx.resolve(); rx.resolve({ data: 'AQID' }); await sending; await receiving; link.close();
  });

  it('rejects oversized/invalid bridge data and uncertain send instead of retrying', async () => {
    for (const data of ['', 'A'.repeat(564), 'AQI', 'AQI\n=', '!!!!']) {
      const port = backend(), scope = owner(); port.receive.mockResolvedValue({ data });
      const link = await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
      await expect(link.receive(scope.signal)).rejects.toThrow(); expect(port.close).toHaveBeenCalledTimes(1);
    }
    const port = backend(), scope = owner();
    const link = await NativeLocalAccessLink.open('192.168.4.2', 8920, scope.signal, port);
    await expect(link.send(new Uint8Array(421), scope.signal)).rejects.toThrow('LOCAL_WS_RECORD_SIZE');
    expect(port.send).not.toHaveBeenCalled();
    port.send.mockRejectedValue(new Error('write failed'));
    await expect(link.send(Uint8Array.of(1), scope.signal)).rejects.toThrow();
    expect(port.send).toHaveBeenCalledTimes(1); expect(port.close).toHaveBeenCalledTimes(1);
  });
});
