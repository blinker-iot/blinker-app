import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceTrendsPage } from './device-trends.page';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2PeriodicHistoryService } from '../../../core/services/device-v2-periodic-history.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';

const id = 'device_a', hash = 'a'.repeat(64);
async function render(options: { shared?: boolean; fields?: boolean; secondField?: boolean; phase?: string; empty?: boolean;
  failure?: 'history' | 'policy' } = {}) {
  const detail = { logicalDeviceId: id, manifestFingerprint: hash, fields: options.fields === false ? [] : [
    { key: 'reading', type: 2 }, ...(options.secondField ? [{ key: 'humidity', type: 2 }] : [])],
    policy: { revision: 1, enabled: true, manifestFingerprint: hash, keys: ['reading'], intervalMs: 60000, updatedAt: 1000 },
    runtime: { phase: options.phase ?? 'active', failures: 0 },
    limits: { intervalMs: 60000, maxFields: 4, maxAgeMs: 2592000000, maxRecords: 200000 },
    source: 'broker-telemetry', timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', canConfigure: !options.shared };
  const history = { detail: vi.fn(async () => detail), save: vi.fn(), read: vi.fn(async (_id: string, query: any) => ({
    logicalDeviceId: id, from: query.from, to: query.to, items: options.empty ? [] : [
      { id: '100', segmentId: '12345678-1234-4234-9234-123456789abc', key: 'reading', type: 2,
        state: { type: 2, cbor: 'AQ', value: 1 }, policyRevision: 1, manifestFingerprint: hash,
        streamId: 1, epoch: 1, sampleSequence: 1, monotonicMs: 1000, effectiveIntervalMs: 60000, receivedAt: query.to - 1000 }], nextCursor: null,
    retention: { maxAgeMs: 2592000000, maxRecords: 200000 }, source: 'broker-telemetry',
    timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', recordedTypes: [1, 2, 3, 4] })) };
  if (options.failure === 'history') history.read.mockRejectedValueOnce(Error('read failed'));
  if (options.failure === 'policy') history.detail.mockRejectedValueOnce(Error('policy failed'));
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    deviceDataLoader: new BehaviorSubject(true), device: { dict: { [id]: { config: { mode: 'bbp2', isShared: !!options.shared },
      displayMetadata: { name: '客厅环境', capabilities: [{ key: 'reading', kind: 0, type: 2, displayName: '数值别名' }] } } } } };
  const visibility = { active: new BehaviorSubject(true) };
  await TestBed.configureTestingModule({ imports: [DeviceTrendsPage], providers: [provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => id } } } },
    { provide: DataService, useValue: data }, { provide: DeviceV2PeriodicHistoryService, useValue: history },
    { provide: AppVisibilityService, useValue: visibility }] }).compileComponents();
  const fixture = TestBed.createComponent(DeviceTrendsPage), page = fixture.componentInstance;
  fixture.autoDetectChanges(); page.ionViewWillEnter(); await fixture.whenStable();
  return { fixture, page, element: fixture.nativeElement as HTMLElement, history, data, visibility, detail };
}
async function editRecordingDraft(f: Awaited<ReturnType<typeof render>>): Promise<void> {
  f.element.querySelector<HTMLInputElement>('.enabled-control input')!.click();
  f.element.querySelectorAll<HTMLInputElement>('fieldset input')[1].click();
  await f.fixture.whenStable();
  expect(f.page.state().draftEnabled).toBe(false);
  expect(f.page.state().draftKeys).toEqual(['reading', 'humidity']);
}
describe('Online trends production template', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it.each(['window', 'filter', 'refresh'] as const)('DS-5 keeps an unsaved settings draft after an unrelated %s query at the same revision', async query => {
    const f = await render({ secondField: true, empty: true });
    await editRecordingDraft(f);
    if (query === 'refresh') f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click();
    else if (query === 'filter') {
      const filter = f.element.querySelector<HTMLSelectElement>('.query-form select:not(.window-width)')!;
      filter.value = 'humidity'; filter.dispatchEvent(new Event('change', { bubbles: true }));
    }
    else {
      const width = f.element.querySelector<HTMLSelectElement>('.window-width')!;
      width.value = width.options[0].value;
      width.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await f.fixture.whenStable();
    expect(f.history.detail).toHaveBeenCalledTimes(2); expect(f.history.read).toHaveBeenCalledTimes(2);
    expect(f.element.querySelector<HTMLInputElement>('.enabled-control input')!.checked).toBe(false);
    expect(f.element.querySelectorAll<HTMLInputElement>('fieldset input')[1].checked).toBe(true);
    expect(f.page.state().draftKeys).toEqual(['reading', 'humidity']);
    expect(f.history.save).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('DS-5 preserves an empty invalid draft through a read without silently selecting server fields', async () => {
    const f = await render({ empty: true });
    f.element.querySelector<HTMLInputElement>('fieldset input')!.click(); await f.fixture.whenStable();
    expect(f.page.state().draftKeys).toEqual([]);
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.element.querySelector<HTMLInputElement>('fieldset input')!.checked).toBe(false);
    expect(f.element.querySelector<HTMLButtonElement>('.save-recording-action')!.disabled).toBe(true);
    expect(f.page.state().draftKeys).toEqual([]); expect(f.history.save).not.toHaveBeenCalled();
  });
  it.each(['revision', 'manifest', 'policy-manifest', 'permission', 'shared'] as const)('DS-5 retires the old draft when %s changes instead of rebasing it', async change => {
    const f = await render({ secondField: true, empty: true }); await editRecordingDraft(f);
    const next = { ...f.detail, policy: { ...f.detail.policy } };
    if (change === 'revision') ++next.policy.revision;
    if (change === 'manifest') next.manifestFingerprint = 'b'.repeat(64);
    if (change === 'policy-manifest') next.policy.manifestFingerprint = 'b'.repeat(64);
    if (change === 'permission') next.canConfigure = false;
    if (change === 'shared') f.data.device.dict[id].config.isShared = true;
    f.history.detail.mockResolvedValueOnce(next);
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.page.state().draftEnabled).toBe(true); expect(f.page.state().draftKeys).toEqual(['reading']);
    expect(f.page.state().detail!.policy!.revision).toBe(next.policy.revision);
    if (change !== 'shared') expect(f.element.querySelector('.notice-note')!.textContent).toContain('已读取服务器设置');
    if (change === 'permission' || change === 'shared') {
      expect(f.element.querySelector('.enabled-control')).toBeNull(); expect(f.page.canSave).toBe(false);
    }
    expect(f.history.save).not.toHaveBeenCalled();
  });
  it('DS-5 keeps the same-version draft after a failed query until explicit read-only recovery', async () => {
    const f = await render({ secondField: true, empty: true }); await editRecordingDraft(f);
    f.history.read.mockRejectedValueOnce(Error('read failed'));
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.element.querySelector('[role="alert"]')!.textContent).toContain('手动刷新');
    expect(f.page.state().writeBlocked).toBe(true);
    expect(f.page.state().draftKeys).toEqual(['reading', 'humidity']);
    expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.history.detail).toHaveBeenCalledTimes(2);
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.page.state().draftEnabled).toBe(false); expect(f.page.state().draftKeys).toEqual(['reading', 'humidity']);
    expect(f.page.state().writeBlocked).toBe(false);
    expect(f.history.read).toHaveBeenCalledTimes(3); expect(f.history.detail).toHaveBeenCalledTimes(3);
    expect(f.history.save).not.toHaveBeenCalled();
  });
  it('DS-5 uses authoritative values after an uncertain save and never resends the old draft', async () => {
    const f = await render({ secondField: true, empty: true }); await editRecordingDraft(f);
    f.history.save.mockRejectedValueOnce(Error('save response lost'));
    f.element.querySelector<HTMLButtonElement>('.save-recording-action')!.click(); await f.fixture.whenStable();
    expect(f.history.save).toHaveBeenCalledTimes(1);
    expect(f.history.save.mock.calls[0][1]).toEqual({ expectedRevision: 1, enabled: false, manifestFingerprint: hash,
      keys: ['reading', 'humidity'] });
    expect(f.element.querySelector('[role="alert"]')!.textContent).toContain('尚未确认');
    expect(f.page.state().writeBlocked).toBe(true);
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.page.state().draftEnabled).toBe(true); expect(f.page.state().draftKeys).toEqual(['reading']);
    expect(f.element.querySelector('.notice-note')!.textContent).toContain('只读刷新服务器设置');
    expect(f.element.querySelector('.notice-note')!.textContent).not.toContain('设备能力或权限已变化');
    expect(f.history.save).toHaveBeenCalledTimes(1); expect(f.history.detail).toHaveBeenCalledTimes(2);
  });
  it.each(['background', 'leave', 'account'] as const)('DS-5 does not carry the draft across %s retirement', async retirement => {
    const f = await render({ secondField: true, empty: true }); await editRecordingDraft(f);
    if (retirement === 'background') f.visibility.active.next(false);
    else if (retirement === 'leave') f.page.ionViewWillLeave();
    else { f.data.auth.uuid = 'other'; ++f.data.sessionEpoch; f.data.authDataChanged.next(); }
    await f.fixture.whenStable();
    expect(f.page.state().draftKeys).toEqual([]); expect(f.page.state().draftEnabled).toBe(false);
    expect(f.element.querySelector('.policy-card')).toBeNull();
    expect(f.history.save).not.toHaveBeenCalled(); expect(f.history.read).toHaveBeenCalledTimes(1);
  });
  it('QA-2 trends applies a phone-local end through the original input without changing UTC query semantics', async () => {
    const at = new Date(2026, 9, 21, 0, 30, 0).getTime(); vi.spyOn(Date, 'now').mockReturnValue(at);
    const f = await render(), input = f.element.querySelector<HTMLInputElement>('.window-end')!;
    expect(f.element.querySelector('.source-summary')?.textContent).toContain('手机本地时间');
    expect(f.element.querySelector('.source-summary')?.textContent).toContain('服务器接收时间');
    expect(input.value).toBe('2026-10-21T00:30');
    expect(f.element.querySelector('time')!.getAttribute('datetime')).toBe(new Date(at - 1000).toISOString());
    input.value = '2026-10-20T23:45:00'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await f.fixture.whenStable(); expect(f.history.read).toHaveBeenCalledTimes(1);
    f.element.querySelector<HTMLButtonElement>('.apply-window')!.click(); await f.fixture.whenStable();
    const to = new Date(2026, 9, 20, 23, 45, 0).getTime();
    expect(f.history.read.mock.calls[1][1]).toEqual({ from: to - 86400000, to, limit: 50 });
    expect(f.element.querySelector('.range-note')!.textContent).toContain('2026-10-20 23:45:00');
    expect(f.history.save).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });
  it('renders receipt-only source, real samples, names and bounded SVG without fake recording claims', async () => {
    const f = await render();
    expect(f.element.querySelector('ion-title')!.textContent).toBe('在线趋势');
    expect(f.element.querySelector('h1')!.textContent).toBe('客厅环境');
    expect(f.element.querySelector('.runtime-phase')!.textContent).toContain('已收到归档样本');
    expect(f.element.querySelector('.source-note')!.textContent).toContain('不是设备采集时间');
    expect(f.element.querySelector('.source-note')!.textContent).toContain('不是设备所有消息都固定');
    expect(f.element.querySelector('.source-note')!.textContent).toContain('关闭此页面不停止');
    expect(f.element.querySelector('.history-main')!.textContent).toContain('数值别名');
    expect(f.element.querySelector('time')!.getAttribute('datetime')).toMatch(/Z$/);
    expect(f.element.querySelectorAll('svg circle')).toHaveLength(1);
    expect(f.element.textContent).not.toContain('正在记录');
  });
  it('shows share reads but no write controls, and clears rendered data/settings on background', async () => {
    const f = await render({ shared: true });
    expect(f.element.querySelector('.history-row')).not.toBeNull(); expect(f.element.querySelector('.enabled-control')).toBeNull();
    expect(f.element.querySelector('.readonly-note')!.textContent).toContain('分享用户');
    f.visibility.active.next(false); await f.fixture.whenStable();
    expect(f.element.querySelector('.history-row')).toBeNull(); expect(f.element.querySelector('.policy-card')).toBeNull();
    expect(f.history.save).not.toHaveBeenCalled();
  });
  it.each(['history', 'policy'] as const)('manual recovery template restores read-only refresh after %s failure without automatic requests', async failure => {
    const f = await render({ failure });
    const refresh = () => f.element.querySelector<HTMLButtonElement>('.refresh-action')!;
    const error = f.element.querySelector('[role="alert"]')!.textContent;
    expect(refresh().disabled).toBe(false);
    f.visibility.active.next(false); await f.fixture.whenStable();
    expect(refresh().disabled).toBe(true);
    expect(f.element.querySelector('.policy-card')).toBeNull();
    expect(f.element.querySelector('.history-row')).toBeNull();
    f.visibility.active.next(true); await f.fixture.whenStable();
    expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.history.detail).toHaveBeenCalledTimes(1);
    expect(f.element.querySelector('[role="alert"]')!.textContent).toBe(error);
    expect(refresh().disabled).toBe(false);

    refresh().click(); await f.fixture.whenStable();
    expect(f.history.read).toHaveBeenCalledTimes(2); expect(f.history.detail).toHaveBeenCalledTimes(2);
    expect(f.element.querySelector('[role="alert"]')).toBeNull();
    expect(f.element.querySelectorAll('.history-row')).toHaveLength(1);
    expect(f.element.querySelector('.policy-card')).not.toBeNull();
    expect(f.history.save).not.toHaveBeenCalled();
    f.page.ionViewWillLeave();
  });
  it.each(['account', 'disabled'] as const)('manual recovery template keeps read-only refresh disabled after %s loss while hidden', async loss => {
    const f = await render({ failure: 'history' });
    f.visibility.active.next(false); await f.fixture.whenStable();
    if (loss === 'account') { f.data.auth.uuid = 'other'; ++f.data.sessionEpoch; f.data.authDataChanged.next(); }
    else { Object.assign(f.data.device.dict[id].config, { disabled: true }); f.data.deviceDataLoader.next(true); }
    f.visibility.active.next(true); await f.fixture.whenStable();
    const refresh = f.element.querySelector<HTMLButtonElement>('.refresh-action')!;
    expect(refresh.disabled).toBe(true);
    refresh.click(); await f.fixture.whenStable();
    expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.history.detail).toHaveBeenCalledTimes(1);
    expect(f.history.save).not.toHaveBeenCalled();
    f.page.ionViewWillLeave();
  });
  it('separates enabled settings from waiting/fault phases and explains naturally missing numeric realtime capability', async () => {
    const f = await render({ fields: false, phase: 'unavailable', empty: true });
    expect(f.element.querySelector('.policy-note')!.textContent).toContain('已启用');
    expect(f.element.querySelector('.runtime-phase')!.textContent).toContain('暂未记录');
    expect(f.element.querySelector('.policy-card .empty-state')!.textContent).toContain('只读数值实时能力');
    expect(f.element.querySelectorAll('.chart-card')).toHaveLength(0); expect(f.element.querySelector('.history-row')).toBeNull();
  });
  it('uses real local input/buttons without moving the applied UTC range until queried', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 20, 12));
    const f = await render(), to = f.page.state().to;
    const input = f.element.querySelector<HTMLInputElement>('.window-end')!;
    expect(input.type).toBe('datetime-local'); expect(f.element.textContent).toContain('结束时间（手机本地');
    expect(f.element.querySelector<HTMLButtonElement>('.next-window')!.disabled).toBe(true);
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    expect(f.element.querySelector('.window-error')!.textContent).toContain('有效的手机本地');
    expect(f.element.querySelector<HTMLButtonElement>('.apply-window')!.disabled).toBe(true);
    expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.page.state().to).toBe(to);
    expect(f.element.querySelector('.window-pending')!.textContent).toContain('结果仍对应已查询范围');
    input.value = '2027-01-01T00:00'; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    expect(f.element.querySelector('.window-error')!.textContent).toContain('不能晚于当前时间');
    expect(f.element.querySelector<HTMLButtonElement>('.apply-window')!.disabled).toBe(true);
    expect(f.history.read).toHaveBeenCalledTimes(1);
    input.value = '2026-10-18T12:30'; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    f.element.querySelector<HTMLButtonElement>('.apply-window')!.click(); await f.fixture.whenStable();
    expect(f.page.state().to).toBe(new Date(2026, 9, 18, 12, 30).getTime());
    expect(f.element.querySelector('.range-note')!.textContent).toContain('2026-10-18 12:30:00');
    expect(f.element.querySelector('.range-note')!.textContent).toContain('保留期');
    f.page.ngOnDestroy();
  });
  it('renders adjacent epoch windows and advertises field-record truncation without fetching beyond 200', async () => {
    const f = await render(), to = f.page.state().to;
    f.element.querySelector<HTMLButtonElement>('.previous-window')!.click(); await f.fixture.whenStable();
    expect(f.page.state().to).toBe(to - 86400000);
    expect(f.element.querySelector<HTMLButtonElement>('.next-window')!.disabled).toBe(false);
    f.page.state.update(s => ({ ...s, rows: Array.from({ length: 200 }, (_, n) => ({ ...s.rows[0], id: String(1000 - n) })), nextCursor: 'YWJj' }));
    await f.fixture.whenStable();
    expect(f.element.querySelector('.load-more-action')).toBeNull();
    expect(f.element.querySelector('.bounded-note')!.textContent).toContain('200 条字段记录');
    expect(f.element.querySelector('.bounded-note')!.textContent).toContain('未必覆盖整个窗口');
    expect(f.element.textContent).not.toContain('最近 7 天'); f.page.ngOnDestroy();
  });
});
