import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DeviceV2BleService } from './device-v2-ble.service';
import { BleApplicationMode } from '../device-v2/ble-direct';

const id = 'ble_ASNFZ4mrze8BI0VniavN7w';
const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const changed = new Subject<void>(), data = { sessionEpoch: 1, auth: { uuid: 'a' }, user: { id: 'a' },
    authDataChanged: changed, getDevice: () => ({ deviceType: 'ble', cloudEnabled: true }) };
  const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any);
  const context = (service as any).accountContext();
  const abort = new AbortController();
  const admission = { signal: abort.signal, assertAcquire: vi.fn(), assertActive: vi.fn(), onClosed: vi.fn() };
  const credential = { state: 'active', logicalDeviceId: id, deviceInstanceId: new Uint8Array(16), accessEpoch: 1,
    controllerId: new Uint8Array(16), controllerSecret: new Uint8Array(32), credentialVersion: 1, permissions: 15,
    presenceKeys: [] };
  const load = vi.fn(async () => structuredClone(credential));
  vi.spyOn(service as any, 'credentialStore').mockReturnValue({ load, replacePresenceKeys: vi.fn() });
  const target = { device: { deviceId: 'expected' }, profile: { mode: BleApplicationMode.Direct, wireVersion: 3,
    capabilities: 0x51, modeLocator: new Uint8Array(8).fill(1) } };
  const discover = vi.spyOn(service as any, 'discoverDirect').mockResolvedValue(target);
  let fail!: (reason?: unknown) => void;
  const session = { state: 'ready', logicalDeviceId: id, close: vi.fn(async () => { session.state = 'closed'; }),
    synchronize: vi.fn(async () => undefined), command: vi.fn(async () => undefined),
    subscribeErrors: (listener: typeof fail) => { fail = listener; return () => undefined; },
    subscribeClosed: () => () => undefined,
    store: { subscribe: () => () => undefined, subscribeEvents: () => () => undefined,
      snapshot: () => ({ manifestAccepted: false }) },
  };
  const connect = vi.fn(async () => session);
  const client = vi.spyOn(service as any, 'client').mockReturnValue({ connect });
  const open = () => service.ensureReady(id, 5000, context, admission);
  return { service, data, changed, context, abort, admission, credential, load, target, discover, session, connect, client, open,
    fault: () => fail(Error('native disconnected')) };
}

