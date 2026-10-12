import { normalizeUiTheme, UiTheme } from './ui-theme';
import { DeviceUiEndpoint, DeviceUiSnapshot } from './device-ui.port';
import {
  COLOR_MAXIMUM, PAGE_WIDGET_TYPES, PageWidgetOptions, PageWidgetType, PageWidgetVariant,
  MAX_EXTRA_KEYS, acceptsExtras, parseWidgetOptions, parseWidgetVariant, sizeAllowed, widgetVariant,
} from './page-widget';

export type { PageWidgetOptions, PageWidgetType, PageWidgetVariant } from './page-widget';

export const PAGE_LAYOUT_SCHEMA_VERSION = 1 as const;
export const PAGE_LAYOUT_COLUMNS = 8 as const;
export const PAGE_LAYOUT_MAX_WIDGETS = 256;

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
  // 附属读数: further read-only fields shown in a display card's note line.
  extraKeys?: string[];
  title?: string;
  appearance?: PageWidgetAppearance;
  variant?: PageWidgetVariant;
  options?: PageWidgetOptions;
  grid: PageWidgetGrid;
}

export interface PageLayout {
  schemaVersion: typeof PAGE_LAYOUT_SCHEMA_VERSION;
  revision: number;
  manifestFingerprint: string;
  columns: typeof PAGE_LAYOUT_COLUMNS;
  widgets: PageLayoutWidget[];
  style?: UiTheme;
}

export interface PageLayoutDiff {
  removedWidgetIds: string[];
  incompatibleWidgetIds: string[];
  addedEndpointKeys: string[];
}

const appearances: readonly PageWidgetAppearance[] = ['default', 'compact', 'emphasized'];

// Default size of each type's default variant, as width x height.
const DEFAULT_SIZES: Readonly<Record<PageWidgetType, [number, number]>> = {
  switch: [2, 2], button: [2, 2], value: [2, 2], slider: [4, 1], select: [4, 2], input: [4, 2], color: [4, 4],
};

export function generateDefaultPageLayout(snapshot: DeviceUiSnapshot): PageLayout {
  if (!snapshot.manifestAccepted || !snapshot.manifestFingerprint) {
    throw new Error('accepted Manifest is required to generate PageLayout');
  }
  const widgets = reflowPageWidgets([...snapshot.endpoints]
    .sort((left, right) => left.id - right.id)
    .flatMap((endpoint, index) => {
      const type = defaultWidgetType(endpoint);
      if (!type) return [];
      const [width, height] = DEFAULT_SIZES[type];
      const widget: PageLayoutWidget = {
        widgetId: `endpoint-${endpoint.id}`,
        type,
        endpointKey: endpoint.key,
        title: endpoint.key,
        grid: { x: 0, y: index, width, height },
      };
      return [widget];
    }));
  return parsePageLayout({
    schemaVersion: PAGE_LAYOUT_SCHEMA_VERSION,
    revision: 1,
    manifestFingerprint: snapshot.manifestFingerprint,
    columns: PAGE_LAYOUT_COLUMNS,
    widgets,
  }, snapshot.endpoints);
}

// Remove rows left empty by hidden widgets, preserving the remaining columns.
export function visiblePageWidgets(layout: PageLayout, hiddenKeys: readonly string[] = []): PageLayoutWidget[] {
  const hidden = new Set(hiddenKeys);
  const visible = layout.widgets.filter(widget => !hidden.has(widget.endpointKey));
  if (visible.length === layout.widgets.length) return visible;

  const occupiedRows = new Set<number>();
  const visibleRows = new Set<number>();
  for (const widget of layout.widgets) {
    for (let row = widget.grid.y; row < widget.grid.y + widget.grid.height; row++) {
      occupiedRows.add(row);
      if (!hidden.has(widget.endpointKey)) visibleRows.add(row);
    }
  }

  const removedRows = [...occupiedRows].filter(row => !visibleRows.has(row));
  return visible.map(widget => ({
    ...widget,
    grid: { ...widget.grid, y: widget.grid.y - removedRows.filter(row => row < widget.grid.y).length },
  }));
}

