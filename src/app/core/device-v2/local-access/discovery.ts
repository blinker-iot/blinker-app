import { Mdns } from 'capacitor-mdns';
import type { MdnsPlugin, MdnsService } from 'capacitor-mdns';
import type { PluginListenerHandle } from '@capacitor/core';

const WATCH = { type: '_blinker-v2._tcp.', domain: 'local.', addressFamily: 'ipv4' as const };
const owners = new WeakSet<MdnsPlugin>();
export interface LocalLanCandidate { readonly host: string; readonly port: number; readonly locator: string; }
export interface LocalLanUpdate { readonly service: string; readonly candidates: readonly LocalLanCandidate[]; }

function privateIpv4(host: string): boolean {
  if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(host)) return false;
  const [a, b, ...rest] = host.split('.').map(Number);
  return [a!, b!, ...rest].every(value => value <= 255)
    && (a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254));
}

// TXT/IP/name are discovery hints ONLY. LocalAccessClient must still compare the
// challenged device instance with the expected cloud identity before issuing.
export function localLanCandidates(service: MdnsService): LocalLanCandidate[] {
  if (!service || service.type?.replace(/\.$/, '') !== '_blinker-v2._tcp'
    || service.domain?.replace(/\.$/, '') !== 'local' || service.port !== 8920) return [];
  const txt = service.txtRecord;
  if (!txt || Object.keys(txt).length !== 4 || txt['v'] !== '2' || txt['path'] !== '/bbp2'
    || (txt['security'] !== 'noise' && txt['security'] !== 'plain') || !/^[a-f0-9]{32}$/.test(txt['locator'] ?? '')
    || /^0+$/.test(txt['locator']!)) return [];
  if (!Array.isArray(service.ipv4Addresses) || service.ipv4Addresses.length > 8) return [];
  return [...new Set(service.ipv4Addresses.filter(host => typeof host === 'string' && privateIpv4(host)))]
    .map(host => Object.freeze({ host, port: 8920, locator: txt['locator']! }));
}

// One raw browser owned by the directory, never by individual pages. Reuse the plugin;
// never stop unrelated discovery/publications via close/removeAllListeners.
export class LocalLanDiscovery {
  constructor(private readonly port: MdnsPlugin = Mdns) {}

  async browse(signal: AbortSignal, changed: (update: LocalLanUpdate) => void): Promise<void> {
    if (owners.has(this.port)) throw new Error('LOCAL_DISCOVERY_BUSY');
    signal.throwIfAborted();
    owners.add(this.port);
    const handles: PluginListenerHandle[] = [];
    let active = true, watching = false;
    let finish!: () => void;
    let failure: Error | undefined;
    const done = new Promise<void>(resolve => { finish = () => { active = false; resolve(); }; });
    signal.addEventListener('abort', finish, { once: true });
    try {
      handles.push(await this.port.addListener('discover', event => {
        const service = event.service;
        if (!active || (event.action !== 'resolved' && event.action !== 'removed')
          || service?.type?.replace(/\.$/, '') !== '_blinker-v2._tcp'
          || service.domain?.replace(/\.$/, '') !== 'local' || typeof service.name !== 'string'
          || !service.name.length || service.name.length > 63) return;
        // Removed events need only the DNS-SD instance name, not stale TXT/IP.
        try { changed({ service: service.name.toLowerCase(),
          candidates: event.action === 'removed' ? [] : localLanCandidates(service) }); }
        catch { failure = new Error('LOCAL_DISCOVERY_CONSUMER_FAILED'); finish(); }
      }));
      if (active) handles.push(await this.port.addListener('error', event => {
        if (!active) return;
        if (event.operation === 'watch' && event.type?.replace(/\.$/, '') === '_blinker-v2._tcp') {
          failure = new Error('LOCAL_DISCOVERY_FAILED'); finish();
        }
      }));
      // Native guard survives suspended JS; the directory still owns its timer
      // and exact unwatch/listener cleanup. Other plugin consumers are untouched.
      if (active) { watching = true; await this.port.watch({ ...WATCH, timeoutMs: 10000, stopOnPause: true }); }
      await done;
      if (failure) throw failure;
    } finally {
      active = false; signal.removeEventListener('abort', finish);
      let released = true;
      try {
        if (watching) await this.port.unwatch(WATCH);
      } catch {
        released = false;
      } finally {
        try {
          const removed = await Promise.allSettled(handles.map(handle => Promise.resolve().then(() => handle.remove())));
          if (removed.some(result => result.status === 'rejected')) released = false;
        }
        finally { if (released) owners.delete(this.port); }
      }
      if (!released) throw new Error('LOCAL_DISCOVERY_CLEANUP_FAILED');
    }
  }
}
