import type { PageWidgetOptions, PageWidgetType, PageWidgetVariant } from './page-widget';
import type { DeviceUiEndpoint } from './device-ui.port';
import { variantsFor } from './page-layout';

export interface WidgetPreset {
  type: PageWidgetType;
  variant: PageWidgetVariant;
  width: 2 | 4 | 8;
  height: number;
  options: PageWidgetOptions;
}

// Narrow the add catalogue without invalidating previously saved layouts.
export function presetMatchesField(preset: WidgetPreset, field: DeviceUiEndpoint): boolean {
  if (!variantsFor(preset.type, field).includes(preset.variant)) return false;

  if (variantsFor('color', field).length) return preset.type === 'color';

  const numeric = field.valueType === 'integer' || field.valueType === 'number';

  const bounded = Number.isFinite(field.minimum) && Number.isFinite(field.maximum)
    && field.maximum! > field.minimum!;

  if (preset.type === 'value') {
    if (field.role === 'event') return preset.variant === 'status' || preset.variant === 'log';
    if (field.role !== 'property') return false;

    switch (preset.variant) {
      case 'number':
      case 'uptime':
      case 'memory':
      case 'trend': return numeric;
      case 'ring': return numeric && bounded;
      case 'status': return numeric || field.valueType === 'boolean' || field.valueType === 'text';
      case 'log': return field.valueType === 'text' && !field.choices?.length;

      default: return false;
    }
  }

  if (preset.type === 'slider') {
    if (!bounded) return false;

    if (preset.variant === 'levels') {
      const step = field.step ?? 1;
      const intervals = (field.maximum! - field.minimum!) / step;

      // The levels widget displays at most twelve values, including off.
      return Number.isInteger(step) && step > 0 && Number.isInteger(field.minimum)
        && Number.isInteger(intervals) && intervals >= 1 && intervals < 12;
    }

    if (preset.variant === 'timer') {
      return field.minimum === 0 && ['s', 'sec', 'second', 'seconds', '秒'].includes(field.unit?.trim().toLowerCase() ?? '');
    }
  }

  // Enumerated text must use choices, not an unrestricted text input.
  if (preset.type === 'input' && field.choices?.length) return false;

  return true;
}

