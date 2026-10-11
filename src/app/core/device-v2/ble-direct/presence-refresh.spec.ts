import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlePresenceRefresh } from './presence-refresh';

describe('foreground BLE presence demand', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());
  const turn = async () => { for (let i = 0; i < 16; ++i) await Promise.resolve(); };

  it('deduplicates demand and limits normal starts to ten-second intervals', async () => {
    const refresh = vi.fn(async (_ids: readonly string[], _signal: AbortSignal) => {
      await new Promise(resolve => setTimeout(resolve, 2500));
    });
    const loop = new BlePresenceRefresh(refresh);
    loop.setDemand('account-1', ['b', 'a', 'a']); await turn();
    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh.mock.calls[0][0]).toEqual(['a', 'b']);
    loop.setDemand('account-1', ['a', 'b']);
    await vi.advanceTimersByTimeAsync(9999); expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(refresh).toHaveBeenCalledTimes(2);
    loop.close(); await vi.advanceTimersByTimeAsync(20_000); expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('waits the entire native cooldown after a delayed rejection', async () => {
    const refresh = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      throw Object.assign(Error('BLE_SCAN_THROTTLED'), { retryAfterMs: 9000 });
    });
    const loop = new BlePresenceRefresh(refresh);
    loop.setDemand('a', ['device']); await vi.advanceTimersByTimeAsync(13_999);
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(refresh).toHaveBeenCalledTimes(2); loop.close();
    await vi.advanceTimersByTimeAsync(5000);
  });

  it.each(['BLE_SCAN_PERMISSION', 'BLE_SCAN_UNAVAILABLE', 'BLE_SCAN_BACKGROUND', 'BLE_SCAN_CLOSE_FAILED'])(
    '%s blocks repeated attempts until a new visible lifetime', async code => {
      const refresh = vi.fn().mockRejectedValue(Error(code));
      const loop = new BlePresenceRefresh(refresh);
      loop.setDemand('a', ['device']); await vi.advanceTimersByTimeAsync(60_000);
      expect(refresh).toHaveBeenCalledOnce();
      loop.setDemand('a', ['device']); await turn(); expect(refresh).toHaveBeenCalledOnce();
      loop.setDemand(undefined, []); loop.setDemand('a', ['device']); await turn();
      expect(refresh).toHaveBeenCalledTimes(2); loop.close();
    },
  );

  it('busy failures preserve bounded retries, without tight loops', async () => {
    const refresh = vi.fn().mockRejectedValue(Error('BLE_SCAN_BUSY'));
    const loop = new BlePresenceRefresh(refresh);
    loop.setDemand('a', ['device']); await vi.advanceTimersByTimeAsync(9999);
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(refresh).toHaveBeenCalledTimes(2); loop.close();
  });

  it('account replacement cancels only its observer and waits for its cleanup', async () => {
    let release!: () => void;
    const refresh = vi.fn((_ids: readonly string[], _signal: AbortSignal) =>
      new Promise<void>(resolve => { release = resolve; }));
    const loop = new BlePresenceRefresh(refresh);
    loop.setDemand('a:1', ['device']); await turn();
    const oldSignal = refresh.mock.calls[0][1];
    loop.setDemand('b:2', ['device']); await turn();
    expect(oldSignal.aborted).toBe(true); expect(refresh).toHaveBeenCalledOnce();
    release(); await turn(); expect(refresh).toHaveBeenCalledTimes(2);
    const finish = release; loop.close(); finish(); await turn();
  });

  it('retirement before the first asynchronous turn spends no scan', async () => {
    const refresh = vi.fn(async () => undefined), loop = new BlePresenceRefresh(refresh);
    loop.setDemand('a', ['device']); loop.close(); await turn();
    expect(refresh).not.toHaveBeenCalled();
    loop.setDemand('a', []); await turn(); expect(refresh).not.toHaveBeenCalled();
  });
});
