import { DestroyRef } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API } from '../configs/api.config';
import { DataService } from '../core/services/data.service';
import { DeviceCardEditor } from './device-card-editor.service';
import { HomeCardPreferencesStore, homeCardViewKey } from './device-card-preferences';
import { DeviceUiSnapshot } from '../core/device-v2/device-ui.port';

const authority = API.BASE_URL;
const authorityDescriptor = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;

const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
};

function harness() {
  const callbacks: (() => void)[] = [];
  const destroyRef = { onDestroy: (callback: () => void) => {
    callbacks.push(callback);
    return () => { const index = callbacks.indexOf(callback); if (index >= 0) callbacks.splice(index, 1); };
  } } as DestroyRef;
  const device = (id: string, wide = false) => ({ deviceName: id, config: {
    mode: 'bbp2', card: { layout: wide ? 'wide' : 'standard' }, disabled: false, isPreview: false,
  } });
  const data = {
    auth: { uuid: 'account', token: 'test-token' } as { uuid: string; token: string } | null,
    sessionEpoch: 1,
    device: { list: ['a', 'b', 'c'], dict: { a: device('a'), b: device('b', true), c: device('c') } as Record<string, ReturnType<typeof device>> },
    room: { list: ['客厅', '卧室'], dict: { 客厅: ['a', 'b'], 卧室: ['c'] } as Record<string, string[]> },
    authDataChanged: new Subject<void>(),
    deviceDataLoader: new BehaviorSubject(true),
    userDataLoader: new BehaviorSubject(true),
  };
  const editor = new DeviceCardEditor(data as unknown as DataService, destroyRef);
  editor.setActive(true);
  return { data, editor, destroy: () => { for (const callback of [...callbacks]) callback(); } };
}

