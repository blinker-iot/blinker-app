import { SimpleChange } from '@angular/core';
import { Subject } from 'rxjs';
import { LegacyPanelComponent } from './legacy-panel.component';
import type { BlinkerDevice } from '../../core/model/device.model';
import type { DeviceService } from '../../core/services/device.service';
import type { DevicePanelService } from '../../core/services/device-panel.service';
import type { HoldGesture, PanelAction, PanelCard } from '../v2/widgets/widget-kit';

describe('QA5 Hold legacy compatibility fence', () => {
  function device(id = 'legacy-a', key = 'power-a'): BlinkerDevice {
    const field = { id: 1, key, role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: false };
    const widget = { widgetId: 'saved-hold', endpointKey: key, type: 'switch', variant: 'hold',
      grid: { x: 0, y: 0, width: 2, height: 2 } };
    return { deviceName: id, config: { broker: 'test', customName: '测试设备', mode: 'wifi',
      layouter: JSON.stringify({ pagePanel: { schemaVersion: 1, columns: 8, widgets: [widget],
        bindings: { 'saved-hold': { field, source: { key } } } } }) },
      data: { enable: true, state: 'connected', [key]: false }, storage: {}, subject: new Subject() };
  }
  function action(card: PanelCard, phase: HoldGesture['phase']): PanelAction {
    return { field: card.field, widgetId: card.widget.widgetId, kind: 'toggle', value: phase === 'press',
      hold: { id: 'hold-1', phase, target: { field: { ...card.field }, widgetId: card.widget.widgetId, scope: card.controlScope } } };
  }
  async function create() {
    const devices = { sendData: vi.fn(), islocalDevice: vi.fn(() => false) };
    const panels = { get: vi.fn(async () => null), install: vi.fn() };
    const page = new LegacyPanelComponent(devices as unknown as DeviceService, panels as unknown as DevicePanelService);
    const load = async (next: BlinkerDevice) => {
      const previous = page.device; page.device = next;
      page.ngOnChanges({ device: new SimpleChange(previous, next, !previous) });
      await Promise.resolve();
    };
    await load(device());
    return { page, devices, load, close() { page.ngOnDestroy(); } };
  }

  it('keeps same-binding true and false on the original legacy on/off protocol', async () => {
    const t = await create();
    try {
      const original = t.page.cards[0];
      t.page.act(action(original, 'press')); t.page.act(action(original, 'release'));
      expect(t.devices.sendData.mock.calls.map(call => call[1])).toEqual(['{"power-a":"on"}', '{"power-a":"off"}']);
    } finally { t.close(); }
  });

  it('rejects the original release after the same widget is rebound from A to B', async () => {
    const t = await create();
    try {
      const original = t.page.cards[0]; t.page.act(action(original, 'press'));
      t.page.device.config.layouter = device('legacy-a', 'power-b').config.layouter;
      t.page.device.subject.next({ key: 'component' }); await Promise.resolve();
      expect(t.page.cards[0].field.key).toBe('power-b');
      t.page.act(action(original, 'release'));
      expect(t.devices.sendData.mock.calls.map(call => call[1])).toEqual(['{"power-a":"on"}']);
    } finally { t.close(); }
  });

  it('refuses the old device scope even when the new device has identical field keys', async () => {
    const t = await create();
    try {
      const original = t.page.cards[0]; t.page.act(action(original, 'press'));
      await t.load(device('legacy-b')); expect(t.page.cards[0].controlScope).not.toBe(original.controlScope);
      t.page.act(action(original, 'release')); expect(t.devices.sendData).toHaveBeenCalledTimes(1);
      const current = t.page.cards[0];
      t.page.act({ field: current.field, widgetId: current.widget.widgetId, kind: 'toggle', value: false });
      expect(t.devices.sendData.mock.lastCall).toEqual([t.page.device, '{"power-a":"off"}']);
    } finally { t.close(); }
  });

  it('retires local owners on hiding or unavailability, without replay after return', async () => {
    const t = await create();
    try {
      const initial = t.page.cards[0]; t.page.act(action(initial, 'press'));
      t.page.viewActive = false; t.page.ngOnChanges({ viewActive: new SimpleChange(true, false, false) });
      expect(t.page.cards[0].controlAvailable).toBe(false);
      t.page.viewActive = true; t.page.ngOnChanges({ viewActive: new SimpleChange(false, true, false) });
      t.page.act(action(initial, 'release')); expect(t.devices.sendData).toHaveBeenCalledTimes(1);
      const resumed = t.page.cards[0]; t.page.act(action(resumed, 'press'));
      t.page.device.data.enable = false; t.page.device.data.state = 'disconnected'; t.page.device.subject.next({ key: 'state' });
      expect(t.page.cards[0].controlAvailable).toBe(false);
      t.page.device.data.enable = true; t.page.device.subject.next({ key: 'state' });
      t.page.act(action(resumed, 'release')); expect(t.devices.sendData).toHaveBeenCalledTimes(2);
    } finally { t.close(); }
  });
});
