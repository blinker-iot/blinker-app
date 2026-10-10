import type { DeviceUiEndpoint, DeviceUiValue } from '../../../core/device-v2/device-ui.port';
import type { HistoryPoint } from '../../../core/device-v2/endpoint-history';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import { PAGE_WIDGET_VARIANTS, PageWidgetOptions, PageWidgetVariant } from '../../../core/device-v2/page-widget';

// Visual families: each one is rendered by a single widget component.
export type WidgetFamily =
  | 'switch' | 'button' | 'slider' | 'dial' | 'select' | 'input' | 'value' | 'meter' | 'chart' | 'color';

const FAMILY_OF_VARIANT: Readonly<Record<string, WidgetFamily>> = {
  'slider:dial': 'dial', 'slider:knob': 'dial',
  'value:gauge': 'meter', 'value:ring': 'meter', 'value:level': 'meter', 'value:battery': 'meter',
  'value:signal': 'meter', 'value:compass': 'meter', 'value:thermo': 'meter',
  'value:trend': 'chart', 'value:bars': 'chart', 'value:wave': 'chart',
  'value:line': 'chart', 'value:timeline': 'chart', 'value:stat': 'chart', 'value:log': 'chart',
};

export type { HistoryPoint } from '../../../core/device-v2/endpoint-history';

export interface PanelCard {
  widget: PageLayoutWidget;
  field: DeviceUiEndpoint;
  value: DeviceUiValue | undefined;
  // Oldest first. Absent when the host records no history.
  history?: readonly HistoryPoint[];
  display: string;
  draft: string;
  error: string;
  disabled: boolean;
}

export type PanelActionKind = 'toggle' | 'range' | 'select' | 'draft' | 'commit' | 'invoke';
export type PanelActionValue = boolean | number | string;

export interface WidgetAct {
  kind: PanelActionKind;
  value?: PanelActionValue;
}

export interface PanelAction extends WidgetAct {
  field: DeviceUiEndpoint;
}

export function variantOf(widget: PageLayoutWidget): PageWidgetVariant {
  return widget.variant ?? PAGE_WIDGET_VARIANTS[widget.type][0];
}

export function familyOf(widget: PageLayoutWidget): WidgetFamily {
  return FAMILY_OF_VARIANT[`${widget.type}:${variantOf(widget)}`] ?? widget.type;
}

export function optionsOf(card: PanelCard): PageWidgetOptions {
  return card.widget.options ?? {};
}

export function toneOf(options: PageWidgetOptions): string | null {
  return options.tone ? `var(--ui-${options.tone})` : null;
}

export function numeric(value: DeviceUiValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

// Position of `value` within [minimum, maximum] as 0..1.
export function ratio(value: number, minimum: number, maximum: number): number {
  return maximum > minimum ? clamp((value - minimum) / (maximum - minimum), 0, 1) : 0;
}

// Snap to the endpoint's own step grid; the port still validates the result.
export function quantize(value: number, minimum: number, maximum: number, step: number): number {
  const snapped = minimum + Math.round((value - minimum) / step) * step;
  return Number(clamp(snapped, minimum, maximum).toFixed(decimalsOf(step)));
}

export function decimalsOf(step: number | undefined): number {
  if (!step || Number.isInteger(step)) return 0;
  return Math.min(4, String(step).split('.')[1]?.length ?? 0);
}

export function formatNumber(value: number, decimals?: number): string {
  if (decimals !== undefined) return value.toFixed(decimals);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

// Display text for a reading after `scale` and `format`; formats carry their own unit.
export function present(
  value: number, options: PageWidgetOptions, field: DeviceUiEndpoint,
): { text: string; unit: string } {
  const scaled = value * (options.scale ?? 1);
  const unit = field.unit ?? '';

  switch (options.format) {
    case 'percent': {
      const minimum = options.min ?? field.minimum ?? 0;
      const maximum = options.max ?? field.maximum ?? 100;
      return { text: formatNumber(ratio(scaled, minimum, maximum) * 100, options.decimals ?? 0), unit: '%' };
    }
    case 'duration': return { text: duration(scaled), unit: '' };
    case 'clock': return { text: clock(scaled), unit: '' };
    case 'bytes': return bytes(scaled, options.decimals);
    default: return { text: formatNumber(scaled, options.decimals), unit };
  }
}

// Seconds as m:ss or h:mm:ss.
export function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// Seconds since midnight as HH:MM.
export function clock(seconds: number): string {
  const total = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total % 3600 / 60)).padStart(2, '0')}`;
}

function bytes(value: number, decimals?: number): { text: string; unit: string } {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = Math.abs(value);
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return { text: formatNumber(Math.sign(value) * scaled, decimals ?? (index ? 1 : 0)), unit: units[index] };
}

export function isAlert(value: number | undefined, options: PageWidgetOptions): boolean {
  if (value === undefined) return false;
  return (options.warnBelow !== undefined && value < options.warnBelow)
    || (options.warnAbove !== undefined && value > options.warnAbove);
}

// SVG arc on a clock face: 0deg points up, angles grow clockwise.
export function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const start = polar(cx, cy, radius, from);
  const end = polar(cx, cy, radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: +(cx + radius * Math.cos(radians)).toFixed(3), y: +(cy + radius * Math.sin(radians)).toFixed(3) };
}
