// Presentation vocabulary of PageLayout widgets. `type` decides data binding and
// commands; `variant` and `options` only change how a widget looks.
// Aligned with docs/2026-10-10/设备组件库设计稿.html; mirrors gateway/src/device-v2/page-widget.js.

export const PAGE_WIDGET_TYPES = ['switch', 'button', 'slider', 'select', 'input', 'value', 'color'] as const;
export type PageWidgetType = typeof PAGE_WIDGET_TYPES[number];

// The first variant of each type is its default. Each variant is one component
// of the 「Blinker 控件库」 design (docs/2026-10-10/设备组件库设计稿.html);
// `slide` and `log` follow the same tokens.
export const PAGE_WIDGET_VARIANTS = {
  switch: ['tile', 'toggle', 'slide'],
  button: ['action'],
  slider: ['level', 'gradient', 'dial', 'levels', 'stepper', 'timer'],
  select: ['mode'],
  input: ['text'],
  value: ['number', 'trend', 'ring', 'status', 'log'],
  color: ['picker'],
} as const satisfies Record<PageWidgetType, readonly string[]>;

export type PageWidgetVariant = typeof PAGE_WIDGET_VARIANTS[PageWidgetType][number];

// The sizes each variant is designed for, as grid columns and rows (the
// `spans` and `rowsOpts` of the design draft). Layouts outside them are invalid.
export const VARIANT_SIZES: Readonly<Record<PageWidgetVariant, { widths: readonly number[]; heights: readonly number[] }>> = {
  tile: { widths: [2, 4], heights: [1, 2] },
  toggle: { widths: [4, 8], heights: [1] },
  slide: { widths: [4, 8], heights: [1] },
  action: { widths: [2, 4], heights: [1, 2] },
  mode: { widths: [4, 8], heights: [1, 2] },
  level: { widths: [2, 4, 8], heights: [1, 2, 3, 4] },
  gradient: { widths: [4, 8], heights: [1, 2] },
  dial: { widths: [4, 8], heights: [3, 4] },
  levels: { widths: [2, 4, 8], heights: [1, 2, 3] },
  stepper: { widths: [2, 4, 8], heights: [1, 2] },
  timer: { widths: [4, 8], heights: [2, 3] },
  picker: { widths: [4, 8], heights: [2, 3, 4] },
  text: { widths: [4, 8], heights: [2, 3] },
  number: { widths: [2, 4], heights: [1, 2] },
  trend: { widths: [4, 8], heights: [2, 3] },
  ring: { widths: [2, 4], heights: [2, 3] },
  status: { widths: [2, 4, 8], heights: [1, 2] },
  log: { widths: [4, 8], heights: [2, 3, 4] },
};

// 附属读数: display cards may show up to three more read-only fields in their
// note line, besides the field they are bound to.
export const MAX_EXTRA_KEYS = 3;
export const EXTRA_READING_VARIANTS: readonly PageWidgetVariant[] = ['number', 'ring', 'status'];

export function acceptsExtras(type: PageWidgetType, variant?: PageWidgetVariant): boolean {
  return type === 'value' && EXTRA_READING_VARIANTS.includes(widgetVariant(type, variant));
}

export function widgetVariant(type: PageWidgetType, variant?: PageWidgetVariant): PageWidgetVariant {
  return variant ?? PAGE_WIDGET_VARIANTS[type][0];
}

export function sizeAllowed(variant: PageWidgetVariant, width: number, height: number): boolean {
  const sizes = VARIANT_SIZES[variant];
  return sizes.widths.includes(width) && sizes.heights.includes(height);
}

// The allowed size nearest to the one asked for (the smaller one on a tie).
export function fitSize(variant: PageWidgetVariant, width: number, height: number): { width: number; height: number } {
  const sizes = VARIANT_SIZES[variant];
  return { width: nearest(sizes.widths, width), height: nearest(sizes.heights, height) };
}

function nearest(values: readonly number[], target: number): number {
  return values.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best);
}

// 24-bit RGB as declared by a color endpoint.
export const COLOR_MAXIMUM = 0xffffff;

export const PAGE_WIDGET_TONES = ['blue', 'orange', 'green', 'purple', 'teal', 'red'] as const;
export type PageWidgetTone = typeof PAGE_WIDGET_TONES[number];

export const PAGE_WIDGET_FORMATS = ['number', 'percent', 'duration', 'clock', 'bytes'] as const;
export type PageWidgetFormat = typeof PAGE_WIDGET_FORMATS[number];

// Every value any variant offers for `style`; each variant uses its own subset.
export const PAGE_WIDGET_STYLES = [
  'tiles', 'segmented', 'chips', 'bars', 'dots', 'segment', 'ring', 'bar', 'text', 'dot', 'pill', 'banner',
] as const;
export type PageWidgetStyle = typeof PAGE_WIDGET_STYLES[number];

