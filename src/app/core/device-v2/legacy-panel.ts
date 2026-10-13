import type { BlinkerDevice } from '../model/device.model';
import type { DeviceUiEndpoint, DeviceUiValue } from './device-ui.port';
import { parsePageWidgets, type PageLayoutWidget } from './page-layout';
import { fitSize, type PageWidgetType } from './page-widget';
import { placeWidget, type PanelDocument } from './panel-document';
import { normalizeUiTheme } from './ui-theme';
import { presetForVariant } from './widget-presets';

export interface LegacyBinding {
  field: DeviceUiEndpoint;
  source: Record<string, unknown>;
}

export interface LegacyPanel {
  document: PanelDocument;
  bindings: Record<string, LegacyBinding>;
  omitted: number;
}

export function legacyRoot(raw?: string): Record<string, unknown> {
  const root: unknown = JSON.parse(raw || '{}');

  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('旧界面配置无法读取');

  return root as Record<string, unknown>;
}

export function readLegacyPanel(device: BlinkerDevice): LegacyPanel {
  const root = legacyRoot(device.config.layouter);
  const saved = root['pagePanel'] as (PanelDocument & { bindings: Record<string, LegacyBinding> }) | undefined;

  if (saved) {
    if (saved.schemaVersion !== 1 || saved.columns !== 8 || !saved.bindings) throw new Error('组件面板格式不受支持');

    const widgets = parsePageWidgets(saved.widgets);

    for (const widget of widgets) {
      if (saved.bindings[widget.widgetId]?.field?.key !== widget.endpointKey) throw new Error('组件字段绑定已损坏');
    }

    if (widgets.length) {
      return { document: { schemaVersion: 1, columns: 8, widgets, style: normalizeUiTheme(saved.style) },
        bindings: saved.bindings, omitted: 0 };
    }
  }

  const dashboard = Array.isArray(root['dashboard']) ? root['dashboard'] as Record<string, unknown>[] : [];
  const sources = [...dashboard];

  if (!sources.length) {
    if (device.config.showSwitch) sources.push({ type: 'btn', mode: 1, key: 'switch', t0: '电源开关' });

    for (const [key, value] of Object.entries(device.data || {})) {
      if (typeof value === 'number' && Number.isFinite(value) && !['timestamp', 'lastSeen', 'revision'].includes(key)) {
        sources.push({ type: 'num', key, t0: key });
      }
    }
  }

  const widgets: PageLayoutWidget[] = [];
  const bindings: Record<string, LegacyBinding> = {};
  const types: Record<string, PageWidgetType> = { btn: 'button', num: 'value', ran: 'slider', inp: 'input', col: 'color' };
  let omitted = 0;

  for (const [index, source] of sources.entries()) {
    if (!source || typeof source['key'] !== 'string' || !types[String(source['type'])]) { omitted++; continue; }

    const type = source['type'] === 'btn' && Number(source['mode']) === 1 ? 'switch' : types[String(source['type'])];
    const variant = { switch: 'tile', button: 'action', value: 'number', slider: 'level', input: 'text', color: 'picker' }[type];
    const preset = presetForVariant(variant as Parameters<typeof presetForVariant>[0]);
    const id = `legacy-${index}`;

    const field: DeviceUiEndpoint = {
      id: index, key: source['key'], role: type === 'button' ? 'action' : 'property',
      valueType: type === 'switch' ? 'boolean' : type === 'input' ? 'text' : type === 'button' ? 'null' : type === 'color' ? 'integer' : 'number',
      readable: type !== 'button', writable: type !== 'value', notifies: false,
      unit: typeof source['uni'] === 'string' ? source['uni'] : undefined,
      ...(type === 'slider' ? { minimum: number(source['min'], 0), maximum: number(source['max'], 100), step: number(source['step'], 1) } : {}),
      ...(type === 'color' ? { minimum: 0, maximum: 0xffffff } : {}),
    };

    const size = fitSize(preset.variant, number(source['cols'], preset.width), number(source['rows'], preset.height));

    const widget: PageLayoutWidget = {
      widgetId: id, endpointKey: field.key, type, variant: preset.variant,
      title: String(source['t0'] || field.key), options: { ...preset.options },
      grid: { x: Math.max(0, Math.min(8 - size.width, Math.round(number(source['x'], 0)))),
        y: Math.max(0, Math.round(number(source['y'], 0))), ...size },
    };

    widgets.push(placeWidget(widget, widgets));

    bindings[id] = { field, source: { ...source } };
  }

  const config = root['config'] as Record<string, unknown> | undefined;

  return { document: { schemaVersion: 1, columns: 8, widgets, style: normalizeUiTheme(saved?.style) ?? normalizeUiTheme(config?.['interfaceStyle']) }, bindings, omitted };
}

export function writeLegacyPanel(raw: string | undefined, document: PanelDocument, bindings: Record<string, LegacyBinding>): string {
  const widgets = parsePageWidgets(document.widgets);

  for (const widget of widgets) {
    if (bindings[widget.widgetId]?.field.key !== widget.endpointKey) throw new Error('缺少部件的字段绑定');
  }

  return JSON.stringify({ ...legacyRoot(raw), pagePanel: { ...document, widgets,
    bindings } });
}

export function legacyField(binding: LegacyBinding, device: BlinkerDevice): DeviceUiEndpoint {
  const reported: unknown = device.data?.[binding.field.key];
  const source = binding.source;
  const state = reported && typeof reported === 'object' ? reported as Record<string, unknown> : undefined;

  const value = reported != null && typeof reported !== 'object' ? reported
    : state?.['swi'] ?? state?.['switch'] ?? state?.['val'] ?? state?.['value']
      ?? source['swi'] ?? source['val'];

  let normalized: DeviceUiValue | undefined;

  if (binding.field.minimum === 0 && binding.field.maximum === 0xffffff && Array.isArray(reported)) {
    normalized = ((Number(reported[0]) & 255) << 16) | ((Number(reported[1]) & 255) << 8) | (Number(reported[2]) & 255);
  } else if (binding.field.valueType === 'boolean') {
    normalized = value === true || value === 'on' ? true : value === false || value === 'off' ? false : undefined;
  } else if (binding.field.valueType === 'number' || binding.field.valueType === 'integer') {
    normalized = value === undefined ? undefined : number(value, NaN);

    if (!Number.isFinite(normalized)) normalized = undefined;
  } else if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') normalized = value;

  return { ...binding.field, value: normalized };
}

export function legacyCommand(binding: LegacyBinding, device: BlinkerDevice, value: unknown, invoke = false): unknown {
  const reported = device.data?.[binding.field.key];

  const property = (key: string) => reported && typeof reported === 'object' && reported[key] !== undefined
    ? reported[key] : binding.source[key];

  if (invoke) return Number(property('mode')) === 2 ? property('cus') ?? property('custom') ?? '' : 'tap';
  if (binding.field.valueType === 'boolean') return value ? 'on' : 'off';

  if (binding.field.minimum === 0 && binding.field.maximum === 0xffffff && typeof value === 'number') {
    return [value >> 16 & 255, value >> 8 & 255, value & 255, Array.isArray(reported) ? reported[3] ?? 255 : 255];
  }

  return value;
}

function number(value: unknown, fallback: number): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}
