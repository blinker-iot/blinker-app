import { parsePageLayout, parsePageWidgets, type PageLayoutWidget } from './page-layout';
import {
  COMMON_WIDGET_OPTIONS, PAGE_WIDGET_OPTION_RULES, PAGE_WIDGET_TITLE_MAX_BYTES,
  PAGE_WIDGET_VARIANTS, VARIANT_OPTION_VALUES, VARIANT_SIZES, VARIANT_WIDGET_OPTIONS,
  parseWidgetOptions, validOption,
  type OptionRule, type PageWidgetOptionKey, type PageWidgetOptions,
  type PageWidgetType, type PageWidgetVariant,
} from './page-widget';

const baseWidget: PageLayoutWidget = {
  widgetId: 'saved-reading', type: 'value', endpointKey: 'temperature',
  grid: { x: 0, y: 0, width: 2, height: 1 },
};

function parseTitle(title?: string): PageLayoutWidget {
  return parsePageWidgets([{ ...baseWidget, ...(title === undefined ? {} : { title }) }])[0];
}

// One valid explicit value for every existing rule, including variant enum subsets.
// The fixture exercises the shared contract, not a second Inspector option catalogue.
function optionValue(key: PageWidgetOptionKey, variant: PageWidgetVariant): unknown {
  const rule = PAGE_WIDGET_OPTION_RULES[key];
  const restricted = VARIANT_OPTION_VALUES[variant]?.[key];
  if (restricted) return restricted[0];
  if (rule.kind === 'boolean') return false;
  if (rule.kind === 'enum') return rule.values[0];
  if (rule.kind === 'integer') return rule.min;
  if (rule.kind === 'number') return key === 'max' ? 100 : key === 'scale' ? 0.1 : 0;
  if (key === 'icon') return 'chip';
  if (key === 'presets') return '15,30,60';
  if (key === 'palette') return '#ff0000,#00ff00';
  if (key === 'choiceIcons') return 'auto:chip,manual:moon';
  if (key === 'choiceTones') return 'auto:green,manual:blue';
  if (key === 'states') return 'ready:ok,error:warn';
  return '原文';
}

