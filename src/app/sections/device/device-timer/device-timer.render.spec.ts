import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AlertController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { TaskRecord } from '../../../core/device-v2/tasks/contract';
import { DeviceTimerPage } from './device-timer.page';
import { TimerService } from './timer.service';
import { TimingEditPage } from './timing-edit/timing-edit';

const record: TaskRecord = { taskId: 7, definitionRevision: 2, consumedUtcMillis: 0, startSequence: 0, progress: 0,
  definition: { enabled: true, key: 'power', valueType: 'boolean', value: true, schedule: { kind: 'countdown', durationMillis: 3000 } } };

function timerState() {
  return { ready: true, busy: false, capacity: 6 as number | null, revision: 2, generation: 1,
    records: structuredClone([record]), targets: [{ key: 'power', valueType: 'boolean' }],
    deviceName: '客厅灯', error: '', notice: '', pending: undefined as any, journal: { held: false } as any,
    canInitialize: false, canRetry: false, canReviewPending: false,
    get canWrite() { return this.ready && !this.busy && !this.pending; },
    get canCreate() { return this.canWrite && this.capacity !== null && this.targets.length > 0 && this.records.length < this.capacity; },
    get capacityText() { return this.ready && this.capacity !== null ? `已用 ${this.records.length} / ${this.capacity} 条` : '容量尚未确认'; },
    get creationHint() { return this.pending ? '有尚未确认的请求，请先查询核对。' : !this.targets.length ? '固件没有开放定时属性。' : !this.canCreate ? '任务容量已满，仍可编辑、停用或删除已有任务。' : ''; },
    sourceText: '设备本地执行；当前通过云端管理，需要设备云端连接。',
    targetLabel: vi.fn(() => '电源开关'), valueLabel: vi.fn((_key: string, value: unknown) => value ? '亮' : '灭'),
    open: vi.fn(async () => undefined), close: vi.fn(), refresh: vi.fn(async () => undefined),
    write: vi.fn(async () => true), retry: vi.fn(async () => true), forget: vi.fn(async () => undefined) };
}

async function render(kind: 'list' | 'edit', timer: TimerService | ReturnType<typeof timerState> = timerState(), routeId = 'task-7') {
  const component = kind === 'list' ? DeviceTimerPage : TimingEditPage;
  const nav = { navigateBack: vi.fn(async () => true) };
  const alerts = { create: vi.fn(async () => ({ present: async () => undefined, onDidDismiss: async () => ({ role: 'confirm' }) })) };
  await TestBed.configureTestingModule({ imports: [component], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (key: string) => key === 'id' ? 'device_a' : routeId } } } },
    { provide: AlertController, useValue: alerts }, { provide: NavController, useValue: nav },
  ] }).overrideComponent(component, { set: { providers: [{ provide: TimerService, useValue: timer }] } }).compileComponents();
  const fixture = TestBed.createComponent<DeviceTimerPage | TimingEditPage>(component);
  if (kind === 'edit') await (fixture.componentInstance as TimingEditPage).ionViewWillEnter();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, timer, alerts, nav };
}

