import '@angular/compiler';
import { DeviceTimerPage } from './device-timer.page';
import { TimingEditPage } from './timing-edit/timing-edit';
import { TaskStatusComponent } from './task-status.component';
import { taskErrorText, taskProgressText, taskScheduleText, taskTargets, taskValue } from './device-timer.models';
import { TaskRecord } from '../../../core/device-v2/tasks/contract';

const record: TaskRecord = { taskId: 7, definitionRevision: 2, consumedUtcMillis: 0, startSequence: 0, progress: 0,
  definition: { enabled: true, key: 'power', valueType: 'boolean', value: true, schedule: { kind: 'countdown', durationMillis: 3000 } } };
function setup(routeId = 'task-7') {
  const timer = { generation: 1, id: 'device_a', ready: true, busy: false, canWrite: true, capacity: 4 as number | null, revision: 2,
    targets: [{ key: 'power', valueType: 'boolean' }, { key: 'level', valueType: 'uint' }],
    records: structuredClone([record]), deviceName: 'test', open: vi.fn(async () => undefined),
    close: vi.fn(), write: vi.fn(async () => true), retry: vi.fn(async () => true), forget: vi.fn(),
    canInitialize: false, canReviewPending: false, canRetry: true, pending: undefined as any, journal: { held: false } as any,
    get canCreate() { return this.canWrite && this.capacity !== null && !!this.targets.length && this.records.length < this.capacity; } };
  const nav = { navigateBack: vi.fn(async () => true) }, router = { navigate: vi.fn(async () => true) };
  const route = { snapshot: { paramMap: { get: (name: string) => name === 'id' ? 'device_a' : routeId } } };
  const dismissal = vi.fn(async () => ({ role: 'confirm' }));
  const alerts = { create: vi.fn(async () => ({ present: vi.fn(async () => undefined), onDidDismiss: dismissal })) };
  return { timer, nav, router, route, alerts, dismissal,
    editor: new TimingEditPage(timer as any, route as any, nav as any, alerts as any),
    list: new DeviceTimerPage(timer as any, route as any, router as any, alerts as any) };
}

