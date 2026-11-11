import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { AppVisibilityService } from '../../core/services/app-visibility.service';
import { DataService } from '../../core/services/data.service';
import { DeviceV2ActivityService } from '../../core/services/device-v2-activity.service';
import { DeviceV2HistoryService } from '../../core/services/device-v2-history.service';
import { DeviceV2ManifestCache } from '../../core/services/device-v2-manifest-cache.service';
import { DeviceV2PeriodicHistoryService } from '../../core/services/device-v2-periodic-history.service';
import { DeviceLogComponent } from './device-log/device-log.component';
import { DeviceStoragePage } from './device-storage/device-storage.page';
import { DeviceTrendsPage } from './device-trends/device-trends.page';

const ID = 'ui5-data-device', HASH = 'a'.repeat(64);
async function render(kind: 'history' | 'trends' | 'activity', shared = false) {
  const device = { name: '原设备名', deviceName: ID, config: { mode: 'bbp2', isShared: shared },
    displayMetadata: { name: '客厅环境', capabilities: [{ key: 'reading', kind: 0, type: 2, displayName: '空气读数' }] },
    data: {}, storage: {}, subject: new Subject() };
  const data = { auth: { uuid: 'ui5-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    deviceDataLoader: new BehaviorSubject(true), device: { dict: { [ID]: device } }, getDevice: (id: string) => id === ID ? device : undefined };
  const visibility = { active: new BehaviorSubject(true) };
  const history = { read: vi.fn(async (_id: string, q: any) => ({ items: [{ id: '1', key: 'reading', kind: 0, type: 2,
    state: { type: 2, value: 0 }, revision: 1, manifestFingerprint: HASH, observedAt: q.to - 1000, event: 'baseline' }], nextCursor: null })) };
  const detail = { logicalDeviceId: ID, manifestFingerprint: HASH, fields: [{ key: 'reading', type: 2 }],
    policy: { revision: 1, enabled: true, manifestFingerprint: HASH, keys: ['reading'], intervalMs: 60000, updatedAt: 1000 },
    runtime: { phase: 'active', failures: 0 }, canConfigure: !shared };
  const trends = { detail: vi.fn(async () => detail), save: vi.fn(async () => { throw Error('UI5_PRIVATE_UNKNOWN'); }),
    read: vi.fn(async (_id: string, q: any) => ({ items: [{ id: '1', key: 'reading', type: 2, state: { type: 2, value: 0 },
      receivedAt: q.to - 1000, streamId: 1, epoch: 1, sampleSequence: 1, effectiveIntervalMs: 60000 }], nextCursor: null })) };
  const activity = { read: vi.fn(async (_id: string, q: any) => ({ items: [{ id: '1', endpointKey: 'reading',
    status: 'outcome_unknown', attemptCount: 1, createdAt: q.to - 1000, updatedAt: q.to - 900 }], nextCursor: null })) };
  const pageType = kind === 'history' ? DeviceStoragePage : kind === 'trends' ? DeviceTrendsPage : DeviceLogComponent;
  await TestBed.configureTestingModule({ imports: [pageType], providers: [provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => ID } } } },
    { provide: DataService, useValue: data }, { provide: AppVisibilityService, useValue: visibility },
    { provide: DeviceV2HistoryService, useValue: history }, { provide: DeviceV2PeriodicHistoryService, useValue: trends },
    { provide: DeviceV2ActivityService, useValue: activity },
    { provide: DeviceV2ManifestCache, useValue: { load: () => ({ fields: [{ key: 'reading', kind: 0, type: 2 }] }) } },
    { provide: NavController, useValue: { navigateForward: vi.fn() } }] }).compileComponents();
  const fixture = TestBed.createComponent(pageType as typeof DeviceStoragePage);
  fixture.autoDetectChanges(); fixture.componentInstance.ionViewWillEnter(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance as DeviceStoragePage | DeviceTrendsPage | DeviceLogComponent,
    element: fixture.nativeElement as HTMLElement, data, visibility, history, trends, activity };
}