describe('page-scoped device card editing', () => {
  let storage: ReturnType<typeof memory>;

  beforeEach(() => {
    storage = memory();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    Object.defineProperty(API, 'BASE_URL', authorityDescriptor);
    vi.unstubAllGlobals();
  });

  it('keeps layout and order in a draft, and cancel performs no write or device/room mutation', () => {
    const { data, editor } = harness();
    const original = structuredClone({ device: data.device, room: data.room });
    expect(editor.layout('b')).toBe('wide');
    expect(editor.begin(undefined, ['a', 'b', 'c'], 'a')).toBe(true);
    expect(editor.editing()).toBe(true);
    expect(editor.selectedId()).toBe('a');
    expect(editor.dirty()).toBe(false);
    editor.setLayout('a', 'wide');
    editor.reorder(['b', 'a', 'c']);
    editor.select('b');
    expect(editor.selectedId()).toBe('b');
    expect(editor.layout('a')).toBe('wide');
    expect(editor.order(undefined, ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
    expect(editor.dirty()).toBe(true);
    editor.cancel();
    expect(editor.editing()).toBe(false);
    expect(editor.layout('a')).toBe('standard');
    expect(editor.order(undefined, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect({ device: data.device, room: data.room }).toEqual(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('commits layout and room order with one local write without changing the shared device or room', () => {
    const { data, editor } = harness();
    const original = structuredClone({ device: data.device, room: data.room });
    expect(editor.begin('客厅', ['a', 'b'], 'a')).toBe(true);
    editor.setLayout('a', 'wide');
    editor.reorder(['b', 'a']);
    expect(editor.save()).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(editor.editing()).toBe(false);
    expect(editor.saving()).toBe(false);
    expect(editor.layout('a')).toBe('wide');
    expect(editor.order('客厅', ['a', 'b'])).toEqual(['b', 'a']);
    expect(editor.order('卧室', ['c'])).toEqual(['c']);
    const persisted = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' }).load();
    expect(persisted.value.revision).toBe(1);
    expect(persisted.value.layouts['a']).toBe('wide');
    expect(persisted.value.orders[homeCardViewKey('客厅')]).toEqual(['b', 'a']);
    expect({ device: data.device, room: data.room }).toEqual(original);
  });

  it('retains the draft and previous baseline after a storage failure so save may be retried', () => {
    const { editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    editor.setLayout('a', 'wide');
    storage.setItem.mockImplementationOnce(() => { throw Error('quota'); });
    expect(editor.save()).toBe(false);
    expect(editor.error()).toBeTruthy();
    expect(editor.editing()).toBe(true);
    expect(editor.dirty()).toBe(true);
    expect(editor.layout('a')).toBe('wide');
    expect(storage.values.size).toBe(0);
    expect(editor.save()).toBe(true);
    expect(editor.editing()).toBe(false);
    expect(storage.values.size).toBe(1);
  });

  it('does not overwrite an external raw change and retains the conflicting draft', () => {
    const { editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    editor.setLayout('a', 'wide');
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const initial = store.load();
    const other = store.save({ ...initial.value, layouts: { b: 'standard' } }, initial.raw);
    storage.setItem.mockClear();
    expect(editor.save()).toBe(false);
    expect(editor.editing()).toBe(true);
    expect(editor.error()).toBeTruthy();
    expect(editor.layout('a')).toBe('wide');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.load()).toEqual(other);
  });

  it.each(['account', 'epoch', 'authority'] as const)('discards a draft when the %s context changes', kind => {
    const { data, editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    editor.setLayout('a', 'wide');
    if (kind === 'account') data.auth = { uuid: 'other-account', token: 'test-token' };
    if (kind === 'epoch') data.sessionEpoch += 1;
    if (kind === 'authority') Object.defineProperty(API, 'BASE_URL', {
      value: 'https://other-gateway.example', configurable: true,
    });
    data.authDataChanged.next();
    expect(editor.editing()).toBe(false);
    expect(editor.layout('a')).toBe('standard');
    expect(editor.save()).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('invalidates a draft when an original device disappears from the inventory', () => {
    const { data, editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    editor.setLayout('a', 'wide');
    delete data.device.dict['b'];
    data.device.list = ['a', 'c'];
    data.deviceDataLoader.next(true);
    expect(editor.editing()).toBe(false);
    expect(editor.save()).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('invalidates a room draft when an original device loses room membership', () => {
    const { data, editor } = harness();
    editor.begin('客厅', ['a', 'b'], 'a');
    editor.reorder(['b', 'a']);
    data.room.dict['客厅'] = ['a'];
    data.userDataLoader.next(true);
    expect(editor.editing()).toBe(false);
    expect(editor.save()).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not transfer a renamed/deleted room draft to another room at the same index', () => {
    const { data, editor } = harness();
    editor.begin('客厅', ['a', 'b'], 'a');
    editor.setLayout('a', 'wide');
    data.room.list[0] = '书房';
    delete data.room.dict['客厅'];
    data.room.dict['书房'] = ['a', 'b'];
    data.userDataLoader.next(true);
    expect(editor.editing()).toBe(false);
    expect(editor.order('书房', ['a', 'b'])).toEqual(['a', 'b']);
    expect(editor.layout('a')).toBe('standard');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('appends newly visible devices in base order without disturbing a saved personal order', () => {
    const { editor, data } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    editor.reorder(['b', 'a', 'c']);
    expect(editor.save()).toBe(true);
    data.device.dict['d'] = { deviceName: 'd', config: { mode: 'bbp2',
      card: { layout: 'standard' }, disabled: false, isPreview: false } };
    data.device.list.push('d');
    data.deviceDataLoader.next(true);
    expect(editor.order(undefined, ['a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c', 'd']);
  });

  it('retains a background draft but forbids mutation or saving until active again', () => {
    const { editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    editor.setLayout('a', 'wide');
    editor.reorder(['b', 'a', 'c']);
    editor.setActive(false);
    expect(editor.active()).toBe(false);
    expect(editor.editing()).toBe(true);
    editor.setLayout('a', 'standard');
    editor.reorder(['c', 'b', 'a']);
    expect(editor.save()).toBe(false);
    expect(editor.layout('a')).toBe('wide');
    expect(editor.order(undefined, ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
    expect(storage.setItem).not.toHaveBeenCalled();
    editor.setActive(true);
    expect(editor.active()).toBe(true);
    expect(editor.save()).toBe(true);
  });

  it('does not allow guest or unauthenticated inventory to enter editing', () => {
    const { data, editor } = harness();
    data.auth = null;
    for (const device of Object.values(data.device.dict)) device.config.isPreview = true;
    data.authDataChanged.next();
    expect(editor.begin(undefined, ['a', 'b', 'c'], 'a')).toBe(false);
    expect(editor.editing()).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  const snapshot = (): DeviceUiSnapshot => ({ manifestAccepted: true, manifestRevision: 1,
    manifestFingerprint: 'known', stateFresh: true, stateRevision: 1, endpoints: [
      { id: 1, key: 'power', manifestKind: 0, manifestType: 0, role: 'property', valueType: 'boolean',
        readable: true, writable: true, notifies: true, value: false },
    ] });
  const power = { key: 'power', kind: 0, type: 0 };
  const controlsSnapshot = (): DeviceUiSnapshot => ({ ...snapshot(), endpoints: [...snapshot().endpoints,
    { id: 2, key: 'level', manifestKind: 0, manifestType: 2, role: 'property', valueType: 'integer',
      readable: true, writable: true, notifies: true, value: 5, minimum: 0, maximum: 100, step: 5 },
    { id: 3, key: 'run', manifestKind: 1, manifestType: 9, role: 'action', valueType: 'null',
      readable: false, writable: true, notifies: false },
  ] });

  it('keeps full bindings in the outer draft; Cancel never changes the preference or source config', () => {
    const { data, editor } = harness();
    const original = structuredClone(data.device);
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a', 'power');
    expect(editor.applySettings('a', 'wide', [power], snapshot())).toBe(true);
    expect(editor.bindings('a')).toEqual([power]); expect(editor.dirty()).toBe(true);
    expect(editor.save()).toBe(false); // Inner panel must be completed first.
    editor.closeSettings(); editor.cancel();
    expect(editor.bindings('a')).toBeUndefined(); expect(editor.layout('a')).toBe('standard');
    expect(data.device).toEqual(original); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('commits explicit empty slots with layout and order once, preserving them on reopen', () => {
    const { editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a');
    expect(editor.applySettings('a', 'wide', [], undefined)).toBe(true);
    editor.closeSettings(); editor.reorder(['c', 'a', 'b']);
    expect(editor.save()).toBe(true); expect(storage.setItem).toHaveBeenCalledOnce();
    expect(editor.bindings('a')).toEqual([]);
    editor.begin(undefined, ['a', 'b', 'c'], 'a');
    expect(editor.bindings('a')).toEqual([]); expect(editor.dirty()).toBe(false);
  });

  it('requires current full Manifest identity for new bindings, but preserves invalid saved references', () => {
    const { editor } = harness();
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const base = store.load(); store.save({ ...base.value, slots: { a: [power] } }, base.raw);
    storage.setItem.mockClear();
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a');
    expect(editor.applySettings('a', 'wide', [power], undefined)).toBe(true);
    const changed = { key: 'power', kind: 0, type: 1 };
    expect(editor.applySettings('a', 'standard', [changed], snapshot())).toBe(false);
    expect(editor.layout('a')).toBe('wide'); expect(editor.bindings('a')).toEqual([power]);
    expect(editor.applySettings('a', 'wide', [power, power], snapshot())).toBe(false);
    expect(editor.applySettings('b', 'wide', [], snapshot())).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('single-card settings never overwrite the saved all-device or room order', () => {
    const { editor } = harness();
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const base = store.load(); store.save({ ...base.value, orders: { all: ['c', 'b', 'a'],
      [homeCardViewKey('客厅')]: ['b', 'a'] } }, base.raw);
    storage.setItem.mockClear();
    expect(editor.beginSingle('a')).toBe(true); editor.openSettings('a');
    expect(editor.single()).toBe(true);
    expect(editor.applySettings('a', 'wide', [power], snapshot())).toBe(true);
    expect(editor.save()).toBe(true); expect(storage.setItem).toHaveBeenCalledOnce();
    expect(store.load().value.orders).toEqual({ all: ['c', 'b', 'a'], [homeCardViewKey('客厅')]: ['b', 'a'] });
    expect(store.load().value.slots['a']).toEqual([power]);
  });

  it('consumes a separate single-card editor save when the cached home becomes active again', () => {
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const base = store.load(); store.save({ ...base.value, layouts: { a: 'wide' }, slots: { a: [power] },
      orders: { all: ['c', 'b', 'a'], [homeCardViewKey('客厅')]: ['b', 'a'] } }, base.raw);
    const home = harness().editor;
    home.setActive(false);
    const settings = harness().editor;
    expect(settings.beginSingle('a')).toBe(true); settings.openSettings('a');
    expect(settings.applySettings('a', 'standard', [], undefined)).toBe(true);
    storage.setItem.mockClear();
    expect(settings.save()).toBe(true);
    const saved = store.load();
    expect(home.layout('a')).toBe('wide'); expect(home.bindings('a')).toEqual([power]);

    home.setActive(true);

    expect(home.layout('a')).toBe('standard'); expect(home.bindings('a')).toEqual([]);
    expect(home.order(undefined, ['a', 'b', 'c'])).toEqual(['c', 'b', 'a']);
    expect(home.order('客厅', ['a', 'b'])).toEqual(['b', 'a']);
    expect(store.load()).toEqual(saved); expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it('re-reads preferences only on re-entry, not ordinary refreshes or repeated active notifications', () => {
    const { editor, data } = harness();
    editor.setActive(false);
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const base = store.load(); store.save({ ...base.value, layouts: { a: 'wide' } }, base.raw);
    storage.getItem.mockClear(); storage.setItem.mockClear();
    editor.refresh(); data.deviceDataLoader.next(true); data.userDataLoader.next(true);
    expect(editor.layout('a')).toBe('standard'); expect(storage.getItem).not.toHaveBeenCalled();

    editor.setActive(true);
    expect(editor.layout('a')).toBe('wide'); expect(storage.getItem).toHaveBeenCalledOnce();
    editor.refresh(); editor.setActive(true); data.deviceDataLoader.next(true);
    expect(storage.getItem).toHaveBeenCalledOnce(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps a background draft and its original CAS baseline when another editor saves', () => {
    const home = harness().editor;
    expect(home.begin(undefined, ['a', 'b', 'c'], 'a')).toBe(true);
    home.reorder(['b', 'a', 'c']); home.setActive(false);
    const settings = harness().editor;
    expect(settings.beginSingle('a')).toBe(true); settings.openSettings('a');
    expect(settings.applySettings('a', 'wide', [], undefined)).toBe(true);
    expect(settings.save()).toBe(true);
    const saved = new Map(storage.values);
    storage.getItem.mockClear(); storage.setItem.mockClear();

    home.setActive(true);

    expect(storage.getItem).not.toHaveBeenCalled(); expect(home.editing()).toBe(true);
    expect(home.dirty()).toBe(true); expect(home.layout('a')).toBe('standard');
    expect(home.order(undefined, ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
    expect(home.save()).toBe(false); expect(home.error()).toContain('其他窗口');
    expect(home.editing()).toBe(true); expect(storage.values).toEqual(saved);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('preserves the saved record after a re-entry read failure and recovers on a later re-entry', () => {
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const base = store.load(); store.save({ ...base.value, layouts: { a: 'wide' } }, base.raw);
    const { editor } = harness(); const saved = new Map(storage.values);
    editor.setActive(false); storage.setItem.mockClear();
    storage.getItem.mockImplementationOnce(() => { throw Error('unavailable'); });

    editor.setActive(true);

    expect(editor.error()).toContain('原记录已保留');
    expect(editor.editing()).toBe(false); expect(storage.values).toEqual(saved);
    expect(storage.setItem).not.toHaveBeenCalled();
    editor.setActive(false); editor.setActive(true);
    expect(editor.error()).toBeNull(); expect(editor.layout('a')).toBe('wide');
    expect(storage.values).toEqual(saved); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(['{broken', JSON.stringify({ version: 4, revision: 1, layouts: {}, orders: {}, slots: {} })])(
    'does not replace an unreadable or future preference record on re-entry', raw => {
      const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
      store.save(store.load().value, null);
      const { editor } = harness(); editor.setActive(false);
      const key = [...storage.values.keys()][0]; storage.values.set(key, raw); storage.setItem.mockClear();

      editor.setActive(true);

      expect(editor.error()).toContain('原记录已保留');
      expect(editor.beginSingle('a')).toBe(false); expect(editor.save()).toBe(false);
      expect(storage.values.get(key)).toBe(raw); expect(storage.setItem).not.toHaveBeenCalled();
    });

  it('loads only the new account on re-entry without carrying another account preferences across', () => {
    const original = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    original.save({ ...original.load().value, layouts: { a: 'wide' }, slots: { a: [power] } }, null);
    const other = new HomeCardPreferencesStore(storage, { authority, accountId: 'other-account' });
    other.save({ ...other.load().value, orders: { all: ['c', 'a', 'b'] } }, null);
    const { editor, data } = harness(); const saved = new Map(storage.values);
    editor.setActive(false); data.auth = { uuid: 'other-account', token: 'other-token' };
    storage.getItem.mockClear(); storage.setItem.mockClear();

    editor.setActive(true);

    expect(storage.getItem).toHaveBeenCalledOnce();
    expect(editor.layout('a')).toBe('standard'); expect(editor.bindings('a')).toBeUndefined();
    expect(editor.order(undefined, ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
    expect(storage.values).toEqual(saved); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('opens a fresh panel token each time and invalidates the panel on access or account changes', () => {
    const { data, editor } = harness();
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a');
    const first = editor.settingsGeneration();
    editor.closeSettings(); editor.openSettings('a');
    expect(editor.settingsGeneration()).toBeGreaterThan(first);
    data.device.dict['a'].config.disabled = true; data.deviceDataLoader.next(true);
    expect(editor.settingsId()).toBeNull(); expect(editor.editing()).toBe(false);
    expect(editor.applySettings('a', 'wide', [power], snapshot())).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('requires an explicit mode change and current endpoint sharing permission for a new control', () => {
    const { editor, data } = harness();
    Object.assign(data.device.dict['a'].config, { isShared: true });
    Object.assign(data.device.dict['a'], { data: { canCommand: false, commandEndpointKeys: null } });
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a'); editor.setCapacity('a', 'wide', 4);
    expect(editor.applySettings('a', 'wide', [{ ...power, mode: 'toggle' }], controlsSnapshot())).toBe(false);
    expect(editor.applySettings('a', 'wide', [power], controlsSnapshot())).toBe(true);
    Object.assign(data.device.dict['a'], { data: { canCommand: true, commandEndpointKeys: ['power'] } });
    expect(editor.applySettings('a', 'wide', [{ ...power, mode: 'toggle' }], controlsSnapshot())).toBe(true);
    expect(editor.bindings('a')).toEqual([{ ...power, mode: 'toggle' }]);
    expect(editor.applySettings('a', 'wide', [{ key: 'run', kind: 1, type: 9, mode: 'action' }], controlsSnapshot())).toBe(false);
    editor.cancel();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('counts range spans and requires fresh width evidence for new range settings', () => {
    const { editor } = harness();
    const toggle = { ...power, mode: 'toggle' as const };
    const range = { key: 'level', kind: 0, type: 2, mode: 'range' as const };
    const action = { key: 'run', kind: 1, type: 9, mode: 'action' as const };
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a');
    editor.setCapacity('a', 'wide', 4);
    expect(editor.applySettings('a', 'wide', [range], controlsSnapshot())).toBe(false);
    editor.setRangeFits('a', 'wide', true);
    expect(editor.applySettings('a', 'wide', [toggle, action, range], controlsSnapshot(), { capacity: 3, rangeFits: true })).toBe(false);
    expect(editor.applySettings('a', 'wide', [toggle, action, range], controlsSnapshot(), { capacity: 4, rangeFits: false })).toBe(false);
    expect(editor.applySettings('a', 'wide', [toggle, action, range], controlsSnapshot(), { capacity: 4, rangeFits: true })).toBe(true);
    expect(editor.applySettings('a', 'wide', [toggle, action, range, { key: 'extra', kind: 0, type: 0 }], controlsSnapshot(),
      { capacity: 4, rangeFits: true })).toBe(false);
    editor.cancel(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('retains saved controls after narrowing or ACL loss without reinterpreting them as read bindings', () => {
    const { editor, data } = harness();
    const bindings = [{ ...power, mode: 'toggle' as const }, { key: 'level', kind: 0, type: 2, mode: 'range' as const }];
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    const base = store.load(); store.save({ ...base.value, slots: { a: bindings } }, base.raw);
    storage.setItem.mockClear();
    Object.assign(data.device.dict['a'].config, { isShared: true });
    Object.assign(data.device.dict['a'], { data: { canCommand: false } });
    editor.begin(undefined, ['a', 'b', 'c'], 'a'); editor.openSettings('a');
    editor.setCapacity('a', 'standard', 1); editor.setRangeFits('a', 'standard', false);
    expect(editor.applySettings('a', 'standard', bindings, undefined, { capacity: 1, rangeFits: false })).toBe(true);
    expect(editor.bindings('a')).toEqual(bindings);
    editor.cancel(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('reads v2 defaults as read-only, keeps Cancel zero-write, and retains a new control draft after save failure', () => {
    const { editor } = harness();
    const store = new HomeCardPreferencesStore(storage, { authority, accountId: 'account' });
    store.save(store.load().value, null);
    const key = [...storage.values.keys()][0];
    const legacy = JSON.stringify({ version: 2, revision: 7, layouts: {}, orders: {}, slots: { a: [power] } });
    storage.values.set(key, legacy); storage.setItem.mockClear();
    editor.beginSingle('a'); editor.openSettings('a');
    expect(editor.bindings('a')).toEqual([power]);
    expect(editor.applySettings('a', 'standard', [{ ...power, mode: 'toggle' }], snapshot(), { capacity: 2, rangeFits: false })).toBe(true);
    editor.cancel(); expect(storage.values.get(key)).toBe(legacy); expect(storage.setItem).not.toHaveBeenCalled();
    editor.beginSingle('a'); editor.openSettings('a');
    expect(editor.applySettings('a', 'standard', [{ ...power, mode: 'toggle' }], snapshot(), { capacity: 2, rangeFits: false })).toBe(true);
    storage.setItem.mockImplementationOnce(() => { throw Error('quota'); });
    expect(editor.save()).toBe(false); expect(editor.bindings('a')).toEqual([{ ...power, mode: 'toggle' }]);
    expect(editor.editing()).toBe(true); expect(storage.values.get(key)).toBe(legacy);
    expect(editor.save()).toBe(true);
    expect(JSON.parse(storage.values.get(key)!).version).toBe(3);
  });
});