describe('UI4 property contract independent of the Inspector form', () => {
  it.each([
    ['ASCII', 'a'.repeat(64)],
    ['Chinese', `${'温'.repeat(21)}a`],
    ['emoji', '🙂'.repeat(16)],
    ['mixed', `${'温'.repeat(20)}🙂`],
  ])('accepts an exact 64 UTF-8 byte %s title without truncation', (_kind, title) => {
    expect(PAGE_WIDGET_TITLE_MAX_BYTES).toBe(64);
    expect(new TextEncoder().encode(title)).toHaveLength(PAGE_WIDGET_TITLE_MAX_BYTES);
    expect(parseTitle(title).title).toBe(title);
  });

  it.each(['a'.repeat(65), '温'.repeat(22), '🙂'.repeat(17), 'valid\0suffix'])(
    'rejects an over-budget or NUL title at the existing save boundary', title => {
      expect(() => parseTitle(title)).toThrow(/title is invalid/);
    });

  it('preserves saved title content and the existing optional empty-title contract', () => {
    expect(parseTitle().title).toBeUndefined();
    expect(parseTitle('').title).toBe('');
    expect(parseTitle('  原始标题  ').title).toBe('  原始标题  ');
    // The parser does not silently trim persisted documents or redefine their names.
    expect(() => parseTitle(` ${'a'.repeat(64)} `)).toThrow(/title is invalid/);
  });

  it('distinguishes absent defaults, explicit zero and explicit false without materialising defaults', () => {
    expect(parseWidgetOptions(undefined, 'widget')).toBeUndefined();
    expect(parseWidgetOptions({}, 'widget')).toEqual({});
    expect(parseWidgetOptions({ decimals: 0, ticks: 0, min: 0, warnBelow: 0,
      showTitle: false, pulse: false }, 'widget')).toEqual({
      decimals: 0, ticks: 0, min: 0, warnBelow: 0, showTitle: false, pulse: false,
    });
    expect(parsePageWidgets([{ ...baseWidget, options: {} }])[0].options).toBeUndefined();
    expect(validOption(PAGE_WIDGET_OPTION_RULES.scale, 0)).toBe(false);
    expect(validOption(PAGE_WIDGET_OPTION_RULES.showTitle, 0)).toBe(false);
    expect(validOption(PAGE_WIDGET_OPTION_RULES.decimals, false)).toBe(false);
    expect(validOption(PAGE_WIDGET_OPTION_RULES.caption, '')).toBe(false);
    expect(() => parseWidgetOptions({ decimals: undefined }, 'widget')).toThrow(/option decimals/);
  });

  it('keeps text rules byte-based for captions and short action labels as well', () => {
    const cases: readonly [OptionRule, string, string][] = [
      [PAGE_WIDGET_OPTION_RULES.caption, `${'温'.repeat(21)}a`, '温'.repeat(22)],
      [PAGE_WIDGET_OPTION_RULES.actionText, '🙂'.repeat(6), '🙂'.repeat(7)],
      [PAGE_WIDGET_OPTION_RULES.placeholder, '温'.repeat(16), '温'.repeat(17)],
    ];
    for (const [rule, accepted, rejected] of cases) {
      expect(validOption(rule, accepted)).toBe(true);
      expect(validOption(rule, rejected)).toBe(false);
      expect(validOption(rule, 'prefix\0suffix')).toBe(false);
    }
  });

  it('validates min/max as a pair while retaining a separately configured bound', () => {
    const input = { min: 0, max: 100 };
    expect(parseWidgetOptions(input, 'widget')).toEqual(input);
    expect(parseWidgetOptions({ min: 0 }, 'widget')).toEqual({ min: 0 });
    expect(parseWidgetOptions({ max: 0 }, 'widget')).toEqual({ max: 0 });
    for (const options of [{ min: 0, max: 0 }, { min: 1, max: 0 }]) {
      expect(() => parseWidgetOptions(options, 'widget')).toThrow(/option range is invalid/);
    }
    expect(input).toEqual({ min: 0, max: 100 });
    // A memory capacity is not a generic display range: its existing positive guard stays.
    expect(() => parsePageWidgets([{ ...baseWidget, variant: 'memory',
      grid: { x: 0, y: 0, width: 2, height: 3 }, options: { max: 0 } }])).toThrow(/total memory/);
  });

  it.each(['natural', 'dark', 'electronic'] as const)(
    'round-trips every existing variant parameter in saved %s documents without reordering or rebinding', style => {
      const widgets = Object.entries(PAGE_WIDGET_VARIANTS).flatMap(([type, variants]) =>
        variants.map((variant: PageWidgetVariant, index): PageLayoutWidget => {
          const keys = [...COMMON_WIDGET_OPTIONS, ...VARIANT_WIDGET_OPTIONS[variant]];
          const options = Object.fromEntries(keys.map(key => [key, optionValue(key, variant)])) as PageWidgetOptions;
          for (const key of keys) expect(validOption(PAGE_WIDGET_OPTION_RULES[key], options[key])).toBe(true);
          return {
            widgetId: `${type}-${variant}`, type: type as PageWidgetType, variant,
            endpointKey: `saved-${type}-${variant}`, title: `原${variant}`, appearance: 'compact', options,
            ...(variant === 'number' ? { extraKeys: ['voltage', 'runtime'] }
              : variant === 'memory' ? { extraKeys: ['capacity'] } : {}),
            grid: { x: 0, y: 0, width: VARIANT_SIZES[variant].widths[0],
              height: VARIANT_SIZES[variant].heights[index % VARIANT_SIZES[variant].heights.length] },
          };
        }));
      widgets.forEach((widget, index) => { widget.grid.y = index * 5; });
      // A historical non-preset size and non-visual array order must also survive.
      widgets.unshift({ widgetId: 'legacy-power', type: 'switch', endpointKey: 'saved-power',
        title: '原电源', grid: { x: 5, y: 150, width: 3, height: 5 } });
      widgets.reverse();
      const saved = { schemaVersion: 1, revision: 17, columns: 8,
        manifestFingerprint: 'ab'.repeat(32), style, widgets };
      const before = structuredClone(saved);
      const parsed = parsePageLayout(JSON.parse(JSON.stringify(saved)));
      const submitted = parsePageWidgets(parsed.widgets, undefined, parsed.widgets);
      const restored = parsePageLayout(JSON.parse(JSON.stringify({ ...parsed, widgets: submitted })));

      expect(JSON.parse(JSON.stringify(restored))).toEqual(before);
      expect(restored.widgets).toHaveLength(24);
      expect(restored.widgets.map(widget => widget.widgetId)).toEqual(widgets.map(widget => widget.widgetId));
      expect(saved).toEqual(before);
    });
});
