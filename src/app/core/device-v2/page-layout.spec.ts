import { DeviceUiEndpoint, DeviceUiSnapshot } from './device-ui.port';
import {
  diffPageLayout,
  generateDefaultPageLayout,
  migratePageLayout,
  PAGE_LAYOUT_COLUMNS,
  parsePageLayout,
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
    expect(layout.widgets.map(widget => widget.grid.y)).toEqual([0, 1, 3, 4, 5]);
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
