import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AlertController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { TaskRecord } from '../../../core/device-v2/tasks/contract';
import { NoticeService } from '../../../core/services/notice.service';
import { DeviceTimerPage } from './device-timer.page';
import { TimerService } from './timer.service';
import { TimingEditPage } from './timing-edit/timing-edit';

function state() {
  const records: TaskRecord[] = [{ taskId: 7, definitionRevision: 2, consumedUtcMillis: 0, startSequence: 0, progress: 0,
    definition: { enabled: true, key: 'power', valueType: 'boolean', value: true,
      schedule: { kind: 'countdown', durationMillis: 3000 } } }];
  return {
    ready: true, busy: false, capacity: 4, revision: 2, generation: 1, records,
    targets: [{ key: 'power', valueType: 'boolean' }], deviceName: '客厅灯',
    error: '', notice: '', statusText: '', timingText: '', pending: undefined as any, journal: { held: false } as any,
    canInitialize: false, canRetry: false, canReviewPending: false,
    get canWrite() { return this.ready && !this.busy && !this.pending; },
    get canCreate() { return this.canWrite && this.records.length < this.capacity; },
    get capacityText() { return `已用 ${this.records.length} / ${this.capacity} 条`; },
    sourceText: '设备本地执行；当前通过云端管理，需要设备云端连接。', creationHint: '',
    targetLabel: vi.fn(() => '电源开关'), valueLabel: vi.fn((_key: string, value: unknown) => value ? '开启' : '关闭'),
    open: vi.fn(async () => undefined), close: vi.fn(), refresh: vi.fn(async () => undefined),
    write: vi.fn(async () => true), retry: vi.fn(async () => true), forget: vi.fn(async () => undefined),
  };
}

async function render(kind: 'list' | 'edit', timer = state()) {
  const component = kind === 'list' ? DeviceTimerPage : TimingEditPage;
  const nav = { navigateBack: vi.fn(async () => true) };
  const alerts = { create: vi.fn(async () => ({ present: async () => undefined, onDidDismiss: async () => ({ role: 'confirm' }) })) };
  await TestBed.configureTestingModule({ imports: [component], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (key: string) => key === 'id' ? 'device_a' : 'task-7' } } } },
    { provide: AlertController, useValue: alerts }, { provide: NavController, useValue: nav },
    { provide: NoticeService, useValue: { showToast: vi.fn(async () => undefined) } },
  ] }).overrideComponent(component, { set: { providers: [{ provide: TimerService, useValue: timer }] } }).compileComponents();
  const fixture = TestBed.createComponent<DeviceTimerPage | TimingEditPage>(component);
  if (kind === 'edit') await (fixture.componentInstance as TimingEditPage).ionViewWillEnter();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, timer, nav, alerts };
}

