import { legacyField, readLegacyPanel } from '../../../core/device-v2/legacy-panel';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';

import {
  generateDefaultPageLayout, PageLayout, PageWidgetOptions, PageWidgetType, PageWidgetVariant, parsePageLayout, reflowPageWidgets,
  variantsFor,
} from '../../../core/device-v2/page-layout';

import { fitSize, widgetVariant } from '../../../core/device-v2/page-widget';
import { presetForVariant } from '../../../core/device-v2/widget-presets';
import { UiTheme } from '../../../core/device-v2/ui-theme';

export interface InterfaceTile {
  id: string;
  key: string;
  title: string;
  type: PageWidgetType;
  value: string;
  unit: string;
  level?: number;
  width: 2 | 4 | 6 | 8;

  height?: number;
  emphasized: boolean;
  compact?: boolean;
  // Presentation chosen by AI; absent means the field's default variant.
  variant?: PageWidgetVariant;

  // 附属读数 chosen by AI: the components (and their fields) shown in the note line.
  extras?: { id: string; key: string }[];

  icon?: string;
  tone?: PageWidgetOptions['tone'];
  // Only the local capability adapter may supply bindings and command options.
  legacy?: Record<string, unknown>;
}

export interface InterfaceProposal {
  summary: string;

  widgets: { id: string; title: string; width: InterfaceTile['width']; emphasized: boolean }[];
}

const labels: Record<string, string> = {
  switch: '电源开关', temperature: '温度', humidity: '湿度', brightness: '亮度',
  soilMoisture: '土壤湿度', co2: '二氧化碳', power: '功率', voltage: '电压',
};

const units: Record<string, string> = { temperature: '°C', humidity: '%', brightness: '%', soilMoisture: '%', co2: 'ppm', power: 'W', voltage: 'V' };

export function displayValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  if (value === 'on' || value === 'off') return value === 'on' ? '开启' : '关闭';

  return typeof value === 'object' ? '—' : String(value).slice(0, 40);
}

function sliderLevel(value: unknown, minimum: unknown, maximum: unknown): number | undefined {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isFinite(number) || typeof minimum !== 'number' || typeof maximum !== 'number'
    || !Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return undefined;

  return Math.max(0, Math.min(100, (number - minimum) / (maximum - minimum) * 100));
}

export function capabilityTiles(device: BlinkerDevice, snapshot?: DeviceUiSnapshot): InterfaceTile[] {
  if (device.config.mode === 'bbp2') {
    if (!snapshot?.manifestAccepted) return [];

    const base = generateDefaultPageLayout(snapshot);

    return base.widgets.filter(widget => !device.config.hiddenEndpointKeys?.includes(widget.endpointKey)).map(widget => {
      const field = snapshot.endpoints.find(endpoint => endpoint.key === widget.endpointKey)!;
      const preset = presetForVariant(widgetVariant(widget.type, widget.variant));

      return { id: widget.widgetId, key: field.key, title: labels[field.key] || field.key,
        type: widget['type'], value: displayValue(field.value), level: sliderLevel(field.value, field.minimum, field.maximum), unit: field.unit || units[field.key] || '',
        width: preset.width, height: preset.height,
        variant: preset.variant, emphasized: false };
    });
  }

  let panel: ReturnType<typeof readLegacyPanel>;

  try { panel = readLegacyPanel(device); } catch { return []; }

  return panel.document.widgets.map(widget => {
    const binding = panel.bindings[widget.widgetId];
    const field = legacyField(binding, device);

    return { id: widget.widgetId, key: field.key, title: widget.title || field.key,
      type: widget.type, value: displayValue(field.value),
      level: sliderLevel(field.value, field.minimum, field.maximum), unit: field.unit || '',
      width: widget.grid.width as InterfaceTile['width'], height: widget.grid.height,
      variant: widget.variant, emphasized: widget.appearance === 'emphasized', legacy: { ...binding.source } };
  });
}