// Re-pack widgets in visual order into rows after a size change, so they never overlap.
export function reflowPageWidgets(widgets: readonly PageLayoutWidget[]): PageLayoutWidget[] {
  const ordered = [...widgets].sort((left, right) => left.grid.y - right.grid.y || left.grid.x - right.grid.x);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return ordered.map(widget => {
    const width = Math.min(PAGE_LAYOUT_COLUMNS, widget.grid.width);
    if (x + width > PAGE_LAYOUT_COLUMNS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const grid = { x, y, width, height: widget.grid.height };
    x += width;
    rowHeight = Math.max(rowHeight, widget.grid.height);
    return { ...widget, grid };
  });
}

export function parsePageLayout(input: unknown, endpoints?: readonly DeviceUiEndpoint[]): PageLayout {
  const root = object(input, 'PageLayout');
  exactKeys(root, ['schemaVersion', 'revision', 'manifestFingerprint', 'columns', 'widgets', 'style'], 'PageLayout');
  if (root['schemaVersion'] !== PAGE_LAYOUT_SCHEMA_VERSION) throw new Error('PageLayout schemaVersion is unsupported');
  if (root['columns'] !== PAGE_LAYOUT_COLUMNS) throw new Error('PageLayout columns are unsupported');
  // Retired style ids are read as their replacement and written back in the new form.
  const style = root['style'] === undefined ? undefined : normalizeUiTheme(root['style']);
  if (root['style'] !== undefined && !style) throw new Error('PageLayout style is invalid');
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
    if (endpointByKey && widget.extraKeys?.some(key => !isExtraReading(endpointByKey.get(key)))) {
      throw new Error(`PageLayout widget ${widget.widgetId} has an incompatible extra reading`);
    }
    return widget;
  });
  rejectOverlaps(widgets);

  return {
    schemaVersion: PAGE_LAYOUT_SCHEMA_VERSION,
    revision,
    ...(style ? { style } : {}),
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
    // A field shown as an extra reading is bound too, so it gets no card of its own.
    for (const key of widget.extraKeys ?? []) if (isExtraReading(endpointByKey.get(key))) boundEndpointKeys.add(key);
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
  }).map((widget): PageLayoutWidget => {
    // Extra readings that are gone or no longer readable are dropped; the card stays.
    if (!widget.extraKeys) return widget;
    const { extraKeys, ...rest } = widget;
    const kept = extraKeys.filter(key => isExtraReading(endpointByKey.get(key)));
    return kept.length ? { ...rest, extraKeys: kept } : rest;
  });
  const boundEndpointKeys = new Set(widgets.flatMap(widget => [widget.endpointKey, ...widget.extraKeys ?? []]));
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

function parseWidget(input: unknown, index: number): PageLayoutWidget {
  const label = `PageLayout widget ${index}`;
  const value = object(input, label);
  exactKeys(value, ['widgetId', 'type', 'endpointKey', 'extraKeys', 'title', 'appearance', 'variant', 'options', 'grid'], label);
  const widgetId = text(value['widgetId'], 64, `${label} widgetId`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(widgetId)) throw new Error(`${label} widgetId is invalid`);
  const type = enumeration(value['type'], PAGE_WIDGET_TYPES, `${label} type`);
  const endpointKey = text(value['endpointKey'], 64, `${label} endpointKey`);
  const title = value['title'] === undefined ? undefined : text(value['title'], 64, `${label} title`, true);
  const appearance = value['appearance'] === undefined
    ? undefined
    : enumeration(value['appearance'], appearances, `${label} appearance`);
  const variant = parseWidgetVariant(type, value['variant'], label);
  const options = parseWidgetOptions(value['options'], label);
  const extraKeys = value['extraKeys'] === undefined ? undefined : parseExtraKeys(value['extraKeys'], endpointKey, label);
  if (extraKeys && !acceptsExtras(type, variant)) throw new Error(`${label} extraKeys need a number, ring or status display`);
  const gridValue = object(value['grid'], `${label} grid`);
  exactKeys(gridValue, ['x', 'y', 'width', 'height'], `${label} grid`);
  const grid = {
    x: integer(gridValue['x'], 0, PAGE_LAYOUT_COLUMNS - 1, `${label} grid.x`),
    y: integer(gridValue['y'], 0, 65535, `${label} grid.y`),
    width: integer(gridValue['width'], 1, PAGE_LAYOUT_COLUMNS, `${label} grid.width`),
    height: integer(gridValue['height'], 1, 16, `${label} grid.height`),
  };
  if (grid.x + grid.width > PAGE_LAYOUT_COLUMNS) throw new Error(`${label} exceeds the grid`);
  if (!sizeAllowed(widgetVariant(type, variant), grid.width, grid.height)) throw new Error(`${label} size is not allowed for its variant`);
  return {
    widgetId, type, endpointKey, title, appearance,
    ...(extraKeys ? { extraKeys } : {}),
    ...(variant ? { variant } : {}),
    ...(options && Object.keys(options).length ? { options } : {}),
    grid,
  };
}

// One to three distinct field keys, none of them the widget's own.
function parseExtraKeys(value: unknown, endpointKey: string, label: string): string[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EXTRA_KEYS) throw new Error(`${label} extraKeys are invalid`);
  const keys = value.map((key, index) => text(key, 64, `${label} extraKeys[${index}]`));
  if (new Set([endpointKey, ...keys]).size !== keys.length + 1) throw new Error(`${label} extraKeys repeat a field`);
  return keys;
}

// An extra reading is bound like a display card's own field.
export function isExtraReading(endpoint: DeviceUiEndpoint | undefined): boolean {
  return !!endpoint && isCompatible('value', endpoint);
}

function defaultWidgetType(endpoint: DeviceUiEndpoint): PageWidgetType | null {
  if (endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'boolean') {
    return 'switch';
  }
  if (isChoice(endpoint)) return 'select';
  if (isColor(endpoint)) return 'color';
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
  if (type === 'select') return isChoice(endpoint);
  if (type === 'color') return isColor(endpoint);
  if (type === 'input') {
    return endpoint.writable && (endpoint.valueType === 'integer'
      || endpoint.valueType === 'number' || endpoint.valueType === 'text');
  }
  return endpoint.readable || endpoint.notifies || endpoint.role === 'event';
}

function isChoice(endpoint: DeviceUiEndpoint): boolean {
  return endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'text'
    && !!endpoint.choices?.length;
}

function isColor(endpoint: DeviceUiEndpoint): boolean {
  return endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'integer'
    && endpoint.minimum === 0 && endpoint.maximum === COLOR_MAXIMUM;
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
