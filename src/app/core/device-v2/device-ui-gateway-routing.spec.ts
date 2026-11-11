import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2DemandOwners } from '../protocol/device-v2/connection-demand';
import { DeviceUiPort } from './device-ui.port';

const a = 'ble_ASNFZ4mrze8BI0VniavN7w', b = 'ble_8Zc1CXfpwQtN1NqFWR6BvQ';
const turn = async () => { for (let i = 0; i < 40; ++i) await Promise.resolve(); };
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const cleanup: (() => void)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) close(); await turn(); vi.useRealTimers(); });

function fixture(online?: boolean) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const send = vi.fn(async r => ({ ...r, status: r.action === 'release' ? 'released' : 'accepted' }));
  const owners = new DeviceV2DemandOwners(send);
  const service = {
    state: new BehaviorSubject('ready'), stop: vi.fn(),
    reserveDirectPriority: vi.fn(async () => { throw Error('UNEXPECTED_DIRECT_RESERVATION'); }),
    acquireConnectionDemand: vi.fn(async (id, signal) => owners.acquire(id, signal)),
    acquireStateInterest: vi.fn(async () => undefined),
    waitUntilReady: vi.fn(async () => undefined), command: vi.fn(async () => undefined),
  };
  const connection = new BehaviorSubject<any>('nearby');
  const ble = {
    hasActiveCredential: vi.fn(async () => true), ensureReady: vi.fn(async () => undefined),
    command: vi.fn(), commandConnected: vi.fn(), disconnect: vi.fn(async () => undefined),
    connectionSnapshot: () => connection.value, watchConnection: () => connection,
    refreshPresence: vi.fn(async () => undefined), watchAdapterEnabled: () => new BehaviorSubject(true),
  };
  const devices = new Map([a, b].map(id => [id, { deviceType: 'ble', cloudEnabled: true, data: { cloudReachable: true } }]));
  const data = { sessionEpoch: 1, authDataChanged: new Subject<void>(), deviceDataLoader: new Subject<boolean>(),
    getDevice: (id: string) => devices.get(id) };
  const active = new BehaviorSubject(true), network = new BehaviorSubject<boolean | undefined>(online);
  const port = new DeviceUiPort(service as any, ble as any, { run: f => f() } as any, { active } as any,
    data as any, undefined, { connected: network, get offline() { return network.value === false; } } as any);
  cleanup.push(() => { active.next(false); owners.close(); });
  const open = (id = a) => { const page = port.openConnection(id); void page.ready.catch(() => undefined); return page; };
  return { port, service, ble, connection, send, owners, data, active, network, devices, open };
}

describe('gateway pages use the shared account route, not automatic Direct takeover', () => {
  it.each([true, undefined])('online evidence %s does not consult a slow local credential store', async online => {
    const f = fixture(online), credential = held<boolean>();
    f.ble.hasActiveCredential.mockReturnValue(credential.promise);
    const page = f.open(); await turn();
    expect(f.service.acquireConnectionDemand).toHaveBeenCalledOnce();
    expect(f.ble.hasActiveCredential).not.toHaveBeenCalled();
    await page.ready;
    expect(f.service.reserveDirectPriority).not.toHaveBeenCalled(); expect(f.ble.ensureReady).not.toHaveBeenCalled();
    expect(f.port.isBleDirect(a)).toBe(false); credential.resolve(true);
  });

  it('closing a Cloud page only releases its owner, not MQTT or an unrelated BLE session', async () => {
    const f = fixture(true), page = f.open(); await page.ready;
    page.close(); await page.closed; await turn();
    expect(f.send.mock.calls.map(([r]) => r.action)).toEqual(['acquire', 'release']);
    expect(f.ble.disconnect).not.toHaveBeenCalled(); expect(f.service.stop).not.toHaveBeenCalled();
  });

  it('closing A leaves the other A caller and child B demands renewing in the same Session', async () => {
    const f = fixture(true), first = f.open(a), second = f.open(a), other = f.open(b);
    await Promise.all([first.ready, second.ready, other.ready]);
    const acquired = f.send.mock.calls.map(([r]) => r);
    expect(acquired.map(r => r.target)).toEqual([a, a, b]);
    expect(acquired.every(r => !r.purpose)).toBe(true);
    first.close(); await turn(); await vi.advanceTimersByTimeAsync(10000);
    expect(f.send.mock.calls.filter(([r]) => r.action === 'renew').map(([r]) => r.ownerId))
      .toEqual([acquired[1].ownerId, acquired[2].ownerId]);
    expect(second.signal.aborted || other.signal.aborted).toBe(false);
    expect(f.service.reserveDirectPriority).not.toHaveBeenCalled(); expect(f.ble.disconnect).not.toHaveBeenCalled();
  });

  it('Presence and WiFiProv handoff cannot promote a cached child to Direct', async () => {
    const f = fixture(true), page = f.open(); await page.ready;
    f.connection.next('ready'); f.devices.get(a)!.data.cloudReachable = false;
    await f.port.refreshBlePresence([a]); await f.port.startDirectHandoff(a);
    expect(f.port.isBleDirect(a)).toBe(false); expect(f.ble.ensureReady).not.toHaveBeenCalled();
    expect(f.service.reserveDirectPriority).not.toHaveBeenCalled();
  });

  it.each(['denied', 'timeout', 'session-ended'])('Cloud %s never triggers automatic Direct or offline fallback', async reason => {
    const f = fixture(true);
    f.service.acquireConnectionDemand.mockImplementationOnce(async () => { f.network.next(false); throw Error(reason); });
    await expect(f.open().ready).rejects.toThrow(reason);
    expect(f.ble.hasActiveCredential).not.toHaveBeenCalled(); expect(f.ble.ensureReady).not.toHaveBeenCalled();
    expect(f.service.reserveDirectPriority).not.toHaveBeenCalled();
  });

  it.each(['page', 'account', 'session'])('late Cloud readiness after %s retirement cannot reopen a path', async cause => {
    const f = fixture(true), ready = held<void>(); f.service.waitUntilReady.mockReturnValue(ready.promise);
    const page = f.open(); await turn();
    if (cause === 'page') page.close();
    else if (cause === 'account') { f.data.sessionEpoch++; f.data.authDataChanged.next(); }
    else f.owners.close();
    await page.closed; ready.resolve(); await turn();
    expect(page.signal.aborted).toBe(true); expect(f.ble.ensureReady).not.toHaveBeenCalled();
    expect(f.service.acquireConnectionDemand).toHaveBeenCalledOnce(); expect(f.service.stop).not.toHaveBeenCalled();
  });

  it('losing only A from the directory leaves B active', async () => {
    const f = fixture(true), first = f.open(a), other = f.open(b); await Promise.all([first.ready, other.ready]);
    f.devices.delete(a); f.data.deviceDataLoader.next(true); await first.closed; await turn();
    expect(other.signal.aborted).toBe(false); expect(f.ble.disconnect).not.toHaveBeenCalled();
  });

  it('an unknown Cloud Action is sent once and never replayed through BLE', async () => {
    const f = fixture(true), page = f.open(); await page.ready;
    f.service.command.mockRejectedValueOnce(Error('UNKNOWN_OUTCOME'));
    await expect(f.port.sendCommand(a, 'button', null)).rejects.toThrow('UNKNOWN_OUTCOME');
    expect(f.service.command).toHaveBeenCalledOnce(); expect(f.ble.command).not.toHaveBeenCalled();
    expect(f.ble.commandConnected).not.toHaveBeenCalled(); expect(f.ble.ensureReady).not.toHaveBeenCalled();
  });
});