export function arrangeTiles(tiles: InterfaceTile[], style?: UiTheme): InterfaceTile[] {
  const ordered = [...tiles];

  if (style) ordered.sort((left, right) => {
    const rank = (tile: InterfaceTile) => style === 'electronic' ? (tile.type === 'value' ? 0 : 1)
      : tile.type === 'switch' || tile.type === 'button' ? 0 : tile.type === 'value' ? 1 : 2;

    return rank(left) - rank(right);
  });

  return ordered.map((tile, index) => ({ ...tile,
    emphasized: !!style && index === 0,
  }));
}

export function validateProposal(input: unknown, source: InterfaceTile[],
  widths: readonly number[] = [4, 8]): { summary: string; tiles: InterfaceTile[] } {
  const proposal = input as InterfaceProposal;

  if (!proposal || typeof proposal.summary !== 'string' || proposal.summary.length > 400
    || !Array.isArray(proposal.widgets) || !proposal.widgets.length || proposal.widgets.length > source.length) throw new Error('生成结果格式不正确，请重新生成');

  const seen = new Set<string>();

  const tiles = proposal.widgets.map(widget => {
    const original = source.find(tile => tile.id === widget?.id);

    if (!original || seen.has(widget.id) || typeof widget.title !== 'string'
      || !widget.title.trim() || new TextEncoder().encode(widget.title).length > 64 || !widths.includes(widget.width)
      || typeof widget.emphasized !== 'boolean') throw new Error('生成结果包含无效组件，请重新生成');

    seen.add(widget.id);

    return { ...original, title: widget.title.trim(), width: widget.width, emphasized: widget.emphasized };
  });

  return { summary: proposal.summary, tiles };
}

function positions(tiles: InterfaceTile[]) {
  let x = 0, y = 0;

  return tiles.map(tile => {
    if (x + tile.width > 8) { x = 0; y += 2; }

    const grid = { x, y, width: tile.width, height: 2 };
    x += tile.width;

    if (x === 8) { x = 0; y += 2; }

    return grid;
  });
}

export function toPageLayout(tiles: InterfaceTile[], snapshot: DeviceUiSnapshot, revision: number, style?: UiTheme): PageLayout {
  // Without a chosen variant a tile takes its field's default, which is not
  // always its type's (an action with choices is a keypad, not a button).
  const variants = tiles.map(tile => {
    const field = snapshot.endpoints.find(endpoint => endpoint.key === tile.key);

    return tile.variant ?? (field ? variantsFor(tile.type, field)[0] : undefined) ?? widgetVariant(tile.type);
  });

  const presets = variants.map(presetForVariant);

  // Visual order is the tile order; the packer turns supported sizes into rows.
  // Normalize each requested size to the nearest one its variant allows.
  const grids = reflowPageWidgets(tiles.map((tile, index) => ({ widgetId: tile.id, type: tile.type, endpointKey: tile.key,
    grid: { x: 0, y: index, ...fitSize(variants[index], tile.width, tile.height ?? presets[index].height) } })))
    .map(widget => widget.grid);

  return parsePageLayout({ ...generateDefaultPageLayout(snapshot), revision: Math.max(1, revision), ...(style ? { style } : {}),
    widgets: tiles.map((tile, index) => ({ widgetId: tile.id, endpointKey: tile.key, type: tile.type,
      title: tile.title, appearance: tile.emphasized ? 'emphasized' : tile.compact ? 'compact' : 'default',
      ...(tile.extras ? { extraKeys: tile.extras.map(extra => extra.key) } : {}),
      ...(variants[index] !== widgetVariant(tile.type) ? { variant: variants[index] } : {}),
      options: { ...presets[index].options, ...(tile.icon ? { icon: tile.icon } : {}), ...(tile.tone ? { tone: tile.tone } : {}) },
      grid: grids[index] })) }, snapshot.endpoints);
}