describe('V2 task pages', () => {
  it('uses the service creation gate and keeps full-table editing/removal available', async () => {
    const f = setup('new'); await f.editor.ionViewWillEnter();
    f.timer.capacity = null; f.list.addTask(); await f.editor.save();
    expect(f.router.navigate).not.toHaveBeenCalled(); expect(f.timer.write).not.toHaveBeenCalled();
    f.timer.capacity = 1; f.list.addTask(); expect(f.editor.canSave).toBe(false);
    expect(f.router.navigate).not.toHaveBeenCalled();
    const edit = setup(); await edit.editor.ionViewWillEnter(); edit.timer.capacity = 1;
    expect(edit.editor.canSave).toBe(true);
    edit.list.editTask(record); expect(edit.router.navigate).toHaveBeenCalled();
    edit.timer.targets = []; expect(edit.editor.canSave).toBe(false);
    await edit.editor.deleteTask();
    expect(edit.timer.write).toHaveBeenCalledExactlyOnceWith({ operation: 'remove', expectedRevision: 2, taskId: 7 }, false);
  });

  it('distinguishes cloud link readiness from device policy and does not promise rollback', () => {
    expect(taskErrorText({ error: { errorCode: 'TASK_DEVICE_OFFLINE' } })).toContain('不会自动重发');
    expect(taskErrorText({ error: { errorCode: 'TASK_CONNECTION_NOT_READY' } })).toContain('不是设备任务额度或冷却限制');
    expect(taskErrorText({ code: 'TASK_CONNECTION_CHANGED' })).toContain('原未确认请求仍保留');
    expect(taskErrorText({ code: 'TASK_CONNECTION_AMBIGUOUS' })).toContain('不会自动选择连接');
  });

  it('does not promise future execution or infer a skipped result from an empty calendar progress', () => {
    expect(taskProgressText(record)).toBe('已启用 · 等待手动开始');
    for (const schedule of [
      { kind: 'once' as const, utcMillis: 946684800000 },
      { kind: 'once' as const, utcMillis: 4102444799999 },
      { kind: 'weekly' as const, minuteOfDay: 0, weekdays: 127, utcOffsetMinutes: 480 },
    ]) {
      const calendar = { ...record, definition: { ...record.definition, schedule } };
      expect(taskProgressText(calendar)).toBe('已启用 · 尚无执行记录');
      expect(taskProgressText({ ...calendar, progress: 5 })).toBe('已启用 · 本次已跳过');
    }
  });
  it('uses stable task IDs, opens/closes the view, and does not translate old array-index links', async () => {
    const f = setup(); await f.editor.ionViewWillEnter(); expect(f.editor.taskId).toBe(7);
    expect(f.editor.taskNotFound).toBe(false); expect(f.editor.seconds).toBe(3);
    f.list.ionViewWillEnter(); f.list.editTask(record); expect(f.router.navigate).toHaveBeenCalledWith(['/device-manager/device_a/timer/task-7']);
    f.editor.ionViewWillLeave(); f.list.ionViewWillLeave(); expect(f.timer.close).toHaveBeenCalledTimes(2);
    expect(f.editor.formLoaded).toBe(false);
    for (const id of ['timing-0', 'countdown', 'loop-0', '0', 'task-0', 'task-4294967296']) {
      const page = setup(id).editor; await page.ionViewWillEnter(); expect(page.taskNotFound).toBe(true);
    }
  });
  it('saves a typed definition only; no Start/optimistic data mutation, and no navigation before confirmation', async () => {
    const f = setup('new'); await f.editor.ionViewWillEnter();
    f.editor.seconds = 15; f.editor.value = false;
    f.timer.write.mockResolvedValueOnce(false); await f.editor.save();
    expect(f.nav.navigateBack).not.toHaveBeenCalled(); expect(f.timer.records).toEqual([record]);
    expect(f.timer.write).toHaveBeenCalledWith({ operation: 'create', expectedRevision: 2, definition: {
      schedule: { kind: 'countdown', durationMillis: 15000 }, enabled: true, key: 'power', valueType: 'boolean', value: false } }, false);
    await f.editor.save(); expect(f.nav.navigateBack).toHaveBeenCalledTimes(1);
    expect(f.timer.write.mock.calls.every(c => (c as any)[0].operation === 'create')).toBe(true);
  });
  it('keeps form CAS stable after a refresh until the user explicitly reloads', async () => {
    const f = setup(); await f.editor.ionViewWillEnter();
    f.editor.seconds = 12; f.editor.value = false;
    f.timer.revision = 9; f.timer.records[0].definition.schedule = { kind: 'countdown', durationMillis: 4000 };
    expect(f.editor.seconds).toBe(12); expect(f.editor.value).toBe(false); expect(f.editor.revision).toBe(2);
    await f.editor.save();
    expect(f.timer.write).toHaveBeenCalledWith(expect.objectContaining({ operation: 'replace', taskId: 7, expectedRevision: 2 }), false);
    f.editor.loadForm(); expect(f.editor.revision).toBe(9); expect(f.editor.seconds).toBe(4); expect(f.editor.value).toBe(true);
  });
  it.each(['task-7', 'new'])('recovers a failed first query through an explicit form load for %s', async routeId => {
    const f = setup(routeId); f.timer.ready = false;
    await f.editor.ionViewWillEnter(); expect(f.editor.formLoaded).toBe(false);
    f.timer.ready = true;
    expect(f.editor.taskNotFound).toBe(false); expect(f.editor.canSave).toBe(false);
    await f.editor.save(); expect(f.timer.write).not.toHaveBeenCalled();
    f.editor.loadForm(); expect(f.editor.formLoaded).toBe(true); expect(f.editor.revision).toBe(2);
    expect(f.editor.key).toBe('power'); expect(f.editor.canSave).toBe(true);
  });
  it('does not confuse an unloaded existing task with a genuinely missing or invalid task route', async () => {
    for (const routeId of ['task-7', 'timing-0']) {
      const f = setup(routeId); f.timer.ready = false; await f.editor.ionViewWillEnter();
      f.timer.records = []; f.timer.ready = true;
      expect(f.editor.taskNotFound).toBe(true);
      f.editor.loadForm(); expect(f.editor.formLoaded).toBe(false); expect(f.editor.canSave).toBe(false);
      await f.editor.save(); await f.editor.deleteTask(); expect(f.timer.write).not.toHaveBeenCalled();
    }
    const f = setup(); await f.editor.ionViewWillEnter();
    f.timer.records = []; expect(f.editor.taskNotFound).toBe(true); expect(f.editor.canSave).toBe(false);
    await f.editor.deleteTask(); expect(f.alerts.create).not.toHaveBeenCalled(); expect(f.timer.write).not.toHaveBeenCalled();
  });
  it('weekly input is Monday bit0 with explicit fixed offset, no implicit Sunday remapping', async () => {
    const f = setup('new'); await f.editor.ionViewWillEnter();
    f.editor.kind = 'weekly'; f.editor.time = '08:05'; f.editor.weekdays = 0;
    f.editor.toggleDay(0, true); f.editor.toggleDay(6, true); f.editor.utcOffsetMinutes = 480;
    expect(f.editor.definition().schedule).toEqual({ kind: 'weekly', minuteOfDay: 485, weekdays: 65, utcOffsetMinutes: 480 });
    expect(f.editor.daySelected(1)).toBe(false);
    f.editor.time = '25:00'; expect(() => f.editor.definition()).toThrow();
  });
  it('preserves once UTC and weekly fixed offset through editing, and deletion leaves the sole read to the list', async () => {
    const f = setup();
    const utcMillis = Date.now() + 86400000;
    f.timer.records[0].definition.schedule = { kind: 'once', utcMillis };
    await f.editor.ionViewWillEnter(); expect(f.editor.definition().schedule).toEqual({ kind: 'once', utcMillis });
    const weekly = { kind: 'weekly' as const, minuteOfDay: 321, weekdays: 4, utcOffsetMinutes: -420 };
    f.timer.records[0].definition.schedule = weekly;
    f.editor.loadForm(); expect(f.editor.definition().schedule).toEqual(weekly);
    f.timer.write.mockImplementationOnce(async () => { f.timer.ready = false; return true; });
    await f.editor.deleteTask();
    expect(f.timer.write).toHaveBeenCalledExactlyOnceWith({ operation: 'remove', expectedRevision: 2, taskId: 7 }, false);
    expect(f.nav.navigateBack).toHaveBeenCalledExactlyOnceWith('/device-manager/device_a/timer');
  });
  it('blocks missing catalog targets and invalid numeric/date inputs rather than guessing switch actions', async () => {
    const f = setup('new'); await f.editor.ionViewWillEnter(); f.editor.selectTarget('unknown'); expect(f.editor.canSave).toBe(false);
    f.editor.selectTarget('level'); expect(() => f.editor.definition()).toThrow();
    f.editor.value = '12'; expect(f.editor.definition().value).toBe(12);
    f.editor.kind = 'once'; f.editor.dateTime = 'not-date'; expect(() => f.editor.definition()).toThrow();
    f.editor.dateTime = '2000-01-01T00:00'; expect(() => f.editor.definition()).toThrow();
    expect(() => taskValue({ key: 'a', valueType: 'boolean' }, 'false')).toThrow();
    f.editor.kind = 'countdown'; f.editor.seconds = 0;
    await f.editor.save(); expect(f.timer.write).not.toHaveBeenCalled(); expect(f.timer.ready).toBe(true);
    f.editor.seconds = 3; f.editor.value = '-1'; await f.editor.save(); expect(f.timer.write).not.toHaveBeenCalled();
  });
  it('enable does not mean Start; Start is explicit and rejects active/claimed countdowns', async () => {
    const f = setup(); f.list.ionViewWillEnter();
    await f.list.change(record, 'enable');
    expect(f.timer.write).toHaveBeenLastCalledWith({ operation: 'enable', expectedRevision: 2, taskId: 7, enabled: false });
    expect(record.definition.enabled).toBe(true);
    await f.list.change(record, 'start'); expect(f.timer.write).toHaveBeenLastCalledWith({ operation: 'start', expectedRevision: 2, taskId: 7 });
    await f.list.change({ ...record, progress: 1 }, 'start'); await f.list.change({ ...record, progress: 2 }, 'start');
    expect(f.timer.write).toHaveBeenCalledTimes(2);
  });
  it('confirmation cancellation or changed view cannot perform deletion/start/initialize', async () => {
    const f = setup(); await f.editor.ionViewWillEnter();
    f.dismissal.mockResolvedValueOnce({ role: 'cancel' }); await f.editor.deleteTask(); expect(f.timer.write).not.toHaveBeenCalled();
    f.dismissal.mockImplementationOnce(async () => { f.timer.generation++; return { role: 'confirm' }; });
    await f.list.change(record, 'start'); expect(f.timer.write).not.toHaveBeenCalled();
    f.timer.canInitialize = true;
    const status = new TaskStatusComponent(f.alerts as any); status.timer = f.timer as any;
    f.dismissal.mockImplementationOnce(async () => { f.timer.generation++; return { role: 'confirm' }; });
    await status.initialize(); expect(f.timer.write).not.toHaveBeenCalled();
  });
  it('pending panel requires review and confirmation and keeps intent unchanged on cancelled retry', async () => {
    const f = setup(), status = new TaskStatusComponent(f.alerts as any); status.timer = f.timer as any;
    f.timer.pending = { operation: 'start', requestId: 'original' };
    f.timer.journal = { pending: f.timer.pending, held: false };
    await status.forget(); expect(f.alerts.create).not.toHaveBeenCalled();
    f.timer.canReviewPending = true;
    f.dismissal.mockResolvedValueOnce({ role: 'cancel' }); await status.retry(); expect(f.timer.retry).not.toHaveBeenCalled();
    expect(f.alerts.create).toHaveBeenLastCalledWith(expect.objectContaining({
      message: expect.stringContaining('如果原操作尚未执行，这次可能执行'),
    }));
    expect(taskErrorText({ code: 'TASK_OUTCOME_UNKNOWN' })).toContain('不是只读查询');
    await status.forget(); expect(f.timer.forget).toHaveBeenCalledWith(f.timer.journal);
  });
  it('Manifest hints cannot introduce any extra scheduling target; progress is not physical output proof', () => {
    const manifest = { revision: 1, fingerprint: 'a'.repeat(64), fields: [
      { id: 1, key: 'level', kind: 0, type: 2, access: 3, constraints: { maximum: 10 } },
      { id: 2, key: 'other', kind: 0, type: 0, access: 3 }] };
    const catalog = { capacity: 4, fingerprint: 'test', targets: [{ key: 'level', valueType: 'uint' as const }] };
    expect(taskTargets(catalog, manifest)).toEqual([{ key: 'level', valueType: 'uint', constraints: { maximum: 10 } }]);
    expect(taskProgressText({ ...record, progress: 2 })).toContain('未知');
    expect(taskScheduleText({ ...record, definition: { ...record.definition,
      schedule: { kind: 'weekly', weekdays: 1, minuteOfDay: 485, utcOffsetMinutes: -210 } } })).toBe('08:05 周一 UTC-3:30');
  });
  it('explains preserved intents and rejects a stale sync confirmation or held write retry', async () => {
    const f = setup(), status = new TaskStatusComponent(f.alerts as any); status.timer = f.timer as any;
    f.timer.canInitialize = true; f.timer.pending = { operation: 'start', requestId: 'old' };
    f.timer.journal = { pending: f.timer.pending, held: false };
    f.dismissal.mockImplementationOnce(async () => {
      f.timer.journal = { ...f.timer.journal, held: true, authority: { operation: 'initialize', requestId: 'sync' } };
      return { role: 'confirm' };
    });
    await status.initialize(); expect(f.timer.write).not.toHaveBeenCalled();
    expect(f.alerts.create).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('保留并暂停重提') }));
    f.timer.canRetry = false; await status.retry(); expect(f.timer.retry).not.toHaveBeenCalled();
    await status.initialize(); expect(f.timer.write).toHaveBeenCalledExactlyOnceWith({ operation: 'initialize' });
  });
});
