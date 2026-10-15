import { BehaviorSubject, Subject } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabDeviceComponent } from './tab-device';

describe('home BLE presence lifetime', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());
  const turn = async () => { for (let i = 0; i < 16; ++i) await Promise.resolve(); };
  const harness = () => {
    const data = { auth: { uuid: 'owner-a' } as { uuid: string } | null, sessionEpoch: 1,
      device: { list: ['device-a'] }, deviceDataLoader: new BehaviorSubject(true),
      userDataLoader: new BehaviorSubject(true), authDataChanged: new Subject<void>() };
    const events = new Subject<unknown>(), active = new BehaviorSubject(true), adapter = new BehaviorSubject<boolean | null>(true);
    const callbacks = new Set<() => void>();
    const refresh = vi.fn(async (_ids: readonly string[], _signal: AbortSignal) => undefined);
    const watchAdapter = vi.fn(() => adapter);
    const component = new TabDeviceComponent(data as any, { url: '/home/device', events } as any,
      {} as any, { refreshBlePresence: refresh, watchBleAdapterEnabled: watchAdapter } as any,
      { markForCheck: vi.fn() } as any,
      { onDestroy: (cb: () => void) => { callbacks.add(cb); return () => callbacks.delete(cb); } } as any,
      { active } as any);
    component.ngOnInit();
    return { data, events, active, adapter, refresh, watchAdapter,
      destroy: () => { for (const cb of [...callbacks]) cb(); } };
  };

  it('background, route leave and logout cancel demand; foreground re-evaluates the actual route', async () => {
    const h = harness(); await turn(); expect(h.refresh).toHaveBeenCalledOnce();
    expect(h.watchAdapter).toHaveBeenCalledOnce();
    h.active.next(false); await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledOnce();
    h.active.next(true); await turn(); expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.watchAdapter).toHaveBeenCalledTimes(2);
    h.events.next(new NavigationEnd(1, '/scene', '/scene'));
    h.active.next(false); h.active.next(true); await vi.advanceTimersByTimeAsync(30_000);
    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.watchAdapter).toHaveBeenCalledTimes(2);
    h.events.next(new NavigationEnd(2, '/home/device', '/home/device')); await turn();
    expect(h.refresh).toHaveBeenCalledTimes(3);
    h.data.auth = null; h.data.sessionEpoch++; h.data.authDataChanged.next();
    await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledTimes(3); h.destroy();
  });

  it('radio loss cancels its signal; repeated loads do not add scanner owners', async () => {
    const h = harness(); await turn(); const signal = h.refresh.mock.calls[0][1];
    h.data.deviceDataLoader.next(true); h.data.deviceDataLoader.next(true); await turn();
    expect(h.refresh).toHaveBeenCalledOnce();
    h.adapter.next(false); expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledOnce();
    h.adapter.next(true); await turn(); expect(h.refresh).toHaveBeenCalledTimes(2);
    h.destroy(); await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledTimes(2);
  });
});