describe('task pages production template rendering', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an asynchronous service result through the real template without a user click or extra request', async () => {
    const client = { submit: vi.fn(), catalog: vi.fn(), table: vi.fn(), inspect: vi.fn() };
    const data = { authDataChanged: new Subject<void>(), device: { dict: { device_a: {
      displayMetadata: { name: '客厅灯', capabilities: [{ key: 'power', kind: 0, type: 0,
        displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' }] },
    } } } };
    const timer = new TimerService(client as any, data as any, { load: () => ({ fields: [
      { key: 'power', kind: 0, type: 0, id: 1, access: 7 },
    ] }) } as any);
    timer.id = 'device_a';
    const f = await render('list', timer); f.fixture.autoDetectChanges();
    expect(f.element.querySelector('.capacity-text')?.textContent).toBe('容量尚未确认');
    await Promise.resolve();
    timer.capacity = 3; timer.records = structuredClone([record]);
    timer.targets = [{ key: 'power', valueType: 'boolean' }]; timer.ready = true;
    await vi.waitFor(() => expect(f.element.querySelector('.capacity-text')?.textContent).toBe('已用 1 / 3 条'));
    expect(f.element.querySelector('.task-detail strong')?.textContent).toBe('电源开关：亮');
    expect(client.submit).not.toHaveBeenCalled(); expect(client.catalog).not.toHaveBeenCalled();
    expect(client.table).not.toHaveBeenCalled(); expect(client.inspect).not.toHaveBeenCalled();
  });

  it('renders device/target/value aliases, actual capacity and local/cloud source without writes', async () => {
    const f = await render('list');
    expect(f.element.querySelector('h1')?.textContent).toBe('客厅灯');
    expect(f.element.querySelector('.capacity-text')?.textContent).toBe('已用 1 / 6 条');
    expect(f.element.querySelector('.source-text')?.textContent).toContain('设备本地执行');
    expect(f.element.querySelector('.source-text')?.textContent).toContain('云端管理');
    expect(f.element.querySelector('.task-detail strong')?.textContent).toBe('电源开关：亮');
    expect(f.element.querySelector('details')?.textContent).toContain('当前查询修订 2');
    const executionNote = f.element.querySelector('.task-execution-note')?.textContent;
    expect(executionNote).toContain('由设备执行');
    expect(executionNote).toContain('退出 App 不会取消');
    expect(executionNote).not.toContain('修订');
    expect(f.timer.write).not.toHaveBeenCalled(); expect(f.timer.retry).not.toHaveBeenCalled();
  });

  it('folds unchanged request IDs behind technical details and keeps read, retry and stop-tracking actions separate', async () => {
    const timer = timerState(); timer.canRetry = true; timer.canReviewPending = true;
    timer.pending = { operation: 'start', requestId: 'original-request-long-id' };
    timer.journal = { held: false, pending: timer.pending,
      authority: { operation: 'initialize', requestId: 'authority-request-long-id' } };
    const journal = structuredClone(timer.journal), f = await render('list', timer);
    const panel = f.element.querySelector('[aria-label="未确认请求"]')!;
    expect(panel.querySelector('strong')?.textContent).toBe('尚未确认：开始倒计时');
    const details = panel.querySelector<HTMLDetailsElement>('.task-request-details')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('original-request-long-id');
    expect(details.textContent).toContain('authority-request-long-id');
    expect([...panel.querySelectorAll('p')].filter(p => !details.contains(p)).map(p => p.textContent).join(' ')).not.toContain('request-long-id');
    expect(panel.textContent).toContain('查询只读取当前任务'); expect(panel.textContent).toContain('恢复原请求可能执行原操作');
    expect(panel.textContent).toContain('停止本地追踪不会取消设备任务');
    const buttons = [...panel.querySelectorAll<HTMLElement>('ion-button')];
    buttons.find(button => button.textContent?.trim() === '查询当前任务')!.click(); await f.fixture.whenStable();
    expect(timer.refresh).toHaveBeenCalledTimes(1); expect(timer.retry).not.toHaveBeenCalled();
    expect(timer.write).not.toHaveBeenCalled(); expect(timer.journal).toEqual(journal);
    buttons.find(button => button.textContent?.trim() === '恢复原请求')!.click(); await f.fixture.whenStable();
    expect(timer.retry).toHaveBeenCalledTimes(1); expect(timer.journal).toEqual(journal);
    buttons.find(button => button.textContent?.trim() === '已核对，停止追踪原请求')!.click(); await f.fixture.whenStable();
    expect(timer.forget).toHaveBeenCalledWith(timer.journal); expect(timer.write).not.toHaveBeenCalled();
  });

  it.each(['loading', 'blocked', 'pending'])('never renders fake zero capacity or empty task results when %s', async mode => {
    const timer = timerState(); timer.ready = false; timer.capacity = null; timer.records = [];
    timer.busy = mode === 'loading';
    if (mode === 'blocked') timer.error = '该设备暂未开放定时任务。';
    if (mode === 'pending') { timer.pending = { operation: 'start', requestId: 'original' }; timer.journal = { held: true, pending: timer.pending }; }
    const f = await render('list', timer);
    expect(f.element.querySelector('.capacity-text')?.textContent).toBe('容量尚未确认');
    expect(f.element.querySelector('.hero-meta')).toBeNull(); expect(f.element.querySelector('.empty-state')).toBeNull();
    expect(f.element.querySelector('.add-task-button')).toBeNull();
    if (mode === 'pending') expect(f.element.querySelector('[aria-label="未确认请求"]')?.textContent).toContain('original');
    expect(timer.write).not.toHaveBeenCalled(); expect(timer.retry).not.toHaveBeenCalled();
  });

  it.each(['full', 'no-target', 'pending'])('disables only creation and explains %s without writing', async mode => {
    const timer = timerState();
    if (mode === 'full') timer.capacity = 1;
    if (mode === 'no-target') timer.targets = [];
    if (mode === 'pending') { timer.pending = { operation: 'start', requestId: 'original' }; timer.journal = { held: false, pending: timer.pending }; }
    const f = await render('list', timer);
    const add = f.element.querySelector<HTMLButtonElement>('.add-task-button')!;
    expect(add.disabled).toBe(true); add.click();
    expect(f.element.querySelector('.creation-hint')?.textContent).toBe(timer.creationHint);
    expect(f.element.querySelector<HTMLButtonElement>('.task-main')?.disabled).toBe(false);
    expect(timer.write).not.toHaveBeenCalled(); expect(timer.retry).not.toHaveBeenCalled();
  });

  it('keeps existing full-table edits/removal available and warns about absent targets', async () => {
    const timer = timerState(); timer.capacity = 1;
    const f = await render('edit', timer);
    expect(f.element.querySelector('select')?.textContent).toContain('倒计时');
    expect(f.element.querySelector<HTMLButtonElement>('.save-action')?.disabled).toBe(false);
    expect(f.element.querySelector<HTMLButtonElement>('.delete-action')?.disabled).toBe(false);
    expect(f.element.textContent).toContain('日期/星期任务需要设备有效时间');
    expect(f.element.textContent).toContain('本页无法确认校时状态及来源');
    expect(f.element.textContent).not.toContain('已授时');
    timer.targets = []; f.fixture.detectChanges();
    expect(f.element.querySelector<HTMLButtonElement>('.save-action')?.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.delete-action')?.disabled).toBe(false);
    expect(f.element.querySelector('.target-unavailable')?.textContent).toContain('仍可删除原任务');
    expect(timer.write).not.toHaveBeenCalled(); expect(timer.refresh).not.toHaveBeenCalled();
  });

  it.each(['once', 'weekly'] as const)('keeps %s editing available without inventing a clock status or extra query', async kind => {
    const timer = timerState();
    timer.records[0].definition.schedule = kind === 'once'
      ? { kind, utcMillis: Date.now() + 60000 }
      : { kind, minuteOfDay: 485, weekdays: 65, utcOffsetMinutes: 480 };
    const f = await render('edit', timer);
    expect(f.element.querySelector('.task-clock-note')?.textContent).toContain('本页无法确认校时状态及来源');
    expect(f.element.textContent).not.toContain('已授时');
    expect(f.element.querySelector<HTMLButtonElement>('.save-action')?.disabled).toBe(false);
    expect((f.fixture.componentInstance as TimingEditPage).canSave).toBe(true);
    f.fixture.detectChanges(); await f.fixture.whenStable();
    expect(timer.open).toHaveBeenCalledOnce();
    expect(timer.refresh).not.toHaveBeenCalled(); expect(timer.write).not.toHaveBeenCalled();
    expect(timer.retry).not.toHaveBeenCalled();
  });

  it('keeps explicit form loading reachable after a failed query without misreporting the existing task', async () => {
    const timer = timerState(); timer.open.mockImplementationOnce(async () => { timer.ready = false; });
    const f = await render('edit', timer);
    expect(f.element.querySelector('.load-form-button')).toBeNull();
    // This fixture's plain stub has no service signal to mark its view dirty.
    // The real signal-driven completion is covered by the first render test.
    timer.ready = true; f.fixture.changeDetectorRef.markForCheck(); f.fixture.detectChanges();
    expect(f.element.querySelector('.not-found')).toBeNull();
    expect(f.element.querySelector('.form-load-hint')?.textContent).toContain('明确载入');
    expect(f.element.querySelector('.save-action')).toBeNull();
    expect(f.element.querySelector('fieldset')).toBeNull();
    f.fixture.autoDetectChanges();
    f.element.querySelector<HTMLButtonElement>('.load-form-button')!.click();
    await f.fixture.whenStable();
    expect(f.element.querySelector('.form-load-hint')).toBeNull();
    expect(f.element.querySelector<HTMLButtonElement>('.save-action')?.disabled).toBe(false);
    expect(f.element.querySelector('.target-unavailable')).toBeNull();
    expect(timer.write).not.toHaveBeenCalled(); expect(timer.refresh).not.toHaveBeenCalled();
  });

  it.each(['task-8', 'timing-0'])('does not offer a form for a missing or invalid route %s', async routeId => {
    const f = await render('edit', timerState(), routeId);
    expect(f.element.querySelector('.not-found')?.textContent).toContain('找不到任务');
    expect(f.element.querySelector('.load-form-button')).toBeNull();
    expect(f.element.querySelector('.save-action')).toBeNull(); expect(f.element.querySelector('fieldset')).toBeNull();
    expect(f.timer.write).not.toHaveBeenCalled();
  });
});