describe('production BLE service admission/cancellation boundary', () => {
  it('BLE-origin native WiFi commands use ordinary Direct without gateway takeover', async () => {
    const f = fixture();
    vi.spyOn(f.data, 'getDevice').mockReturnValue({ deviceType: 'ble', cloudEnabled: true, gatewayRouted: false } as any);
    await f.service.command(id, 'button', null);
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.session.command).toHaveBeenCalledOnce();
    await f.service.disconnect(id);
  });
  it('late cleanup for an old admission cannot close a successor with the same logical id', async () => {
    const f = fixture(); await f.open();
    await f.service.disconnect(id, { ...f.admission });
    expect(f.session.close).not.toHaveBeenCalled();
    await f.service.disconnect(id, f.admission); expect(f.session.close).toHaveBeenCalledOnce();
  });
  it('forwards the actual native acquisition notification, without treating discovery as acquisition', async () => {
    const f = fixture(), onAcquire = vi.fn(); (f.admission as any).onAcquire = onAcquire;
    await f.open(); expect(onAcquire).not.toHaveBeenCalled();
    (f.client.mock.calls[0][0] as any).admission.onAcquire(); expect(onAcquire).toHaveBeenCalledOnce();
    await f.service.disconnect(id);
  });
  it('cancelled opening cannot mask failed native release as a successful disconnect', async () => {
    const f = fixture(), pending = held<void>();
    f.connect.mockImplementationOnce(async () => { await pending.promise; throw Error('BLE_DIRECT_NATIVE_RELEASE_FAILED'); });
    const opening = f.open().catch(e => e); await turn();
    const closing = f.service.disconnect(id).catch(e => e); pending.resolve();
    expect(await closing).toMatchObject({ message: 'BLE_DIRECT_NATIVE_RELEASE_FAILED' });
    expect(await opening).toMatchObject({ message: 'BLE_DIRECT_NATIVE_RELEASE_FAILED' });
  });
  it('disconnect waits for the cancelled opening and its late session cleanup', async () => {
    const f = fixture(), connected = held<any>(), released = held<void>();
    f.connect.mockReturnValueOnce(connected.promise);
    f.session.close.mockReturnValueOnce(released.promise);
    const open = f.open().catch(e => e); await turn();
    let done = false; const closing = f.service.disconnect(id).then(() => { done = true; });
    await turn(); expect(done).toBe(false); connected.resolve(f.session); await turn();
    expect(f.session.close).toHaveBeenCalledOnce(); expect(done).toBe(false);
    released.resolve(); await closing; await open; expect(done).toBe(true);
  });
  it('failed native close retains the service barrier across retry and account replacement', async () => {
    const f = fixture(); await f.open();
    f.session.close.mockRejectedValueOnce(Error('NATIVE_CLOSE_FAILED'));
    await expect(f.service.disconnect(id)).rejects.toThrow('NATIVE_CLOSE_FAILED');
    expect(f.admission.onClosed).toHaveBeenCalledOnce(); // Logical retirement is immediate, not release.
    await expect(f.service.disconnect(id)).rejects.toThrow('NATIVE_CLOSE_FAILED');
    await expect(f.open()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    f.data.sessionEpoch++; f.data.auth.uuid = 'b'; f.data.user.id = 'b';
    await expect(f.service.ensureReady(id, 5000, (f.service as any).accountContext(), { ...f.admission })).rejects.toThrow('NATIVE_CLOSE_FAILED');
    expect(f.discover).toHaveBeenCalledOnce(); expect(f.connect).toHaveBeenCalledOnce();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it('account cancel during credential loading cannot advance to a scan', async () => {
    const f = fixture(), h = held<any>(); f.load.mockImplementationOnce(() => h.promise);
    const result = f.open().catch(e => e); await turn(); f.abort.abort(); h.resolve(structuredClone(f.credential));
    expect(await result).toMatchObject({ name: 'AbortError' }); expect(f.discover).not.toHaveBeenCalled();
    expect(f.client).not.toHaveBeenCalled();
  });

  it('cancel after discovery ignores a late candidate and never creates a native link', async () => {
    const f = fixture(), h = held<any>(); f.discover.mockReturnValueOnce(h.promise);
    const result = f.open().catch(e => e); await turn(); f.abort.abort(); h.resolve(f.target);
    expect(await result).toMatchObject({ name: 'AbortError' }); expect(f.client).not.toHaveBeenCalled();
  });

  it('passes the original admission to the actual link and forbids an unlocated v2 candidate', async () => {
    const f = fixture(); await f.open();
    const linkAdmission = (f.client.mock.calls[0][0] as any).admission;
    expect(linkAdmission.signal).toBe(f.admission.signal);
    linkAdmission.assertAcquire(); expect(f.admission.assertAcquire).toHaveBeenCalled();
    linkAdmission.assertActive(); expect(f.admission.assertActive).toHaveBeenCalled();
    const matcher = f.discover.mock.calls[0][3] as (target: any) => Promise<boolean>;
    expect(await matcher({ ...f.target, profile: { ...f.target.profile, wireVersion: 2 } })).toBe(false);
    await f.service.disconnect(id);
  });

  it('same admission reuses a session; a different admission cannot adopt its physical link', async () => {
    const f = fixture(); await f.open(); await f.open(); expect(f.connect).toHaveBeenCalledOnce();
    expect(f.session.synchronize).toHaveBeenCalledOnce();
    expect(() => f.service.ensureReady(id, 5000, f.context, { ...f.admission })).toThrow('BLE_DIRECT_CONNECTION_OWNED');
    await f.service.disconnect(id); expect(f.admission.onClosed).toHaveBeenCalledOnce();
  });

  it('native session loss retires the original scope and must finish closing before a new scan', async () => {
    const f = fixture(), h = held<void>(); await f.open(); f.session.close.mockImplementationOnce(() => h.promise);
    f.fault(); expect(f.admission.onClosed).toHaveBeenCalledOnce();
    const next = f.service.ensureReady(id, 5000, f.context, { ...f.admission }).catch(e => e); await turn();
    expect(f.discover).toHaveBeenCalledOnce(); h.resolve(); await next; expect(f.discover).toHaveBeenCalledTimes(2);
    await f.service.disconnect(id);
  });

  it('account replacement does not free an unfinished native open for another account', async () => {
    const f = fixture(), h = held<any>(); f.connect.mockReturnValueOnce(h.promise);
    const old = f.open().catch(e => e); await turn();
    f.data.sessionEpoch++; f.data.auth.uuid = 'b'; f.data.user.id = 'b'; f.changed.next();
    const newContext = (f.service as any).accountContext();
    const next = f.service.ensureReady(id, 5000, newContext, { ...f.admission }).catch(e => e); await turn();
    expect(f.connect).toHaveBeenCalledOnce(); h.resolve(f.session); await old; await next;
    expect(f.connect).toHaveBeenCalledTimes(2); await f.service.disconnect(id);
  });

  it('managed-child commands and pending PresenceKey maintenance never implicitly acquire BLE', async () => {
    const f = fixture(), acquire = vi.spyOn(f.service, 'ensureReady');
    await expect(f.service.command(id, 'button', null)).rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    await expect(f.service.commandConnected(id, 'button', null)).rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    const bundle = { logicalDeviceId: id, current: { deviceConfirmed: false, accessEpoch: 1, version: 1, key: new Uint8Array(16) } };
    await expect((f.service as any).installPresenceBundle(bundle, f.context, {})).rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    expect(acquire).not.toHaveBeenCalled(); expect(f.discover).not.toHaveBeenCalled();
  });

  it('existing scoped commands check live duration without using new-acquisition permission', async () => {
    const f = fixture(); await f.open(); f.admission.assertAcquire.mockImplementation(() => { throw Error('RENEW_PENDING'); });
    await f.service.commandConnected(id, 'button', null); expect(f.session.command).toHaveBeenCalledOnce();
    f.admission.assertActive.mockImplementation(() => { throw Error('EXPIRED'); });
    await expect(f.service.commandConnected(id, 'button', null)).rejects.toThrow('EXPIRED');
    expect(f.session.command).toHaveBeenCalledOnce(); expect(f.connect).toHaveBeenCalledOnce(); await f.service.disconnect(id);
  });
});
