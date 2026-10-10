// Presentation vocabulary of PageLayout widgets. `type` decides data binding and
// commands; `variant` and `options` only change how a widget looks.
// Aligned with docs/2026-10-10/设备组件库设计稿.html; mirrors gateway/src/device-v2/page-widget.js.

export const PAGE_WIDGET_TYPES = ['switch', 'button', 'slider', 'select', 'input', 'value', 'color'] as const;
export type PageWidgetType = typeof PAGE_WIDGET_TYPES[number];

// The first variant of each type is its default.
export const PAGE_WIDGET_VARIANTS = {
  switch: ['tile', 'entity', 'toggle', 'power', 'chip', 'segment', 'check', 'lock', 'slide'],
  button: ['pill', 'tile', 'icon', 'hold', 'scene', 'keycap'],
  slider: ['fill', 'entity', 'bar', 'gradient', 'dial', 'knob', 'stepper', 'steps', 'curtain', 'ruler', 'timer'],
  select: ['tiles', 'segment', 'pills', 'list', 'wheel', 'menu'],
  input: ['field', 'keypad', 'note'],
  value: [
    'metric', 'entity', 'chip', 'text', 'status', 'countdown', 'matrix',
    'gauge', 'ring', 'level', 'battery', 'signal', 'compass', 'thermo',
    'trend', 'bars', 'wave', 'line', 'timeline', 'stat', 'log',
  ],
  color: ['wheel', 'swatches', 'spectrum'],
} as const satisfies Record<PageWidgetType, readonly string[]>;

export type PageWidgetVariant = typeof PAGE_WIDGET_VARIANTS[PageWidgetType][number];

// 24-bit RGB as declared by a color endpoint.
export const COLOR_MAXIMUM = 0xffffff;

export const PAGE_WIDGET_TONES = ['blue', 'orange', 'green', 'purple', 'teal', 'red'] as const;
export type PageWidgetTone = typeof PAGE_WIDGET_TONES[number];

export const PAGE_WIDGET_FORMATS = ['number', 'percent', 'duration', 'clock', 'bytes'] as const;
export type PageWidgetFormat = typeof PAGE_WIDGET_FORMATS[number];

