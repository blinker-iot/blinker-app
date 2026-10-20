import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { DeviceStoragePage } from './device-storage.page';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2HistoryService } from '../../../core/services/device-v2-history.service';
import { DeviceV2ManifestCache } from '../../../core/services/device-v2-manifest-cache.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { STATE_HISTORY_MAX_AGE_MS, STATE_HISTORY_MAX_RECORDS, STATE_HISTORY_RECORDED_TYPES } from '../../../core/device-v2/state-history';

const id = 'device_a';
function response(url: string, items?: any[], nextCursor: string | null = null) {
  const query = new URL(url).searchParams;
  const row = { id: '100', segmentId: '12345678-1234-4234-9234-123456789abc', key: 'power', kind: 0, type: 0,
    state: { type: 0, cbor: '9Q', value: true }, revision: 2, manifestFingerprint: 'a'.repeat(64),
    observedAt: Number(query.get('to')) - 1000, event: 'baseline' };
  return { status: 200, headers: { get: () => 'private, no-store' }, body: { message: 1000, detail: {
    logicalDeviceId: id, from: Number(query.get('from')), to: Number(query.get('to')), items: items ?? [row], nextCursor,
    retention: { maxAgeMs: STATE_HISTORY_MAX_AGE_MS, maxRecords: STATE_HISTORY_MAX_RECORDS },
    timeBasis: 'serverAcceptedAt', source: 'broker-state', recordedTypes: [...STATE_HISTORY_RECORDED_TYPES] } } };
}
async function render(mode: 'real' | 'empty' | 'failed' | 'pending' = 'real') {
  const pending = new Subject<any>();
  const http = { get: vi.fn((url: string) => mode === 'pending' ? pending : of(mode === 'failed'
    ? { ...response(url), body: { message: 0, detail: null } } : response(url, mode === 'empty' ? [] : undefined))) };
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    deviceDataLoader: new BehaviorSubject(true), device: { dict: { [id]: { config: { mode: 'bbp2', customName: '旧设备名' },
      displayMetadata: { name: '客厅灯', capabilities: [{ key: 'power', kind: 0, type: 0,
        displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' }] } } } } };
  const visibility = { active: new BehaviorSubject(true) };
  await TestBed.configureTestingModule({ imports: [DeviceStoragePage], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => id } } } },
    { provide: DataService, useValue: data },
    { provide: DeviceV2HistoryService, useValue: new DeviceV2HistoryService(http as any) },
    { provide: DeviceV2ManifestCache, useValue: { load: () => ({ fields: [{ key: 'power', kind: 0, type: 0 }] }) } },
    { provide: AppVisibilityService, useValue: visibility },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(DeviceStoragePage), page = fixture.componentInstance;
  fixture.autoDetectChanges(); page.ionViewWillEnter();
  // The pending fixture deliberately cannot become stable before its HTTP
  // completes; render its immediate busy signal without completing that read.
  if (mode === 'pending') fixture.detectChanges();
  if (mode !== 'pending') { await vi.waitFor(() => expect(page.state().busy).toBe(false)); await fixture.whenStable(); }
  return { fixture, page, element: fixture.nativeElement as HTMLElement, http, pending, data, visibility };
}

describe('State history production template and read API', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('renders actual source, UTC, names and baseline values without fake quota, sample series or unit guesses', async () => {
    const f = await render();
    expect(f.element.querySelector('ion-title')?.textContent).toBe('状态历史');
    expect(f.element.querySelector('h1')?.textContent).toBe('客厅灯');
    expect(f.element.querySelector('.history-main')?.textContent).toContain('电源开关');
    expect(f.element.querySelector('.history-main')?.textContent).toContain('亮');
    expect(f.element.querySelector('.event-label')?.textContent).toContain('基线（不是操作）');
    expect(f.element.querySelector('time')?.getAttribute('datetime')).toMatch(/Z$/);
    expect(f.element.querySelector('.source-note')?.textContent).toContain('服务器确认时间');
    expect(f.element.querySelector('.source-note')?.textContent).toContain('本地变化');
    expect(f.element.querySelector('.policy-note')?.textContent).toContain('10,000');
    expect(f.element.querySelector('.policy-note')?.textContent).toContain('不保证完整');
    expect(f.element.textContent).not.toContain('13.6'); expect(f.element.textContent).not.toContain('20 MB');
    expect(f.element.querySelector('.mini-chart')).toBeNull(); expect(f.element.textContent).not.toContain('温度');
    expect(f.http.get).toHaveBeenCalledTimes(1);
  });
  it.each(['failed', 'pending'] as const)('does not display a false empty history or policy as confirmed on %s', async mode => {
    const f = await render(mode);
    expect(f.element.querySelector('.empty-state')).toBeNull(); expect(f.element.querySelector('.history-list')).toBeNull();
    expect(f.element.querySelector('.policy-note')).toBeNull();
    if (mode === 'failed') expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('尚未取得');
    else expect(f.element.querySelector('[role="status"]')).not.toBeNull();
  });
  it('displays genuine empty server results without inserting any samples', async () => {
    const f = await render('empty');
    expect(f.element.querySelector('.empty-state')?.textContent).toContain('该范围暂无服务器观测');
    expect(f.element.querySelector('.history-row')).toBeNull(); expect(f.element.querySelector('.policy-note')).not.toBeNull();
  });
  it('uses the real refresh/range DOM controls for bounded GETs without another State lease or mutation', async () => {
    const f = await render();
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.http.get).toHaveBeenCalledTimes(2);
    const select = f.element.querySelector<HTMLSelectElement>('select')!, hour = [...select.options].find(option => option.textContent?.includes('1 小时'))!;
    select.value = hour.value; select.dispatchEvent(new Event('change', { bubbles: true })); await f.fixture.whenStable();
    expect(f.http.get).toHaveBeenCalledTimes(3);
    const last = new URL(f.http.get.mock.calls[2][0]).searchParams;
    expect(Number(last.get('to')) - Number(last.get('from'))).toBe(3600000); expect(last.get('limit')).toBe('50');
    expect(f.http.get.mock.calls.every(call => call[0].includes('/state-history?'))).toBe(true);
  });
  it('explains the 200-row display boundary without promising that a shorter range retrieves older records', async () => {
    const f = await render();
    let pageIndex = 0;
    f.http.get.mockImplementation((url: string) => {
      const row = response(url).body.detail.items[0];
      const items = Array.from({ length: 50 }, (_, index) => ({ ...row, id: String(250 - pageIndex * 50 - index) }));
      return of(response(url, items, btoa(`page-${pageIndex++}`)));
    });
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    for (let index = 0; index < 3; ++index) {
      expect(f.element.querySelector('.bounded-note')).toBeNull();
      f.element.querySelector<HTMLButtonElement>('.load-more-action')!.click(); await f.fixture.whenStable();
    }
    expect(f.page.state().rows).toHaveLength(200); expect(f.page.state().nextCursor).not.toBeNull();
    expect(f.element.querySelectorAll('.history-row')).toHaveLength(200);
    expect(f.element.querySelector('.load-more-action')).toBeNull();
    const note = f.element.querySelector('.bounded-note')?.textContent;
    expect(note).toContain('200 条显示上限'); expect(note).toContain('仍有更早记录未显示');
    expect(note).toContain('按功能筛选或调整范围重新查询');
    expect(note).not.toContain('缩短时间范围'); expect(note).not.toContain('查询更早记录');
    const requests = f.http.get.mock.calls.length;
    await f.page.loadMore(); expect(f.http.get).toHaveBeenCalledTimes(requests);
    const ranges = f.http.get.mock.calls.slice(1).map(([url]) => new URL(url).searchParams);
    expect(ranges.every(query => query.get('limit') === '50'
      && query.get('from') === ranges[0].get('from') && query.get('to') === ranges[0].get('to'))).toBe(true);
  });
  it('clears the actual rendered records on native background, account change or view exit', async () => {
    const f = await render();
    expect(f.element.querySelector('.history-row')).not.toBeNull();
    f.visibility.active.next(false); await f.fixture.whenStable(); expect(f.element.querySelector('.history-row')).toBeNull();
    f.visibility.active.next(true); await f.fixture.whenStable(); expect(f.http.get).toHaveBeenCalledTimes(2);
    expect(f.element.querySelector('.history-row')).not.toBeNull();
    f.data.auth.uuid = 'other'; f.data.sessionEpoch += 1; f.data.authDataChanged.next(); await f.fixture.whenStable();
    expect(f.element.querySelector('.history-row')).toBeNull(); expect(f.element.querySelector('h1')?.textContent).toBe('设备');
    f.page.ionViewWillLeave(); await f.fixture.whenStable(); expect(f.http.get).toHaveBeenCalledTimes(2);
  });
});
