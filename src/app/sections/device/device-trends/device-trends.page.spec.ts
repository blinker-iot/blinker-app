import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceTrendsPage } from './device-trends.page';
import { GatewayHttpError } from '../../../core/model/response.model';
import { PeriodicHistoryDetail, PeriodicHistoryQuery } from '../../../core/device-v2/periodic-history';

const id = 'device_a', hash = 'a'.repeat(64), now = 1700000000000;
function detail(): PeriodicHistoryDetail {
  return { logicalDeviceId: id, manifestFingerprint: hash, fields: [{ key: 'reading', type: 2 }], policy: null,
    runtime: { phase: 'disabled', failures: 0 }, limits: { intervalMs: 60000, maxFields: 4, maxAgeMs: 2592000000, maxRecords: 200000 },
    source: 'broker-telemetry', timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', canConfigure: true };
}
function row(query: PeriodicHistoryQuery, n = 100) {
  return { id: String(n), segmentId: '12345678-1234-4234-9234-123456789abc', key: query.key ?? 'reading', type: 2,
    state: { type: 2, cbor: 'AQ', value: 1 }, policyRevision: 1, manifestFingerprint: hash,
    streamId: 1, epoch: 1, sampleSequence: n, monotonicMs: n, effectiveIntervalMs: 60000, receivedAt: query.to - 1000 };
}
function page(query: PeriodicHistoryQuery, rows = [row(query)], nextCursor: string | null = null) {
  return { logicalDeviceId: id, from: query.from, to: query.to, items: rows, nextCursor,
    retention: { maxAgeMs: 2592000000, maxRecords: 200000 }, source: 'broker-telemetry' as const,
    timeBasis: 'serverReceivedAt' as const, timeQuality: 'receipt-only' as const, recordedTypes: [1, 2, 3, 4] };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }
function setup() {
  const device = { config: { mode: 'bbp2', isPreview: false, disabled: false, isShared: false },
    displayMetadata: { logicalDeviceId: id, revision: 1, name: '客厅环境', capabilities: [{ key: 'reading', kind: 0, type: 2, displayName: '温度读数' }] } };
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    deviceDataLoader: new BehaviorSubject(true), device: { dict: { [id]: device } } };
  const visibility = { active: new BehaviorSubject(true) };
  const history = { detail: vi.fn(async () => detail()), read: vi.fn(async (_id: string, query: PeriodicHistoryQuery, _signal: AbortSignal) => page(query)),
    save: vi.fn(async (_id: string, input: any, _signal: AbortSignal) => ({ ...detail(), policy: { ...input,
      revision: input.expectedRevision + 1, updatedAt: now, intervalMs: 60000 as const }, runtime: { phase: 'waiting' as const, failures: 0 } })) };
  const instance = new DeviceTrendsPage({ snapshot: { paramMap: { get: () => id } } } as any, data as any, history as any, visibility as any);
  return { instance, data, visibility, history, device };
}
async function settled(instance: DeviceTrendsPage) { await vi.waitFor(() => expect(instance.state().busy).toBe(false)); }
async function opened() { const f = setup(); f.instance.ionViewWillEnter(); await settled(f.instance); return f; }
function draft(f: ReturnType<typeof setup>) { f.instance.selectField('reading', true); f.instance.setEnabled(true); }
describe('Online trends page lifecycle and save confirmation', () => {
  afterEach(() => vi.restoreAllMocks());
  it('performs only initial policy/range reads and uses compatible names and explicit receipt time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened();
    expect(f.history.detail).toHaveBeenCalledTimes(1); expect(f.history.read).toHaveBeenCalledTimes(1);
    expect(f.history.read.mock.calls[0][1]).toEqual({ from: now - 86400000, to: now, limit: 50 });
    expect(f.instance.deviceName).toBe('客厅环境'); expect(f.instance.fieldLabel(f.instance.state().rows[0])).toBe('温度读数');
    expect(f.instance.phaseLabel).toBe('记录未启用'); expect(f.instance.curves[0].dots).toHaveLength(1);
    f.instance.ngOnDestroy();
  });
  it('confirms save immediately without waiting for/refetching list or falsely claiming recording', async () => {
    const f = await opened(); draft(f); await f.instance.save();
    expect(f.history.save).toHaveBeenCalledTimes(1); expect(f.history.read).toHaveBeenCalledTimes(1);
    expect(f.instance.state().notice).toContain('服务器已确认'); expect(f.instance.phaseLabel).toContain('等待在线样本');
    expect(f.instance.state().writeBlocked).toBe(false); f.instance.ngOnDestroy();
  });
  it.each(['timeout', 'conflict'])('blocks re-save after %s and only fresh read enables explicit reviewed writes', async reason => {
    const f = await opened(); draft(f);
    f.history.save.mockRejectedValueOnce(reason === 'conflict' ? new GatewayHttpError({ httpStatus: 409, code: 'CONFLICT', message: 'revision' }) : Error('timeout'));
    await f.instance.save(); expect(f.instance.state().writeBlocked).toBe(true); await f.instance.save();
    expect(f.history.save).toHaveBeenCalledTimes(1); expect(f.instance.state().error).toContain(reason === 'conflict' ? '旧版本' : '尚未确认');
    f.history.detail.mockResolvedValueOnce({ ...detail(), policy: { revision: 2, enabled: false, manifestFingerprint: hash,
      keys: ['reading'], intervalMs: 60000, updatedAt: now } });
    await f.instance.refresh(); expect(f.instance.state().writeBlocked).toBe(false);
    expect(f.instance.state().notice).toContain('不会自动重发'); expect(f.history.save).toHaveBeenCalledTimes(1);
    await f.instance.save(); expect(f.history.save.mock.calls[1][1].expectedRevision).toBe(2); f.instance.ngOnDestroy();
  });
  it('never withdraws accepted save confirmation when later history refresh fails', async () => {
    const f = await opened(); draft(f); await f.instance.save();
    f.history.read.mockRejectedValueOnce(Error('network')); await f.instance.refresh();
    expect(f.instance.state().notice).toContain('服务器已确认'); expect(f.instance.state().ready).toBe(false);
    expect(f.instance.state().rows).toEqual([]); expect(f.instance.state().writeBlocked).toBe(true);
    expect(f.instance.canSave).toBe(false); f.instance.ngOnDestroy();
  });
  it('blocks writes through retained old detail after a failed fresh refresh until a complete read succeeds', async () => {
    const f = await opened(); draft(f); await f.instance.save();
    expect(f.instance.canSave).toBe(true);
    f.history.detail.mockRejectedValueOnce(Error('network'));
    await f.instance.refresh();
    expect(f.instance.state().detail!.policy!.revision).toBe(1);
    expect(f.instance.state().notice).toContain('服务器已确认');
    expect(f.instance.state().writeBlocked).toBe(true); expect(f.instance.canSave).toBe(false);
    await f.instance.save(); expect(f.history.save).toHaveBeenCalledTimes(1);
    f.history.detail.mockResolvedValueOnce({ ...detail(), policy: { revision: 2, enabled: false, manifestFingerprint: hash,
      keys: ['reading'], intervalMs: 60000, updatedAt: now } });
    await f.instance.refresh(); expect(f.instance.state().writeBlocked).toBe(false); expect(f.instance.canSave).toBe(true);
    expect(f.history.save).toHaveBeenCalledTimes(1); await f.instance.save();
    expect(f.history.save.mock.calls[1][1].expectedRevision).toBe(2); f.instance.ngOnDestroy();
  });
  it('describes a capacity pause without assuming the live page was its cause', async () => {
    const f = setup(); f.history.detail.mockResolvedValueOnce({ ...detail(), runtime: { phase: 'capacity', failures: 0 } });
    f.instance.ionViewWillEnter(); await settled(f.instance);
    expect(f.instance.phaseLabel).toContain('资源或报文容量受限'); expect(f.instance.phaseLabel).not.toContain('页面');
    f.instance.ngOnDestroy();
  });
  it('clears sensitive policy/sample data on save denial and never repeats the write', async () => {
    const f = await opened(); draft(f);
    f.history.save.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 403, code: 'DENIED', message: 'denied' }));
    await f.instance.save(); expect(f.instance.state().detail).toBeNull(); expect(f.instance.state().rows).toEqual([]);
    expect(f.instance.state().error).toContain('权限'); await f.instance.save(); expect(f.history.save).toHaveBeenCalledTimes(1);
    f.instance.ngOnDestroy();
  });
  it('keeps shares read-only even if cached ownership or the server hint disagrees', async () => {
    const f = await opened(); f.device.config.isShared = true; draft(f); await f.instance.save();
    expect(f.instance.canQuery).toBe(true); expect(f.instance.canConfigure).toBe(false); expect(f.history.save).not.toHaveBeenCalled();
    f.device.config.isShared = false;
    f.history.detail.mockResolvedValueOnce({ ...detail(), canConfigure: false }); await f.instance.refresh();
    draft(f); await f.instance.save(); expect(f.history.save).not.toHaveBeenCalled(); f.instance.ngOnDestroy();
  });
  it('bounds field selection without hardcoding firmware capacity and disables the old exact policy after Manifest changes', async () => {
    const f = await opened(); const fields = Array.from({ length: 5 }, (_, n) => ({ key: String(n), type: 2 }));
    f.history.detail.mockResolvedValueOnce({ ...detail(), fields }); await f.instance.refresh();
    fields.forEach(field => f.instance.selectField(field.key, true)); expect(f.instance.state().draftKeys).toHaveLength(4);
    f.history.detail.mockResolvedValueOnce({ ...detail(), manifestFingerprint: 'b'.repeat(64), fields: [], policy: {
      revision: 3, enabled: true, manifestFingerprint: hash, keys: ['old-reading'], intervalMs: 60000, updatedAt: now },
      runtime: { phase: 'manifest-changed', failures: 0 } }); await f.instance.refresh();
    expect(f.instance.canSave).toBe(false); f.instance.setEnabled(false); expect(f.instance.canSave).toBe(true);
    await f.instance.save(); expect(f.history.save.mock.calls[0][1]).toEqual({ expectedRevision: 3, enabled: false, manifestFingerprint: hash, keys: ['old-reading'] });
    f.instance.ngOnDestroy();
  });
  it.each(['leave', 'destroy', 'account', 'retired', 'background'])('clears sensitive samples/settings and fences late results after %s', async reason => {
    const f = setup(), pending = deferred<any>(); f.history.detail.mockReturnValueOnce(pending.promise);
    f.instance.ionViewWillEnter(); const signal = f.history.read.mock.calls[0][2];
    if (reason === 'leave') f.instance.ionViewWillLeave();
    if (reason === 'destroy') f.instance.ngOnDestroy();
    if (reason === 'account') { f.data.auth.uuid = 'other'; ++f.data.sessionEpoch; f.data.authDataChanged.next(); }
    if (reason === 'retired') { f.device.config.disabled = true; f.data.deviceDataLoader.next(true); }
    if (reason === 'background') f.visibility.active.next(false);
    expect(signal.aborted).toBe(true); pending.resolve(detail()); await Promise.resolve(); await Promise.resolve();
    expect(f.instance.state().rows).toEqual([]); expect(f.instance.state().detail).toBeNull();
    expect(f.instance.state().draftKeys).toEqual([]); expect(f.instance.state().ready).toBe(false);
    if (reason !== 'destroy') f.instance.ngOnDestroy();
  });
  it('aborts an uncertain save on background, then only reads and never resends on foreground', async () => {
    const f = await opened(), pending = deferred<any>(); draft(f); f.history.save.mockReturnValueOnce(pending.promise);
    const saved = f.instance.save(); const signal = f.history.save.mock.calls[0][2];
    f.visibility.active.next(false); expect(signal.aborted).toBe(true); expect(f.instance.state().detail).toBeNull();
    f.visibility.active.next(true); await settled(f.instance); expect(f.history.save).toHaveBeenCalledTimes(1);
    expect(f.instance.state().notice).toContain('只读刷新');
    pending.resolve({ ...detail(), policy: { revision: 1, enabled: true, manifestFingerprint: hash, keys: ['reading'], intervalMs: 60000, updatedAt: now } });
    await saved; expect(f.instance.state().detail!.policy).toBeNull(); f.instance.ngOnDestroy();
  });
  it('caps rows to 200 across frozen range pagination, preserving exact historical field filters', async () => {
    const f = setup(); f.history.read.mockImplementation(async (_id, query) => {
      const start = 1000 - (f.history.read.mock.calls.length - 1) * 50;
      return page(query, Array.from({ length: 50 }, (_, n) => row(query, start - n)), 'YWJj');
    });
    f.instance.ionViewWillEnter(); await settled(f.instance);
    for (let n = 0; n < 3; ++n) await f.instance.loadMore();
    expect(f.instance.state().rows).toHaveLength(200); expect(f.instance.bounded).toBe(true);
    await f.instance.loadMore(); expect(f.history.read).toHaveBeenCalledTimes(4); f.instance.ngOnDestroy();
  });
  it('keeps the exact applied window on refresh, filtering, pagination and foreground restore', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened();
    const window = { from: f.instance.state().from, to: f.instance.state().to };
    clock.mockReturnValue(now + 7200000);
    await f.instance.refresh(); f.instance.changeKey('reading'); await settled(f.instance);
    f.instance.state.update(s => ({ ...s, nextCursor: 'YWJj' }));
    f.history.read.mockImplementationOnce(async (_id, query) => page(query, [row(query, 99)]));
    await f.instance.loadMore();
    f.visibility.active.next(false); f.visibility.active.next(true); await settled(f.instance);
    expect(f.instance.state().key).toBe('reading');
    for (const call of f.history.read.mock.calls) expect({ from: call[1].from, to: call[1].to }).toEqual(window);
    f.instance.latestWindow(); await settled(f.instance);
    expect(f.instance.state().to).toBe(now + 7200000); expect(f.instance.state().to - f.instance.state().from).toBe(86400000);
    f.instance.ngOnDestroy();
  });
  it('changes width around the fixed end and flips adjacent windows without reusing a cursor', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened();
    f.instance.changeRange(3600000); await settled(f.instance);
    expect(f.instance.state().to).toBe(now); expect(f.instance.state().from).toBe(now - 3600000);
    f.instance.state.update(s => ({ ...s, nextCursor: 'YWJj' }));
    expect(f.instance.canShiftWindow(1)).toBe(false); f.instance.shiftWindow(1);
    expect(f.history.read).toHaveBeenCalledTimes(2);
    f.instance.shiftWindow(-1); await settled(f.instance);
    expect(f.history.read.mock.calls.at(-1)![1]).toEqual({ from: now - 7200000, to: now - 3600000, limit: 50 });
    expect(f.instance.state().nextCursor).toBeNull(); expect(f.instance.canShiftWindow(1)).toBe(true);
    f.instance.shiftWindow(1); await settled(f.instance); expect(f.instance.state().to).toBe(now);
    f.instance.ngOnDestroy();
  });
  it.each(['', '2026-02-30T12:00', '2030-01-01T00:00', '1970-01-01T01:00'])('does not query or mislabel existing rows for invalid UTC end %s', async value => {
    vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened(), previous = f.instance.state();
    f.instance.editEnd(value); expect(f.instance.windowPending).toBe(true); expect(f.instance.windowError).not.toBe('');
    expect(f.instance.canApplyWindow).toBe(false); f.instance.applyWindow();
    expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.instance.state().rows).toEqual(previous.rows);
    expect(f.instance.state().to).toBe(previous.to); expect(f.history.save).not.toHaveBeenCalled(); f.instance.ngOnDestroy();
  });
  it('applies a UTC end only on request and retries failures in that same window', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened();
    f.instance.editEnd('2023-11-12T12:00'); expect(f.history.read).toHaveBeenCalledTimes(1);
    f.history.read.mockRejectedValueOnce(Error('network')); f.instance.applyWindow(); await settled(f.instance);
    const to = Date.parse('2023-11-12T12:00:00Z');
    expect(f.instance.state().to).toBe(to); expect(f.instance.state().rows).toEqual([]); expect(f.instance.state().writeBlocked).toBe(true);
    clock.mockReturnValue(now + 7200000); await f.instance.refresh();
    expect(f.history.read.mock.calls.at(-1)![1]).toEqual({ from: to - 86400000, to, limit: 50 });
    expect(f.instance.windowPending).toBe(false); f.instance.ngOnDestroy();
  });
  it('does not unlock unknown policy saves by window edits or failed window reads', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened(); draft(f);
    f.history.save.mockRejectedValueOnce(Error('timeout')); await f.instance.save();
    f.instance.editEnd('2023-11-12T12:00'); expect(f.instance.canSave).toBe(false);
    f.history.detail.mockRejectedValueOnce(Error('network')); f.instance.applyWindow(); await settled(f.instance);
    expect(f.instance.state().writeBlocked).toBe(true); await f.instance.save(); expect(f.history.save).toHaveBeenCalledTimes(1);
    await f.instance.refresh(); expect(f.instance.state().notice).toContain('不会自动重发');
    expect(f.history.save).toHaveBeenCalledTimes(1); f.instance.ngOnDestroy();
  });
  it('fences a late old window result after background and resumes only the selected range', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now); const f = await opened(), pending = deferred<any>();
    f.history.read.mockReturnValueOnce(pending.promise); f.instance.shiftWindow(-1);
    const query = f.history.read.mock.calls.at(-1)![1], signal = f.history.read.mock.calls.at(-1)![2];
    f.visibility.active.next(false); expect(signal.aborted).toBe(true);
    f.visibility.active.next(true); await settled(f.instance); const current = f.instance.state().rows;
    pending.resolve(page(query, [row(query, 999)])); await Promise.resolve(); await Promise.resolve();
    expect(f.instance.state().rows).toEqual(current); expect(f.instance.state().to).toBe(now - 86400000);
    f.instance.ngOnDestroy();
  });
  it.each([403, 404])('clears policy and rows after actual HTTP %i permission denial', async status => {
    const f = await opened(); f.history.read.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: status, code: 'DENIED', message: 'denied' }));
    await f.instance.refresh(); expect(f.instance.state().detail).toBeNull(); expect(f.instance.state().rows).toEqual([]);
    expect(f.instance.canConfigure).toBe(false); expect(f.instance.state().error).toContain('权限'); f.instance.ngOnDestroy();
  });
});

