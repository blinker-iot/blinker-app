import { DeviceUiEndpoint, DeviceUiSnapshot } from './device-ui.port';
import {
  diffPageLayout,
  generateDefaultPageLayout,
  migratePageLayout,
  PAGE_LAYOUT_COLUMNS,
  parsePageLayout,
  parsePageWidgets,
} from './page-layout';

function endpoint(overrides: Partial<DeviceUiEndpoint>): DeviceUiEndpoint {
  return {
    id: 1,
    key: 'power',
    role: 'property',
    valueType: 'boolean',
    readable: true,
    writable: true,
    notifies: true,
    ...overrides,
  };
}

function snapshot(): DeviceUiSnapshot {
  return {
    manifestRevision: 1,
    manifestFingerprint: 'ab'.repeat(32),
    manifestAccepted: true,
    stateRevision: 2,
    stateFresh: true,
    endpoints: [
      endpoint({ id: 4, key: 'label', valueType: 'text' }),
      endpoint({ id: 1, key: 'power' }),
      endpoint({ id: 3, key: 'restart', role: 'action', valueType: 'null', readable: false }),
      endpoint({
        id: 2,
        key: 'level',
        valueType: 'integer',
        minimum: 0,
        maximum: 100,
        step: 5,
      }),
      endpoint({
        id: 5,
        key: 'uptime',
        valueType: 'integer',
        writable: false,
      }),
    ],
  };
}

describe('PageLayout v1', () => {
  it('generates one deterministic schema for default, manual, and Agent editors', () => {
    const layout = generateDefaultPageLayout(snapshot());
    expect(layout).toEqual({
      schemaVersion: 1,
      revision: 1,
      manifestFingerprint: 'ab'.repeat(32),
      columns: PAGE_LAYOUT_COLUMNS,
      widgets: [
        expect.objectContaining({ widgetId: 'endpoint-1', endpointKey: 'power', type: 'switch' }),
        expect.objectContaining({ widgetId: 'endpoint-2', endpointKey: 'level', type: 'slider' }),
        expect.objectContaining({ widgetId: 'endpoint-3', endpointKey: 'restart', type: 'button' }),
        expect.objectContaining({ widgetId: 'endpoint-4', endpointKey: 'label', type: 'input' }),
        expect.objectContaining({ widgetId: 'endpoint-5', endpointKey: 'uptime', type: 'value' }),
      ],
    });
    expect(layout.widgets.map(widget => widget.grid.y)).toEqual([0, 0, 0, 2, 2]);
    expect(parsePageLayout(JSON.parse(JSON.stringify(layout)), snapshot().endpoints)).toEqual(layout);
  });

  it('rejects executable/unknown fields, invalid bindings, and overlapping widgets', () => {
    const layout = generateDefaultPageLayout(snapshot());
    expect(() => parsePageLayout({ ...layout, script: 'alert(1)' }, snapshot().endpoints))
      .toThrow(/unknown fields/);
    expect(() => parsePageLayout({
      ...layout,
      widgets: [{ ...layout.widgets[0], endpointKey: 'missing' }],
    }, snapshot().endpoints)).toThrow(/incompatible/);
    expect(() => parsePageLayout({
      ...layout,
      widgets: [layout.widgets[0], { ...layout.widgets[1], grid: layout.widgets[0].grid }],
    }, snapshot().endpoints)).toThrow(/overlap/);
  });

  it('requires an accepted Manifest before generating a default page', () => {
    expect(() => generateDefaultPageLayout({ ...snapshot(), manifestAccepted: false }))
      .toThrow(/accepted Manifest/);
  });

  it.each(['switch', 'button', 'slider', 'input', 'value'] as const)(
    'retains original schema-1 %s grid sizes without admitting them to new panels', type => {
      const base = generateDefaultPageLayout(snapshot());
      const widget = { ...base.widgets[0], type, grid: { x: 0, y: 0, width: 3, height: 5 } };
      const input = { ...base, widgets: [widget] };
      expect(parsePageLayout(input).widgets[0]).toEqual(widget);
      expect(() => parsePageWidgets(input.widgets)).toThrow(/size is not allowed/);
    });

  it('keeps size rules for new presentation fields and types even inside schema 1', () => {
    const base = generateDefaultPageLayout(snapshot());
    const widget = { ...base.widgets[0], grid: { x: 0, y: 0, width: 3, height: 5 } };
    for (const change of [{ variant: 'tile' }, { options: {} }, { type: 'select' }, { type: 'color' },
      { type: 'value', extraKeys: ['level'] }]) {
      expect(() => parsePageLayout({ ...base, widgets: [{ ...widget, ...change }] }))
        .toThrow(/size is not allowed/);
    }
  });

  it('retains legacy dimensions without relaxing bounds, overlaps, keys or endpoint binding', () => {
    const base = generateDefaultPageLayout(snapshot());
    const widget = { ...base.widgets[0], grid: { x: 0, y: 0, width: 8, height: 5 } };
    expect(parsePageLayout({ ...base, widgets: [widget] }, snapshot().endpoints).widgets[0]).toEqual(widget);
    for (const grid of [{ ...widget.grid, width: 9 }, { ...widget.grid, height: 17 },
      { ...widget.grid, x: 1 }, { ...widget.grid, height: 1.5 }]) {
      expect(() => parsePageLayout({ ...base, widgets: [{ ...widget, grid }] })).toThrow();
    }
    expect(() => parsePageLayout({ ...base, widgets: [widget, { ...widget, widgetId: 'other' }] }))
      .toThrow(/overlap/);
    expect(() => parsePageLayout({ ...base, widgets: [{ ...widget, script: 'unsafe' }] }))
      .toThrow(/unknown fields/);
    expect(() => parsePageLayout({ ...base, widgets: [{ ...widget, endpointKey: 'missing' }] }, snapshot().endpoints))
      .toThrow(/incompatible/);
    expect(() => parsePageLayout({ ...base, widgets: [{ ...widget, type: 'input' }] }, snapshot().endpoints))
      .toThrow(/incompatible/);
  });

  it('diffs and migrates a stale layout while preserving compatible manual choices', () => {
    const originalSnapshot = snapshot();
    const original = generateDefaultPageLayout(originalSnapshot);
    original.widgets[0] = {
      ...original.widgets[0],
      title: 'Main power',
      appearance: 'emphasized',
    };
    const next: DeviceUiSnapshot = {
      ...originalSnapshot,
      manifestRevision: 2,
      manifestFingerprint: 'cd'.repeat(32),
      endpoints: [
        endpoint({ id: 1, key: 'power' }),
        endpoint({ id: 6, key: 'temperature', valueType: 'number', writable: false }),
      ],
    };

    expect(diffPageLayout(original, next.endpoints)).toEqual({
      removedWidgetIds: ['endpoint-2', 'endpoint-3', 'endpoint-4', 'endpoint-5'],
      incompatibleWidgetIds: [],
      addedEndpointKeys: ['temperature'],
    });
    const migrated = migratePageLayout(original, next);
    expect(migrated.manifestFingerprint).toBe('cd'.repeat(32));
    expect(migrated.widgets).toEqual([
      expect.objectContaining({
        endpointKey: 'power',
        title: 'Main power',
        appearance: 'emphasized',
      }),
      expect.objectContaining({ endpointKey: 'temperature', type: 'value' }),
    ]);
    expect(parsePageLayout(migrated, next.endpoints)).toEqual(migrated);
  });
});
