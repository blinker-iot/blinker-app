import { describe, expect, it, vi } from 'vitest';
import { HomeCardBinding, HomeCardPreferences, HomeCardPreferencesStore, homeCardViewKey, orderedDeviceIds } from './device-card-preferences';

const scope = { authority: 'https://gateway.example', accountId: 'user' };
const empty = (): HomeCardPreferences => ({ version: 3, revision: 0, layouts: {}, orders: {}, slots: {} });
const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
};

describe('home card personal preferences', () => {
  it('loads an empty draft without writing, so cancel has no persistence side effect', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const baseline = store.load();
    baseline.value.layouts['device'] = 'wide';

    expect(store.load()).toEqual({ raw: null, value: empty() });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('saves layout and order together with one write and increments revision without mutating the draft', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const draft = { ...empty(), layouts: { device: 'wide' as const }, orders: { all: ['device'] } };
    const saved = store.save(draft, null);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(saved.value).toEqual({ ...draft, revision: 1 });
    expect(draft.revision).toBe(0);
    draft.orders.all.push('other');
    expect(store.load()).toEqual(saved);
    const second = store.save({ ...saved.value, layouts: { device: 'standard' } }, saved.raw);
    expect(second.value.revision).toBe(2);
  });

  it('isolates account and authority keys without changing another user preference', () => {
    const storage = memory();
    const owner = new HomeCardPreferencesStore(storage, scope);
    const saved = owner.save({ ...empty(), layouts: { device: 'wide' } }, null);
    const otherAccount = new HomeCardPreferencesStore(storage, { ...scope, accountId: 'other' });
    const otherAuthority = new HomeCardPreferencesStore(storage, { ...scope, authority: 'http://gateway.example' });
    expect(otherAccount.load().raw).toBeNull();
    expect(otherAuthority.load().raw).toBeNull();
    otherAccount.save(empty(), null);
    expect(owner.load()).toEqual(saved);
    expect(storage.values.size).toBe(2);
  });

  it('rejects a changed raw baseline or stale revision without writing', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const first = store.save(empty(), null);
    expect(() => store.save(empty(), null)).toThrow('HOME_CARD_PREFERENCES_CONFLICT');
    expect(() => store.save(empty(), first.raw)).toThrow('HOME_CARD_PREFERENCES_CONFLICT');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(store.load()).toEqual(first);
  });

  it('sanitizes storage failures and leaves the saved record and draft baseline unchanged', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const first = store.save(empty(), null);
    storage.setItem.mockImplementationOnce(() => { throw Error('private storage details'); });
    expect(() => store.save({ ...first.value, layouts: { device: 'wide' } }, first.raw))
      .toThrow('HOME_CARD_PREFERENCES_WRITE_FAILED');
    expect(store.load()).toEqual(first);
    expect(first.value.revision).toBe(1);
    storage.getItem.mockImplementationOnce(() => { throw Error('private storage details'); });
    expect(() => store.load()).toThrow('HOME_CARD_PREFERENCES_READ_FAILED');
    storage.getItem.mockImplementationOnce(() => { throw Error('private storage details'); });
    expect(() => store.save(first.value, first.raw)).toThrow('HOME_CARD_PREFERENCES_READ_FAILED');
    expect(store.load()).toEqual(first);
  });

  it.each(['{', 'null', JSON.stringify({ ...empty(), secret: 'unexpected' }),
    JSON.stringify({ ...empty(), revision: -1 }), JSON.stringify({ ...empty(), orders: { all: ['a', 'a'] } }),
    JSON.stringify({ ...empty(), layouts: { a: 'huge' } }), ' '.repeat(512 * 1024 + 1)])(
    'preserves a corrupt record instead of resetting or overwriting it', raw => {
      const storage = memory();
      const store = new HomeCardPreferencesStore(storage, scope);
      store.save(empty(), null);
      const key = [...storage.values.keys()][0];
      storage.values.set(key, raw);
      storage.setItem.mockClear();
      expect(() => store.load()).toThrow('HOME_CARD_PREFERENCES_INVALID');
      expect(() => store.save(empty(), raw)).toThrow('HOME_CARD_PREFERENCES_INVALID');
      expect(storage.values.get(key)).toBe(raw);
      expect(storage.setItem).not.toHaveBeenCalled();
    });

  it('preserves future versions and rejects exhausted revisions', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    store.save(empty(), null);
    const key = [...storage.values.keys()][0];
    const future = JSON.stringify({ ...empty(), version: 4 });
    storage.values.set(key, future);
    storage.setItem.mockClear();
    expect(() => store.load()).toThrow('HOME_CARD_PREFERENCES_UNSUPPORTED_VERSION');
    expect(() => store.save(empty(), future)).toThrow('HOME_CARD_PREFERENCES_UNSUPPORTED_VERSION');
    expect(storage.values.get(key)).toBe(future);
    const exhausted = JSON.stringify({ ...empty(), revision: 0x7fffffff });
    storage.values.set(key, exhausted);
    expect(() => store.save({ ...empty(), revision: 0x7fffffff }, exhausted))
      .toThrow('HOME_CARD_PREFERENCES_REVISION_EXHAUSTED');
    expect(storage.values.get(key)).toBe(exhausted);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('handles prototype-named own keys without inherited layout or view values', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const draft = JSON.parse('{"version":3,"revision":0,"layouts":{"__proto__":"wide","constructor":"standard"},"orders":{"all":["__proto__","constructor"]},"slots":{"__proto__":[],"constructor":[{"key":"power","kind":0,"type":0}]}}');
    const saved = store.save(draft, null);
    expect(Object.getPrototypeOf(saved.value.layouts)).toBeNull();
    expect(saved.value.layouts['__proto__']).toBe('wide');
    expect(saved.value.layouts['toString']).toBeUndefined();
    expect(Object.getPrototypeOf(store.load().value.orders)).toBeNull();
    expect(Object.getPrototypeOf(store.load().value.slots)).toBeNull();
    expect(saved.value.slots['__proto__']).toEqual([]);
    expect(saved.value.slots['toString']).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it('accepts the device and view count boundaries', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const deviceIds = Array.from({ length: 512 }, (_, index) => `device-${index}`);
    const draft: HomeCardPreferences = { ...empty(),
      layouts: Object.fromEntries(deviceIds.map(id => [id, 'wide' as const])),
      orders: Object.fromEntries(Array.from({ length: 128 }, (_, index) => [homeCardViewKey(`room-${index}`), [deviceIds[index]]])),
    };
    draft.orders['all'] = deviceIds;
    delete draft.orders[homeCardViewKey('room-127')];
    expect(store.save(draft, null).value.orders['all']).toHaveLength(512);
  });

  it.each(['devices', 'views', 'order', 'union', 'bytes', 'id', 'view', 'extra'])(
    'rejects invalid %s before writing', kind => {
      const storage = memory();
      const store = new HomeCardPreferencesStore(storage, scope);
      const draft = empty();
      if (kind === 'devices') draft.layouts = Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`d-${i}`, 'wide' as const]));
      if (kind === 'views') draft.orders = Object.fromEntries(Array.from({ length: 129 }, (_, i) => [homeCardViewKey(`r-${i}`), []]));
      if (kind === 'order') draft.orders['all'] = Array.from({ length: 513 }, (_, i) => `d-${i}`);
      if (kind === 'union') {
        draft.layouts = Object.fromEntries(Array.from({ length: 512 }, (_, i) => [`d-${i}`, 'wide' as const]));
        draft.orders['all'] = ['outside'];
      }
      if (kind === 'bytes') {
        const deviceIds = Array.from({ length: 512 }, (_, i) => `device-${i}`);
        draft.orders = Object.fromEntries(Array.from({ length: 128 }, (_, i) => [homeCardViewKey(`r-${i}`), [...deviceIds]]));
      }
      if (kind === 'id') draft.layouts['x'.repeat(129)] = 'wide';
      if (kind === 'view') draft.orders['__proto__:invalid'] = [];
      if (kind === 'extra') Object.assign(draft, { state: { power: true } });
      expect(() => store.save(draft, null)).toThrow('HOME_CARD_PREFERENCES_INVALID');
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.values.size).toBe(0);
    });

  it('reads exact v1 raw without writing and migrates layout/order with one v3 save', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    store.save(empty(), null);
    const key = [...storage.values.keys()][0];
    const raw = ' { "version":1,"revision":7,"layouts":{"a":"wide"},"orders":{"all":["b","a"]} } ';
    storage.values.set(key, raw);
    storage.setItem.mockClear();
    const loaded = store.load();
    expect(loaded.raw).toBe(raw);
    expect(loaded.value).toEqual({ version: 3, revision: 7, layouts: { a: 'wide' }, orders: { all: ['b', 'a'] }, slots: {} });
    expect(storage.values.get(key)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    loaded.value.slots['a'] = [{ key: 'power', kind: 0, type: 0 }];
    const saved = store.save(loaded.value, loaded.raw);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(saved.value).toEqual({ ...loaded.value, revision: 8 });
    expect(JSON.parse(saved.raw!).version).toBe(3);
  });

  it('keeps explicit empty slots distinct from no preference and preserves scalar binding identities', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    expect(Object.hasOwn(store.load().value.slots, 'empty')).toBe(false);
    const configured = { ...empty(), slots: { empty: [], populated: [
      { key: 'power', kind: 0, type: 0 }, { key: 'signed', kind: 0, type: 1 },
      { key: 'float', kind: 0, type: 4 }, { key: 'text', kind: 0, type: 5 },
    ] } };
    const saved = store.save(configured, null);
    expect(Object.hasOwn(saved.value.slots, 'empty')).toBe(true);
    expect(saved.value.slots['empty']).toEqual([]);
    expect(Object.hasOwn(saved.value.slots, 'unconfigured')).toBe(false);
    expect(store.load()).toEqual(saved);
    configured.slots.populated[0].key = 'changed';
    expect(store.load().value.slots['populated'][0].key).toBe('power');
  });

  it.each([
    [{ key: '', kind: 0, type: 0 }], [{ key: '蜗'.repeat(22), kind: 0, type: 0 }],
    [{ key: 'power', kind: 1, type: 0 }], [{ key: 'power', kind: 2, type: 0 }],
    [{ key: 'power', kind: 0, type: -1 }], [{ key: 'power', kind: 0, type: 6 }],
    [{ key: 'power', kind: 0, type: 9 }], [{ key: 'power', kind: 0, type: 1.5 }],
    [{ key: 'power', kind: 0, type: '0' }], [{ key: 'power', kind: 0, type: 0, command: true }],
    [{ key: 'power', kind: 0, type: 0 }, { key: 'power', kind: 0, type: 1 }],
    Array.from({ length: 5 }, (_, i) => ({ key: `field-${i}`, kind: 0, type: 0 })),
  ].map(bindings => ({ bindings })))('rejects invalid or oversized slots and preserves the previous record', ({ bindings }) => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const previous = store.save(empty(), null);
    storage.setItem.mockClear();
    expect(() => store.save({ ...previous.value, slots: { device: bindings as unknown as HomeCardBinding[] } }, previous.raw))
      .toThrow('HOME_CARD_PREFERENCES_INVALID');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.load()).toEqual(previous);
  });

  it('counts slot device identities in the shared 512-device limit, including explicit empty slots', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const slots = Object.fromEntries(Array.from({ length: 512 }, (_, i) => [`d-${i}`, []]));
    const saved = store.save({ ...empty(), slots }, null);
    expect(Object.keys(saved.value.slots)).toHaveLength(512);
    storage.setItem.mockClear();
    expect(() => store.save({ ...saved.value, layouts: { outside: 'wide' } }, saved.raw))
      .toThrow('HOME_CARD_PREFERENCES_INVALID');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.load()).toEqual(saved);
  });

  it('projects v2 slots as read-only v3 without rewriting raw or losing explicit empty rows', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    store.save(empty(), null);
    const key = [...storage.values.keys()][0];
    const raw = ' {"version":2,"revision":11,"layouts":{"a":"wide"},"orders":{"all":["a"]},"slots":{"a":[{"key":"power","kind":0,"type":0}],"empty":[]}} ';
    storage.values.set(key, raw);
    storage.setItem.mockClear();
    const loaded = store.load();
    expect(loaded.raw).toBe(raw);
    expect(loaded.value).toEqual({ version: 3, revision: 11, layouts: { a: 'wide' }, orders: { all: ['a'] },
      slots: { a: [{ key: 'power', kind: 0, type: 0 }], empty: [] } });
    expect(loaded.value.slots['a'][0].mode).toBeUndefined();
    expect(Object.hasOwn(loaded.value.slots, 'empty')).toBe(true);
    expect(storage.values.get(key)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    const saved = store.save(loaded.value, raw);
    expect(saved.value.revision).toBe(12);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(saved.raw!).version).toBe(3);
  });

  it('refuses mode injection into v2 raw and preserves the exact rejected record', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    store.save(empty(), null);
    const key = [...storage.values.keys()][0];
    const raw = JSON.stringify({ ...empty(), version: 2,
      slots: { a: [{ key: 'power', kind: 0, type: 0, mode: 'toggle' }] } });
    storage.values.set(key, raw);
    storage.setItem.mockClear();
    expect(() => store.load()).toThrow('HOME_CARD_PREFERENCES_INVALID');
    expect(() => store.save(empty(), raw)).toThrow('HOME_CARD_PREFERENCES_INVALID');
    expect(storage.values.get(key)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('canonicalizes read to omitted mode and round-trips explicit toggle, action and range intents', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const draft: HomeCardPreferences = { ...empty(), slots: {
      controls: [{ key: 'power', kind: 0, type: 0, mode: 'toggle' },
        { key: 'click', kind: 1, type: 0, mode: 'action' }, { key: 'level', kind: 0, type: 2, mode: 'range' }],
      readings: [{ key: 'temperature', kind: 0, type: 3, mode: 'read' }, { key: 'text', kind: 0, type: 5 }],
      nullAction: [{ key: 'reset', kind: 1, type: 9, mode: 'action' }],
    } };
    const saved = store.save(draft, null);
    expect(saved.value.slots['controls']).toEqual(draft.slots['controls']);
    expect(saved.value.slots['nullAction']).toEqual(draft.slots['nullAction']);
    expect(saved.value.slots['readings']).toEqual([{ key: 'temperature', kind: 0, type: 3 }, { key: 'text', kind: 0, type: 5 }]);
    expect(Object.hasOwn(saved.value.slots['readings'][0], 'mode')).toBe(false);
    expect(draft.slots['readings'][0].mode).toBe('read');
    expect(store.load()).toEqual(saved);
  });

  it('fits exactly two range spans in the four-column contract', () => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const configured: HomeCardBinding[] = [{ key: 'a', kind: 0, type: 1, mode: 'range' }, { key: 'b', kind: 0, type: 4, mode: 'range' }];
    expect(store.save({ ...empty(), slots: { device: configured } }, null).value.slots['device']).toEqual(configured);
  });

  it.each([
    [{ key: 'power', kind: 0, type: 2, mode: 'toggle' }],
    [{ key: 'power', kind: 1, type: 0, mode: 'toggle' }],
    [{ key: 'read', kind: 1, type: 0, mode: 'read' }],
    [{ key: 'action', kind: 0, type: 0, mode: 'action' }],
    [{ key: 'action', kind: 1, type: 2, mode: 'action' }],
    [{ key: 'range', kind: 0, type: 0, mode: 'range' }],
    [{ key: 'range', kind: 0, type: 5, mode: 'range' }],
    [{ key: 'range', kind: 1, type: 1, mode: 'range' }],
    [{ key: 'power', kind: 0, type: 0, mode: 'unknown' }],
    [{ key: 'power', kind: 0, type: 0, mode: null }],
    [{ key: 'power', kind: 0, type: 0, mode: undefined }],
    [{ key: 'power', kind: 0, type: 0, mode: 'toggle', args: true }],
    [{ key: 'click', kind: 1, type: 9, mode: 'action', args: null }],
    [{ key: 'range', kind: 0, type: 2, mode: 'range', span: 2 }],
    [{ key: 'range', kind: 0, type: 2, mode: 'range' }, ...['a', 'b', 'c'].map(key => ({ key, kind: 0, type: 0 }))],
    ['a', 'b', 'c'].map(key => ({ key, kind: 0, type: 2, mode: 'range' })),
    [{ key: 'duplicate', kind: 0, type: 0 }, { key: 'duplicate', kind: 0, type: 0, mode: 'toggle' }],
  ].map(bindings => ({ bindings })))('rejects incompatible modes, arbitrary args and excess derived spans without a write', ({ bindings }) => {
    const storage = memory();
    const store = new HomeCardPreferencesStore(storage, scope);
    const baseline = store.save(empty(), null);
    storage.setItem.mockClear();
    expect(() => store.save({ ...baseline.value, slots: { device: bindings as unknown as HomeCardBinding[] } }, baseline.raw))
      .toThrow('HOME_CARD_PREFERENCES_INVALID');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.load()).toEqual(baseline);
  });
});

describe('home card view and personal order helpers', () => {
  it('uses exact room names, not indexes or trimmed aliases', () => {
    expect(homeCardViewKey()).toBe('all');
    expect(homeCardViewKey('客厅')).toBe('room:' + encodeURIComponent('客厅'));
    expect(homeCardViewKey('客厅 ')).not.toBe(homeCardViewKey('客厅'));
    expect(homeCardViewKey('all')).not.toBe('all');
    expect(() => homeCardViewKey('')).toThrow('HOME_CARD_PREFERENCES_INVALID');
  });

  it('retains visible saved order, appends new IDs in base order and deliberately deduplicates', () => {
    const base = ['a', 'b', 'a', 'c', 'd'];
    const saved = ['gone', 'c', 'c', 'a'];
    expect(orderedDeviceIds(base, saved)).toEqual(['c', 'a', 'b', 'd']);
    expect(orderedDeviceIds(base)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderedDeviceIds(['constructor', '__proto__'], ['__proto__'])).toEqual(['__proto__', 'constructor']);
    expect(base).toEqual(['a', 'b', 'a', 'c', 'd']);
    expect(saved).toEqual(['gone', 'c', 'c', 'a']);
  });
});
