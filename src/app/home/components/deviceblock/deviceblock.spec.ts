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
    return { card, set };
  };

  it.each(['scanning', 'connecting', 'retrying'] as const)('%s alone cannot manufacture blue BLE or hide Cloud', phase => {
    const h = harness(); h.set({ bleState: phase });
    expect(h.card.transportIcon).toBe('fa-light fa-wifi');
    expect(h.card.status).toBe('ready'); expect(h.card.statusText).toBe('云端已同步');
    const direct = harness(false); direct.set({ bleState: phase });
    expect(direct.card.status).toBe('unknown'); expect(direct.card.online).toBe(false);
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
    expect(h.card.canControl).toBe(false); expect(h.card.online).toBe(false);
  });
});
