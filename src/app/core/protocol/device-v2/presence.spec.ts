import { afterEach, expect, it, vi } from 'vitest';
import { DeviceV2PresenceSubscriptions } from './presence';
import { decodePresenceLostBody, hexToBytes } from './codec';

const a = 'device_11111111-2222-4333-8444-555555555555';
const b = 'device_22222222-2222-4333-8444-555555555555';
const online = { cloudReachable: true, cloudLastSeenAt: 100 };
afterEach(() => vi.useRealTimers());
function fixture() {
  let n = 0;
  const ports = { id: () => new Uint8Array(16).fill(++n),
    request: vi.fn(async (_target: string, _id: Uint8Array, _signal: AbortSignal) => online),
    apply: vi.fn(), lost: vi.fn(), failed: vi.fn(), terminal: (error: unknown) => error === 'denied' };
  const manager = new DeviceV2PresenceSubscriptions(ports);
  return { manager, ...ports };
}

it('loss identity has exact canonical 19-byte encoding and rejects malformed/tail/zero', () => {
  const wire = hexToBytes('a1005011111111111111111111111111111111');
  expect(decodePresenceLostBody(wire)).toEqual(new Uint8Array(16).fill(0x11));
  for (let n = 0; n < wire.length; n++) expect(() => decodePresenceLostBody(wire.slice(0, n))).toThrow();
  expect(() => decodePresenceLostBody(new Uint8Array([...wire, 0]))).toThrow();
  expect(() => decodePresenceLostBody(hexToBytes('a1005000000000000000000000000000000000'))).toThrow();
  expect(() => decodePresenceLostBody(hexToBytes('a118005011111111111111111111111111111111'))).toThrow();
});

it('deduplicates initial requests and only recovers the failed target with a new identity', async () => {
  vi.useFakeTimers(); const f = fixture();
  const first = f.manager.subscribe(a); expect(f.manager.subscribe(a)).toBe(first);
  await first; await f.manager.subscribe(b);
  const id = f.request.mock.calls[0][1];
  f.manager.lost(b, id); expect(f.lost).not.toHaveBeenCalled();
  f.manager.lost(a, id); f.manager.lost(a, id);
  expect(f.lost).toHaveBeenCalledExactlyOnceWith(a);
  expect(f.manager.accepts(a)).toBe(false); expect(f.manager.accepts(b)).toBe(true);
  await vi.advanceTimersByTimeAsync(1001);
  expect(f.request.mock.calls.map(v => v[0])).toEqual([a, b, a]);
  expect(f.request.mock.calls[2][1]).not.toEqual(id); expect(f.manager.accepts(a)).toBe(true);
  f.manager.lost(a, id); expect(f.lost).toHaveBeenCalledTimes(1);
  f.manager.close();
});

it('bounds retries across repeated losses, exhaustion cannot restart itself', async () => {
  vi.useFakeTimers(); const f = fixture(); await f.manager.subscribe(a);
  f.manager.lost(a, f.request.mock.calls[0][1]);
  f.request.mockRejectedValue(new Error('transport'));
  await vi.advanceTimersByTimeAsync(20000);
  expect(f.request).toHaveBeenCalledTimes(4); expect(f.failed).toHaveBeenCalledTimes(1);
  await expect(f.manager.subscribe(a)).rejects.toThrow('transport');
  await vi.advanceTimersByTimeAsync(60000); expect(f.request).toHaveBeenCalledTimes(4);
  f.request.mockResolvedValue(online);
  await f.manager.subscribe(a, true);
  expect(f.manager.accepts(a)).toBe(true); expect(f.request).toHaveBeenCalledTimes(5);
  f.manager.close();
});

it('explicit authority denial stops retry, transport failure does not masquerade as denial', async () => {
  vi.useFakeTimers(); const f = fixture(); f.request.mockRejectedValueOnce('denied');
  await expect(f.manager.subscribe(a)).rejects.toBe('denied');
  await vi.advanceTimersByTimeAsync(60000); expect(f.request).toHaveBeenCalledTimes(1);
  f.request.mockRejectedValueOnce(new Error('network'));
  await expect(f.manager.subscribe(b)).rejects.toThrow('network');
  await vi.advanceTimersByTimeAsync(1001);
  expect(f.manager.accepts(b)).toBe(true); f.manager.close();
});

it('loss before initial response fences a non-cooperative late result', async () => {
  vi.useFakeTimers(); const f = fixture(); let resolve!: (value: typeof online) => void;
  f.request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const pending = f.manager.subscribe(a); const rejected = expect(pending).rejects.toThrow('retired');
  await Promise.resolve(); f.manager.lost(a, f.request.mock.calls[0][1]);
  await vi.advanceTimersByTimeAsync(2000); expect(f.request).toHaveBeenCalledTimes(1);
  resolve(online); await rejected; expect(f.apply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(f.request).toHaveBeenCalledTimes(2);
  f.manager.close();
});

it('close cancels pending retries and cannot apply a late result into another login', async () => {
  vi.useFakeTimers(); const f = fixture(); await f.manager.subscribe(a);
  f.manager.lost(a, f.request.mock.calls[0][1]); f.manager.close();
  await vi.advanceTimersByTimeAsync(60000); expect(f.request).toHaveBeenCalledTimes(1);
  await expect(f.manager.subscribe(b)).rejects.toThrow('closed');
});

it('recovery fanout retains at most four actual requests, even with ignored cancellation', async () => {
  vi.useFakeTimers(); const f = fixture();
  const ids = Array.from({ length: 6 }, (_, n) => `device_${String(n + 1).padStart(8, '0')}-2222-4333-8444-555555555555`);
  for (const id of ids) await f.manager.subscribe(id);
  f.request.mockImplementation(() => new Promise(() => {}));
  ids.forEach((id, i) => f.manager.lost(id, f.request.mock.calls[i][1]));
  await vi.advanceTimersByTimeAsync(60000); expect(f.request).toHaveBeenCalledTimes(10);
  f.manager.close(); await vi.advanceTimersByTimeAsync(60000); expect(f.request).toHaveBeenCalledTimes(10);
});
