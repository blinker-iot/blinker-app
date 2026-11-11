import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2DemandOwners } from '../protocol/device-v2/connection-demand';
import { DeviceUiPort } from './device-ui.port';

const id = 'ble_ASNFZ4mrze8BI0VniavN7w';
const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const requests: string[] = [];
  const owners = new DeviceV2DemandOwners(async r => {
    requests.push(r.action);
    return { ...r, status: r.action === 'release' ? 'released' : 'accepted' };
  });
  const device = { deviceType: 'ble', cloudEnabled: true, data: { cloudReachable: true } };
  const interests: string[] = [];
  const observers = new DeviceV2DemandOwners(async r => {
    interests.push(r.action);
    return { ...r, status: r.action === 'release' ? 'released' : 'accepted' };
  });
  const service = {
    acquireStateInterest: vi.fn(async (_id, signal) => observers.acquire(id, signal)),
    reserveDirectPriority: vi.fn(async () => { throw Error('Direct priority/Ready is not negotiated'); }),
    acquireConnectionDemand: vi.fn(async (_id, signal) => owners.acquire(id, signal)),
    waitUntilReady: vi.fn(async () => undefined),
  };
  const ble = {
    disconnect: vi.fn(async () => undefined),
    ensureReady: vi.fn(async () => undefined),
    hasActiveCredential: vi.fn(async () => false),
    canManagePresenceCredential: vi.fn(async () => false),
  };
  const active = new BehaviorSubject(true);
  const port = new DeviceUiPort(service as any, ble as any,
    { run: f => f() } as any, { active } as any, { getDevice: () => device } as any);
  return { port, service, ble, device, active, requests, interests,
    retire: () => { owners.close(); observers.close(); } };
}

describe('DeviceUiPort production demand consumers', () => {
  it('ordinary WiFi pages own State observation without requesting a southbound wake', async () => {
    const f = fixture(); f.device.deviceType = 'diy';
    const a = f.port.openConnection(id), b = f.port.openConnection(id);
    await Promise.all([a.ready, b.ready]);
    expect(f.requests).toEqual([]); expect(f.interests).toEqual(['acquire', 'acquire']);
    a.close(); await turn(); await vi.advanceTimersByTimeAsync(10000);
    expect(f.interests).toEqual(['acquire', 'acquire', 'release', 'renew']);
    f.active.next(false); await b.closed; await turn();
    expect(f.interests.at(-1)).toBe('release'); f.retire();
  });
  it('page and read-only sync share Session ownership but not lifetime', async () => {
    const f = fixture(), page = f.port.openConnection(id); await page.ready;
    expect(f.requests).toEqual(['acquire']);
    expect(f.interests).toEqual(['acquire']);
    await f.port.connect(id); await turn();
    expect(f.requests).toEqual(['acquire', 'acquire', 'release']);
    expect(f.interests).toEqual(['acquire']); // One-shot read owns no persistent observer.
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.requests.at(-1)).toBe('renew');
    page.close(); await turn();
    expect(f.requests.at(-1)).toBe('release'); f.retire();
    expect(f.interests).toEqual(['acquire', 'renew', 'release']);
  });

  it('background closes all page scopes; foreground alone does not restart them', async () => {
    const f = fixture(), a = f.port.openConnection(id), b = f.port.openConnection(id);
    await Promise.all([a.ready, b.ready]); f.active.next(false);
    await Promise.all([a.closed, b.closed]); await turn();
    expect(f.requests).toEqual(['acquire', 'acquire', 'release', 'release']);
    f.active.next(true); await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(4); f.retire();
  });

  it('Cloud pages release independent demands without owning native BLE cleanup', async () => {
    const f = fixture(), a = f.port.openConnection(id), b = f.port.openConnection(id);
    await Promise.all([a.ready, b.ready]); f.ble.disconnect.mockClear();
    a.close(); await turn(); expect(f.ble.disconnect).not.toHaveBeenCalled();
    expect(f.requests).toEqual(['acquire', 'acquire', 'release']);
    b.close(); await turn(); expect(f.ble.disconnect).not.toHaveBeenCalled();
    expect(f.requests).toEqual(['acquire', 'acquire', 'release', 'release']); f.retire();
  });

  it('only gateway Cloud paths acquire demand; Direct and ordinary WiFi do not', async () => {
    const f = fixture();
    f.device.cloudEnabled = false;
    await f.port.connect(id);
    expect(f.ble.ensureReady).toHaveBeenCalled();
    f.device.deviceType = 'edge-hub'; f.device.cloudEnabled = true;
    await f.port.connect(id);
    f.device.deviceType = 'diy'; f.ble.hasActiveCredential.mockResolvedValue(false);
    await f.port.connect(id);
    expect(f.service.acquireConnectionDemand).not.toHaveBeenCalled(); f.retire();
  });

  it('a Cloud read outliving the last page releases only its own remaining demand', async () => {
    const f = fixture(), page = f.port.openConnection(id); await page.ready;
    let finish!: () => void;
    f.service.waitUntilReady.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const read = f.port.connect(id); await turn(); f.ble.disconnect.mockClear();
    page.close(); await turn(); expect(f.ble.disconnect).not.toHaveBeenCalled();
    finish(); await read; await turn();
    expect(f.ble.disconnect).not.toHaveBeenCalled();
    expect(f.requests).toEqual(['acquire', 'acquire', 'release', 'release']); f.retire();
  });

  it('read failure releases demand and never leaves an automatic retry owner', async () => {
    const f = fixture(); f.service.waitUntilReady.mockRejectedValueOnce(Error('READ_FAILED'));
    await expect(f.port.connect(id)).rejects.toThrow('READ_FAILED'); await turn();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toEqual(['acquire', 'release']); f.retire();
  });

  it('session retirement closes the visible scope, even after it became ready', async () => {
    const f = fixture(), page = f.port.openConnection(id); await page.ready;
    f.retire(); await page.closed; await turn();
    expect(f.requests).toEqual(['acquire']);
    expect(f.service.waitUntilReady).toHaveBeenCalledOnce();
  });
});