describe('UI5 production data-page grouping and state boundaries', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('keeps state history, query controls and source limitations in independent groups without extra reads', async () => {
    const f = await render('history');
    expect(f.element.querySelector('.data-heading h1')?.textContent).toBe('客厅环境');
    expect(f.element.querySelector('.query-form h2')?.textContent).toBe('查询范围');
    expect(f.element.querySelectorAll('.query-form label select')).toHaveLength(2);
    const source = f.element.querySelector<HTMLDetailsElement>('.source-disclosure')!;
    expect(source.open).toBe(false);
    expect(source.querySelector('summary')?.textContent).toBe('记录来源与限制');
    source.open = true;
    expect(source.textContent).toContain('未送达服务器的蓝牙或局域网本地变化不补录');
    expect(source.textContent).toContain('不是设备采集或实际发生时间');
    expect(source.querySelector('.policy-note')?.textContent).toContain('10,000');
    expect(f.element.querySelector('.event-label')?.textContent).toContain('状态基线（不是操作）');
    expect(f.element.querySelector('.history-main')?.textContent).toContain('0');
    expect(f.history.read).toHaveBeenCalledTimes(1);
  });

  it.each(['history', 'trends'] as const)('retains background and page-exit clearing for %s without retaining rendered records', async kind => {
    const f = await render(kind);
    expect(f.element.querySelector('.history-row')).not.toBeNull();
    f.visibility.active.next(false); await f.fixture.whenStable();
    expect(f.element.querySelector('.history-row')).toBeNull();
    expect(f.element.querySelector('.policy-card')).toBeNull();
    f.visibility.active.next(true); await f.fixture.whenStable();
    expect(f.element.querySelector('.history-row')).not.toBeNull();
    f.page.ionViewWillLeave(); await f.fixture.whenStable();
    expect(f.element.querySelectorAll('.history-row, .chart-card, .policy-card')).toHaveLength(0);
    expect(f.trends.save).not.toHaveBeenCalled();
  });

  it('keeps online-record settings, phase and source separate from the applied query window', async () => {
    const f = await render('trends');
    expect(f.element.querySelector('.policy-card h2')?.textContent).toBe('在线记录');
    expect(f.element.querySelector('.runtime-phase')?.textContent).toBe('已收到归档样本');
    expect(f.element.querySelector('.query-form h2')?.textContent).toBe('查询窗口');
    expect(f.element.querySelector('.query-form .window-status')).not.toBeNull();
    expect(f.element.querySelectorAll('.enabled-control span')).toHaveLength(1);
    const source = f.element.querySelector<HTMLDetailsElement>('.source-disclosure')!;
    expect(source.open).toBe(false); source.open = true;
    expect(source.textContent).toContain('不是设备所有消息都固定每 60 秒上传');
    expect(source.textContent).toContain('关闭此页面不停止已启用的归档');
    expect(f.element.querySelectorAll('svg circle')).toHaveLength(1);
    expect(f.trends.detail).toHaveBeenCalledTimes(1); expect(f.trends.read).toHaveBeenCalledTimes(1);
    expect(f.trends.save).not.toHaveBeenCalled();
  });

  it('keeps the UTC error next to its actual input and does not query an invalid draft', async () => {
    const f = await render('trends');
    const input = f.element.querySelector<HTMLInputElement>('.window-end')!;
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await f.fixture.whenStable();
    const status = f.element.querySelector('.window-status')!;
    expect(input.getAttribute('aria-describedby')).toBe(status.id);
    expect(status.querySelector('[role="alert"]')?.textContent).toContain('有效的 UTC');
    expect(f.element.querySelector<HTMLButtonElement>('.apply-window')?.disabled).toBe(true);
    expect(f.trends.read).toHaveBeenCalledTimes(1);
  });

  it('keeps an unknown recording save visibly blocked until an explicit read without replaying it', async () => {
    const f = await render('trends');
    const checkbox = f.element.querySelector<HTMLInputElement>('.enabled-control input')!;
    checkbox.checked = false; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await f.fixture.whenStable();
    f.element.querySelector<HTMLButtonElement>('.save-recording-action')!.click(); await f.fixture.whenStable();
    expect(f.element.querySelector('.error-note')?.textContent).toContain('保存结果尚未确认');
    expect(f.element.querySelector('.error-note')?.textContent).not.toContain('PRIVATE');
    expect(f.element.querySelector<HTMLButtonElement>('.save-recording-action')?.disabled).toBe(true);
    expect(f.element.querySelector<HTMLInputElement>('.enabled-control input')?.disabled).toBe(true);
    expect(f.trends.save).toHaveBeenCalledTimes(1); expect(f.trends.detail).toHaveBeenCalledTimes(1);
    f.element.querySelector<HTMLButtonElement>('.refresh-action')!.click(); await f.fixture.whenStable();
    expect(f.element.querySelector('.notice-note')?.textContent).toContain('不会自动重发之前的保存');
    expect(f.element.querySelector<HTMLButtonElement>('.save-recording-action')?.disabled).toBe(false);
    expect(f.trends.save).toHaveBeenCalledTimes(1); expect(f.trends.detail).toHaveBeenCalledTimes(2);
  });

  it('renders shared trend reads without owner-only edit controls', async () => {
    const f = await render('trends', true);
    expect(f.element.querySelector('.readonly-note')?.textContent).toContain('分享用户');
    expect(f.element.querySelectorAll('.enabled-control, .save-recording-action, .policy-card fieldset')).toHaveLength(0);
    expect(f.element.querySelector('.history-row')).not.toBeNull();
    expect(f.trends.save).not.toHaveBeenCalled();
  });

  it('keeps activity UNKNOWN distinct from ACK, State and physical completion without retry controls', async () => {
    const f = await render('activity');
    expect(f.element.querySelector('.activity-heading h1')?.textContent).toBe('客厅环境');
    expect(f.element.querySelector('.activity-status[data-status="outcome_unknown"]')?.textContent).toBe('结果未知');
    const source = f.element.querySelector<HTMLDetailsElement>('.source-disclosure')!;
    source.open = true;
    expect(source.textContent).toContain('不包含 BLE／LAN 控制、定时任务或全部 State 事件');
    expect(source.textContent).toContain('不等于新鲜 State 或物理执行完成');
    expect(source.textContent).toContain('不会自动重发');
    expect(f.element.querySelectorAll('.activity-row button')).toHaveLength(0);
    expect(f.activity.read).toHaveBeenCalledTimes(1);
    f.visibility.active.next(false); await f.fixture.whenStable();
    expect(f.element.querySelectorAll('.activity-row, .source-disclosure, [data-action]')).toHaveLength(0);
  });
});
