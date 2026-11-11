import { readLegacyPanel, writeLegacyPanel } from '../../../core/device-v2/legacy-panel';
import { parsePageLayout, migratePageLayout } from '../../../core/device-v2/page-layout';
import { UI_THEME_IDS } from '../../../core/device-v2/ui-theme';
import { arrangeTiles, capabilityTiles, toPageLayout, validateProposal } from './interface-draft';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';

const device = { config: { mode: 'mqtt', showSwitch: true }, data: { switch: 'on', temperature: 23, token: 'secret', enable: true }, } as BlinkerDevice;

describe('interface capability and proposal boundaries', () => {
  const unitSnapshot = (field: Partial<DeviceUiSnapshot['endpoints'][number]> = {}): DeviceUiSnapshot => ({
    manifestAccepted: true, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateRevision: 1, stateFresh: true,
    endpoints: [{ id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: false, notifies: true, ...field }],
  });
  const v2Device = { ...device, config: { ...device.config, mode: 'bbp2' } };

  it('infers units from declared numeric capability types, never a current value or a boolean key', () => {
    for (const field of [
      { valueType: 'boolean' as const, value: true },
      { valueType: 'boolean' as const, value: undefined },
      { valueType: 'text' as const, value: '123' },
      { key: 'humidity', valueType: 'boolean' as const, value: false },
    ]) {
      expect(capabilityTiles(v2Device, unitSnapshot(field))[0].unit).toBe('');
    }
    for (const valueType of ['integer', 'number'] as const) {
      expect(capabilityTiles(v2Device, unitSnapshot({ valueType, value: undefined }))[0].unit).toBe('W');
    }
  });

  it('preserves explicit capability units including an intentionally empty numeric unit', () => {
    for (const [valueType, unit] of [['boolean', 'custom'], ['text', 'label'], ['integer', 'kW'], ['number', '']] as const) {
      expect(capabilityTiles(v2Device, unitSnapshot({ valueType, unit }))[0].unit).toBe(unit);
    }
  });

  it('keeps existing numeric unit defaults and never reads a prototype key as a unit', () => {
    const defaults = { temperature: '°C', humidity: '%', brightness: '%', soilMoisture: '%', co2: 'ppm', power: 'W', voltage: 'V' };
    for (const valueType of ['integer', 'number'] as const) {
      for (const [key, unit] of Object.entries(defaults)) {
        expect(capabilityTiles(v2Device, unitSnapshot({ key, valueType }))[0].unit).toBe(unit);
      }
      for (const key of ['customNumeric', 'constructor', '__proto__', 'toString']) {
        expect(capabilityTiles(v2Device, unitSnapshot({ key, valueType }))[0].unit).toBe('');
      }
    }
  });

  it('keeps inferred units local without mutating the snapshot or adding units to saved layouts', () => {
    const snapshot = unitSnapshot({ valueType: 'number' });
    const before = structuredClone(snapshot);
    const tiles = capabilityTiles(v2Device, snapshot);
    expect(tiles[0].unit).toBe('W');
    const layout = toPageLayout(tiles, snapshot, 1);
    expect(snapshot).toEqual(before);
    expect(snapshot.endpoints[0].unit).toBeUndefined();
    expect(JSON.stringify(layout)).not.toContain('"unit":');
  });

  it('uses typed power names and compatible aliases for V2 capability previews', () => {
    const field = { id: 1, key: 'power', manifestKind: 0, manifestType: 0, role: 'property' as const,
      valueType: 'boolean' as const, readable: true, writable: true, notifies: true };
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: 'a'.repeat(64),
      manifestRevision: 1, stateRevision: 1, stateFresh: true, endpoints: [field] };
    const v2 = { ...device, config: { ...device.config, mode: 'bbp2' } };
    expect(capabilityTiles(v2, snapshot)[0].title).toBe('电源开关');
    expect(capabilityTiles({ ...v2, displayMetadata: { logicalDeviceId: 'device_a', revision: 1, name: '灯',
      capabilities: [{ key: 'power', kind: 0, type: 0, displayName: '主灯' }] } }, snapshot)[0].title).toBe('主灯');
    expect(capabilityTiles(v2, { ...snapshot, endpoints: [{ ...field, manifestType: 2, valueType: 'integer' }] })[0].title).toBe('功率');
  });
  it('does not infer write access from legacy telemetry', () => {
    const tiles = capabilityTiles(device);

    expect(tiles.map(tile => [tile.key, tile.type])).toEqual([['switch', 'switch'], ['temperature', 'value']]);
    expect(tiles[0].legacy?.['mode']).toBe(1);
  });

  it('rejects invented bindings, duplicate ids and oversized labels', () => {
    const source = capabilityTiles(device);
    const widget = { id: source[0].id, title: '电源', width: 8, emphasized: true };

    for (const widgets of [[{ ...widget, id: 'invented' }], [widget, widget], [{ ...widget, title: '温'.repeat(22) }]]) {
      expect(() => validateProposal({ summary: '', widgets }, source)).toThrow();
    }
  });

  it('ignores model attempts to alter commands and keeps local bindings', () => {
    const source = capabilityTiles(device);
    const result = validateProposal({ summary: '电源优先', widgets: [{ id: source[0].id, title: '电源', width: 8, emphasized: true, key: 'danger', legacy: { mode: 2 } }] }, source);

    expect(result.tiles[0].key).toBe('switch'); expect(result.tiles[0].legacy?.['mode']).toBe(1);
  });

  it('preserves imported appearance and automation data when caching the new panel', () => {
    const config = { headerStyle: 'light', background: { img: 'saved-background', isFull: true } };
    const panel = readLegacyPanel(device);
    const layout = JSON.parse(writeLegacyPanel(JSON.stringify({ config, actions: [{ cmd: { switch: 'on' } }], triggers: ['test'] }), panel.document, panel.bindings));

    expect(layout.config).toEqual(config);
    expect(layout.actions).toEqual([{ cmd: { switch: 'on' } }]); expect(layout.triggers).toEqual(['test']);
  });

  it('packs mixed-width widgets without grid overlap and respects read-only fields', () => {
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateRevision: 1, stateFresh: true,
      endpoints: Array.from({ length: 5 }, (_, id) => ({ id: id + 1, key: `field${id}`, role: 'property' as const, valueType: 'number' as const, writable: false, readable: true, notifies: true })) };

    const tiles = arrangeTiles(capabilityTiles({ ...device, config: { ...device.config, mode: 'bbp2' } }, snapshot));
    tiles[1].width = 8;

    const layout = toPageLayout(tiles, snapshot, 3);

    expect(layout.revision).toBe(3); expect(layout.widgets.map(widget => widget.type)).toEqual(Array(5).fill('value'));
    expect(layout.widgets.map(widget => [widget.grid.x, widget.grid.y])).toEqual([[0, 0], [2, 0], [6, 0], [0, 2], [2, 2]]);
  });

  it('carries styles through validated V2 layouts and capability migrations', () => {
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateRevision: 1, stateFresh: true,
      endpoints: [{ id: 1, key: 'temperature', role: 'property', valueType: 'number', writable: false, readable: true, notifies: true }] };

    const tiles = capabilityTiles({ ...device, config: { ...device.config, mode: 'bbp2' } }, snapshot);

    for (const style of UI_THEME_IDS) {
      const layout = toPageLayout(tiles, snapshot, 1, style);

      expect(parsePageLayout(JSON.parse(JSON.stringify(layout))).style).toBe(style);
      expect(migratePageLayout(layout, { ...snapshot, manifestFingerprint: 'b'.repeat(64) }).style).toBe(style);
    }

    expect(() => parsePageLayout({ ...toPageLayout(tiles, snapshot, 1), style: 'arbitrary-css' })).toThrow();
  });

  it('changes layout priorities without mutating bindings or dropping capabilities', () => {
    const source = capabilityTiles(device);

    expect(arrangeTiles(source, 'electronic').map(tile => tile.type)).toEqual(['value', 'switch']);
    expect(arrangeTiles(source, 'dark').map(tile => tile.width)).toEqual([2, 2]);
    expect(source.map(tile => tile.type)).toEqual(['switch', 'value']);

    const config = { background: { img: 'kept', isFull: true } };

    for (const style of UI_THEME_IDS) {
      const panel = readLegacyPanel(device);
      const result = JSON.parse(writeLegacyPanel(JSON.stringify({ config, actions: ['keep'], triggers: ['keep'] }), { ...panel.document, style }, panel.bindings));

      expect(result.config).toEqual(config);
      expect(result.pagePanel.style).toBe(style);
      expect(result.actions).toEqual(['keep']); expect(result.triggers).toEqual(['keep']);
      const first = result.pagePanel.widgets[0];
      expect(first.endpointKey).toBe('switch'); expect(result.pagePanel.bindings[first.widgetId].source.mode).toBe(1);
    }
  });

  it('previews slider positions from actual capability bounds rather than a fixed percentage', () => {
    const field = { id: 1, key: 'brightness', role: 'property' as const, valueType: 'number' as const, writable: true, readable: true, notifies: true, minimum: 10, maximum: 30 };
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateRevision: 1, stateFresh: true, endpoints: [] };

    for (const [value, level] of [[20, 50], [5, 0], [35, 100]]) {
      snapshot.endpoints = [{ ...field, value }];

      expect(capabilityTiles({ ...device, config: { ...device.config, mode: 'bbp2' } }, snapshot)[0].level).toBe(level);
    }
  });
});
