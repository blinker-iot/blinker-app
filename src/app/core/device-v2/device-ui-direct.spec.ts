import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2DemandOwners } from '../protocol/device-v2/connection-demand';
import { BleDirectConnectionAdmission } from './ble-direct/transport';
import { DeviceUiPort } from './device-ui.port';

const id = 'ble_ASNFZ4mrze8BI0VniavN7w';
const turn = async () => { for (let i = 0; i < 40; ++i) await Promise.resolve(); };
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const cleanup: (() => void)[] = [];
afterEach(async () => { cleanup.splice(0).forEach(close => close()); await turn(); vi.useRealTimers(); vi.restoreAllMocks(); });

function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const send = vi.fn(async r => ({ ...r, status: r.action === 'release' ? 'released' : 'accepted' }));
  const owners = new DeviceV2DemandOwners(send);
  const service = {
    state: new BehaviorSubject('ready'),
    reserveDirectPriority: vi.fn(async () => { throw Error('UNEXPECTED_DIRECT_RESERVATION'); }),
    acquireConnectionDemand: vi.fn(async (_id, signal) => owners.acquire(id, signal)),
    acquireStateInterest: vi.fn(async () => undefined),
    waitUntilReady: vi.fn(async () => undefined), command: vi.fn(async () => undefined),
  };
  const connection = new BehaviorSubject<any>('nearby'), closed = vi.fn();
  let current: BleDirectConnectionAdmission | undefined;
  const ble = {
    hasActiveCredential: vi.fn(async () => true),
    canManagePresenceCredential: vi.fn(async () => true), syncPresenceCredential: vi.fn(async () => undefined),
    connectionSnapshot: () => connection.value, watchConnection: () => connection,
    watchAdapterEnabled: () => new BehaviorSubject(true), refreshPresence: vi.fn(async () => undefined),
    ensureReady: vi.fn(async (_id, _timeout, _context, guard: BleDirectConnectionAdmission) => {
      guard.assertAcquire(); guard.onAcquire?.(); current = guard;
      guard.signal.addEventListener('abort', () => {
        closed(guard);
        if (current === guard) { current = undefined; connection.next('stopped'); }
      }, { once: true });
      connection.next('ready');
    }),
    disconnect: vi.fn(async () => undefined), command: vi.fn(async () => undefined),
    commandConnected: vi.fn(async () => { if (!current) throw Error('NOT_CONNECTED'); current.assertActive(); }),
  };
  const device = { deviceType: 'ble', cloudEnabled: true, data: { cloudReachable: true }, subject: new Subject<void>() };
  const data = { sessionEpoch: 1, authDataChanged: new Subject<void>(), deviceDataLoader: new Subject<boolean>(),
    getDevice: vi.fn(() => device) };
  const active = new BehaviorSubject(true), network = new BehaviorSubject<boolean | undefined>(false);
  const connectivity = { connected: network, get offline() { return network.value === false; } };
  const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any, { active } as any, data as any,
    undefined, connectivity as any);
  const open = () => { const page = port.openConnection(id); void page.ready.catch(() => undefined); return page; };
  const start = async () => { const page = open(); await turn(); await page.ready; return page; };
  cleanup.push(() => { active.next(false); owners.close(); });
  return { port, send, service, ble, closed, connection, device, data, active, network, open, start, guard: () => current! };
}

