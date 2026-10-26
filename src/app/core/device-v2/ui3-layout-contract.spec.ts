import { ATOM_CATALOG } from '../../device/custom-panel/atom-catalog';
import { PageLayoutPanelComponent } from '../../device/v2/panel/page-layout-panel';
import type { PanelCard } from '../../device/v2/widgets/widget-kit';
import type { DeviceUiEndpoint } from './device-ui.port';
import { parsePageLayout, parsePageWidgets, type PageLayoutWidget } from './page-layout';
import { PAGE_WIDGET_TYPES, PAGE_WIDGET_VARIANTS, VARIANT_SIZES, type PageWidgetType } from './page-widget';
import { DEFAULT_WIDGET_PRESETS, WIDGET_PRESETS } from './widget-presets';

describe('UI3 preserved layout and shared catalogue contract', () => {
  it('retains all 7 types, 23 appearances and 48 presets in the Agent catalogue', () => {
    const variants = Object.values(PAGE_WIDGET_VARIANTS).flat();
    const presets = Object.entries(WIDGET_PRESETS);

    expect(PAGE_WIDGET_TYPES).toHaveLength(7);
    expect(new Set(variants).size).toBe(23);
    expect(presets).toHaveLength(48);
    expect(ATOM_CATALOG).toHaveLength(23);
    expect(ATOM_CATALOG.map(atom => atom.variant)).toEqual(variants);
    expect(ATOM_CATALOG.flatMap(atom => atom.presets)).toHaveLength(48);

    for (const atom of ATOM_CATALOG) {
      expect(atom.tag).toBe(`blinker-${atom.variant}`);
      expect(PAGE_WIDGET_TYPES).toContain(atom.type);
      expect(PAGE_WIDGET_VARIANTS[atom.type as PageWidgetType]).toContain(atom.variant);
      expect(atom.defaultPreset).toBe(DEFAULT_WIDGET_PRESETS[atom.variant]);
      expect(atom.sizes).toEqual(VARIANT_SIZES[atom.variant]);
      expect(atom.presets).toEqual(presets
        .filter(([, preset]) => preset.variant === atom.variant)
        .map(([id, preset]) => ({ id, ...preset })));
    }
  });

  it('sorts the rendered cards without changing saved array order, references or grids', () => {
    const widgets: PageLayoutWidget[] = [
      { widgetId: 'last', endpointKey: 'last', type: 'value',
        grid: { x: 0, y: 4, width: 2, height: 2 } },
      { widgetId: 'right', endpointKey: 'right', type: 'value',
        grid: { x: 4, y: 0, width: 2, height: 2 } },
      { widgetId: 'left', endpointKey: 'left', type: 'value',
        grid: { x: 0, y: 0, width: 2, height: 2 } },
    ];
    const cards: PanelCard[] = widgets.map((widget, index) => ({
      widget, field: { id: index + 1, key: widget.endpointKey, role: 'property', valueType: 'integer',
        readable: true, writable: false, notifies: true },
      value: index, display: String(index), draft: '', error: '', disabled: false,
    }));
    const before = structuredClone(cards);
    const panel = new PageLayoutPanelComponent();
    panel.cards = cards;

    const rendered = panel.ordered;

    expect(rendered.map(card => card.widget.widgetId)).toEqual(['left', 'right', 'last']);
    expect(rendered).not.toBe(cards);
    expect(rendered[0]).toBe(cards[2]);
    expect(rendered[1]).toBe(cards[1]);
    expect(rendered[2]).toBe(cards[0]);
    expect(panel.cards).toBe(cards);
    expect(cards.map(card => card.widget)).toEqual(widgets);
    expect(cards).toEqual(before);
    expect(panel.ordered).toEqual(rendered);
    expect(cards).toEqual(before);
  });

  it.each(['natural', 'dark', 'electronic'] as const)(
    'round-trips saved %s layout without replacing its grids, options, order or bindings', style => {
      const fields: DeviceUiEndpoint[] = [
        { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true,
          writable: true, notifies: true },
        { id: 2, key: 'temperature', role: 'property', valueType: 'number', readable: true,
          writable: false, notifies: true },
        { id: 3, key: 'voltage', role: 'property', valueType: 'number', readable: true,
          writable: false, notifies: true },
        { id: 4, key: 'runtime', role: 'property', valueType: 'integer', readable: true,
          writable: false, notifies: true },
        { id: 5, key: 'label', role: 'property', valueType: 'text', readable: true,
          writable: true, notifies: true },
      ];
      const saved = {
        schemaVersion: 1, columns: 8, revision: 17, manifestFingerprint: 'ab'.repeat(32), style,
        // Deliberately keep document order different from visual grid order.
        widgets: [
          { widgetId: 'legacy-power', type: 'switch', endpointKey: 'power', title: '原电源',
            grid: { x: 5, y: 8, width: 3, height: 5 } },
          { widgetId: 'saved-reading', type: 'value', variant: 'number', endpointKey: 'temperature',
            title: '舱内温度', appearance: 'compact', extraKeys: ['runtime', 'voltage'],
            options: { icon: 'chip', tone: 'teal', decimals: 0, showTitle: false,
              scale: 0.1, warnBelow: 0, format: 'number' },
            grid: { x: 0, y: 3, width: 2, height: 2 } },
          { widgetId: 'saved-input', type: 'input', variant: 'text', endpointKey: 'label',
            title: '保留名称', options: { placeholder: '设备名称', showCounter: false, multiline: true },
            grid: { x: 0, y: 0, width: 4, height: 2 } },
        ],
      };
      const before = structuredClone(saved);
      const parsed = parsePageLayout(saved, fields);
      const edited = parsePageWidgets(parsed.widgets, fields, parsed.widgets);
      const restored = parsePageLayout(JSON.parse(JSON.stringify({ ...parsed, widgets: edited })), fields);

      expect(JSON.parse(JSON.stringify(restored))).toEqual(before);
      expect(restored.widgets.map(widget => widget.widgetId))
        .toEqual(['legacy-power', 'saved-reading', 'saved-input']);
      expect(restored.widgets[1].extraKeys).toEqual(['runtime', 'voltage']);
      expect(saved).toEqual(before);
    });
});
