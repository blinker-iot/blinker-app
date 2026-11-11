import { parsePageWidgets } from './page-layout';
import { PAGE_WIDGET_VARIANTS, type PageWidgetType } from './page-widget';
import { presetForVariant, WIDGET_PRESETS } from './widget-presets';

describe('shared widget presets', () => {
  it.each(Object.entries(WIDGET_PRESETS))('%s remains valid for manual and Agent creation', (id, preset) => {
    const widget = { widgetId: id, endpointKey: 'field', type: preset.type, variant: preset.variant,
      ...(Object.keys(preset.options).length ? { options: { ...preset.options } } : {}),
      grid: { x: 0, y: 0, width: preset.width, height: preset.height } };

    expect(parsePageWidgets([widget])).toEqual([widget]);
  });

  it('provides one catalogue default of the same type for every variant', () => {
    for (const [type, variants] of Object.entries(PAGE_WIDGET_VARIANTS)) {
      for (const variant of variants) {
        const preset = presetForVariant(variant);
        expect(preset.type).toBe(type as PageWidgetType);
        expect(preset.variant).toBe(variant);
        expect(Object.values(WIDGET_PRESETS)).toContain(preset);
      }
    }
  });
});
