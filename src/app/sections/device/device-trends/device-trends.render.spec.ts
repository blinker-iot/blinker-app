import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceTrendsPage } from './device-trends.page';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2PeriodicHistoryService } from '../../../core/services/device-v2-periodic-history.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';

const id = 'device_a', hash = 'a'.repeat(64);
async function render(options: { shared?: boolean; fields?: boolean; phase?: string; empty?: boolean } = {}) {
  const detail = { logicalDeviceId: id, manifestFingerprint: hash, fields: options.fields === false ? [] : [{ key: 'reading', type: 2 }],
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
  return { fixture, page, element: fixture.nativeElement as HTMLElement, history, visibility };
}
describe('Online trends production template', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
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
  it('separates enabled settings from waiting/fault phases and explains naturally missing numeric realtime capability', async () => {
    const f = await render({ fields: false, phase: 'unavailable', empty: true });
    expect(f.element.querySelector('.policy-note')!.textContent).toContain('已启用');
    expect(f.element.querySelector('.runtime-phase')!.textContent).toContain('暂未记录');
    expect(f.element.querySelector('.policy-card .empty-state')!.textContent).toContain('只读数值实时能力');
    expect(f.element.querySelectorAll('.chart-card')).toHaveLength(0); expect(f.element.querySelector('.history-row')).toBeNull();
  });
  it('uses real UTC input/buttons without moving the applied range until queried', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 20, 12));
    const f = await render(), to = f.page.state().to;
    const input = f.element.querySelector<HTMLInputElement>('.window-end')!;
    expect(input.type).toBe('datetime-local'); expect(f.element.textContent).toContain('结束时间（UTC');
    expect(f.element.querySelector<HTMLButtonElement>('.next-window')!.disabled).toBe(true);
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    expect(f.element.querySelector('.window-error')!.textContent).toContain('有效的 UTC');
    expect(f.element.querySelector<HTMLButtonElement>('.apply-window')!.disabled).toBe(true);
    expect(f.history.read).toHaveBeenCalledTimes(1); expect(f.page.state().to).toBe(to);
    expect(f.element.querySelector('.window-pending')!.textContent).toContain('结果仍对应已查询范围');
    input.value = '2027-01-01T00:00'; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    expect(f.element.querySelector('.window-error')!.textContent).toContain('不能晚于当前时间');
    expect(f.element.querySelector<HTMLButtonElement>('.apply-window')!.disabled).toBe(true);
    expect(f.history.read).toHaveBeenCalledTimes(1);
    input.value = '2026-10-18T12:30'; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    f.element.querySelector<HTMLButtonElement>('.apply-window')!.click(); await f.fixture.whenStable();
    expect(f.page.state().to).toBe(Date.parse('2026-10-18T12:30:00Z'));
    expect(f.element.querySelector('.range-note')!.textContent).toContain('2026-10-18 12:30:00');
    expect(f.element.querySelector('.range-note')!.textContent).toContain('保留期');
    f.page.ngOnDestroy();
  });
  it('renders UTC adjacent navigation and advertises field-record truncation without fetching beyond 200', async () => {
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
