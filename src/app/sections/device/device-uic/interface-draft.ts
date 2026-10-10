import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { generateDefaultPageLayout, PageLayout, PageWidgetType, parsePageLayout } from '../../../core/device-v2/page-layout';

import { InterfaceStyle } from '../../../core/device-v2/interface-style';

export type InterfaceDensity = 'balanced' | 'compact' | 'focus';
export interface InterfaceTile {
  id: string;
  key: string;
  title: string;
  type: PageWidgetType;
  value: string;
  unit: string;
  level?: number;
  width: 4 | 8;
  emphasized: boolean;
  // Only the local capability adapter may supply bindings and command options.
  legacy?: Record<string, unknown>;
}
export interface InterfaceProposal {
  summary: string;
  widgets: { id: string; title: string; width: 4 | 8; emphasized: boolean }[];
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
    return base.widgets.map(widget => {
      const field = snapshot.endpoints.find(endpoint => endpoint.key === widget.endpointKey)!;
      return { id: widget.widgetId, key: field.key, title: labels[field.key] || field.key,
        type: widget['type'], value: displayValue(field.value), level: sliderLevel(field.value, field.minimum, field.maximum), unit: field.unit || units[field.key] || '',
        width: widget['type'] === 'value' ? 4 : 8, emphasized: false };
    });
  }
  const tiles: InterfaceTile[] = [];
  let dashboard: Record<string, unknown>[] = [];
  try { dashboard = JSON.parse(device.config.layouter || '{}').dashboard || []; } catch { /* Invalid legacy layouts stay untouched. */ }
  const types: Record<string, PageWidgetType> = { btn: 'button', num: 'value', ran: 'slider', inp: 'input' };
  if (Array.isArray(dashboard)) for (const [index, widget] of dashboard.entries()) {
    if (!widget || typeof widget['key'] !== 'string' || !types[String(widget['type'])]) continue;
    const value = device.data?.[widget['key']];
    tiles.push({ id: `legacy-${index}`, key: widget['key'],
      title: String(widget['t0'] || labels[widget['key']] || widget['key']).slice(0, 64),
      type: widget['type'] === 'btn' && widget['mode'] === 1 ? 'switch' : types[String(widget['type'])],
      value: displayValue(value?.val ?? value), level: sliderLevel(value?.val ?? value, widget['min'], widget['max']), unit: String(widget['uni'] || ''),
      width: widget['type'] === 'ran' || widget['type'] === 'inp' ? 8 : 4, emphasized: false, legacy: { ...widget } });
  }
  if (tiles.length) return tiles;
  // Legacy data has no access metadata. Only its explicit main switch is writable.
  if (device.config.showSwitch) tiles.push({ id: 'switch', key: 'switch', title: '电源开关', type: 'switch',
    value: displayValue(device.data?.switch), unit: '', width: 8, emphasized: true,
    legacy: { type: 'btn', mode: 1, ico: 'fal fa-power-off' } });
  for (const [key, value] of Object.entries(device.data || {})) {
    if (!Number.isFinite(value) || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) continue;
    if (['timestamp', 'lastSeen', 'revision'].includes(key)) continue;
    tiles.push({ id: `metric-${key}`, key, title: labels[key] || key, type: 'value',
      value: displayValue(value), unit: units[key] || '', width: 4, emphasized: false,
      legacy: { type: 'num', ico: 'fal fa-gauge', min: 0, max: 100, lstyle: 1 } });
  }
  return tiles.slice(0, 64);
}
export function arrangeTiles(tiles: InterfaceTile[], density: InterfaceDensity, style?: InterfaceStyle): InterfaceTile[] {
  const ordered = [...tiles];
  if (style) ordered.sort((left, right) => {
    const rank = (tile: InterfaceTile) => style === 'technical' ? (tile.type === 'value' ? 0 : 1)
      : tile.type === 'switch' || tile.type === 'button' ? 0 : tile.type === 'value' ? 1 : 2;
    return rank(left) - rank(right);
  });
  return ordered.map((tile, index) => ({ ...tile,
    width: density === 'focus' ? 8 : density === 'compact' && tile.type !== 'slider' && tile.type !== 'input' ? 4 : tile.type === 'value' ? 4 : 8,
    emphasized: (density === 'focus' || !!style) && index === 0,
  }));
}
export function validateProposal(input: unknown, source: InterfaceTile[]): { summary: string; tiles: InterfaceTile[] } {
  const proposal = input as InterfaceProposal;
  if (!proposal || typeof proposal.summary !== 'string' || proposal.summary.length > 400
    || !Array.isArray(proposal.widgets) || !proposal.widgets.length || proposal.widgets.length > source.length) throw new Error('生成结果格式不正确，请重新生成');
  const seen = new Set<string>();
  const tiles = proposal.widgets.map(widget => {
    const original = source.find(tile => tile.id === widget?.id);
    if (!original || seen.has(widget.id) || typeof widget.title !== 'string'
      || !widget.title.trim() || new TextEncoder().encode(widget.title).length > 64 || ![4, 8].includes(widget.width)
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
export function toPageLayout(tiles: InterfaceTile[], snapshot: DeviceUiSnapshot, revision: number, style?: InterfaceStyle): PageLayout {
  const grids = positions(tiles);
  return parsePageLayout({ ...generateDefaultPageLayout(snapshot), revision: Math.max(1, revision), ...(style ? { style } : {}),
    widgets: tiles.map((tile, index) => ({ widgetId: tile.id, endpointKey: tile.key, type: tile.type,
      title: tile.title, appearance: tile.emphasized ? 'emphasized' : 'default', grid: grids[index] })) }, snapshot.endpoints);
}
export function toLegacyLayout(tiles: InterfaceTile[], previous?: string, style?: InterfaceStyle): string {
  let existing: Record<string, unknown> = {};
  try { const parsed = JSON.parse(previous || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed; } catch { /* Create a fresh layout if the old one is invalid. */ }
  const grids = positions(tiles);
  const config = existing['config'];
  const accent = style === 'technical' ? '#68d6ec' : style === 'warm' ? '#ac592f' : style === 'minimal' ? '#28785e' : undefined;
  return JSON.stringify({ ...existing, version: '2.0.0', config: { ...(config && typeof config === 'object' && !Array.isArray(config)
    ? config : { headerColor: 'transparent', headerStyle: 'dark', background: { img: '', isFull: false } }),
    ...(style ? { interfaceStyle: style } : {}) },
    dashboard: tiles.map((tile, index) => ({ ...tile.legacy, key: tile.key, t0: tile.title, uni: tile.unit,
      clr: accent || (tile.emphasized ? '#49dcb1' : '#389BEE'), cols: grids[index].width, rows: 2,
      x: grids[index].x, y: grids[index].y })), actions: existing['actions'] || [], triggers: existing['triggers'] || [] });
}