export interface PageWidgetOptions {
  // Common
  icon?: string;
  tone?: PageWidgetTone;
  caption?: string;
  showTitle?: boolean;
  size?: 'md' | 'lg' | 'xl';
  align?: 'start' | 'center';
  // Texts
  onText?: string;
  offText?: string;
  actionText?: string;
  doneText?: string;
  placeholder?: string;
  labels?: string;
  states?: string;
  choiceIcons?: string;
  presets?: string;
  palette?: string;
  // Behaviour
  confirm?: boolean;
  holdMs?: number;
  allowOff?: boolean;
  longPress?: boolean;
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
  activeStyle?: 'fill' | 'tint' | 'outline';
  corner?: 'none' | 'dot' | 'chevron';
  iconStyle?: 'circle' | 'plain' | 'none';
  orientation?: 'horizontal' | 'vertical';
  fill?: 'solid' | 'gradient';
  track?: 'cct' | 'hue' | 'bright';
  trackSize?: 'thin' | 'mid' | 'thick';
  knob?: 'ring' | 'dot' | 'bar';
  sweep?: number;
  thickness?: number;
  layout?: 'inline' | 'split';
  timerStyle?: 'ring' | 'bar' | 'text';
  unitPosition?: 'sup' | 'base';
  curve?: 'line' | 'area' | 'steps';
  shape?: 'ring' | 'half' | 'segments';
  statusStyle?: 'dot' | 'pill' | 'banner';
  // Toggles
  showState?: boolean;
  showCount?: boolean;
  showValue?: boolean;
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
  size: oneOf('md', 'lg', 'xl'),
  align: oneOf('start', 'center'),
  onText: text(24),
  offText: text(24),
  actionText: text(24),
  doneText: text(24),
  placeholder: text(48),
  // "静音,低,中,高"
  labels: text(120),
  // "在线:ok,离线:off,告警:warn"
  states: text(200),
  // "制冷:snow,制热:flame"
  choiceIcons: text(240),
  // Minutes: "15,30,60,120"
  presets: text(40, /^\d{1,4}(,\d{1,4}){0,5}$/),
  palette: text(120, /^#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6}){0,11}$/),
  confirm: flag,
  holdMs: integer(300, 5000),
  allowOff: flag,
  longPress: flag,
  decimals: integer(0, 4),
  scale: { kind: 'number', nonZero: true },
  format: { kind: 'enum', values: PAGE_WIDGET_FORMATS },
  min: number,
  max: number,
  warnBelow: number,
  warnAbove: number,
  points: integer(8, 120),
  ticks: integer(0, 24),
  activeStyle: oneOf('fill', 'tint', 'outline'),
  corner: oneOf('none', 'dot', 'chevron'),
  iconStyle: oneOf('circle', 'plain', 'none'),
  orientation: oneOf('horizontal', 'vertical'),
  fill: oneOf('solid', 'gradient'),
  track: oneOf('cct', 'hue', 'bright'),
  trackSize: oneOf('thin', 'mid', 'thick'),
  knob: oneOf('ring', 'dot', 'bar'),
  sweep: integer(180, 320),
  thickness: integer(2, 30),
  layout: oneOf('inline', 'split'),
  timerStyle: oneOf('ring', 'bar', 'text'),
  unitPosition: oneOf('sup', 'base'),
  curve: oneOf('line', 'area', 'steps'),
  shape: oneOf('ring', 'half', 'segments'),
  statusStyle: oneOf('dot', 'pill', 'banner'),
  showState: flag,
  showCount: flag,
  showValue: flag,
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
export const COMMON_WIDGET_OPTIONS: readonly PageWidgetOptionKey[] = ['icon', 'tone', 'caption', 'showTitle', 'size', 'align'];

// Further options each variant reads, keyed "type:variant". The inspector and
// the AI layout guide both come from this table.
export const VARIANT_WIDGET_OPTIONS: Readonly<Record<string, readonly PageWidgetOptionKey[]>> = {
  'switch:tile': ['onText', 'offText', 'confirm', 'activeStyle', 'showState', 'corner'],
  'switch:entity': ['onText', 'offText', 'confirm', 'iconStyle'],
  'switch:toggle': ['onText', 'offText', 'confirm', 'iconStyle'],
  'switch:power': ['onText', 'offText', 'confirm'],
  'switch:chip': ['onText', 'offText', 'confirm'],
  'switch:segment': ['onText', 'offText', 'confirm'],
  'switch:check': ['onText', 'offText', 'confirm'],
  'switch:lock': ['onText', 'offText', 'confirm', 'activeStyle'],
  'switch:slide': ['onText', 'offText'],
  'button:pill': ['actionText', 'doneText', 'confirm', 'showCount'],
  'button:tile': ['actionText', 'doneText', 'confirm', 'showCount', 'activeStyle'],
  'button:icon': ['actionText', 'doneText', 'confirm', 'showCount'],
  'button:hold': ['actionText', 'doneText', 'holdMs', 'showCount'],
  'button:scene': ['actionText', 'doneText', 'confirm', 'showCount'],
  'button:keycap': ['actionText', 'doneText', 'confirm'],
  'slider:fill': ['orientation', 'fill', 'showValue', 'ticks', 'decimals', 'scale', 'format'],
  'slider:entity': ['ticks', 'decimals', 'scale', 'format'],
  'slider:bar': ['ticks', 'decimals', 'scale', 'format'],
  'slider:gradient': ['track', 'trackSize', 'knob', 'ticks', 'decimals', 'scale', 'format'],
  'slider:dial': ['sweep', 'thickness', 'ticks', 'showButtons', 'decimals', 'scale', 'format'],
  'slider:knob': ['sweep', 'ticks', 'decimals', 'scale', 'format'],
  'slider:stepper': ['layout', 'longPress', 'showRange', 'decimals', 'scale', 'format'],
  'slider:steps': ['ticks', 'labels', 'allowOff', 'showButtons'],
  'slider:curtain': ['decimals', 'scale', 'format'],
  'slider:ruler': ['decimals', 'scale', 'format'],
  'slider:timer': ['presets', 'actionText', 'timerStyle'],
  'select:tiles': ['choiceIcons', 'showIcons'],
  'select:segment': ['choiceIcons', 'showIcons'],
  'select:pills': ['choiceIcons', 'showIcons'],
  'select:list': ['choiceIcons', 'showIcons'],
  'select:wheel': [],
  'select:menu': [],
  'input:field': ['actionText', 'placeholder', 'showCounter'],
  'input:keypad': ['actionText'],
  'input:note': ['actionText', 'placeholder', 'showCounter'],
  'value:metric': ['decimals', 'scale', 'format', 'unitPosition', 'showDelta', 'warnBelow', 'warnAbove'],
  'value:entity': ['decimals', 'scale', 'format', 'iconStyle', 'onText', 'offText', 'warnBelow', 'warnAbove'],
  'value:chip': ['decimals', 'scale', 'format', 'onText', 'offText', 'warnBelow', 'warnAbove'],
  'value:text': ['decimals', 'scale', 'format', 'onText', 'offText', 'warnBelow', 'warnAbove'],
  'value:status': ['statusStyle', 'states', 'pulse', 'onText', 'offText'],
  'value:countdown': ['max', 'timerStyle', 'scale'],
  'value:matrix': ['decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:gauge': ['min', 'max', 'sweep', 'thickness', 'ticks', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:ring': ['min', 'max', 'shape', 'thickness', 'ticks', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:level': ['min', 'max', 'ticks', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:battery': ['min', 'max', 'ticks', 'decimals', 'format', 'warnBelow', 'warnAbove'],
  'value:signal': ['min', 'max', 'ticks', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:compass': ['scale'],
  'value:thermo': ['min', 'max', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:trend': ['curve', 'smooth', 'points', 'showRange', 'showAxis', 'min', 'max', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:bars': ['points', 'showRange', 'showAxis', 'min', 'max', 'decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:wave': ['points', 'min', 'max', 'decimals', 'scale', 'format'],
  'value:line': ['decimals', 'scale', 'format', 'warnBelow', 'warnAbove'],
  'value:timeline': ['points', 'onText', 'offText', 'states'],
  'value:stat': ['points', 'decimals', 'scale', 'format'],
  'value:log': ['points', 'decimals', 'scale', 'format', 'onText', 'offText'],
  'color:wheel': ['thickness', 'palette', 'showHex'],
  'color:swatches': ['palette', 'showHex'],
  'color:spectrum': ['showHex'],
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

// "名称:值" pairs separated by commas, as used by states and choiceIcons.
export function parsePairs(value: string | undefined): [string, string][] {
  return (value ?? '').split(/[,，]/).flatMap(part => {
    const [name, ...rest] = part.split(/[:：]/);
    return name?.trim() ? [[name.trim(), rest.join(':').trim()] as [string, string]] : [];
  });
}

export function parseList(value: string | undefined): string[] {
  return (value ?? '').split(/[,，]/).map(part => part.trim()).filter(Boolean);
}