export interface PageWidgetOptions {
  // Common
  icon?: string;
  tone?: PageWidgetTone;
  caption?: string;
  showTitle?: boolean;
  // Texts
  onText?: string;
  offText?: string;
  actionText?: string;
  doneText?: string;
  placeholder?: string;
  labels?: string;
  states?: string;
  choiceIcons?: string;
  // "ERROR:red,WARN:orange": a tone per choice.
  choiceTones?: string;
  presets?: string;
  palette?: string;
  // Behaviour
  confirm?: boolean;
  hold?: boolean;
  allowOff?: boolean;
  longPress?: boolean;
  multiline?: boolean;
  // Readings
  decimals?: number;
  scale?: number;
  format?: PageWidgetFormat;
  min?: number;
  max?: number;
  warnBelow?: number;
  warnAbove?: number;
  points?: number;
  ticks?: number;
  // Looks
  style?: PageWidgetStyle;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  activeStyle?: 'fill' | 'tint' | 'outline';
  corner?: 'none' | 'dot' | 'chevron';
  iconStyle?: 'circle' | 'plain' | 'none';
  shape?: 'circle' | 'card' | 'ring' | 'half' | 'segments';
  orientation?: 'vertical' | 'horizontal';
  fill?: 'solid' | 'gradient';
  track?: 'cct' | 'hue' | 'bright';
  trackSize?: 'thin' | 'mid' | 'thick';
  knob?: 'ring' | 'dot' | 'bar';
  sweep?: number;
  thickness?: number;
  layout?: 'inline' | 'split';
  chart?: 'line' | 'area' | 'bars' | 'steps';
  mode?: 'wheel' | 'swatches' | 'both';
  unitPosition?: 'sup' | 'base';
  // Toggles
  showState?: boolean;
  showCount?: boolean;
  showValue?: boolean;
  showTicks?: boolean;
  showButtons?: boolean;
  showIcons?: boolean;
  showHex?: boolean;
  showDelta?: boolean;
  showRange?: boolean;
  showAxis?: boolean;
  showCounter?: boolean;
  smooth?: boolean;
  pulse?: boolean;
}

export type PageWidgetOptionKey = keyof PageWidgetOptions;

export type OptionRule =
  | { kind: 'text'; bytes: number; pattern?: RegExp }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'boolean' }
  | { kind: 'integer'; min: number; max: number }
  | { kind: 'number'; nonZero?: boolean };

const text = (bytes: number, pattern?: RegExp): OptionRule => ({ kind: 'text', bytes, pattern });
const oneOf = (...values: string[]): OptionRule => ({ kind: 'enum', values });
const flag: OptionRule = { kind: 'boolean' };
const integer = (min: number, max: number): OptionRule => ({ kind: 'integer', min, max });
const number: OptionRule = { kind: 'number' };

