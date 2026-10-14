import type { DeviceUiEndpoint, DeviceUiValue } from '../../../core/device-v2/device-ui.port';
import type { HistoryPoint } from '../../../core/device-v2/endpoint-history';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import { PAGE_WIDGET_TONES, PAGE_WIDGET_VARIANTS, PageWidgetOptions, PageWidgetVariant, parsePairs } from '../../../core/device-v2/page-widget';

export type { HistoryPoint } from '../../../core/device-v2/endpoint-history';

export interface PanelCard {
  widget: PageLayoutWidget;

  field: DeviceUiEndpoint;
  value: DeviceUiValue | undefined;

  // 附属读数: the widget's extraKeys that the device declares, in order.
  extras?: readonly { field: DeviceUiEndpoint; value: DeviceUiValue | undefined }[];
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
  widgetId?: string;
}

export function variantOf(widget: PageLayoutWidget): PageWidgetVariant {
  return widget.variant ?? PAGE_WIDGET_VARIANTS[widget.type][0];
}

export function optionsOf(card: PanelCard): PageWidgetOptions {
  return card.widget.options ?? {};
}

// The field's choices, each with the icon and tone the options give it (choiceIcons, choiceTones).
export function choicesOf(card: PanelCard): { label: string; icon: string; tone: string }[] {
  const options = optionsOf(card);
  const icons = new Map(parsePairs(options.choiceIcons));
  const tones = new Map(parsePairs(options.choiceTones));

  return (card.field.choices ?? []).map(label => {
    const tone = tones.get(label) ?? '';

    return { label, icon: icons.get(label) ?? '', tone: (PAGE_WIDGET_TONES as readonly string[]).includes(tone) ? tone : '' };
  });
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

export function formatValue(value?: DeviceUiValue): string {
  if (value instanceof Uint8Array) {
    return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join(' ');
  }

  return value === undefined ? '—' : String(value);
}

export function formatNumber(value: number, decimals?: number): string {
  if (decimals !== undefined) return value.toFixed(decimals);

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

const compactNumberFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact', maximumSignificantDigits: 3, useGrouping: false,
});

const scientificNumberFormat = new Intl.NumberFormat('en-US', {
  notation: 'scientific', maximumSignificantDigits: 3, useGrouping: false,
});

// Display-only magnitude notation; units and the original device value stay intact.
export function compactNumber(value: number | bigint): string {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);

  const magnitude = value < 0 ? -value : value;

  const formatter = magnitude >= 1e15 || (magnitude > 0 && magnitude < 0.01)
    ? scientificNumberFormat : compactNumberFormat;

  return formatter.format(value).replace('E', 'e');
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

// Seconds as mm:ss or h:mm:ss.
export function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor(total % 3600 / 60)).padStart(2, '0');
  const rest = String(total % 60).padStart(2, '0');

  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
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
  const finish = Math.min(Math.max(to, from + 0.01), from + 359.99);
  const start = polar(cx, cy, radius, from);
  const end = polar(cx, cy, radius, finish);
  const large = finish - from > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = (angle - 90) * Math.PI / 180;

  return { x: +(cx + radius * Math.cos(radians)).toFixed(3), y: +(cy + radius * Math.sin(radians)).toFixed(3) };
}

// Colours are 24-bit RGB integers on the wire and #RRGGBB on screen.
export function hexOf(rgb: number): string {
  return '#' + Math.round(rgb).toString(16).padStart(6, '0').toUpperCase();
}

export function hueOf(rgb: number): number {
  const r = (rgb >> 16 & 255) / 255, g = (rgb >> 8 & 255) / 255, b = (rgb & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;

  if (!d) return 0;

  const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;

  return hue * 60;
}

export function rgbOfHsl(hue: number, saturation: number, lightness: number): number {
  const s = saturation / 100, l = lightness / 100;
  const a = s * Math.min(l, 1 - l);

  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;

    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };

  return channel(0) << 16 | channel(8) << 8 | channel(4);
}

export function isLight(rgb: number): boolean {
  return 0.299 * (rgb >> 16 & 255) + 0.587 * (rgb >> 8 & 255) + 0.114 * (rgb & 255) > 170;
}