describe('UI5 task grouping and truthful state rendering', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders one complete card per real task, preserving aliases, IDs and distinct enabled/Start actions', async () => {
    const timer = state();
    timer.records.push({ ...structuredClone(timer.records[0]), taskId: 9,
      definition: { ...timer.records[0].definition, enabled: false, schedule: { kind: 'weekly', weekdays: 1, minuteOfDay: 485, utcOffsetMinutes: 480 } } });
    const f = await render('list', timer);
    const cards = [...f.element.querySelectorAll('.task-list > .task-row.surface-card')];
    expect(cards).toHaveLength(2);
    expect(f.element.querySelector('.task-list')?.classList.contains('surface-card')).toBe(false);
    expect(cards[0].textContent).toContain('#7');
    expect(cards[0].textContent).toContain('定义已启用');
    expect(cards[0].textContent).toContain('电源开关：开启');
    expect(cards[0].textContent).toContain('开始新倒计时');
    expect(cards[1].textContent).toContain('#9');
    expect(cards[1].textContent).toContain('定义已停用');
    expect(cards[1].textContent).not.toContain('开始新倒计时');
    expect(timer.write).not.toHaveBeenCalled();
  });

  it('keeps the existing explicit Start path and current revision behind its confirmation', async () => {
    const f = await render('list');
    const start = [...f.element.querySelectorAll<HTMLElement>('.task-actions ion-button')]
      .find(button => button.textContent?.trim() === '开始新倒计时')!;
    start.click(); await f.fixture.whenStable();
    expect(f.alerts.create).toHaveBeenCalledOnce();
    expect(f.timer.write).toHaveBeenCalledExactlyOnceWith({ operation: 'start', expectedRevision: 2, taskId: 7 });
  });

  it('groups the same editor inputs by schedule, action and definition state with normal-flow saving', async () => {
    const f = await render('edit');
    expect([...f.element.querySelectorAll('.setting-card > h2')].map(h => h.textContent))
      .toEqual(['何时执行', '执行动作', '定义状态']);
    const schedule = f.element.querySelector('[aria-label="何时执行"]')!;
    expect(schedule.querySelector('select')?.textContent).toContain('倒计时');
    expect(schedule.querySelector('input')?.getAttribute('step')).toBe('0.001');
    expect(schedule.textContent).toContain('设备接受并持久化开始请求后起算');
    expect(f.element.querySelector('[aria-label="执行动作"]')?.textContent).toContain('固件允许的目标');
    expect(f.element.querySelector('[aria-label="定义状态"]')?.textContent).toContain('不是开始/恢复倒计时');
    expect(f.element.querySelector('main .editor-bottom-actions .save-action')).not.toBeNull();
    expect(f.element.querySelector('main .editor-bottom-actions .delete-action')).not.toBeNull();
    expect(f.timer.write).not.toHaveBeenCalled();
  });

  it('keeps confirmation visible while the independent list refresh is busy, with timings folded', async () => {
    const timer = state(); timer.busy = true; timer.ready = false;
    timer.notice = '设备已确认本次管理操作；不代表到期动作或物理输出已完成。';
    timer.statusText = '正在更新任务目录与列表'; timer.timingText = 'HTTP开始至设备确认 210 ms';
    const f = await render('list', timer);
    expect(f.element.querySelector('.task-busy[role="status"]')?.textContent).toContain('更新任务目录');
    expect([...f.element.querySelectorAll('.workflow-feedback[role="status"]')].some(p => p.textContent === timer.notice)).toBe(true);
    const details = f.element.querySelector<HTMLDetailsElement>('.task-timing-details')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('确认也不代表到期动作已执行');
    expect(f.element.querySelector('.task-list')).toBeNull();
    expect(timer.write).not.toHaveBeenCalled();
  });

  it('leaves UNKNOWN review actions outside disclosures and preserves the original journal on read', async () => {
    const timer = state(); timer.canRetry = true; timer.canReviewPending = true;
    timer.pending = { operation: 'start', requestId: 'original-request' };
    timer.journal = { pending: timer.pending, held: true };
    const journal = structuredClone(timer.journal), f = await render('list', timer);
    const pending = f.element.querySelector('.task-pending[aria-label="未确认请求"]')!;
    const actions = [...pending.querySelectorAll<HTMLElement>('.workflow-actions ion-button')];
    expect(actions.map(b => b.textContent?.trim())).toEqual(['恢复原请求', '查询当前任务', '已核对，停止追踪原请求']);
    expect(actions.every(button => !button.closest('details'))).toBe(true);
    expect(pending.textContent).toContain('停止本地追踪不会取消设备任务');
    const details = pending.querySelector<HTMLDetailsElement>('.task-request-details')!;
    expect(details.open).toBe(false); expect(details.textContent).toContain('original-request');
    actions[1].click(); await f.fixture.whenStable();
    expect(timer.refresh).toHaveBeenCalledOnce(); expect(timer.retry).not.toHaveBeenCalled();
    expect(timer.write).not.toHaveBeenCalled(); expect(timer.journal).toEqual(journal);
  });

  it('retains weekly choices, fixed timezone and the original teardown without extra refreshes', async () => {
    const timer = state();
    timer.records[0].definition.schedule = { kind: 'weekly', weekdays: 65, minuteOfDay: 485, utcOffsetMinutes: 480 };
    const f = await render('edit', timer);
    expect(f.element.querySelector('[aria-label="执行星期"]')?.querySelectorAll('input')).toHaveLength(7);
    expect(f.element.querySelector('[aria-label="何时执行"]')?.textContent).toContain('固定 UTC 偏移');
    expect(f.element.querySelector('.task-clock-note')?.textContent).toContain('本页无法确认校时状态及来源');
    const editor = f.fixture.componentInstance as TimingEditPage;
    expect(editor.definition().schedule).toEqual(timer.records[0].definition.schedule);
    editor.ionViewWillLeave(); expect(timer.close).toHaveBeenCalledOnce();
    expect(timer.refresh).not.toHaveBeenCalled(); expect(timer.write).not.toHaveBeenCalled();
  });
});
