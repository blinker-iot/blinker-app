import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceUiEndpoint, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { deviceCardColumns, deviceCardMetrics, deviceCardRangeFits, homeCardBindingField, homeCardFields,
  homeCardReadableFields, homeCardRow, homeCardSpan, legacyCardBindings } from './device-card-presentation';
import type { HomeCardBinding } from '../../device-card-preferences';

const field = (key: string, value?: DeviceUiEndpoint['value'], extra: Partial<DeviceUiEndpoint> = {}): DeviceUiEndpoint => ({
  key, id: 1, role: 'property', valueType: 'number', manifestKind: 0, manifestType: 3,
  readable: true, writable: false, notifies: true, value, ...extra,
});
const device = (keys?: string[]): BlinkerDevice => ({
  deviceName: 'device', config: { card: keys ? { metrics: keys.map(key => ({ key })) } : undefined },
}) as BlinkerDevice;
const snapshot = (...endpoints: DeviceUiEndpoint[]): DeviceUiSnapshot => ({
  endpoints, manifestRevision: 1, manifestFingerprint: 'ab', manifestAccepted: true, stateRevision: 1, stateFresh: true,
});

describe('bounded single-row card presentation', () => {
  it.each([[128, 2], [181, 2], [182, 3], [235, 3], [236, 4], [500, 4]] as const)(
    'fits width %i into %i columns without shrinking the minimum tile', (width, columns) => {
      expect(deviceCardColumns(width, false)).toBe(columns);
      expect(columns * 48 + (columns - 1) * 6).toBeLessThanOrEqual(width - 26);
    });

  it('uses conservative defaults until measured and retains a one-column narrow fallback', () => {
    expect(deviceCardColumns(0, false)).toBe(2);
    expect(deviceCardColumns(0, true)).toBe(4);
    expect(deviceCardColumns(Number.NaN, false)).toBe(2);
    expect(deviceCardColumns(100, true)).toBe(1);
  });

  it('reduces columns for larger text without changing saved bindings or card size', () => {
    expect(deviceCardColumns(172, false, 48)).toBe(2);
    expect(deviceCardColumns(172, false, 66)).toBe(2);
    expect(deviceCardColumns(137, false, 66)).toBe(1);
    expect(deviceCardColumns(240, false, Number.NaN)).toBe(4);
  });

  it('does not auto-populate unconfigured or explicitly empty rows from available endpoints', () => {
    const state = snapshot(field('power', false));
    expect(deviceCardMetrics(device(), state)).toEqual([]);
    expect(deviceCardMetrics(device([]), state)).toEqual([]);
  });

  it('keeps configured positions when values disappear and includes zero and false', () => {
    const metrics = deviceCardMetrics(device(['temperature', 'power', 'missing']), snapshot(
      field('temperature', 0, { unit: '℃' }), field('power', false, { valueType: 'boolean', manifestType: 0 }),
    ));
    expect(metrics.map(metric => metric.key)).toEqual(['temperature', 'power', 'missing']);
    expect(metrics.map(metric => metric.display)).toEqual(['0', '关', '—']);
    expect(metrics[0].description).toBe('temperature：0℃');
  });

  it('reuses compatible names and boolean labels but does not reinterpret a changed type', () => {
    const source = device(['power']);
    source.displayMetadata = { logicalDeviceId: 'device', revision: 1, name: '灯', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源', trueLabel: '运行', falseLabel: '待机' },
    ] };
    expect(deviceCardMetrics(source, snapshot(field('power', false, { valueType: 'boolean', manifestType: 0 })))[0]).toMatchObject({
      label: '电源', display: '待机', description: '电源：待机',
    });
    expect(deviceCardMetrics(source, snapshot(field('power', 2)))[0].label).toBe('power');
  });

  it('does not expose write-only or Action values, or non-finite/structured values', () => {
    const metrics = deviceCardMetrics(device(['private', 'action', 'bad', 'bytes']), snapshot(
      field('private', 123, { readable: false }), field('action', 456, { role: 'action' }),
      field('bad', Number.NaN), field('bytes', new Uint8Array([1])),
    ));
    expect(metrics.map(metric => metric.display)).toEqual(['—', '—', '—', '—']);
  });

  it('bounds and deduplicates legacy bindings without mutating them', () => {
    const source = device(['one', 'one', 'two', 'three', 'four']);
    const original = structuredClone(source.config.card);
    expect(deviceCardMetrics(source, undefined).map(metric => metric.key)).toEqual(['one', 'two', 'three']);
    expect(source.config.card).toEqual(original);
  });

  it('preserves small numeric precision and full values while compacting large readings', () => {
    const metrics = deviceCardMetrics(device(['small', 'large', 'big']), snapshot(
      field('small', 26.125), field('large', 12345, { unit: 'W' }),
      field('big', 1234567890123456789n, { valueType: 'integer', manifestType: 1 }),
    ));
    expect(metrics[0].display).toBe('26.125');
    expect(metrics[1].display.length).toBeLessThan(8);
    expect(metrics[1].description).toBe('large：12345W');
    expect(metrics[2].description).toBe('big：1234567890123456789');
  });

  it('distinguishes an absent personal binding from an explicitly empty row', () => {
    const source = device(['old']), state = snapshot(field('old', 1), field('new', 0));
    expect(deviceCardMetrics(source, state).map(metric => metric.key)).toEqual(['old']);
    expect(deviceCardMetrics(source, state, [])).toEqual([]);
    expect(deviceCardMetrics(source, state, [{ key: 'new', kind: 0, type: 3 }])[0]).toMatchObject({
      key: 'new', display: '0', unavailable: null,
    });
  });

  it('does not reinterpret a full reference when the same key changes kind or type', () => {
    const source = device(['power']);
    const bindings = [{ key: 'power', kind: 0, type: 0 }];
    for (const current of [field('power', 12), field('power', false, {
      manifestKind: 1, manifestType: 0, role: 'action', valueType: 'boolean',
    })]) {
      const metric = deviceCardMetrics(source, snapshot(current), bindings)[0];
      expect(metric.display).toBe('—');
      expect(metric.unit).toBe('');
      expect(metric.unavailable).toBe('字段类型已变化');
      expect(metric.description).toContain('不可用');
    }
  });

  it('keeps removed and unreadable full references as recognizable unavailable positions', () => {
    const bindings: HomeCardBinding[] = [
      { key: 'removed', kind: 0, type: 3 }, { key: 'private', kind: 0, type: 3 },
    ];
    const metrics = deviceCardMetrics(device(), snapshot(field('private', 99, { readable: false, unit: 'W' })), bindings);
    expect(metrics.map(metric => metric.key)).toEqual(['removed', 'private']);
    expect(metrics.map(metric => metric.display)).toEqual(['—', '—']);
    expect(metrics.every(metric => metric.unavailable && metric.unit === '')).toBe(true);
  });

  it.each([false, true])('does not leak retained values without a complete accepted Manifest (accepted=%s)', accepted => {
    const stale = { ...snapshot(field('power', 123, { unit: 'W' })), manifestAccepted: accepted,
      manifestRevision: accepted ? null : 1 };
    for (const bindings of [undefined, [{ key: 'power', kind: 0, type: 3 }]]) {
      const metric = deviceCardMetrics(device(['power']), stale, bindings)[0];
      expect(metric.display).toBe('—'); expect(metric.unit).toBe('');
      expect(metric.description).not.toContain('123');
      expect(metric.unavailable).toBe('尚未获取设备能力');
    }
  });

  it('offers only accepted, unambiguous, readable scalar Properties as binding candidates', () => {
    const fields = snapshot(field('number', 0), field('text', '', { valueType: 'text', manifestType: 5 }),
      field('power', false, { valueType: 'boolean', manifestType: 0 }), field('write-only', 1, { readable: false }),
      field('action', 1, { role: 'action', manifestKind: 1 }),
      field('bytes', new Uint8Array(), { valueType: 'bytes', manifestType: 6 }),
      field('duplicate', 1), field('duplicate', 2));
    expect(homeCardReadableFields(fields).map(field => field.key)).toEqual(['number', 'text', 'power']);
    expect(homeCardReadableFields({ ...fields, manifestAccepted: false })).toEqual([]);
  });

  it('resolves legacy references only with complete capabilities and never mutates or silently truncates configuration', () => {
    const source = device(['power', 'text']), original = structuredClone(source.config.card);
    const fields = snapshot(field('power', false, { valueType: 'boolean', manifestType: 0 }),
      field('text', '', { valueType: 'text', manifestType: 5 }));
    expect(legacyCardBindings(source, fields)).toEqual([
      { key: 'power', kind: 0, type: 0 }, { key: 'text', kind: 0, type: 5 },
    ]);
    expect(legacyCardBindings(source, undefined)).toBeUndefined();
    expect(legacyCardBindings(source, snapshot(field('power', false, { valueType: 'boolean', manifestType: 0 })))).toBeUndefined();
    expect(legacyCardBindings(device(['a', 'b', 'c', 'd', 'e']), fields)).toBeUndefined();
    expect(legacyCardBindings(device([]), undefined)).toEqual([]);
    expect(source.config.card).toEqual(original);
  });

  it('retains text, numeric zero and false through full references without coercing wrong-shaped values', () => {
    const bindings = [{ key: 'text', kind: 0, type: 5 }, { key: 'power', kind: 0, type: 0 },
      { key: 'integer', kind: 0, type: 2 }];
    const fields = snapshot(field('text', '', { valueType: 'text', manifestType: 5 }),
      field('power', false, { valueType: 'boolean', manifestType: 0 }),
      field('integer', 0, { valueType: 'integer', manifestType: 2 }));
    expect(deviceCardMetrics(device(), fields, bindings).map(metric => metric.display)).toEqual(['', '关', '0']);
    fields.endpoints[1].value = 1; fields.endpoints[2].value = -1;
    expect(deviceCardMetrics(device(), fields, bindings).map(metric => metric.display)).toEqual(['', '—', '—']);
  });

  it('keeps old writable references read-only and filters each explicitly selected control mode', () => {
    const state = snapshot(field('power', false, { valueType: 'boolean', manifestType: 0, writable: true }),
      field('level', 0, { writable: true, minimum: 0, maximum: 100, step: 5 }),
      field('missing-step', 0, { writable: true, minimum: 0, maximum: 100 }),
      field('act', true, { role: 'action', manifestKind: 1, manifestType: 0, valueType: 'boolean', readable: false, writable: true }),
      field('null-act', null, { role: 'action', manifestKind: 1, manifestType: 9, valueType: 'null', readable: false, writable: true }),
      field('parameter', 1, { role: 'action', manifestKind: 1, writable: true, minimum: 0, maximum: 10, step: 1 }));
    expect(homeCardFields(state, 'toggle').map(field => field.key)).toEqual(['power']);
    expect(homeCardFields(state, 'range').map(field => field.key)).toEqual(['level']);
    expect(homeCardFields(state, 'action').map(field => field.key)).toEqual(['act', 'null-act']);
    const metric = deviceCardMetrics(device(), state, [{ key: 'power', kind: 0, type: 0 }])[0];
    expect(metric.mode).toBe('read'); expect(metric.span).toBe(1); expect(metric.display).toBe('关');
    expect(homeCardBindingField(state, { key: 'level', kind: 0, type: 3, mode: 'range' })).toBe(state.endpoints[1]);
    expect(homeCardBindingField(state, { key: 'level', kind: 0, type: 1, mode: 'range' })).toBeUndefined();
  });

  it('does not read Action values or claim an execution result before a real command', () => {
    const state = snapshot(field('act', false, { role: 'action', manifestKind: 1, manifestType: 0,
      valueType: 'boolean', readable: false, writable: true }));
    const binding: HomeCardBinding = { key: 'act', kind: 1, type: 0, mode: 'action' };
    expect(deviceCardMetrics(device(), state, [binding])[0]).toMatchObject({ mode: 'action', display: '执行', unit: '', span: 1 });
    expect(homeCardBindingField({ ...state, manifestAccepted: false }, binding)).toBeUndefined();
  });

  it.each([[0, 2, false], [165, 2, false], [166, 2, true], [239, 3, true], [311, 4, false], [312, 4, true], [500, 1, false]] as const)(
    'requires 140 actual CSS pixels for a two-column range at width %i/%i columns', (width, columns, fits) => {
      expect(deviceCardRangeFits(width, columns)).toBe(fits);
    });

  it('packs a two-column range as an ordered prefix, reserving More without skipping or shrinking it', () => {
    const range: HomeCardBinding = { key: 'range', kind: 0, type: 3, mode: 'range' };
    const state = snapshot(field('range', 0, { writable: true, minimum: 0, maximum: 10, step: 1 }), field('a', 1), field('b', 2));
    const metrics = deviceCardMetrics(device(), state, [range, { key: 'a', kind: 0, type: 3 }, { key: 'b', kind: 0, type: 3 }]);
    expect(homeCardSpan(range)).toBe(2); expect(homeCardSpan({ key: 'a', kind: 0, type: 3 })).toBe(1);
    expect(homeCardRow(metrics, 4)).toEqual({ visible: metrics, hasMore: false });
    expect(homeCardRow(metrics, 3)).toEqual({ visible: [metrics[0]], hasMore: true });
    expect(homeCardRow(metrics, 2)).toEqual({ visible: [], hasMore: true });
    expect(homeCardRow(metrics, 4, false)).toEqual({ visible: [], hasMore: true });
    expect(homeCardRow([metrics[1], metrics[0], metrics[2]], 3)).toEqual({ visible: [metrics[1]], hasMore: true });
    expect(homeCardRow([metrics[0]], 2)).toEqual({ visible: [metrics[0]], hasMore: false });
    const invalid = deviceCardMetrics(device(), undefined, [range])[0];
    expect(invalid.span).toBe(2); expect(invalid.display).toBe('—'); expect(invalid.unavailable).toBeTruthy();
  });
});
