import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2LanService } from './device-v2-lan.service';
import { LocalAccessConnector } from '../device-v2/local-access/connector';
import { LocalLanDiscovery } from '../device-v2/local-access/discovery';
import { DirectDeviceSession } from '../protocol/device-v2/direct-session';
import { environment } from '../../../environments/environment';
import { API } from '../../configs/api.config';

const config = vi.hoisted(() => ({ platform: 'android', plugin: true }));
const original = { authority: API.BASE_URL, enabled: environment.deviceV2LanEnabled };
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => config.platform,
  isPluginAvailable: () => config.plugin }, registerPlugin: () => ({}) }));
vi.mock('capacitor-mdns', () => ({ Mdns: {} }));
const services: DeviceV2LanService[] = [];
const turn = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const warm = async () => { await vi.advanceTimersByTimeAsync(250); await turn(); };
function fixture() {
  const data = { auth: { uuid: 'a' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    getDevice: vi.fn(() => ({ deviceType: 'diy', cloudEnabled: true })) };
  const evidence = new BehaviorSubject({ connected: true, wifi: true, generation: 1 });
  const network = { get current() { return evidence.value; }, changes: evidence.asObservable() };
  const visibility = { active: new BehaviorSubject(true) };
  const service = new DeviceV2LanService({} as any, data as any, network as any, visibility as any);
  services.push(service);
  let signal!: AbortSignal;
  let closeListener!: () => void;
  const session = { subscribeClosed: (cb: () => void) => { closeListener = cb; } } as unknown as DirectDeviceSession;
  const open = vi.spyOn(LocalAccessConnector.prototype, 'open').mockImplementation(async (_id, owner, assert) => {
    signal = owner; assert(); return { session, permissions: 3 };
  });
  return { service, data, network, evidence, visibility, open, session, signal: () => signal, closed: () => closeListener() };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks(); Object.assign(config, { platform: 'android', plugin: true });
  Object.assign(API, { BASE_URL: 'https://lan.test' }); environment.deviceV2LanEnabled = true;
  vi.spyOn(LocalLanDiscovery.prototype, 'browse').mockImplementation(signal => new Promise<void>(resolve => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  }));
});
afterEach(async () => {
  for (const service of services.splice(0)) service.ngOnDestroy();
  await turn(); vi.useRealTimers();
  Object.assign(API, { BASE_URL: original.authority }); environment.deviceV2LanEnabled = original.enabled; vi.restoreAllMocks();
});
describe('Android LAN composition account/network lifetime', () => {
  it('keeps one caller across page/network reopen, but replaces it for a new account lifetime', async () => {
    const h = fixture(); await h.service.open('wifi-A', new AbortController().signal); h.closed();
    const first = h.open.mock.calls[0]![3].slice();
    h.evidence.next({ ...h.network.current, generation: 2 });
    await h.service.open('wifi-A', new AbortController().signal); h.closed();
    expect(h.open.mock.calls[1]![3]).toEqual(first);
    expect(h.open.mock.calls[1]![3]).not.toBe(h.open.mock.calls[0]![3]);
    h.data.sessionEpoch++;
    await h.service.open('wifi-A', new AbortController().signal); h.closed();
    expect(h.open.mock.calls[2]![3]).not.toEqual(first);
  });
  it.each(['gate', 'platform', 'plugin', 'http', 'cellular', 'child', 'hub'])('does not acquire unsupported %s', async condition => {
    const h = fixture();
    if (condition === 'gate') environment.deviceV2LanEnabled = false;
    if (condition === 'platform') config.platform = 'web';
    if (condition === 'plugin') config.plugin = false;
    if (condition === 'http') Object.assign(API, { BASE_URL: 'http://lan.test' });
    if (condition === 'cellular') h.evidence.next({ ...h.network.current, wifi: false });
    if (condition === 'child' || condition === 'hub') h.data.getDevice.mockReturnValue({ deviceType: condition === 'child' ? 'ble' : 'edge-hub', cloudEnabled: true });
    expect(h.service.available('wifi-A')).toBe(false);
    await expect(h.service.open('wifi-A', new AbortController().signal)).rejects.toThrow('UNAVAILABLE');
    expect(h.open).not.toHaveBeenCalled();
  });
  it.each(['network', 'account', 'page', 'background', 'destroy'])('retires a ready session owner immediately on %s invalidation', async cause => {
    const h = fixture(), owner = new AbortController(); await h.service.open('wifi-A', owner.signal);
    expect(h.signal().aborted).toBe(false);
    if (cause === 'network') h.evidence.next({ ...h.network.current, generation: 2 });
    if (cause === 'account') { h.data.sessionEpoch++; h.data.authDataChanged.next(); }
    if (cause === 'page') owner.abort();
    if (cause === 'background') h.visibility.active.next(false);
    if (cause === 'destroy') h.service.ngOnDestroy();
    expect(h.signal().aborted).toBe(true);
    expect(h.data.authDataChanged.observers).toHaveLength(cause === 'destroy' ? 0 : 1);
    expect(h.evidence.observers).toHaveLength(cause === 'destroy' ? 0 : 1);
  });
  it('detaches observers after a native session has actually closed', async () => {
    const h = fixture(); await h.service.open('wifi-A', new AbortController().signal);
    h.closed(); expect(h.data.authDataChanged.observers).toHaveLength(1); expect(h.evidence.observers).toHaveLength(1);
    h.service.ngOnDestroy(); expect(h.data.authDataChanged.observed).toBe(false); expect(h.evidence.observed).toBe(false);
  });
  it('warms discovery before a page without fetching context or opening native/Cloud connections', async () => {
    const h = fixture(); await warm();
    const browse = vi.mocked(LocalLanDiscovery.prototype.browse);
    expect(browse).toHaveBeenCalledOnce(); expect(h.open).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000); expect(browse.mock.calls[0]![0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60000); expect(browse).toHaveBeenCalledOnce();
    h.visibility.active.next(false); h.visibility.active.next(true); await warm();
    expect(browse).toHaveBeenCalledTimes(2);
  });
  it.each(['account', 'network', 'background'])('drops the old warm scope on %s and rejects late hints', async cause => {
    const h = fixture(); await warm(); const browse = vi.mocked(LocalLanDiscovery.prototype.browse);
    const old = (h.service as any).scope.directory;
    if (cause === 'account') { h.data.sessionEpoch++; h.data.authDataChanged.next(); }
    if (cause === 'network') h.evidence.next({ ...h.network.current, generation: 2 });
    if (cause === 'background') h.visibility.active.next(false);
    expect(browse.mock.calls[0]![0].aborted).toBe(true);
    browse.mock.calls[0]![1]({ service: 'late', candidates: [{ host: '192.168.4.2', port: 8920, locator: 'a'.repeat(32) }] });
    await expect(old.scan(new AbortController().signal, vi.fn())).rejects.toThrow('SCOPE_CLOSED');
    await warm(); expect(browse).toHaveBeenCalledTimes(cause === 'background' ? 1 : 2);
    expect(h.open).not.toHaveBeenCalled();
  });
  it('joins all previous cleanup across rapid generations before starting the latest browser', async () => {
    const browse = vi.mocked(LocalLanDiscovery.prototype.browse);
    let retired!: () => void;
    browse.mockImplementationOnce(() => new Promise<void>(resolve => { retired = resolve; }));
    const h = fixture(); await warm();
    h.visibility.active.next(false); h.visibility.active.next(true); await warm();
    h.data.sessionEpoch++; h.data.authDataChanged.next(); await warm();
    expect(browse).toHaveBeenCalledOnce(); retired(); await turn();
    expect(browse).toHaveBeenCalledTimes(2);
  });
  it('does not retry uncertain native cleanup on a new foreground or network lifetime', async () => {
    const browse = vi.mocked(LocalLanDiscovery.prototype.browse);
    browse.mockImplementationOnce(signal => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Error('LOCAL_DISCOVERY_CLEANUP_FAILED')), { once: true });
    }));
    const h = fixture(); await warm(); h.visibility.active.next(false); await turn();
    h.visibility.active.next(true); await warm(); h.evidence.next({ ...h.network.current, generation: 2 }); await warm();
    expect(browse).toHaveBeenCalledOnce();
  });
  it('coalesces resume followed by native network evidence before starting speculative discovery', async () => {
    const h = fixture(), browse = vi.mocked(LocalLanDiscovery.prototype.browse);
    await vi.advanceTimersByTimeAsync(21);
    h.evidence.next({ ...h.network.current, generation: 2 });
    await vi.advanceTimersByTimeAsync(249); expect(browse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(browse).toHaveBeenCalledOnce();
    expect((h.service as any).scope.generation).toBe(2);
  });
  it('does not delay explicit page demand or start an extra deferred warm round', async () => {
    const h = fixture();
    await h.service.open('wifi-A', new AbortController().signal);
    expect(h.open).toHaveBeenCalledOnce(); h.closed();
    await warm(); expect(LocalLanDiscovery.prototype.browse).not.toHaveBeenCalled();
  });
});
