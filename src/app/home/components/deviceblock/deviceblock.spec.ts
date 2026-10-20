import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Deviceblock } from './deviceblock';
import type { DeviceUiConnectivitySnapshot } from '../../../core/device-v2/device-ui.port';

describe('device card presence evidence', () => {
  const harness = (cloud = true) => {
    const connectivity = new BehaviorSubject<DeviceUiConnectivitySnapshot>({
      activeTransport: 'cloud', directConnectAllowed: true, bleAccess: true,
      bleAdapterEnabled: true, bleNearby: false, bleState: 'idle', cloudSessionState: 'ready',
    });
    const state = new BehaviorSubject<any>({ stateFresh: true, endpoints: [] });
    const card = new Deviceblock({ watchState: () => state, watchConnectivity: () => connectivity } as any,
      { markForCheck: vi.fn() } as any, { onDestroy: vi.fn() } as any);
    card.device = { deviceName: 'device', cloudEnabled: cloud, config: {}, data: { cloudReachable: cloud },
      subject: new Subject() } as any;
    const set = (value: Partial<DeviceUiConnectivitySnapshot>) => connectivity.next({ ...connectivity.value, ...value });
    return { card, set, state };
  };

  it.each(['scanning', 'connecting', 'retrying'] as const)('%s alone cannot manufacture blue BLE or hide Cloud', phase => {
    const h = harness(); h.set({ bleState: phase });
    expect(h.card.transportIcon).toBe('fa-light fa-wifi');
    expect(h.card.status).toBe('ready'); expect(h.card.statusText).toBe('云端已同步');
    const direct = harness(false); direct.set({ bleState: phase });
    expect(direct.card.status).toBe('unknown');
  });

  it('fresh matched evidence stays blue during another scan and falls back to Cloud when expired', () => {
    const h = harness(); h.set({ bleNearby: true, bleState: 'scanning' });
    expect(h.card.transportIcon).toBe('fa-brands fa-bluetooth-b');
    expect(h.card.status).toBe('reachable'); expect(h.card.statusText).toBe('蓝牙在附近');
    h.set({ bleNearby: false }); expect(h.card.transportIcon).toBe('fa-light fa-wifi');
  });

  it('only ready Direct is green, and radio loss cannot retain green', () => {
    const h = harness(false); h.set({ activeTransport: 'ble', bleState: 'ready', bleNearby: false });
    expect(h.card.status).toBe('ready'); expect(h.card.canControl).toBe(true);
    h.set({ bleAdapterEnabled: false }); expect(h.card.status).toBe('offline');
    expect(h.card.canControl).toBe(false);
  });

  it('does not treat missing Cloud evidence as confirmed offline', () => {
    const h = harness();
    h.card.device.data.cloudReachable = undefined;
    expect(h.card.status).toBe('unknown'); expect(h.card.statusText).toBe('状态未知');
    h.card.device.data.cloudReachable = false;
    expect(h.card.status).toBe('offline'); expect(h.card.statusText).toBe('离线');
  });

  it('uses the actual LAN channel instead of a stale Cloud flag', () => {
    const h = harness();
    h.card.device.data.cloudReachable = false;
    h.set({ activeTransport: 'lan' });
    expect(h.card.transportIcon).toBe('fa-light fa-network-wired');
    expect(h.card.status).toBe('ready'); expect(h.card.statusText).toBe('局域网已同步');
    h.state.next({ stateFresh: false, endpoints: [] });
    expect(h.card.status).toBe('reachable'); expect(h.card.statusText).toBe('局域网已连接');
  });

  it('only consumes the tile event in editing mode and emits the selected binding key', () => {
    const h = harness(), configured = vi.fn();
    h.card.configure.subscribe(configured);
    const event = new Event('click', { bubbles: true, cancelable: true });
    const stop = vi.spyOn(event, 'stopPropagation'), prevent = vi.spyOn(event, 'preventDefault');
    h.card.configureMetric(event, 'power');
    expect(stop).not.toHaveBeenCalled(); expect(prevent).not.toHaveBeenCalled();
    expect(configured).not.toHaveBeenCalled();
    h.card.editing = true; h.card.configureMetric(event, 'power');
    expect(stop).toHaveBeenCalledOnce(); expect(prevent).toHaveBeenCalledOnce();
    expect(configured).toHaveBeenCalledWith('power');
    h.card.configureMetric(event);
    expect(configured).toHaveBeenLastCalledWith(undefined);
  });

  it('reports bounded presentation capacity only when it changes', async () => {
    const h = harness(), reported = vi.fn();
    h.card.capacityChange.subscribe(reported);
    h.card.wide = true; await Promise.resolve();
    expect(reported).toHaveBeenCalledWith(4);
    h.card.wide = true; await Promise.resolve();
    expect(reported).toHaveBeenCalledOnce();
    h.card.wide = false; await Promise.resolve();
    expect(reported).toHaveBeenLastCalledWith(2);
    expect(reported).toHaveBeenCalledTimes(2);
  });

  it('keeps single items in base columns and distributes multiple visible spans without changing capacity reports', async () => {
    const h = harness(), capacities = vi.fn(), ranges = vi.fn();
    Object.assign(h.card, { measuredWidth: 360 });
    h.card.capacityChange.subscribe(capacities); h.card.rangeCapacityChange.subscribe(ranges);
    h.card.wide = true; await Promise.resolve();
    const read = { key: 'temperature', kind: 0, type: 3 };
    const range = { key: 'level', kind: 0, type: 2, mode: 'range' as const };
    h.card.bindings = [read]; expect(h.card.rowColumns).toBe(4);
    h.card.bindings = [range]; expect(h.card.rowColumns).toBe(4);
    h.card.bindings = [read, range]; expect(h.card.rowColumns).toBe(3);
    h.card.bindings = [read, { ...read, key: 'humidity' }]; expect(h.card.rowColumns).toBe(2);
    expect(h.card.columns).toBe(4); expect(h.card.rangeFits).toBe(true);
    expect(capacities.mock.calls).toEqual([[4]]); expect(ranges.mock.calls).toEqual([[true]]);
  });

  it('reserves one visible More span without using the smaller presentation column count to admit a range', () => {
    const h = harness(); Object.assign(h.card, { measuredWidth: 284 });
    h.card.bindings = [{ key: 'temperature', kind: 0, type: 3 }, { key: 'humidity', kind: 0, type: 3 },
      { key: 'level', kind: 0, type: 2, mode: 'range' }];
    expect(h.card.columns).toBe(4); expect(h.card.rowColumns).toBe(3);
    expect(h.card.rangeFits).toBe(false); expect(h.card.hasMore).toBe(true);
    expect(h.card.visibleMetrics.map(metric => metric.key)).toEqual(['temperature', 'humidity']);
  });

  it('reports capacity and range-fit again after a size mode change even if the measured width is unchanged', async () => {
    const h = harness(), capacities = vi.fn(), ranges = vi.fn();
    Object.assign(h.card, { measuredWidth: 160 });
    h.card.capacityChange.subscribe(capacities); h.card.rangeCapacityChange.subscribe(ranges);
    h.card.wide = true; await Promise.resolve();
    h.card.wide = false; await Promise.resolve();
    expect(capacities.mock.calls).toEqual([[2], [2]]);
    expect(ranges.mock.calls).toEqual([[false], [false]]);
  });
});
