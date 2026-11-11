import { afterEach, expect, it, vi } from 'vitest';
import type { MdnsPlugin, MdnsService, MdnsWatchEvent } from 'capacitor-mdns';
import { LocalLanDiscovery, localLanCandidates } from './discovery';

const service = (): MdnsService => ({ name: 'untrusted-label', hostname: 'not-used.local', domain: 'local.',
  type: '_blinker-v2._tcp.', port: 8920, ipv4Addresses: ['192.168.4.2'], ipv6Addresses: [],
  txtRecord: { v: '2', path: '/bbp2', security: 'noise', locator: 'a'.repeat(32) } });
function backend() {
  let callback!: (event: MdnsWatchEvent) => void;
  const handles = [ { remove: vi.fn().mockResolvedValue(undefined) }, { remove: vi.fn().mockResolvedValue(undefined) } ];
  const port = { addListener: vi.fn(async (name, cb) => { if (name === 'discover') callback = cb; return handles[name === 'discover' ? 0 : 1]; }),
    watch: vi.fn().mockResolvedValue(undefined), unwatch: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(), removeAllListeners: vi.fn() };
  return { port: port as unknown as MdnsPlugin, mocks: port, handles, emit: (event: MdnsWatchEvent) => callback(event) };
}
afterEach(() => vi.useRealTimers());

it.each(['unwatch', 'listener'])('retains ownership when %s cleanup fails', async failure => {
  const h = backend(), owner = new AbortController(), discovery = new LocalLanDiscovery(h.port);
  if (failure === 'unwatch') h.mocks.unwatch.mockRejectedValue(Error('failed'));
  else h.handles[0]!.remove.mockRejectedValue(Error('failed'));
  const failed = expect(discovery.browse(owner.signal, vi.fn())).rejects.toThrow('LOCAL_DISCOVERY_CLEANUP_FAILED');
  await vi.waitFor(() => expect(h.mocks.watch).toHaveBeenCalled()); owner.abort(); await failed;
  await expect(discovery.browse(new AbortController().signal, vi.fn())).rejects.toThrow('LOCAL_DISCOVERY_BUSY');
  for (const handle of h.handles) expect(handle.remove).toHaveBeenCalledOnce();
});

it('only accepts the current bounded LAN profile; addresses/locator never become an identity', () => {
  expect(localLanCandidates(service())).toEqual([{ host: '192.168.4.2', port: 8920, locator: 'a'.repeat(32) }]);
  for (const change of [{ port: 80 }, { domain: 'example.org' }, { type: '_http._tcp.' },
    { txtRecord: { ...service().txtRecord, path: '/admin' } }, { txtRecord: { ...service().txtRecord, security: 'unknown' } },
    { txtRecord: { ...service().txtRecord, locator: '0'.repeat(32) } }, { ipv4Addresses: new Array(9).fill('192.168.4.2') }])
    expect(localLanCandidates({ ...service(), ...change })).toEqual([]);
  for (const host of ['localhost', '127.0.0.1', '8.8.8.8', '192.168.04.2', '192.168.4.256', '224.0.0.1'])
    expect(localLanCandidates({ ...service(), ipv4Addresses: [host] })).toEqual([]);
  expect(localLanCandidates({ ...service(), ipv4Addresses: ['192.168.4.2', '192.168.4.2'] })).toHaveLength(1);
});

it('owns only its mDNS type and reports bounded replacements/removals to the directory', async () => {
  const h = backend(), owner = new AbortController(), found = vi.fn();
  const scan = new LocalLanDiscovery(h.port).browse(owner.signal, found);
  await vi.waitFor(() => expect(h.mocks.watch).toHaveBeenCalled());
  await expect(new LocalLanDiscovery(h.port).browse(owner.signal, found)).rejects.toThrow('LOCAL_DISCOVERY_BUSY');
  expect(h.mocks.watch).toHaveBeenCalledExactlyOnceWith({ type: '_blinker-v2._tcp.', domain: 'local.',
    addressFamily: 'ipv4', timeoutMs: 10000, stopOnPause: true });
  h.emit({ action: 'added', service: service() }); expect(found).not.toHaveBeenCalled();
  h.emit({ action: 'resolved', service: service() });
  expect(found).toHaveBeenLastCalledWith({ service: 'untrusted-label', candidates: localLanCandidates(service()) });
  h.emit({ action: 'removed', service: { ...service(), port: 0, txtRecord: {} } });
  expect(found).toHaveBeenLastCalledWith({ service: 'untrusted-label', candidates: [] });
  h.emit({ action: 'removed', service: { ...service(), type: '_other._tcp.' } });
  h.emit({ action: 'resolved', service: { ...service(), name: 'a'.repeat(64) } });
  expect(found).toHaveBeenCalledTimes(2);
  owner.abort(); h.emit({ action: 'resolved', service: { ...service(), ipv4Addresses: ['192.168.4.200'] } });
  await scan;
  expect(found).toHaveBeenCalledTimes(2);
  expect(h.mocks.unwatch).toHaveBeenCalledExactlyOnceWith({ type: '_blinker-v2._tcp.', domain: 'local.', addressFamily: 'ipv4' });
  for (const handle of h.handles) expect(handle.remove).toHaveBeenCalledTimes(1);
  expect(h.mocks.close).not.toHaveBeenCalled(); expect(h.mocks.removeAllListeners).not.toHaveBeenCalled();
});

it('leaves the round budget to its owner and retires a late watch before another owner starts', async () => {
  vi.useFakeTimers();
  const h = backend(), owner = new AbortController();
  const scan = new LocalLanDiscovery(h.port).browse(owner.signal, vi.fn());
  await vi.advanceTimersByTimeAsync(10000); expect(h.mocks.unwatch).not.toHaveBeenCalled();
  owner.abort(); await scan;
  expect(h.mocks.unwatch).toHaveBeenCalledTimes(1);
  let finish!: () => void;
  h.mocks.watch.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const lateOwner = new AbortController(), late = new LocalLanDiscovery(h.port).browse(lateOwner.signal, vi.fn());
  await vi.advanceTimersByTimeAsync(0); lateOwner.abort();
  await expect(new LocalLanDiscovery(h.port).browse(new AbortController().signal, vi.fn())).rejects.toThrow('LOCAL_DISCOVERY_BUSY');
  finish(); await late; expect(h.mocks.unwatch).toHaveBeenCalledTimes(2);
});

it('a directory cancelling during an event receives no subsequent update', async () => {
  const h = backend(), owner = new AbortController(), found = vi.fn(() => owner.abort());
  const scan = new LocalLanDiscovery(h.port).browse(owner.signal, found);
  await vi.waitFor(() => expect(h.mocks.watch).toHaveBeenCalled());
  h.emit({ action: 'resolved', service: { ...service(), ipv4Addresses: ['192.168.4.2', '192.168.4.3'] } });
  h.emit({ action: 'removed', service: service() });
  await scan; expect(found).toHaveBeenCalledTimes(1);
});
