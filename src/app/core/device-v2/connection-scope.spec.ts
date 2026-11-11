import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceUiConnectionScope } from './connection-scope';
import { DeviceV2DemandOwners } from '../protocol/device-v2/connection-demand';

const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('UI connection scope over the existing Session owner', () => {
  it('one page can own multiple independent leases; closing either required owner releases the rest', async () => {
    const f = fixture();
    let first!: ReturnType<DeviceV2DemandOwners['acquire']>;
    const scope = new DeviceUiConnectionScope(async current => {
      first = f.owners.acquire('state'); await current.hold(first);
      await current.hold(f.owners.acquire('wake'));
    });
    await scope.ready; first.release(); await scope.closed; await turn();
    expect(f.send.mock.calls.filter(([r]) => r.action === 'release').map(([r]) => r.target)).toEqual(['state', 'wake']);
    f.owners.close();
  });

  it('an optional Cloud observer ending does not retire another ready carrier scope', async () => {
    const f = fixture(); let observer!: ReturnType<DeviceV2DemandOwners['acquire']>;
    const scope = new DeviceUiConnectionScope(async current => {
      observer = f.owners.acquire('state'); await current.hold(observer, false);
    });
    await scope.ready; observer.release(); await turn();
    expect(scope.isReady).toBe(true); scope.close(); f.owners.close();
  });
  function fixture() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const send = vi.fn(async request => ({ ...request, status: request.action === 'release' ? 'released' : 'accepted' }));
    const owners = new DeviceV2DemandOwners(send);
    const open = (signal?: AbortSignal) => new DeviceUiConnectionScope(async scope => {
      await scope.hold(owners.acquire('ble_child', scope.signal));
    }, signal);
    return { owners, send, open };
  }

  it('retains after ready, renews via the existing owner and releases only its own page', async () => {
    const f = fixture(), a = f.open(), b = f.open();
    await Promise.all([a.ready, b.ready]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.send.mock.calls.map(([r]) => r.action)).toEqual(['acquire', 'acquire', 'renew', 'renew']);
    a.close(); await a.closed; await turn();
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.send.mock.lastCall![0]).toMatchObject({ ownerId: 2, action: 'renew' });
    b.close(); await turn();
    expect(f.send.mock.calls.filter(([r]) => r.action === 'release')).toHaveLength(2);
    f.owners.close();
  });

  it('account retirement closes scopes without moving owners or restarting work', async () => {
    const f = fixture(), a = f.open(); await a.ready;
    f.owners.close(); await a.closed;
    expect(a.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it('cancellation settles a hung login and rejects a late owner without renewal', async () => {
    const f = fixture();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const scope = new DeviceUiConnectionScope(async current => {
      await pending;
      await current.hold(f.owners.acquire('ble_child'));
    });
    const result = scope.ready.catch(error => error);
    await turn(); scope.close();
    expect(await result).toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    finish(); await turn(); await vi.advanceTimersByTimeAsync(60000);
    expect(f.send.mock.calls.every(([r]) => r.action === 'release')).toBe(true);
    f.owners.close();
  });

  it('a failed read releases its accepted demand without queuing an Action', async () => {
    const f = fixture();
    const scope = new DeviceUiConnectionScope(async current => {
      await current.hold(f.owners.acquire('ble_child', current.signal));
      throw Error('READ_FAILED');
    });
    await expect(scope.ready).rejects.toThrow('READ_FAILED'); await scope.closed; await turn();
    expect(f.send.mock.calls.map(([r]) => r.action)).toEqual(['acquire', 'release']);
    f.owners.close();
  });

  it('the total prepare deadline includes account login and is not a page lifetime timer', async () => {
    const f = fixture(), healthy = f.open(); await healthy.ready;
    const hung = new DeviceUiConnectionScope(() => new Promise(() => undefined));
    const result = hung.ready.catch(error => error);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await result).toMatchObject({ code: 'DEVICE_V2_READY_TIMEOUT' });
    expect(healthy.signal.aborted).toBe(false);
    healthy.close(); f.owners.close();
  });

  it('pre-cancel never calls prepare', async () => {
    const abort = new AbortController(); abort.abort();
    const prepare = vi.fn(async () => undefined);
    const scope = new DeviceUiConnectionScope(prepare, abort.signal);
    await expect(scope.ready).rejects.toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    expect(prepare).not.toHaveBeenCalled();
  });
});
