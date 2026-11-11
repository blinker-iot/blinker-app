import { afterEach, expect, it, vi } from 'vitest';
import { LocalLanDirectory } from './directory';
import type { LocalLanCandidate, LocalLanUpdate } from './discovery';

const turn = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const candidate = (host = '192.168.4.2', locator = 'a'.repeat(32)): LocalLanCandidate => ({ host, locator, port: 8920 });
function fixture() {
  const rounds: { signal: AbortSignal; emit: (update: LocalLanUpdate) => void; done: ReturnType<typeof deferred> }[] = [];
  let now = 0, delayed = false;
  const browse = vi.fn((signal: AbortSignal, emit: (update: LocalLanUpdate) => void) => {
    const done = deferred();
    rounds.push({ signal, emit, done });
    signal.addEventListener('abort', () => { if (!delayed) done.resolve(); }, { once: true });
    return done.promise;
  });
  const directory = new LocalLanDirectory(browse, () => now);
  const open = (found = vi.fn()) => {
    const owner = new AbortController(), work = directory.scan(owner.signal, found);
    return { owner, work, found };
  };
  return { directory, browse, rounds, open, delay: () => { delayed = true; }, advance: (ms: number) => { now += ms; } };
}
afterEach(() => vi.useRealTimers());

it('bounds reader count and never starts work for an already cancelled owner', async () => {
  const h = fixture(), cancelled = new AbortController(); cancelled.abort();
  await expect(h.directory.scan(cancelled.signal, vi.fn())).rejects.toThrow();
  expect(h.browse).not.toHaveBeenCalled();
  const readers = Array.from({ length: 16 }, () => h.open());
  await expect(h.open().work).rejects.toThrow('BUSY');
  await h.directory.close(); await Promise.all(readers.map(reader => reader.work));
});

it('scope cancellation inside a callback prevents all subsequent hint delivery', async () => {
  const h = fixture();
  const first = h.open(vi.fn(() => { void h.directory.close(); })), second = h.open(); await turn();
  h.rounds[0]!.emit({ service: 'one', candidates: [candidate(), candidate('192.168.4.3')] });
  await Promise.all([first.work, second.work]);
  expect(first.found).toHaveBeenCalledOnce(); expect(second.found).not.toHaveBeenCalled();
});

it('shares one browser; a departing page does not unwatch a still-owned foreground scan', async () => {
  const h = fixture(), home = h.open(); await turn();
  h.rounds[0]!.emit({ service: 'one', candidates: [candidate()] });
  const page = h.open(); await turn();
  expect(page.found).toHaveBeenCalledExactlyOnceWith(candidate());
  expect(h.browse).toHaveBeenCalledOnce();
  page.owner.abort(); await page.work;
  expect(h.rounds[0]!.signal.aborted).toBe(false);
  home.owner.abort(); await home.work;
  expect(h.rounds[0]!.signal.aborted).toBe(true);
  await h.directory.close();
});

it('serializes a new reader behind the last reader cleanup, including a late callback', async () => {
  const h = fixture(); h.delay();
  const first = h.open(); await turn(); first.owner.abort(); await turn();
  const next = h.open(); await turn(); expect(h.browse).toHaveBeenCalledOnce();
  h.rounds[0]!.emit({ service: 'old', candidates: [candidate()] });
  expect(next.found).not.toHaveBeenCalled();
  h.rounds[0]!.done.resolve(); await first.work; await turn();
  expect(h.browse).toHaveBeenCalledTimes(2);
  expect(next.found).not.toHaveBeenCalled();
  next.owner.abort(); await turn(); h.rounds[1]!.done.resolve(); await next.work;
  await h.directory.close();
});

it('bounds each scan round to ten seconds without a background rescan timer', async () => {
  vi.useFakeTimers(); const h = fixture(), first = h.open(); await turn();
  await vi.advanceTimersByTimeAsync(10000); await first.work;
  await vi.advanceTimersByTimeAsync(60000); expect(h.browse).toHaveBeenCalledOnce();
  const next = h.open(); await turn(); expect(h.browse).toHaveBeenCalledTimes(2);
  next.owner.abort(); await next.work; await h.directory.close();
});

it.each([14999, 15000])('serves only unexpired public hints at age %i ms and refreshes on demand', async age => {
  const h = fixture(), warm = h.open(); await turn();
  h.rounds[0]!.emit({ service: 'one', candidates: [candidate()] });
  warm.owner.abort(); await warm.work; h.advance(age);
  const page = h.open(); await turn();
  expect(page.found).toHaveBeenCalledTimes(age < 15000 ? 1 : 0);
  h.rounds[1]!.emit({ service: 'one', candidates: [candidate()] });
  expect(page.found).toHaveBeenCalledTimes(1);
  page.owner.abort(); await page.work; await h.directory.close();
});

