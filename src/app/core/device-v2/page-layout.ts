import { DeviceUiEndpoint, DeviceUiSnapshot } from './device-ui.port';

export const PAGE_LAYOUT_SCHEMA_VERSION = 1 as const;
export const PAGE_LAYOUT_COLUMNS = 8 as const;
export const PAGE_LAYOUT_MAX_WIDGETS = 256;

export type PageWidgetType = 'switch' | 'button' | 'slider' | 'input' | 'value';
export type PageWidgetAppearance = 'default' | 'compact' | 'emphasized';

export interface PageWidgetGrid {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayoutWidget {
  widgetId: string;
  type: PageWidgetType;
  endpointKey: string;
  title?: string;
  appearance?: PageWidgetAppearance;
  grid: PageWidgetGrid;
}

export interface PageLayout {
  schemaVersion: typeof PAGE_LAYOUT_SCHEMA_VERSION;
  revision: number;
  manifestFingerprint: string;
  columns: typeof PAGE_LAYOUT_COLUMNS;
  widgets: PageLayoutWidget[];
}

export interface PageLayoutDiff {
  removedWidgetIds: string[];
  incompatibleWidgetIds: string[];
  addedEndpointKeys: string[];
}

const widgetTypes: readonly PageWidgetType[] = ['switch', 'button', 'slider', 'input', 'value'];
const appearances: readonly PageWidgetAppearance[] = ['default', 'compact', 'emphasized'];

export function generateDefaultPageLayout(snapshot: DeviceUiSnapshot): PageLayout {
  if (!snapshot.manifestAccepted || !snapshot.manifestFingerprint) {
    throw new Error('accepted Manifest is required to generate PageLayout');
  }
  let y = 0;
  const widgets = [...snapshot.endpoints]
    .sort((left, right) => left.id - right.id)
    .flatMap(endpoint => {
      const type = defaultWidgetType(endpoint);
      if (!type) return [];
      const height = type === 'slider' ? 2 : 1;
      const widget: PageLayoutWidget = {
        widgetId: `endpoint-${endpoint.id}`,
        type,
        endpointKey: endpoint.key,
        title: endpoint.key,
        grid: { x: 0, y, width: PAGE_LAYOUT_COLUMNS, height },
      };
      y += height;
      return [widget];
    });
  return parsePageLayout({
    schemaVersion: PAGE_LAYOUT_SCHEMA_VERSION,
    revision: 1,
    manifestFingerprint: snapshot.manifestFingerprint,
    columns: PAGE_LAYOUT_COLUMNS,
    widgets,
  }, snapshot.endpoints);
}

export function parsePageLayout(input: unknown, endpoints?: readonly DeviceUiEndpoint[]): PageLayout {
  const root = object(input, 'PageLayout');
  exactKeys(root, ['schemaVersion', 'revision', 'manifestFingerprint', 'columns', 'widgets'], 'PageLayout');
  if (root['schemaVersion'] !== PAGE_LAYOUT_SCHEMA_VERSION) throw new Error('PageLayout schemaVersion is unsupported');
  if (root['columns'] !== PAGE_LAYOUT_COLUMNS) throw new Error('PageLayout columns are unsupported');
  const revision = integer(root['revision'], 1, 0x7fffffff, 'PageLayout revision');
  const manifestFingerprint = text(root['manifestFingerprint'], 64, 'PageLayout manifestFingerprint');
  if (!/^[0-9a-f]{64}$/.test(manifestFingerprint)) {
    throw new Error('PageLayout manifestFingerprint is invalid');
  }
  if (!Array.isArray(root['widgets']) || root['widgets'].length > PAGE_LAYOUT_MAX_WIDGETS) {
    throw new Error('PageLayout widgets are invalid');
  }

  const endpointByKey = endpoints
    ? new Map(endpoints.map(endpoint => [endpoint.key, endpoint]))
    : undefined;
  const ids = new Set<string>();
  const widgets = root['widgets'].map((value, index) => {
    const widget = parseWidget(value, index);
    if (ids.has(widget.widgetId)) throw new Error('PageLayout widgetId is duplicated');
    ids.add(widget.widgetId);
    const endpoint = endpointByKey?.get(widget.endpointKey);
    if (endpointByKey && (!endpoint || !isCompatible(widget.type, endpoint))) {
      throw new Error(`PageLayout widget ${widget.widgetId} is incompatible with its endpoint`);
    }
    return widget;
  });
  rejectOverlaps(widgets);

  return {
    schemaVersion: PAGE_LAYOUT_SCHEMA_VERSION,
    revision,
    manifestFingerprint,
    columns: PAGE_LAYOUT_COLUMNS,
    widgets,
  };
}

export function diffPageLayout(
  input: unknown,
  endpoints: readonly DeviceUiEndpoint[],
): PageLayoutDiff {
  const layout = parsePageLayout(input);
  const endpointByKey = new Map(endpoints.map(endpoint => [endpoint.key, endpoint]));
  const removedWidgetIds: string[] = [];
  const incompatibleWidgetIds: string[] = [];
  const boundEndpointKeys = new Set<string>();
  for (const widget of layout.widgets) {
    const endpoint = endpointByKey.get(widget.endpointKey);
    if (!endpoint) removedWidgetIds.push(widget.widgetId);
    else if (!isCompatible(widget.type, endpoint)) incompatibleWidgetIds.push(widget.widgetId);
    else boundEndpointKeys.add(widget.endpointKey);
  }
  const addedEndpointKeys = endpoints
    .filter(endpoint => defaultWidgetType(endpoint) && !boundEndpointKeys.has(endpoint.key))
    .sort((left, right) => left.id - right.id)
    .map(endpoint => endpoint.key);
  return { removedWidgetIds, incompatibleWidgetIds, addedEndpointKeys };
}

export function migratePageLayout(input: unknown, snapshot: DeviceUiSnapshot): PageLayout {
  if (!snapshot.manifestAccepted || !snapshot.manifestFingerprint) {
    throw new Error('accepted Manifest is required to migrate PageLayout');
  }
  const previous = parsePageLayout(input);
  const endpointByKey = new Map(snapshot.endpoints.map(endpoint => [endpoint.key, endpoint]));
  const widgets = previous.widgets.filter(widget => {
    const endpoint = endpointByKey.get(widget.endpointKey);
    return !!endpoint && isCompatible(widget.type, endpoint);
  });
  const boundEndpointKeys = new Set(widgets.map(widget => widget.endpointKey));
  const widgetIds = new Set(widgets.map(widget => widget.widgetId));
  let y = widgets.reduce((maximum, widget) => Math.max(
    maximum,
    widget.grid.y + widget.grid.height,
  ), 0);
  for (const generated of generateDefaultPageLayout(snapshot).widgets) {
    if (boundEndpointKeys.has(generated.endpointKey) || widgets.length >= PAGE_LAYOUT_MAX_WIDGETS) continue;
    if (y > 65535) break;
    const widgetId = uniqueWidgetId(generated.widgetId, widgetIds);
    widgets.push({ ...generated, widgetId, grid: { ...generated.grid, y } });
    widgetIds.add(widgetId);
    boundEndpointKeys.add(generated.endpointKey);
    y += generated.grid.height;
  }
  return parsePageLayout({
    ...previous,
    manifestFingerprint: snapshot.manifestFingerprint,
    widgets,
  }, snapshot.endpoints);
}

/**
 * Repairs layouts created before writable boolean endpoints had a switch widget.
 * The accepted Manifest remains authoritative even when a saved layout still
 * represents the endpoint as a read-only value card.
 */
export function upgradeDefaultWidgetTypes(
  input: PageLayout,
  endpoints: readonly DeviceUiEndpoint[],
): PageLayout {
  const endpointByKey = new Map(endpoints.map(endpoint => [endpoint.key, endpoint]));
  let changed = false;
  const widgets = input.widgets.map(widget => {
    const endpoint = endpointByKey.get(widget.endpointKey);
    const isLegacyBooleanCard = widget.type === 'value'
      && endpoint?.role === 'property'
      && endpoint.writable
      && endpoint.valueType === 'boolean';
    if (!isLegacyBooleanCard) return widget;
    changed = true;
    return { ...widget, type: 'switch' as const };
  });
  if (!changed) return input;
  return parsePageLayout({ ...input, widgets }, endpoints);
}

function parseWidget(input: unknown, index: number): PageLayoutWidget {
  const label = `PageLayout widget ${index}`;
  const value = object(input, label);
  exactKeys(value, ['widgetId', 'type', 'endpointKey', 'title', 'appearance', 'grid'], label);
  const widgetId = text(value['widgetId'], 64, `${label} widgetId`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(widgetId)) throw new Error(`${label} widgetId is invalid`);
  const type = enumeration(value['type'], widgetTypes, `${label} type`);
  const endpointKey = text(value['endpointKey'], 64, `${label} endpointKey`);
  const title = value['title'] === undefined ? undefined : text(value['title'], 64, `${label} title`, true);
  const appearance = value['appearance'] === undefined
    ? undefined
    : enumeration(value['appearance'], appearances, `${label} appearance`);
  const gridValue = object(value['grid'], `${label} grid`);
  exactKeys(gridValue, ['x', 'y', 'width', 'height'], `${label} grid`);
  const grid = {
    x: integer(gridValue['x'], 0, PAGE_LAYOUT_COLUMNS - 1, `${label} grid.x`),
    y: integer(gridValue['y'], 0, 65535, `${label} grid.y`),
    width: integer(gridValue['width'], 1, PAGE_LAYOUT_COLUMNS, `${label} grid.width`),
    height: integer(gridValue['height'], 1, 16, `${label} grid.height`),
  };
  if (grid.x + grid.width > PAGE_LAYOUT_COLUMNS) throw new Error(`${label} exceeds the grid`);
  return { widgetId, type, endpointKey, title, appearance, grid };
}

function defaultWidgetType(endpoint: DeviceUiEndpoint): PageWidgetType | null {
  if (endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'boolean') {
    return 'switch';
  }
  if (endpoint.role === 'action' && endpoint.writable
    && (endpoint.valueType === 'boolean' || endpoint.valueType === 'null')) {
    return 'button';
  }
  if (endpoint.role === 'property' && endpoint.writable
    && (endpoint.valueType === 'integer' || endpoint.valueType === 'number')
    && Number.isFinite(endpoint.minimum) && Number.isFinite(endpoint.maximum)) {
    return 'slider';
  }
  if (endpoint.writable && (endpoint.valueType === 'integer'
    || endpoint.valueType === 'number' || endpoint.valueType === 'text')) {
    return 'input';
  }
  return endpoint.readable || endpoint.notifies || endpoint.role === 'event' ? 'value' : null;
}

function isCompatible(type: PageWidgetType, endpoint: DeviceUiEndpoint): boolean {
  if (type === 'switch') {
    return endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'boolean';
  }
  if (type === 'button') {
    return endpoint.role === 'action' && endpoint.writable
      && (endpoint.valueType === 'boolean' || endpoint.valueType === 'null');
  }
  if (type === 'slider') {
    return endpoint.role === 'property' && endpoint.writable
      && (endpoint.valueType === 'integer' || endpoint.valueType === 'number')
      && Number.isFinite(endpoint.minimum) && Number.isFinite(endpoint.maximum);
  }
  if (type === 'input') {
    return endpoint.writable && (endpoint.valueType === 'integer'
      || endpoint.valueType === 'number' || endpoint.valueType === 'text');
  }
  return endpoint.readable || endpoint.notifies || endpoint.role === 'event';
}

function uniqueWidgetId(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= PAGE_LAYOUT_MAX_WIDGETS + 1; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = base.slice(0, 64 - ending.length) + ending;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('PageLayout widgetId space is exhausted');
}

function rejectOverlaps(widgets: readonly PageLayoutWidget[]): void {
  for (let index = 0; index < widgets.length; index += 1) {
    const left = widgets[index].grid;
    for (let previous = 0; previous < index; previous += 1) {
      const right = widgets[previous].grid;
      const separate = left.x + left.width <= right.x || right.x + right.width <= left.x
        || left.y + left.height <= right.y || right.y + right.height <= left.y;
      if (!separate) throw new Error('PageLayout widgets overlap');
    }
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} has unknown fields`);
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value as number;
}

function text(value: unknown, maximumBytes: number, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)
    || value.includes('\0')
    || new TextEncoder().encode(value).length > maximumBytes) throw new Error(`${label} is invalid`);
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} is invalid`);
  return value as T;
}