export const PAGE_WIDGET_OPTION_RULES: Readonly<Record<PageWidgetOptionKey, OptionRule>> = {
  icon: text(40, /^[a-z0-9-]+$/),
  tone: { kind: 'enum', values: PAGE_WIDGET_TONES },
  caption: text(64),
  showTitle: flag,
  onText: text(24),
  offText: text(24),
  actionText: text(24),
  doneText: text(24),
  placeholder: text(48),
  // "静音,低,中,高"
  labels: text(120),
  // "在线:ok,离线:off,告警:warn"
  states: text(200),
  // "自动:auto,省电:moon"
  choiceIcons: text(240),
  // "ERROR:red,WARN:orange"
  choiceTones: text(240),
  // Minutes: "15,30,60,120"
  presets: text(40, /^\d{1,4}(,\d{1,4}){0,5}$/),
  palette: text(120, /^#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6}){0,11}$/),
  confirm: flag,
  hold: flag,
  allowOff: flag,
  longPress: flag,
  multiline: flag,
  decimals: integer(0, 4),
  scale: { kind: 'number', nonZero: true },
  format: { kind: 'enum', values: PAGE_WIDGET_FORMATS },
  min: number,
  max: number,
  warnBelow: number,
  warnAbove: number,
  points: integer(8, 120),
  ticks: integer(0, 24),
  style: { kind: 'enum', values: PAGE_WIDGET_STYLES },
  size: oneOf('sm', 'md', 'lg', 'xl'),
  activeStyle: oneOf('fill', 'tint', 'outline'),
  corner: oneOf('none', 'dot', 'chevron'),
  iconStyle: oneOf('circle', 'plain', 'none'),
  shape: oneOf('circle', 'card', 'ring', 'half', 'segments'),
  orientation: oneOf('vertical', 'horizontal'),
  fill: oneOf('solid', 'gradient'),
  track: oneOf('cct', 'hue', 'bright'),
  trackSize: oneOf('thin', 'mid', 'thick'),
  knob: oneOf('ring', 'dot', 'bar'),
  sweep: integer(180, 320),
  thickness: integer(3, 30),
  layout: oneOf('inline', 'split'),
  chart: oneOf('line', 'area', 'bars', 'steps'),
  mode: oneOf('wheel', 'swatches', 'both'),
  unitPosition: oneOf('sup', 'base'),
  showState: flag,
  showCount: flag,
  showValue: flag,
  showTicks: flag,
  showButtons: flag,
  showIcons: flag,
  showHex: flag,
  showDelta: flag,
  showRange: flag,
  showAxis: flag,
  showCounter: flag,
  smooth: flag,
  pulse: flag,
};

// Options every widget reads.
export const COMMON_WIDGET_OPTIONS: readonly PageWidgetOptionKey[] = ['icon', 'tone', 'caption', 'showTitle'];

// Further options each variant reads, keyed by variant (names are unique across
// types). The inspector and the AI layout guide both follow this table.
export const VARIANT_WIDGET_OPTIONS: Readonly<Record<PageWidgetVariant, readonly PageWidgetOptionKey[]>> = {
  tile: ['activeStyle', 'showState', 'onText', 'offText', 'corner', 'confirm'],
  toggle: ['iconStyle', 'size', 'confirm'],
  slide: ['onText', 'offText'],
  action: ['shape', 'hold', 'doneText', 'showCount'],
  level: ['orientation', 'fill', 'showValue', 'ticks'],
  gradient: ['track', 'trackSize', 'knob', 'showTicks'],
  dial: ['sweep', 'thickness', 'showTicks', 'showButtons'],
  levels: ['style', 'labels', 'allowOff', 'showButtons'],
  stepper: ['layout', 'longPress', 'showRange'],
  timer: ['presets', 'actionText', 'style'],
  mode: ['style', 'showIcons', 'choiceIcons', 'choiceTones'],
  text: ['placeholder', 'actionText', 'showCounter', 'multiline'],
  number: ['decimals', 'size', 'unitPosition', 'showDelta', 'warnBelow', 'warnAbove', 'scale', 'format'],
  trend: ['chart', 'points', 'smooth', 'showRange', 'showAxis', 'decimals', 'scale'],
  ring: ['shape', 'min', 'max', 'warnBelow', 'warnAbove', 'decimals', 'scale'],
  status: ['style', 'states', 'pulse', 'onText', 'offText'],
  log: ['points', 'onText', 'offText', 'decimals', 'scale'],
  picker: ['mode', 'thickness', 'palette', 'showHex'],
};

// Enumerated options whose allowed values differ by variant.
export const VARIANT_OPTION_VALUES: Readonly<Partial<Record<PageWidgetVariant, Partial<Record<PageWidgetOptionKey, readonly string[]>>>>> = {
  action: { shape: ['circle', 'card'] },
  ring: { shape: ['ring', 'half', 'segments'] },
  toggle: { size: ['sm', 'md', 'lg'] },
  number: { size: ['md', 'lg', 'xl'] },
  mode: { style: ['tiles', 'segmented', 'chips'] },
  levels: { style: ['bars', 'dots', 'segment'] },
  timer: { style: ['ring', 'bar', 'text'] },
  status: { style: ['dot', 'pill', 'banner'] },
};

export function parseWidgetVariant(type: PageWidgetType, value: unknown, label: string): PageWidgetVariant | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(PAGE_WIDGET_VARIANTS[type] as readonly string[]).includes(value)) {
    throw new Error(`${label} variant is invalid`);
  }
  return value as PageWidgetVariant;
}

export function parseWidgetOptions(value: unknown, label: string): PageWidgetOptions | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} options are invalid`);

  const options: Record<string, unknown> = {};
  for (const [key, option] of Object.entries(value)) {
    const rule = Object.hasOwn(PAGE_WIDGET_OPTION_RULES, key) ? PAGE_WIDGET_OPTION_RULES[key as PageWidgetOptionKey] : undefined;
    if (!rule || !validOption(rule, option)) throw new Error(`${label} option ${key} is invalid`);
    options[key] = option;
  }

  const { min, max } = options as PageWidgetOptions;
  if (min !== undefined && max !== undefined && min >= max) throw new Error(`${label} option range is invalid`);
  return options as PageWidgetOptions;
}

export function validOption(rule: OptionRule, value: unknown): boolean {
  if (rule.kind === 'boolean') return typeof value === 'boolean';
  if (rule.kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value) && (!rule.nonZero || value !== 0);
  }
  if (rule.kind === 'integer') {
    return Number.isInteger(value) && (value as number) >= rule.min && (value as number) <= rule.max;
  }
  if (rule.kind === 'enum') return typeof value === 'string' && rule.values.includes(value);

  return typeof value === 'string' && value.length > 0 && !value.includes('\0')
    && new TextEncoder().encode(value).length <= rule.bytes
    && (!rule.pattern || rule.pattern.test(value));
}

// "名称:值" pairs separated by commas, as used by states, choiceIcons and choiceTones.
export function parsePairs(value: string | undefined): [string, string][] {
  return (value ?? '').split(/[,，]/).flatMap(part => {
    const [name, ...rest] = part.split(/[:：]/);
    return name?.trim() ? [[name.trim(), rest.join(':').trim()] as [string, string]] : [];
  });
}

export function parseList(value: string | undefined): string[] {
  return (value ?? '').split(/[,，]/).map(part => part.trim()).filter(Boolean);
}