// Online Direct priority/Ready remains a protocol capability, covered by
// direct-ready.spec.ts. Ordinary pages no longer negotiate that takeover.
describe('explicitly offline gateway-child Direct scope', () => {
  it('directory removal retires only the existing offline scope and native admission', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); const page = await f.start();
    f.data.getDevice.mockReturnValue(undefined as any); f.data.deviceDataLoader.next(true);
    await page.closed; await turn();
    expect(page.signal.aborted).toBe(true); expect(f.ble.disconnect).toHaveBeenCalledOnce();
    expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it('a cached shared directory cannot grant offline access without a current local credential', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000);
    Object.assign(f.device, { config: { isShared: true }, data: { accessRole: 'operator' } });
    f.ble.hasActiveCredential.mockResolvedValue(false);
    await expect(f.open().ready).rejects.toThrow('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    expect(f.ble.ensureReady).not.toHaveBeenCalled();
    expect(f.service.reserveDirectPriority).not.toHaveBeenCalled(); expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it('offline pages share one bounded opportunity without fabricating Broker Ready or refunding retries', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000);
    const a = f.open(), b = f.open(); await Promise.all([a.ready, b.ready]);
    expect(f.ble.ensureReady).toHaveBeenCalledOnce(); expect(f.service.reserveDirectPriority).not.toHaveBeenCalled();
    expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9999); expect(a.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await turn(); expect(a.signal.aborted && b.signal.aborted).toBe(true);
    expect(f.ble.disconnect).toHaveBeenCalledWith(id, expect.objectContaining({ onAcquire: expect.any(Function) }));
    await expect(f.open().ready).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY'); expect(f.ble.ensureReady).toHaveBeenCalledOnce();
  });

  it('network recovery closes offline Direct, with no implicit Cloud or Action replay', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); const page = await f.start();
    f.network.next(true); await page.closed; await turn();
    expect(f.ble.disconnect).toHaveBeenCalledOnce(); expect(f.service.command).not.toHaveBeenCalled();
    expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
    const next = await f.start(); // A new online caller uses MQTT, not the busy local radio.
    expect(f.service.acquireConnectionDemand).toHaveBeenCalledOnce(); expect(f.service.reserveDirectPriority).not.toHaveBeenCalled();
    expect(f.ble.ensureReady).toHaveBeenCalledOnce(); next.close();
  });

  it.each(['network', 'page', 'account'])('%s change during credential lookup cannot acquire a replacement path', async cause => {
    const f = fixture(), lookup = held<boolean>(); await vi.advanceTimersByTimeAsync(6000);
    f.ble.hasActiveCredential.mockReturnValueOnce(lookup.promise);
    const page = f.open(), result = page.ready.catch(error => error); await turn();
    if (cause === 'network') f.network.next(true);
    else if (cause === 'account') { f.data.sessionEpoch++; f.data.authDataChanged.next(); }
    else page.close();
    lookup.resolve(true); expect(await result).toBeInstanceOf(Error); await turn();
    expect(f.ble.ensureReady).not.toHaveBeenCalled(); expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it.each(['account', 'background'])('%s retirement cannot refund the next caller budget', async cause => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); const old = await f.start();
    if (cause === 'account') { f.data.sessionEpoch++; f.data.authDataChanged.next(); } else f.active.next(false);
    await old.closed; await turn(); f.active.next(true);
    await expect(f.open().ready).rejects.toThrow('BLE_DIRECT_OPPORTUNITY_BUSY');
    expect(f.ble.ensureReady).toHaveBeenCalledOnce(); expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it('two pages and a one-shot read share one physical link; only the last caller closes it', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000);
    const a = f.open(), b = f.open(), read = f.port.connect(id); await Promise.all([a.ready, b.ready, read]);
    expect(f.ble.ensureReady).toHaveBeenCalledOnce(); expect(f.send).not.toHaveBeenCalled();
    a.close(); await turn(); expect(f.closed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(b.signal.aborted).toBe(false);
    b.close(); await turn(); expect(f.closed).toHaveBeenCalledOnce(); expect(f.ble.disconnect).toHaveBeenCalledOnce();
  });

  it('a one-shot offline read releases its exact link without needing a page', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); await f.port.connect(id); await turn();
    expect(f.closed).toHaveBeenCalledOnce(); expect(f.ble.disconnect).toHaveBeenCalledOnce();
    expect(f.port.isBleDirect(id)).toBe(false); expect(f.send).not.toHaveBeenCalled();
  });

  it('native failure cannot fall back to Cloud or leave a selected BLE path', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); f.ble.ensureReady.mockRejectedValueOnce(Error('GATT_FAILED'));
    await expect(f.open().ready).rejects.toThrow('GATT_FAILED'); await turn();
    expect(f.port.isBleDirect(id)).toBe(false); expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it('cancel during native acquisition drains late work; stale ready/presence cannot reopen the page', async () => {
    const f = fixture(), pending = held<void>(); await vi.advanceTimersByTimeAsync(6000);
    const native = f.ble.ensureReady.getMockImplementation()!;
    f.ble.ensureReady.mockImplementationOnce(async (...args) => { await native(...args); await pending.promise; });
    const page = f.open(), result = page.ready.catch(error => error); await turn();
    page.close(); await result; await turn(); expect(f.closed).toHaveBeenCalledOnce();
    expect(f.ble.disconnect).not.toHaveBeenCalled();
    pending.resolve(); await turn(); expect(f.ble.disconnect).toHaveBeenCalledOnce();
    f.connection.next('ready'); await f.port.refreshBlePresence([id]);
    expect(f.port.isBleDirect(id)).toBe(false); expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it.each(['background', 'account', 'native-close'])('%s retires ready Direct without transferring work', async cause => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); const page = await f.start();
    if (cause === 'background') f.active.next(false);
    else if (cause === 'account') { f.data.sessionEpoch++; f.data.authDataChanged.next(); }
    else f.guard().onClosed?.();
    await page.closed; await turn(); expect(f.closed).toHaveBeenCalledOnce();
    expect(f.port.isBleDirect(id)).toBe(false); expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled();
  });

  it('a retired group cannot close or change the selection of a later admitted link', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); const old = await f.start(), oldGuard = f.guard();
    old.close(); await turn(); await vi.advanceTimersByTimeAsync(6000); const next = await f.start();
    oldGuard.onClosed?.(); await turn();
    expect(f.port.isBleDirect(id)).toBe(true); expect(next.signal.aborted).toBe(false);
    expect(f.ble.disconnect).toHaveBeenCalledOnce(); expect(f.closed).toHaveBeenCalledOnce(); next.close();
  });

  it('an unknown BLE Action is never replayed through Cloud when the path closes mid-await', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(6000); const page = await f.start();
    f.ble.commandConnected.mockImplementationOnce(async () => { f.guard().onClosed?.(); throw Error('UNKNOWN_OUTCOME'); });
    await expect(f.port.sendCommand(id, 'button', null)).rejects.toThrow('UNKNOWN_OUTCOME');
    await page.closed; await turn(); expect(f.service.command).not.toHaveBeenCalled();
    expect(f.ble.ensureReady).toHaveBeenCalledOnce(); expect(f.ble.command).not.toHaveBeenCalled();
  });
});