describe('Online trends manual read recovery', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['network', 401, 429, 503])('manual read recovery waits for an explicit read after %s, not visibility changes', async failure => {
    const f = setup();
    f.history.read.mockRejectedValueOnce(typeof failure === 'number'
      ? new GatewayHttpError({ httpStatus: failure, code: 'UNAVAILABLE', message: 'private upstream detail' })
      : Error('private upstream detail'));
    try {
      f.instance.ionViewWillEnter(); await settled(f.instance);
      const error = f.instance.state().error;
      expect(error).toContain('手动刷新'); expect(error).not.toContain('private');
      for (let n = 0; n < 2; ++n) {
        f.visibility.active.next(false);
        expect(f.instance.state().rows).toEqual([]); expect(f.instance.state().detail).toBeNull();
        expect(f.instance.state().draftKeys).toEqual([]);
        f.visibility.active.next(true); await settled(f.instance);
        expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.history.detail).toHaveBeenCalledTimes(1);
        expect(f.instance.state().error).toBe(error); expect(f.instance.canSave).toBe(false);
      }
      await f.instance.refresh();
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.history.detail).toHaveBeenCalledTimes(2);
      expect(f.instance.state().ready).toBe(true); expect(f.instance.state().error).toBe('');
      f.visibility.active.next(false); f.visibility.active.next(true); await settled(f.instance);
      expect(f.history.read).toHaveBeenCalledTimes(3); expect(f.history.save).not.toHaveBeenCalled();
    } finally { f.instance.ngOnDestroy(); }
  });
  it.each(['permission', 'overlap'])('manual read recovery discards a failed %s page and refreshes from the first page', async failure => {
    const f = setup();
    f.history.read.mockImplementationOnce(async (_id, query) => page(query, [row(query)], 'YWJj'));
    try {
      f.instance.ionViewWillEnter(); await settled(f.instance);
      if (failure === 'permission') f.history.read.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 403, code: 'DENIED', message: 'private' }));
      await f.instance.loadMore();
      expect(f.instance.state().ready).toBe(false); expect(f.instance.state().rows).toEqual([]);
      expect(f.instance.state().nextCursor).toBeNull();
      const error = f.instance.state().error;
      f.visibility.active.next(false); f.visibility.active.next(true); await settled(f.instance);
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.history.detail).toHaveBeenCalledTimes(1);
      expect(f.instance.state().error).toBe(error); expect(f.instance.canSave).toBe(false);
      await f.instance.refresh();
      expect(f.history.read.mock.calls[2][1].before).toBeUndefined();
      expect(f.instance.state().ready).toBe(true); expect(f.history.save).not.toHaveBeenCalled();
    } finally { f.instance.ngOnDestroy(); }
  });
  it('manual read recovery preserves unknown-save fencing through a failed reconciliation and only unlocks a fresh revision', async () => {
    const f = await opened(); draft(f);
    try {
      f.history.save.mockRejectedValueOnce(Error('unknown'));
      await f.instance.save();
      f.history.detail.mockRejectedValueOnce(Error('read failed'));
      await f.instance.refresh();
      f.visibility.active.next(false); f.visibility.active.next(true); await settled(f.instance);
      expect(f.history.detail).toHaveBeenCalledTimes(2); expect(f.history.read).toHaveBeenCalledTimes(2);
      expect(f.instance.canSave).toBe(false); await f.instance.save();
      expect(f.history.save).toHaveBeenCalledTimes(1);
      f.history.detail.mockResolvedValueOnce({ ...detail(), policy: { revision: 2, enabled: false,
        manifestFingerprint: hash, keys: ['reading'], intervalMs: 60000, updatedAt: now } });
      await f.instance.refresh();
      expect(f.instance.state().notice).toContain('不会自动重发'); expect(f.instance.canSave).toBe(true);
      await f.instance.save(); expect(f.history.save.mock.calls[1][1].expectedRevision).toBe(2);
    } finally { f.instance.ngOnDestroy(); }
  });
  it('manual read recovery does not suppress the separate read-only recovery of a later interrupted save', async () => {
    const f = setup(), pending = deferred<any>();
    let saved: Promise<void> | undefined;
    try {
      f.history.read.mockRejectedValueOnce(Error('network'));
      f.instance.ionViewWillEnter(); await settled(f.instance);
      f.visibility.active.next(false); f.visibility.active.next(true); await settled(f.instance);
      expect(f.history.read).toHaveBeenCalledTimes(1);
      await f.instance.refresh(); draft(f); f.history.save.mockReturnValueOnce(pending.promise);
      saved = f.instance.save(); const signal = f.history.save.mock.calls[0][2];
      f.visibility.active.next(false); expect(signal.aborted).toBe(true);
      f.visibility.active.next(true); await settled(f.instance);
      expect(f.history.read).toHaveBeenCalledTimes(3); expect(f.history.detail).toHaveBeenCalledTimes(3);
      expect(f.instance.state().notice).toContain('只读刷新'); expect(f.history.save).toHaveBeenCalledTimes(1);
      pending.resolve(detail()); await saved;
      expect(f.instance.state().detail!.policy).toBeNull();
    } finally { pending.resolve(detail()); await saved; f.instance.ngOnDestroy(); }
  });
  it('manual read recovery clears its failed-read context on leave or account change, with no request until re-entry', async () => {
    const f = setup();
    try {
      f.history.read.mockRejectedValueOnce(Error('network'));
      f.instance.ionViewWillEnter(); await settled(f.instance);
      f.instance.ionViewWillLeave();
      expect(f.instance.state().error).toBe('');
      f.visibility.active.next(false); f.visibility.active.next(true);
      expect(f.history.read).toHaveBeenCalledTimes(1);
      f.instance.ionViewWillEnter(); await settled(f.instance);
      expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.instance.state().ready).toBe(true);
      f.history.read.mockRejectedValueOnce(Error('network')); await f.instance.refresh();
      f.data.auth.uuid = 'other'; ++f.data.sessionEpoch; f.data.authDataChanged.next();
      f.visibility.active.next(false); f.visibility.active.next(true);
      expect(f.history.read).toHaveBeenCalledTimes(3); expect(f.instance.state().error).toBe('');
      expect(f.instance.state().detail).toBeNull(); expect(f.instance.canSave).toBe(false);
      f.instance.ionViewWillEnter(); await settled(f.instance);
      expect(f.history.read).toHaveBeenCalledTimes(4); expect(f.history.save).not.toHaveBeenCalled();
    } finally { f.instance.ngOnDestroy(); }
  });
});
