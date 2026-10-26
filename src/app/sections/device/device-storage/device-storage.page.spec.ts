import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceStoragePage } from './device-storage.page';
import { GatewayHttpError } from '../../../core/model/response.model';
import { StateHistoryItem, StateHistoryQuery, STATE_HISTORY_MAX_AGE_MS, STATE_HISTORY_MAX_RECORDS,
  STATE_HISTORY_RECORDED_TYPES } from '../../../core/device-v2/state-history';

const id = 'device_a', now = 1700000000000;
function item(query: StateHistoryQuery, recordId = '100'): StateHistoryItem {
  return { id: recordId, segmentId: '12345678-1234-4234-9234-123456789abc', key: query.key ?? 'power', kind: 0, type: 0,
    state: { type: 0, cbor: '9Q', value: true }, revision: 2, manifestFingerprint: 'a'.repeat(64), observedAt: query.to - 1000, event: 'change' };
}
function result(query: StateHistoryQuery, items = [item(query)], nextCursor: string | null = null) {
  return { logicalDeviceId: id, from: query.from, to: query.to, items, nextCursor,
    retention: { maxAgeMs: STATE_HISTORY_MAX_AGE_MS, maxRecords: STATE_HISTORY_MAX_RECORDS },
    timeBasis: 'serverAcceptedAt', source: 'broker-state', recordedTypes: [...STATE_HISTORY_RECORDED_TYPES] };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }
function setup() {
  const device = { config: { mode: 'bbp2', customName: '旧设备名', disabled: false, isPreview: false }, cloudEnabled: true,
    displayMetadata: { logicalDeviceId: id, revision: 1, name: '客厅灯', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' } ] } };
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    deviceDataLoader: new BehaviorSubject(true), device: { dict: { [id]: device } } };
  const visibility = { active: new BehaviorSubject(true) };
  const history = { read: vi.fn(async (_id: string, query: StateHistoryQuery, _signal: AbortSignal) => result(query)) };
  const route = { snapshot: { paramMap: { get: () => id } } };
  const manifests = { load: vi.fn(() => ({ fields: [{ key: 'power', kind: 0, type: 0 },
    { key: ' power ', kind: 0, type: 0 }, { key: 'byte_data', kind: 0, type: 6 }, { key: 'null_data', kind: 0, type: 9 },
    { key: 'press', kind: 1, type: 0 }] })) };
  const page = new DeviceStoragePage(route as any, data as any, history as any, manifests as any, visibility as any);
  return { page, history, data, device, visibility, manifests };
}
async function settled(page: DeviceStoragePage) { await vi.waitFor(() => expect(page.state().busy).toBe(false)); }

describe('State history page existing account/read lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());
  it('opens the existing storage route with only one 24h server range read, preserving compatible names and baseline semantics', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const f = setup(); f.page.ionViewWillEnter(); await settled(f.page);
    expect(f.history.read).toHaveBeenCalledTimes(1);
    expect(f.history.read.mock.calls[0].slice(0, 2)).toEqual([id, { from: now - 86400000, to: now, limit: 50 }]);
    expect(f.page.defaultBackHref).toBe('/device-manager/device_a'); expect(f.page.deviceName).toBe('客厅灯');
    expect(f.page.fieldLabel(f.page.state().rows[0])).toBe('电源开关'); expect(f.page.valueLabel(f.page.state().rows[0])).toBe('亮');
    expect(f.page.state().ready).toBe(true); expect(f.page.state().policyConfirmed).toBe(true);
    expect(f.page.keyOptions).toEqual([{ key: 'power', label: '电源开关' }, { key: ' power ', label: ' power ' }]);
    f.page.ngOnDestroy();
  });
  it('uses each historical kind/type, never a current incompatible alias or Number conversion for int64 values', async () => {
    const f = setup(); f.page.ionViewWillEnter(); await settled(f.page);
    const original = f.page.state().rows[0];
    const oldInteger = { ...original, type: 2, state: { type: 2, cbor: 'G___________', value: '18446744073709551615', encoding: 'uint64' as const } };
    expect(f.page.fieldLabel(oldInteger)).toBe('power'); expect(f.page.valueLabel(oldInteger)).toBe('18446744073709551615');
    f.device.displayMetadata.capabilities[0].displayName = '新电源名称';
    expect(f.page.fieldLabel(original)).toBe('新电源名称');
    expect(f.page.fieldLabel({ ...original, kind: 1 as any })).toBe('power');
    expect(f.page.utcText(original.observedAt)).toContain(' UTC'); expect(f.page.utcDate(original.observedAt)).toMatch(/Z$/);
    f.page.ngOnDestroy();
  });
  it('changes range/key exactly without trimming legal endpoint keys or polling', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const f = setup(); f.page.ionViewWillEnter(); await settled(f.page);
    f.page.changeRange(3600000); await settled(f.page);
    f.page.changeKey(' power '); await settled(f.page);
    expect(f.history.read.mock.calls[2][1]).toEqual({ from: now - 3600000, to: now, limit: 50, key: ' power ' });
    expect(f.page.state().rows[0].key).toBe(' power ');
    f.page.changeRange(1); f.page.changeKey('unknown'); await Promise.resolve();
    expect(f.history.read).toHaveBeenCalledTimes(3); f.page.ngOnDestroy();
  });
  it('retains an exact removed-field filter after an empty refresh without guessing a new alias type', async () => {
    const f = setup(); f.history.read.mockImplementationOnce(async (_id, query) => result(query,
      [{ ...item(query), key: 'old_power', type: 1, state: { type: 1, cbor: 'AQ', value: 1 } }]));
    f.page.ionViewWillEnter(); await settled(f.page);
    expect(f.page.keyOptions.find(field => field.key === 'old_power')?.label).toBe('old_power');
    f.history.read.mockImplementationOnce(async (_id, query) => result(query, []));
    f.page.changeKey('old_power'); await settled(f.page);
    expect(f.page.state().key).toBe('old_power'); expect(f.page.state().rows).toEqual([]);
    expect(f.page.keyOptions.find(field => field.key === 'old_power')?.label).toBe('old_power');
    f.page.ngOnDestroy();
  });
  it('freezes range and key across id-desc pagination and caps accumulated real rows at 200', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now), f = setup();
    f.history.read.mockImplementation(async (_id, query) => {
      const pageIndex = f.history.read.mock.calls.length - 1;
      const rows = Array.from({ length: 50 }, (_, n) => item(query, String(1000 - pageIndex * 50 - n)));
      return result(query, rows, btoa(`page-${pageIndex}`));
    });
    f.page.ionViewWillEnter(); await settled(f.page); clock.mockReturnValue(now + 5000);
    for (let n = 0; n < 3; ++n) await f.page.loadMore();
    expect(f.page.state().rows).toHaveLength(200); expect(f.page.bounded).toBe(true); expect(f.page.canLoadMore).toBe(false);
    expect(f.history.read.mock.calls.every(call => call[1].from === now - 86400000 && call[1].to === now)).toBe(true);
    expect(f.history.read.mock.calls[1][1].before).toBe(btoa('page-0'));
    await f.page.loadMore(); expect(f.history.read).toHaveBeenCalledTimes(4); f.page.ngOnDestroy();
  });
  it('fails closed on duplicated/cursor-overlapping pages instead of appending a false history', async () => {
    const f = setup(); f.history.read.mockImplementationOnce(async (_id, query) => result(query, [item(query)], 'YWJj'));
    f.page.ionViewWillEnter(); await settled(f.page); await f.page.loadMore();
    expect(f.page.state().ready).toBe(false); expect(f.page.state().rows).toEqual([]); expect(f.page.state().error).toContain('有效');
    f.page.ngOnDestroy();
  });
  it.each(['leave', 'destroy', 'account', 'retired'])('aborts and discards a late response after %s without replay', async reason => {
    const f = setup(), pending = deferred<any>(); f.history.read.mockReturnValueOnce(pending.promise);
    f.page.ionViewWillEnter(); const [, query, signal] = f.history.read.mock.calls[0];
    if (reason === 'leave') f.page.ionViewWillLeave();
    if (reason === 'destroy') f.page.ngOnDestroy();
    if (reason === 'account') { f.data.auth.uuid = 'other'; f.data.sessionEpoch += 1; f.data.authDataChanged.next(); }
    if (reason === 'retired') { f.device.config.disabled = true; f.data.deviceDataLoader.next(true); }
    expect(signal.aborted).toBe(true); pending.resolve(result(query)); await Promise.resolve(); await Promise.resolve();
    expect(f.page.state().rows).toEqual([]); expect(f.page.state().ready).toBe(false); expect(f.page.canQuery).toBe(false);
    expect(f.history.read).toHaveBeenCalledTimes(1); if (reason !== 'destroy') f.page.ngOnDestroy();
  });
  it('releases on native background and performs only a fresh visible foreground query, without resurrecting the old result', async () => {
    const f = setup(), pending = deferred<any>(); f.history.read.mockReturnValueOnce(pending.promise);
    f.page.ionViewWillEnter(); const [, query, signal] = f.history.read.mock.calls[0];
    f.visibility.active.next(false); expect(signal.aborted).toBe(true); expect(f.page.state().rows).toEqual([]);
    f.visibility.active.next(true); await settled(f.page); expect(f.history.read).toHaveBeenCalledTimes(2);
    const rows = f.page.state().rows; pending.resolve(result(query, [item(query, '999')])); await Promise.resolve(); await Promise.resolve();
    expect(f.page.state().rows).toEqual(rows);
    f.page.ionViewWillLeave(); f.visibility.active.next(false); f.visibility.active.next(true);
    expect(f.history.read).toHaveBeenCalledTimes(2); f.page.ngOnDestroy();
  });
  it.each([403, 404])('clears prior data on an actual HTTP %i denial, and recovers only through explicit refresh', async status => {
    const f = setup(); f.history.read.mockImplementationOnce(async (_id, query) => result(query, [item(query)], 'YWJj'));
    f.page.ionViewWillEnter(); await settled(f.page);
    f.history.read.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: status, code: 'DENIED', message: 'denied' }));
    await f.page.loadMore(); expect(f.page.state().rows).toEqual([]); expect(f.page.state().ready).toBe(false);
    expect(f.page.state().error).toContain('权限'); expect(f.history.read).toHaveBeenCalledTimes(2);
    await f.page.refresh(); expect(f.page.state().ready).toBe(true); expect(f.page.state().rows).toHaveLength(1);
    f.page.ngOnDestroy();
  });
  it('distinguishes unknown/error from a genuine empty server result and allows pure BLE history reads without inventing samples', async () => {
    const f = setup(); f.device.cloudEnabled = false; f.history.read.mockRejectedValueOnce(Error('network'));
    f.page.ionViewWillEnter(); await settled(f.page); expect(f.page.state().ready).toBe(false); expect(f.page.state().error).toBeTruthy();
    f.history.read.mockImplementationOnce(async (_id, query) => result(query, []));
    await f.page.refresh(); expect(f.page.state().ready).toBe(true); expect(f.page.state().rows).toEqual([]);
    expect(f.page.state().error).toBe(''); expect(f.history.read).toHaveBeenCalledTimes(2); f.page.ngOnDestroy();
  });
  it.each(['anonymous', 'preview', 'legacy'])('does not send queries for %s and never treats cached values as authorization', async reason => {
    const f = setup();
    if (reason === 'anonymous') f.data.auth = null as any;
    if (reason === 'preview') f.device.config.isPreview = true;
    if (reason === 'legacy') f.device.config.mode = 'legacy';
    f.page.ionViewWillEnter(); await f.page.refresh(); expect(f.history.read).not.toHaveBeenCalled();
    expect(f.page.state().rows).toEqual([]); expect(f.page.state().error).toBeTruthy(); f.page.ngOnDestroy();
  });
});