it('invalidates removed/replaced service addresses and restart locators, not logical identities', async () => {
  const h = fixture(), warm = h.open(); await turn();
  const emit = h.rounds[0]!.emit;
  emit({ service: 'one', candidates: [candidate()] });
  emit({ service: 'one', candidates: [candidate('192.168.4.3', 'b'.repeat(32))] });
  const page = h.open(); await turn();
  expect(page.found).toHaveBeenCalledExactlyOnceWith(candidate('192.168.4.3', 'b'.repeat(32)));
  page.owner.abort(); await page.work;
  emit({ service: 'one', candidates: [] });
  const later = h.open(); await turn(); expect(later.found).not.toHaveBeenCalled();
  later.owner.abort(); await later.work; warm.owner.abort(); await warm.work; await h.directory.close();
});

it('bounds the directory and each reader to sixteen hints and keeps the newest hint for an IP reuse', async () => {
  const h = fixture(), warm = h.open(); await turn();
  for (let i = 0; i < 25; i++) h.rounds[0]!.emit({ service: `device-${i}`, candidates: [candidate(`192.168.4.${i + 1}`)] });
  expect(warm.found).toHaveBeenCalledTimes(16);
  const page = h.open(); await turn(); expect(page.found).toHaveBeenCalledTimes(16);
  page.owner.abort(); await page.work;
  h.rounds[0]!.emit({ service: 'device-0', candidates: [candidate('192.168.4.1', 'b'.repeat(32))] });
  const later = h.open(); await turn();
  expect(later.found).toHaveBeenCalledTimes(16);
  expect(later.found).toHaveBeenCalledWith(candidate('192.168.4.1', 'b'.repeat(32)));
  later.owner.abort(); await later.work; warm.owner.abort(); await warm.work; await h.directory.close();
});

it('isolates a cancelled/throwing consumer and does not emit further address hints to it', async () => {
  const h = fixture(), home = h.open(); await turn();
  const cancelled = h.open(); cancelled.found.mockImplementation(() => cancelled.owner.abort());
  const broken = h.open(vi.fn(() => { throw Error('consumer'); }));
  const rejected = expect(broken.work).rejects.toThrow('CONSUMER_FAILED');
  h.rounds[0]!.emit({ service: 'one', candidates: [candidate(), candidate('192.168.4.3')] });
  await cancelled.work; await rejected;
  expect(cancelled.found).toHaveBeenCalledOnce(); expect(broken.found).toHaveBeenCalledOnce();
  expect(home.found).toHaveBeenCalledTimes(2); expect(h.rounds[0]!.signal.aborted).toBe(false);
  home.owner.abort(); await home.work; await h.directory.close();
});

it('clears all cached and late hints on scope close; a new scope starts clean', async () => {
  const h = fixture(), first = h.open(); await turn();
  h.rounds[0]!.emit({ service: 'one', candidates: [candidate()] });
  await h.directory.close(); await first.work;
  await expect(h.open().work).rejects.toThrow('SCOPE_CLOSED');
  h.rounds[0]!.emit({ service: 'old', candidates: [candidate()] });
  const fresh = new LocalLanDirectory(h.browse), owner = new AbortController(), found = vi.fn();
  const work = fresh.scan(owner.signal, found); await turn(); expect(found).not.toHaveBeenCalled();
  owner.abort(); await work; await fresh.close();
});

it.each(['LOCAL_DISCOVERY_FAILED', 'LOCAL_DISCOVERY_CLEANUP_FAILED'])('propagates %s to readers and fences uncertain cleanup', async message => {
  const h = fixture(), first = h.open(), second = h.open();
  const rejected = [expect(first.work).rejects.toThrow(message), expect(second.work).rejects.toThrow(message)];
  await turn(); h.rounds[0]!.emit({ service: 'one', candidates: [candidate()] });
  h.rounds[0]!.done.reject(Error(message)); await Promise.all(rejected);
  const next = h.open();
  if (message.endsWith('CLEANUP_FAILED')) {
    await expect(next.work).rejects.toThrow(message);
    await expect(h.directory.close()).rejects.toThrow(message);
    expect(h.browse).toHaveBeenCalledOnce();
  } else {
    await turn(); expect(next.found).not.toHaveBeenCalled();
    expect(h.browse).toHaveBeenCalledTimes(2); next.owner.abort(); await next.work; await h.directory.close();
  }
});