// Shared component appearances. Example readings, thresholds and device-specific
// copy belong to the gallery fixtures, not to a real device's preset.
export const WIDGET_PRESETS = {
  'led-tile': {
    type: 'switch', variant: 'tile',
    width: 2, height: 2,
    options: { icon: 'bulb', tone: 'orange' },
  },

  'relay-tile': {
    type: 'switch', variant: 'tile',
    width: 2, height: 2,
    options: { icon: 'plug', activeStyle: 'tint', corner: 'chevron' },
  },

  'restart-action': {
    type: 'button', variant: 'action',
    width: 2, height: 2,
    options: { icon: 'restart', tone: 'red', hold: true },
  },

  'calibration-action': {
    type: 'button', variant: 'action',
    width: 2, height: 2,
    options: { icon: 'gauge', tone: 'teal', shape: 'card', showCount: true },
  },

  'buzzer-tile': {
    type: 'switch', variant: 'tile',
    width: 4, height: 1,
    options: { icon: 'speaker', tone: 'purple' },
  },

  'report-action': {
    type: 'button', variant: 'action',
    width: 4, height: 1,
    options: { icon: 'send', shape: 'card' },
  },

  'sleep-toggle': {
    type: 'switch', variant: 'toggle',
    width: 4, height: 1,
    options: { icon: 'moon', tone: 'purple' },
  },

  'debug-toggle': {
    type: 'switch', variant: 'toggle',
    width: 4, height: 1,
    options: { icon: 'terminal', tone: 'teal' },
  },

  'pump-slide': {
    type: 'switch', variant: 'slide',
    width: 8, height: 1,
    options: { icon: 'drop' },
  },

  'motor-hold': {
    type: 'switch', variant: 'hold',
    width: 4, height: 1,
    options: { icon: 'fan', tone: 'orange' },
  },

  'buzzer-keys': {
    type: 'button', variant: 'keys',
    width: 4, height: 1,
    options: {  },
  },

  'remote-keys': {
    type: 'button', variant: 'keys',
    width: 4, height: 3,
    options: { icon: 'tv' },
  },

  'direction-pad': {
    type: 'button', variant: 'dpad',
    width: 4, height: 3,
    options: { icon: 'play', momentary: true },
  },

  'servo-dial': {
    type: 'slider', variant: 'dial',
    width: 4, height: 4,
    options: { icon: 'servo', showButtons: true },
  },

  'rgb-picker': {
    type: 'color', variant: 'picker',
    width: 4, height: 4,
    options: { icon: 'palette', showHex: true },
  },

  'pwm-level': {
    type: 'slider', variant: 'level',
    width: 2, height: 3,
    options: { icon: 'bolt', tone: 'orange' },
  },

  'fan-level': {
    type: 'slider', variant: 'level',
    width: 2, height: 3,
    options: { icon: 'fan', tone: 'teal', fill: 'gradient' },
  },

  'motor-levels': {
    type: 'slider', variant: 'levels',
    width: 4, height: 3,
    options: { icon: 'fan', allowOff: true },
  },

  'hue-gradient': {
    type: 'slider', variant: 'gradient',
    width: 4, height: 2,
    options: { icon: 'palette', track: 'hue' },
  },

  'temperature-gradient': {
    type: 'slider', variant: 'gradient',
    width: 4, height: 2,
    options: { icon: 'sun', track: 'cct', showTicks: true },
  },

  'sampling-stepper': {
    type: 'slider', variant: 'stepper',
    width: 4, height: 2,
    options: { icon: 'timer', longPress: true, showRange: true },
  },

  'shutdown-timer': {
    type: 'slider', variant: 'timer',
    width: 4, height: 2,
    options: { icon: 'timer', tone: 'purple' },
  },

  'backlight-level': {
    type: 'slider', variant: 'level',
    width: 4, height: 1,
    options: { icon: 'sun' },
  },

  'report-stepper': {
    type: 'slider', variant: 'stepper',
    width: 4, height: 1,
    options: { icon: 'wifi' },
  },

  'servo-stepper': {
    type: 'slider', variant: 'stepper',
    width: 8, height: 1,
    options: { icon: 'servo' },
  },

  'motion-status': {
    type: 'value', variant: 'status',
    width: 4, height: 2,
    options: { icon: 'eye' },
  },

  'button-status': {
    type: 'value', variant: 'status',
    width: 4, height: 2,
    options: { icon: 'pulse', style: 'pill' },
  },

  'temperature-number': {
    type: 'value', variant: 'number',
    width: 2, height: 2,
    options: { icon: 'chip', tone: 'orange', showDelta: true },
  },

  'voltage-number': {
    type: 'value', variant: 'number',
    width: 2, height: 2,
    options: { icon: 'bolt' },
  },

  'memory-number': {
    type: 'value', variant: 'number',
    width: 2, height: 2,
    options: { icon: 'chip', tone: 'green' },
  },
  'device-uptime': {
    type: 'value', variant: 'uptime',
    width: 4, height: 2,
    options: { icon: 'timer', tone: 'purple' },
  },
  'memory-usage': {
    type: 'value', variant: 'memory',
    width: 4, height: 3,
    options: { icon: 'chip', tone: 'teal' },
  },

  'signal-number': {
    type: 'value', variant: 'number',
    width: 2, height: 2,
    options: { icon: 'wifi' },
  },

  'temperature-trend': {
    type: 'value', variant: 'trend',
    width: 4, height: 2,
    options: { icon: 'thermo', tone: 'orange', chart: 'area', smooth: true, showRange: true },
  },

  'light-trend': {
    type: 'value', variant: 'trend',
    width: 4, height: 2,
    options: { icon: 'sun', tone: 'teal', chart: 'bars', points: 24 },
  },

  'battery-ring': {
    type: 'value', variant: 'ring',
    width: 2, height: 2,
    options: { icon: 'battery', tone: 'green' },
  },

  'cpu-ring': {
    type: 'value', variant: 'ring',
    width: 2, height: 2,
    options: { icon: 'chip', shape: 'half' },
  },

  'storage-ring': {
    type: 'value', variant: 'ring',
    width: 2, height: 2,
    options: { icon: 'storage', shape: 'segments', tone: 'purple' },
  },

  'wifi-status': {
    type: 'value', variant: 'status',
    width: 2, height: 2,
    options: { icon: 'wifi' },
  },

  'gpio-status': {
    type: 'value', variant: 'status',
    width: 4, height: 1,
    options: { icon: 'pulse', style: 'pill', pulse: false },
  },

  'runtime-status': {
    type: 'value', variant: 'status',
    width: 4, height: 1,
    options: { style: 'banner' },
  },

  'adc-trend': {
    type: 'value', variant: 'trend',
    width: 4, height: 3,
    options: { icon: 'pulse', chart: 'line', points: 60, showAxis: true },
  },

  'event-log': {
    type: 'value', variant: 'log',
    width: 4, height: 3,
    options: { icon: 'eye' },
  },

  'display-text': {
    type: 'input', variant: 'text',
    width: 4, height: 2,
    options: { icon: 'tv', showCounter: true },
  },

  'operating-mode': {
    type: 'select', variant: 'mode',
    width: 4, height: 2,
    options: {  },
  },

  'adc-mode': {
    type: 'select', variant: 'mode',
    width: 4, height: 2,
    options: { icon: 'gauge', style: 'segmented' },
  },

  'log-mode': {
    type: 'select', variant: 'mode',
    width: 4, height: 2,
    options: { icon: 'filter', style: 'segmented' },
  },

  'serial-text': {
    type: 'input', variant: 'text',
    width: 8, height: 2,
    options: { icon: 'terminal', actionText: '发送', multiline: true },
  },
} as const satisfies Record<string, WidgetPreset>;

export type WidgetPresetId = keyof typeof WIDGET_PRESETS;

export const DEFAULT_WIDGET_PRESETS = {
  tile: 'relay-tile',
  toggle: 'debug-toggle',
  slide: 'pump-slide',
  hold: 'motor-hold',
  action: 'calibration-action',
  keys: 'remote-keys',
  dpad: 'direction-pad',
  level: 'pwm-level',
  gradient: 'hue-gradient',
  dial: 'servo-dial',
  levels: 'motor-levels',
  stepper: 'sampling-stepper',
  timer: 'shutdown-timer',
  picker: 'rgb-picker',
  number: 'temperature-number',
  trend: 'temperature-trend',
  ring: 'battery-ring',
  status: 'gpio-status',
  log: 'event-log',
  uptime: 'device-uptime',
  memory: 'memory-usage',
  mode: 'adc-mode',
  text: 'serial-text',
} as const satisfies Record<PageWidgetVariant, WidgetPresetId>;

export function presetForVariant(variant: PageWidgetVariant): WidgetPreset {
  return WIDGET_PRESETS[DEFAULT_WIDGET_PRESETS[variant]];
}