describe('State history manual read recovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([0, 401, 429, 503])('manual read recovery retains a safe initial failure for status %i until explicit refresh', async status => {
    const f = setup(), privateDetail = 'private-service-detail-do-not-display';
    f.history.read.mockRejectedValueOnce(status
      ? new GatewayHttpError({ httpStatus: status, code: 'PRIVATE_UPSTREAM_CODE', message: privateDetail })
      : Error(privateDetail));
    try {
      f.page.ionViewWillEnter(); await settled(f.page);
      const prompt = f.page.state().error;
      expect(prompt).toContain('手动刷新'); expect(prompt).not.toContain(privateDetail);
      expect(prompt).not.toContain('PRIVATE_UPSTREAM_CODE');
      expect(f.page.state().ready).toBe(false); expect(f.page.state().rows).toEqual([]);
      for (let n = 0; n < 2; ++n) {
        f.visibility.active.next(false); f.visibility.active.next(true);
        await Promise.resolve(); await Promise.resolve();
        expect(f.history.read).toHaveBeenCalledTimes(1);
        expect(f.page.state().error).toBe(prompt); expect(f.page.state().busy).toBe(false);
        expect(f.page.state().rows).toEqual([]); expect(f.page.state().nextCursor).toBeNull();
      }
      await f.page.refresh();
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.page.state().error).toBe('');
      expect(f.page.state().ready).toBe(true); expect(f.page.state().rows).toHaveLength(1);
      f.visibility.active.next(false); f.visibility.active.next(true); await settled(f.page);
      expect(f.history.read).toHaveBeenCalledTimes(3); expect(f.page.state().ready).toBe(true);
    } finally { f.page.ngOnDestroy(); }
  });

  it.each(['permission', 'response'])('manual read recovery clears a failed %s page and starts manual refresh from a new first page', async reason => {
    const f = setup();
    f.history.read.mockImplementationOnce(async (_id, query) => result(query, [item(query)], 'YWJj'));
    try {
      f.page.ionViewWillEnter(); await settled(f.page);
      f.history.read.mockRejectedValueOnce(reason === 'permission'
        ? new GatewayHttpError({ httpStatus: 404, code: 'PRIVATE_DENIAL', message: 'private-service-detail' })
        : Error('STATE_HISTORY_RESPONSE_INVALID private-service-detail'));
      await f.page.loadMore();
      const prompt = f.page.state().error;
      expect(prompt).toBeTruthy(); expect(prompt).not.toContain('private-service-detail');
      expect(prompt).not.toContain('PRIVATE_DENIAL'); expect(f.page.state().rows).toEqual([]);
      expect(f.page.state().nextCursor).toBeNull(); expect(f.page.state().ready).toBe(false);
      expect(f.page.canLoadMore).toBe(false); expect(f.history.read).toHaveBeenCalledTimes(2);
      f.visibility.active.next(false); f.visibility.active.next(true);
      await Promise.resolve(); await Promise.resolve();
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.page.state().error).toBe(prompt);
      await f.page.refresh();
      expect(f.history.read).toHaveBeenCalledTimes(3);
      expect(f.history.read.mock.calls[2][1].before).toBeUndefined();
      expect(f.page.state().error).toBe(''); expect(f.page.state().ready).toBe(true);
      expect(f.page.state().rows).toHaveLength(1);
    } finally { f.page.ngOnDestroy(); }
  });

  it('manual read recovery permits a fresh explicit route entry after a failed read without hidden queries', async () => {
    const f = setup(); f.history.read.mockRejectedValueOnce(Error('network'));
    try {
      f.page.ionViewWillEnter(); await settled(f.page); expect(f.page.state().error).toBeTruthy();
      f.page.ionViewWillLeave(); f.visibility.active.next(false); f.visibility.active.next(true);
      await Promise.resolve(); expect(f.history.read).toHaveBeenCalledTimes(1);
      expect(f.page.state().rows).toEqual([]); expect(f.page.canQuery).toBe(false);
      f.page.ionViewWillEnter(); await settled(f.page);
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.page.state().ready).toBe(true);
      expect(f.page.state().error).toBe('');
    } finally { f.page.ngOnDestroy(); }
  });

  it('manual read recovery fences a changed account and reads only after explicit entry into the new context', async () => {
    const f = setup(); f.history.read.mockRejectedValueOnce(Error('network'));
    try {
      f.page.ionViewWillEnter(); await settled(f.page);
      f.data.auth.uuid = 'other'; ++f.data.sessionEpoch; f.data.authDataChanged.next();
      f.visibility.active.next(false); f.visibility.active.next(true);
      await Promise.resolve(); await f.page.refresh();
      expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.page.canQuery).toBe(false);
      expect(f.page.state().rows).toEqual([]); expect(f.page.state().policyConfirmed).toBe(false);
      f.page.ionViewWillEnter(); await settled(f.page);
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.page.state().ready).toBe(true);
      expect(f.page.state().error).toBe('');
    } finally { f.page.ngOnDestroy(); }
  });
});
