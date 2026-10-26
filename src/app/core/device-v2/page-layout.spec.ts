import { DeviceUiEndpoint, DeviceUiSnapshot } from './device-ui.port';
import { generateAutomaticPageLayout } from './automatic-page-layout';
import { widgetVariant } from './page-widget';
import { presetForVariant } from './widget-presets';
import {
  diffPageLayout,
  generateDefaultPageLayout,
  migratePageLayout,
  PAGE_LAYOUT_COLUMNS,
  parsePageLayout,
  parsePageWidgets,
  type PageLayoutWidget,
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

function legacyWidget(overrides: Partial<PageLayoutWidget> = {}): PageLayoutWidget {
  return { widgetId: 'original', type: 'switch', endpointKey: 'power',
    grid: { x: 0, y: 0, width: 3, height: 5 }, ...overrides };
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
    expect(layout.widgets.map(widget => widget.grid.y)).toEqual([0, 0, 0, 3, 5]);
    expect(parsePageLayout(JSON.parse(JSON.stringify(layout)), snapshot().endpoints)).toEqual(layout);
  });

  it('uses catalogue defaults for every newly generated binding, including alternate variants', () => {
    const source: DeviceUiSnapshot = { ...snapshot(), endpoints: [
      ...snapshot().endpoints,
      endpoint({ id: 6, key: 'setLevel', role: 'action', valueType: 'integer', minimum: 0, maximum: 100 }),
      endpoint({ id: 7, key: 'keys', role: 'action', valueType: 'text', choices: ['up', 'down'] }),
      endpoint({ id: 8, key: 'event', role: 'event', valueType: 'boolean', writable: false }),
      endpoint({ id: 9, key: 'mode', valueType: 'text', choices: ['auto', 'manual'] }),
      endpoint({ id: 10, key: 'color', valueType: 'integer', minimum: 0, maximum: 0xffffff }),
    ] };
    const before = structuredClone(source);
    const layout = generateDefaultPageLayout(source);

    for (const widget of layout.widgets) {
      const preset = presetForVariant(widgetVariant(widget.type, widget.variant));
      expect(widget.grid).toMatchObject({ width: preset.width, height: preset.height });
      expect(widget.options).toEqual(preset.options);
      expect(widget.options).not.toBe(preset.options);
    }
    expect(source).toEqual(before);
  });

  it.each([undefined, 'natural', 'dark', 'electronic'] as const)(
    'keeps automatic theme %s on the same default sizes and options', style => {
      const source = snapshot();
      const base = generateDefaultPageLayout(source);
      const automatic = generateAutomaticPageLayout(source, style, ['power']);

      expect(automatic.widgets.some(widget => widget.endpointKey === 'power')).toBe(false);
      for (const widget of automatic.widgets) {
        const original = base.widgets.find(candidate => candidate.widgetId === widget.widgetId)!;
        expect(widget.grid).toMatchObject({ width: original.grid.width, height: original.grid.height });
        expect(widget.options).toEqual(original.options);
        expect(widget.endpointKey).toBe(original.endpointKey);
      }
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
      const widget = legacyWidget({ type });
      const input = { ...base, widgets: [widget] };
      expect(parsePageLayout(input).widgets[0]).toEqual(widget);
      expect(() => parsePageWidgets(input.widgets)).toThrow(/size is not allowed/);
    });

  it('keeps size rules for new presentation fields and types even inside schema 1', () => {
    const base = generateDefaultPageLayout(snapshot());
    const widget = legacyWidget();
    for (const change of [{ variant: 'tile' }, { options: {} }, { type: 'select' }, { type: 'color' },
      { type: 'value', extraKeys: ['level'] }]) {
      expect(() => parsePageLayout({ ...base, widgets: [{ ...widget, ...change }] }))
        .toThrow(/size is not allowed/);
    }
  });

  it('retains legacy dimensions without relaxing bounds, overlaps, keys or endpoint binding', () => {
    const base = generateDefaultPageLayout(snapshot());
    const widget = legacyWidget({ grid: { x: 0, y: 0, width: 8, height: 5 } });
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

  it('retains an untouched legacy size while editing another widget or renaming/moving it', () => {
    const base = generateDefaultPageLayout(snapshot());
    const old = legacyWidget();
    const modern = { ...base.widgets[1], grid: { ...base.widgets[1].grid, x: 4, y: 0 } };
    const saved = parsePageLayout({ ...base, widgets: [old, modern] }, snapshot().endpoints).widgets;
    const edited = [
      { ...saved[0], title: '原开关', grid: { ...saved[0].grid, x: 1, y: 6 } },
      { ...saved[1], title: '新标题' },
    ];

    expect(parsePageWidgets(edited, snapshot().endpoints, saved)).toEqual(edited);
    expect(saved[0]).toEqual(old);
  });

  it('does not inherit a legacy size for new identities, bindings or presentation changes', () => {
    const old = legacyWidget();
    const changes: Partial<PageLayoutWidget>[] = [
      { widgetId: 'new' }, { endpointKey: 'other' }, { type: 'button' }, { variant: 'tile' },
      { options: { icon: 'plug' } }, { extraKeys: ['temperature'] },
      { grid: { ...old.grid, width: 4 } }, { grid: { ...old.grid, height: 6 } },
    ];
    for (const change of changes) {
      expect(() => parsePageWidgets([{ ...old, ...change }], undefined, [old])).toThrow();
    }
    expect(() => parsePageWidgets([old])).toThrow(/size is not allowed/);
  });

  it('still checks bounds, overlap and endpoint compatibility for retained legacy sizes', () => {
    const old = legacyWidget();
    expect(() => parsePageWidgets([{ ...old, grid: { ...old.grid, x: 7 } }], undefined, [old])).toThrow(/exceeds/);
    expect(() => parsePageWidgets([old, { ...old, widgetId: 'new' }], undefined,
      [old, { ...old, widgetId: 'new' }])).toThrow(/overlap/);
    expect(() => parsePageWidgets([old], [], [old])).toThrow(/incompatible/);
  });

  it('leaves saved geometry, ordering and bindings unchanged when migrating without additions', () => {
    const base = generateDefaultPageLayout(snapshot());
    const saved = parsePageLayout({ ...base, widgets: [
      legacyWidget({ grid: { x: 5, y: 8, width: 3, height: 5 } }),
      { ...base.widgets[1], grid: { x: 1, y: 2, width: 2, height: 3 } },
    ] }, snapshot().endpoints);
    const before = structuredClone(saved);
    const next = migratePageLayout(saved, { ...snapshot(), manifestFingerprint: 'cd'.repeat(32) }, false);

    expect(next.widgets).toEqual(before.widgets);
    expect(saved).toEqual(before);
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
