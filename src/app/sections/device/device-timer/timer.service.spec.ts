import '@angular/compiler';
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { DeviceTaskClient, TaskApi } from '../../../core/device-v2/tasks/client';
import { TaskRecord, TaskRequest, TaskResponse } from '../../../core/device-v2/tasks/contract';
import { base64UrlEncode } from '../../../core/device-v2/base64url';
import { TimerService } from './timer.service';
import { GatewayHttpError } from '../../../core/model/response.model';

const id = 'device_task';
@Component({ selector: 'task-view-child', template: '{{ timer.pending?.operation }} {{ timer.error }}' })
class TaskViewChild { @Input({ required: true }) timer!: TimerService; }
@Component({ imports: [TaskViewChild], template: '{{ timer.deviceName }} {{ timer.ready }} {{ timer.records.length }} <task-view-child [timer]="timer" />' })
class TaskViewProbe { timer!: TimerService; }
function fixture({ capacity = 4, targetCount = 1 } = {}) {
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    device: { dict: { [id]: { config: { mode: 'bbp2', customName: 'test' } } } } };
  const records: TaskRecord[] = [];
  let revision = 0, initialized = true, serial = 1;
  const storage = new Map<string, string>();
  const execute = vi.fn<TaskApi['execute']>(async (_, request) => {
    const result: TaskResponse = { contract: 'device-tasks/1', logicalDeviceId: id, requestId: request.requestId,
      state: 'verified', evidence: 'fresh', result: null };
    if (request.operation === 'initialize') { initialized = true; result.result = { kind: 'authority', tableRevision: revision, count: records.length }; }
    else if (!initialized) throw new GatewayHttpError({ code: 'TASK_SCOPE_REQUIRED', httpStatus: 409, message: 'Task request failed' });
    else if (request.operation === 'catalog') {
      const meta = { capacity, total: targetCount, fingerprint: base64UrlEncode(new Uint8Array(32).fill(8)), tableRevision: revision, count: records.length };
      result.result = request.index === null ? { kind: 'catalog', ...meta }
        : { kind: 'target', ...meta, index: request.index, key: 'power', valueType: 'boolean' };
    } else if (request.operation === 'read') {
      result.result = request.index === null ? { kind: 'metadata', tableRevision: revision, count: records.length }
        : { kind: 'record', tableRevision: revision, count: records.length, index: request.index, record: records[request.index] };
    } else {
      revision++;
      if (request.operation === 'create') records.push({ taskId: 7, definitionRevision: revision,
        consumedUtcMillis: 0, progress: 0, startSequence: 0, definition: request.definition });
      result.result = { kind: 'mutation', tableRevision: revision, count: records.length,
        taskId: request.operation === 'create' ? 7 : request.taskId, replayed: false };
    }
    return result;
  });
  const client = new DeviceTaskClient({ execute }, {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); },
    removeItem: key => { storage.delete(key); },
  }, () => ({ authority: API.BASE_URL, accountId: data.auth.uuid, sessionEpoch: data.sessionEpoch }),
  () => new Uint8Array(16).fill(serial++));
  const manifests = { load: vi.fn(() => undefined) };
  const visibility = { active: new BehaviorSubject(true) };
  const page = () => new TimerService(client, data as any, manifests as any, visibility as any);
  return { data, records, storage, execute, client, page, manifests, visibility,
    setInitialized: (v: boolean) => { initialized = v; }, setRevision: (v: number) => { revision = v; } };
}
const definition = { schedule: { kind: 'countdown' as const, durationMillis: 3000 }, enabled: true,
  key: 'power', valueType: 'boolean' as const, value: false };

describe('V2 task page lifecycle and original intent', () => {
  it('returns confirmed before a deferred refresh and keeps stale revision unavailable for writes', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    const execute = f.execute.getMockImplementation()!;
    let finish!: () => void;
    f.execute.mockImplementation(async (device, request, signal, onDispatch) => {
      if (request.operation === 'catalog') return new Promise(resolve => {
        finish = () => { void execute(device, request, signal, onDispatch).then(resolve); };
      });
      return execute(device, request, signal, onDispatch);
    });
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(true);
    expect(page.notice).toContain('设备已确认本次管理操作');
    expect(page.phase).toBe('refreshing'); expect(page.busy).toBe(true); expect(page.ready).toBe(false);
    expect(page.revision).toBe(0); expect(page.canWrite).toBe(false); expect(page.pending).toBeUndefined();
    finish(); await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.records).toHaveLength(1); expect(page.revision).toBe(1); page.ngOnDestroy();
  });
  it('does not withdraw confirmation or replay a write when its later list read fails', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    const execute = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async (device, request, signal, onDispatch) => {
      if (request.operation === 'catalog') throw new Error('TASK_DEVICE_OFFLINE');
      return execute(device, request, signal, onDispatch);
    });
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(true);
    await vi.waitFor(() => expect(page.busy).toBe(false));
    expect(page.notice).toContain('设备已确认本次管理操作'); expect(page.error).toContain('云端连接');
    expect(page.ready).toBe(false); expect(page.capacity).toBeNull(); expect(page.records).toEqual([]);
    expect(page.pending).toBeUndefined(); expect(f.storage.size).toBe(0);
    expect(f.execute.mock.calls.filter(([, request]) => request.operation === 'create')).toHaveLength(1);
    page.ngOnDestroy();
  });
  it('separates local dispatch wait, verified confirmation and list read without inventing device RX time', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    const execute = f.execute.getMockImplementation()!; let now = 1000, finish!: () => void;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      f.execute.mockImplementation(async (device, request, signal, onDispatch) => {
        if (request.operation === 'create') { now = 1050; onDispatch?.(); now = 1200; }
        if (request.operation === 'catalog') return new Promise(resolve => {
          finish = () => { now = 1600; void execute(device, request, signal, onDispatch).then(resolve); };
        });
        return execute(device, request, signal, onDispatch);
      });
      expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(true);
      expect(page.timings).toMatchObject({ submissionMs: 200, dispatchWaitMs: 50, confirmationMs: 150,
        refreshMs: null, evidence: 'fresh' });
      expect(page.timingText).toContain('HTTP开始至设备确认 150 ms');
      expect(page.timingText).not.toContain('设备接收耗时');
      finish(); await vi.waitFor(() => expect(page.busy).toBe(false));
      expect(page.timings.refreshMs).toBe(400); expect(page.timingText).toContain('列表读取 400 ms');
    } finally { clock.mockRestore(); page.ngOnDestroy(); }
  });
  it('keeps historical confirmation distinct from a new device ACK', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.execute.mockImplementationOnce(async (_, request) => ({ contract: 'device-tasks/1', logicalDeviceId: id,
      requestId: request.requestId, state: 'verified', evidence: 'historical', result: null }));
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition }, false)).toBe(true);
    expect(page.timings.evidence).toBe('historical'); expect(page.timingText).toContain('历史确认');
    expect(page.notice).toContain('原请求已有历史确认'); expect(page.notice).not.toContain('设备已确认本次');
    expect(page.ready).toBe(false); page.ngOnDestroy();
  });
  it('saves target page reads after a write but still fetches changed progress at the same revision', async () => {
    const f = fixture(), page = f.page(); await page.open(id); f.execute.mockClear();
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(true);
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(f.execute.mock.calls.map(([, r]) => r.operation)).toEqual(['create', 'catalog', 'read']);
    expect(f.execute.mock.calls.flatMap(([, r]) => r.operation === 'catalog' ? [r.index] : [])).toEqual([null]);
    f.records[0].progress = 3; f.execute.mockClear(); await page.refresh();
    expect(page.revision).toBe(1); expect(page.records[0].progress).toBe(3);
    expect(f.execute.mock.calls.map(([, r]) => r.operation)).toEqual(['catalog', 'read']);
    page.ngOnDestroy();
  });
  it('keeps confirmation when the fresh row read fails, without replaying or publishing the old CAS', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    const execute = f.execute.getMockImplementation()!; f.execute.mockClear();
    f.execute.mockImplementation(async (device, request, signal, onDispatch) => {
      if (request.operation === 'read') throw new Error('TASK_DEVICE_OFFLINE');
      return execute(device, request, signal, onDispatch);
    });
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(true);
    await vi.waitFor(() => expect(page.busy).toBe(false));
    expect(page.notice).toContain('设备已确认本次管理操作'); expect(page.error).toContain('云端连接');
    expect(page.ready).toBe(false); expect(page.canWrite).toBe(false); expect(page.revision).toBe(0);
    expect(page.records).toEqual([]); expect(page.pending).toBeUndefined(); expect(f.storage.size).toBe(0);
    expect(f.execute.mock.calls.map(([, r]) => r.operation)).toEqual(['create', 'catalog', 'read']);
    page.ngOnDestroy();
  });
  it('rejects a table changed after its fresh catalog anchor and leaves recovery to an explicit query', async () => {
    const f = fixture(), page = f.page(); f.setRevision(1);
    f.records.push({ taskId: 7, definitionRevision: 1, consumedUtcMillis: 0,
      progress: 0, startSequence: 0, definition });
    await page.open(id); const execute = f.execute.getMockImplementation()!; f.execute.mockClear();
    f.execute.mockImplementation(async (device, request, signal, onDispatch) => {
      const result = await execute(device, request, signal, onDispatch);
      if (request.operation === 'catalog') f.setRevision(2);
      return result;
    });
    await page.refresh();
    expect(page.ready).toBe(false); expect(page.revision).toBe(0); expect(page.canWrite).toBe(false);
    expect(page.records).toEqual([]); expect(f.storage.size).toBe(0);
    expect(f.execute.mock.calls.map(([, r]) => r.operation)).toEqual(['catalog', 'read']);
    expect(f.execute.mock.calls[1][1]).toMatchObject({ expectedRevision: 1, index: 0 });
    f.execute.mockImplementation(execute); await page.refresh();
    expect(page.ready).toBe(true); expect(page.revision).toBe(2);
    await expect(page.write({ operation: 'start', taskId: 7, expectedRevision: 1 })).rejects.toThrow('TASK_TABLE_CHANGED');
    expect(f.execute.mock.calls.every(([, r]) => r.operation === 'catalog' || r.operation === 'read')).toBe(true);
    page.ngOnDestroy();
  });
  it('background cancellation preserves an uncertain write and resumes only fresh reads', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    const execute = f.execute.getMockImplementation()!; let finish!: () => void, observed!: AbortSignal;
    f.execute.mockImplementation(async (device, request, signal, onDispatch) => {
      if (request.operation === 'create') return new Promise(resolve => {
        observed = signal; finish = () => { void execute(device, request, signal, onDispatch).then(resolve); };
      });
      return execute(device, request, signal, onDispatch);
    });
    const work = page.write({ operation: 'create', expectedRevision: 0, definition });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    f.visibility.active.next(false); expect(observed.aborted).toBe(true);
    finish(); expect(await work).toBe(false); expect(page.ready).toBe(false); expect(page.notice).toBe('');
    expect(f.storage.size).toBe(1);
    f.visibility.active.next(true); await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.pending?.operation).toBe('create'); expect(page.canWrite).toBe(false);
    expect(f.execute.mock.calls.filter(([, r]) => r.operation === 'create')).toHaveLength(1);
    page.ngOnDestroy();
  });
  it('does not reopen an Ionic view that was left while the app was in background', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.visibility.active.next(false); page.close(); const calls = f.execute.mock.calls.length;
    f.visibility.active.next(true); await Promise.resolve();
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(page.ready).toBe(false);
    expect(page.phase).toBe('idle'); expect(page.timingText).toBe(''); page.ngOnDestroy();
  });
  it('uses compatible shared capability names/value labels without adding a scheduling target or changing definitions', async () => {
    const f = fixture(), page = f.page();
    Object.assign(f.data.device.dict[id], { displayMetadata: { logicalDeviceId: id, revision: 1, name: '客厅灯', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' },
      { key: 'unknown', kind: 0, type: 0, displayName: '不在调度目录' },
    ] } });
    f.manifests.load.mockReturnValue({ revision: 1, fingerprint: 'a'.repeat(64), fields: [
      { key: 'power', kind: 0, type: 0, id: 1, access: 7 } ] } as any);
    await page.open(id);
    expect(page.deviceName).toBe('客厅灯'); expect(page.targetLabel('power')).toBe('电源开关');
    expect(page.valueLabel('power', true)).toBe('亮'); expect(page.valueLabel('power', false)).toBe('灭');
    expect(page.targets.map(t => t.key)).toEqual(['power']);
    expect(page.targetLabel('unknown')).toBe('unknown');
    expect(page.targetLabel('power', 'uint')).toBe('power');
    expect(page.valueLabel('power', true, 'uint')).toBe('开');
    expect(definition.key).toBe('power'); expect(definition.value).toBe(false);
    for (const field of [{ key: 'power', kind: 1, type: 0, id: 1, access: 7 },
      { key: 'power', kind: 0, type: 2, id: 1, access: 7 }]) {
      f.manifests.load.mockReturnValue({ revision: 2, fingerprint: 'b'.repeat(64), fields: [field] } as any);
      expect(page.targetLabel('power')).toBe('power'); expect(page.valueLabel('power', true)).toBe('开');
      expect(page.targets.map(t => t.key)).toEqual(['power']);
    }
    f.manifests.load.mockReturnValue(undefined);
    expect(page.valueLabel('power', true)).toBe('开');
    page.ngOnDestroy();
  });
  it('preserves unconfirmed initialization across unsupported root recovery and reopening without retry or sync', async () => {
    for (const withAuthorityJournal of [false, true]) {
      const f = fixture(); f.setInitialized(false); const page = f.page(); await page.open(id);
      f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
      expect(await page.write({ operation: 'initialize' })).toBe(false);
      if (withAuthorityJournal) {
        await page.refresh();
        f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
        expect(await page.write({ operation: 'initialize' })).toBe(false);
        expect(page.journal.authority).toBeDefined();
      }
      const journal = page.journal, stored = [...f.storage];
      f.execute.mockRejectedValue(new GatewayHttpError({ code: 'TASK_AUTHORITY_RECOVERY_UNSUPPORTED',
        httpStatus: 409, message: 'Task request failed' }));
      for (const reopen of [false, true]) {
        if (reopen) { page.close(); await page.open(id); } else await page.refresh();
        expect(page.error).toContain('任务授权初始化或同步尚未确认'); expect(page.error).toContain('原请求与日志已保留');
        expect(page.ready).toBe(false); expect(page.canInitialize).toBe(false); expect(page.canRetry).toBe(false);
        expect(page.canWrite).toBe(false); expect(page.canReviewPending).toBe(false);
        const calls = f.execute.mock.calls.length;
        expect(await page.write({ operation: 'initialize' })).toBe(false);
        expect(await page.retry()).toBe(false); expect(f.execute).toHaveBeenCalledTimes(calls);
        expect(page.journal).toEqual(journal); expect([...f.storage]).toEqual(stored);
      }
      page.ngOnDestroy();
    }
  });
  it('keeps the original write and unknown sync held when another Key change makes recovery unsupported', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    const original = page.pending;
    f.execute.mockRejectedValueOnce(new Error('TASK_AUTHORITY_REQUIRED')); await page.refresh();
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    expect(await page.write({ operation: 'initialize' })).toBe(false);
    expect(page.journal.held).toBe(true); expect(page.journal.authority).toBeDefined();
    const journal = page.journal, stored = [...f.storage];
    f.execute.mockRejectedValue(new GatewayHttpError({ code: 'TASK_AUTHORITY_RECOVERY_UNSUPPORTED',
      httpStatus: 409, message: 'Task request failed' }));
    for (const reopen of [false, true]) {
      if (reopen) { page.close(); await page.open(id); } else await page.refresh();
      expect(page.error).toContain('初始化或同步尚未确认'); expect(page.notice).toBe('');
      expect(page.canInitialize).toBe(false); expect(page.canRetry).toBe(false); expect(page.canWrite).toBe(false);
      expect(page.pending).toEqual(original); expect(page.journal).toEqual(journal);
      const calls = f.execute.mock.calls.length;
      expect(await page.write({ operation: 'initialize' })).toBe(false); expect(await page.retry()).toBe(false);
      await expect(page.forget(journal)).rejects.toThrow('TASK_TABLE_UNAVAILABLE');
      expect(f.execute).toHaveBeenCalledTimes(calls); expect([...f.storage]).toEqual(stored);
    }
    page.ngOnDestroy();
  });
  it('shows a verified attempt restriction without clearing intent, reporting success or retrying', async () => {
    for (const reason of ['write-budget', 'start-cooldown']) {
      const f = fixture(), page = f.page(); await page.open(id);
      await page.write({ operation: 'create', expectedRevision: 0, definition });
      await vi.waitFor(() => expect(page.ready).toBe(true)); f.execute.mockClear();
      f.execute.mockImplementationOnce(async (_, request) => ({ contract: 'device-tasks/1', logicalDeviceId: id,
        requestId: request.requestId, state: 'rejected', evidence: 'fresh', result: {
          kind: 'rejection', tableRevision: 1, count: 1, reason } }) as unknown as TaskResponse);
      expect(await page.write({ operation: 'start', expectedRevision: 1, taskId: 7 })).toBe(false);
      expect(page.error).toContain(reason === 'write-budget' ? '写入额度不足' : '冷却期');
      expect(page.error).toContain('此前是否执行仍需核对'); expect(page.notice).toBe('');
      expect(page.pending?.operation).toBe('start'); expect(page.canWrite).toBe(false);
      expect(f.execute).toHaveBeenCalledTimes(1);
      const pending = page.pending; await page.refresh(); expect(page.pending).toEqual(pending);
      expect(page.canWrite).toBe(false); page.ngOnDestroy();
    }
  });
  it('renders async state in parent and unchanged-reference child without manual change detection', async () => {
    const f = fixture(), timer = f.page();
    TestBed.configureTestingModule({ imports: [TaskViewProbe] });
    const view = TestBed.createComponent(TaskViewProbe); view.componentInstance.timer = timer;
    view.autoDetectChanges(); await view.whenStable();
    expect(view.nativeElement.textContent).toContain('false 0');
    await timer.open(id); await view.whenStable();
    expect(view.nativeElement.textContent).toContain('test true 0');
    await timer.write({ operation: 'create', expectedRevision: 0, definition }); await view.whenStable();
    expect(view.nativeElement.textContent).toContain('true 1');
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await timer.write({ operation: 'start', expectedRevision: timer.revision, taskId: 7 }); await view.whenStable();
    expect(view.nativeElement.textContent).toContain('start');
    timer.ngOnDestroy(); view.destroy();
  });
  it('loads only authenticated catalog/table, creates without implicit Start, and re-reads stable task IDs', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    expect(page.ready).toBe(true); expect(page.capacity).toBe(4); expect(page.targets[0].key).toBe('power');
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(true);
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.records[0].taskId).toBe(7); expect(page.revision).toBe(1); expect(page.pending).toBeUndefined();
    expect(f.execute.mock.calls.filter(c => !['read', 'catalog'].includes(c[1].operation)).map(c => c[1].operation)).toEqual(['create']);
    page.ngOnDestroy();
  });
  it.each([1, 10])('shows actual %i-slot capacity only after a fresh catalog and table, without a fixed four-slot guess', async capacity => {
    const f = fixture({ capacity }), page = f.page();
    expect(page.capacity).toBeNull(); expect(page.capacityText).toBe('容量尚未确认');
    expect(page.canCreate).toBe(false); expect(page.creationHint).toContain('容量尚未确认');
    await page.open(id);
    expect(page.capacity).toBe(capacity); expect(page.capacityText).toBe(`已用 0 / ${capacity} 条`);
    expect(page.canCreate).toBe(true); expect(page.creationHint).toBe('');
    expect(page.sourceText).toContain('设备本地执行'); expect(page.sourceText).toContain('设备云端连接');
    expect(page.sourceText).not.toContain('授时');
    expect(f.execute.mock.calls.every(c => ['catalog', 'read'].includes(c[1].operation))).toBe(true);
    page.ngOnDestroy();
    expect(page.capacity).toBeNull(); expect(page.revision).toBe(0); expect(page.capacityText).toBe('容量尚未确认');
  });
  it('a valid capacity with no authorized targets is not a zero-slot profile and does not allow creating a task', async () => {
    const f = fixture({ capacity: 10, targetCount: 0 }), page = f.page(); await page.open(id);
    expect(page.ready).toBe(true); expect(page.capacity).toBe(10); expect(page.capacityText).toBe('已用 0 / 10 条');
    expect(page.canWrite).toBe(true); expect(page.canCreate).toBe(false); expect(page.creationHint).toContain('固件未提供');
    const calls = f.execute.mock.calls.length;
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(f.storage.size).toBe(0); page.ngOnDestroy();
  });
  it.each([1, 10])('blocks creation at the actual %i-slot limit while retaining edit/remove management', async capacity => {
    const f = fixture({ capacity }), page = f.page(); f.setRevision(1);
    for (let i = 0; i < capacity; ++i) f.records.push({ taskId: i + 1, definitionRevision: 1,
      consumedUtcMillis: 0, progress: 0, startSequence: 0, definition });
    await page.open(id);
    expect(page.capacityText).toBe(`已用 ${capacity} / ${capacity} 条`); expect(page.canWrite).toBe(true);
    expect(page.canCreate).toBe(false); expect(page.creationHint).toContain('容量已满');
    const calls = f.execute.mock.calls.length;
    expect(await page.write({ operation: 'create', expectedRevision: 1, definition })).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(f.storage.size).toBe(0); page.ngOnDestroy();
  });
  it('an invalid zero capacity or profile refusal stays unknown and cannot initialize on its own', async () => {
    for (const code of ['TASK_CONTRACT_INVALID', 'TASK_PROFILE_NOT_ADMITTED', 'TASK_UNAVAILABLE']) {
      const f = fixture({ capacity: 0 }), page = f.page();
      if (code !== 'TASK_CONTRACT_INVALID') f.execute.mockRejectedValueOnce(new Error(code));
      await page.open(id);
      expect(page.ready).toBe(false); expect(page.capacity).toBeNull(); expect(page.capacityText).toBe('容量尚未确认');
      expect(page.revision).toBe(0); expect(page.records).toEqual([]); expect(page.targets).toEqual([]);
      expect(page.canCreate).toBe(false); expect(page.canInitialize).toBe(false);
      expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['catalog']); page.ngOnDestroy();
    }
  });
  it('clears old table, targets, revision and capacity as soon as refresh starts and retains unknown state on failure', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.revision).toBe(1); expect(page.records).toHaveLength(1);
    let reject!: (error: unknown) => void;
    f.execute.mockImplementationOnce(async () => new Promise((_, r) => { reject = r; }));
    const work = page.refresh();
    expect(page.busy).toBe(true); expect(page.ready).toBe(false); expect(page.capacity).toBeNull();
    expect(page.revision).toBe(0); expect(page.records).toEqual([]); expect(page.targets).toEqual([]);
    expect(page.creationHint).toContain('正在查询');
    await vi.waitFor(() => expect(reject).toBeTypeOf('function')); reject(new Error('TASK_DEVICE_OFFLINE')); await work;
    expect(page.busy).toBe(false); expect(page.capacity).toBeNull(); expect(page.revision).toBe(0);
    expect(page.records).toEqual([]); expect(page.targets).toEqual([]); expect(page.canCreate).toBe(false);
    expect(page.capacityText).toBe('容量尚未确认'); expect(page.error).toContain('云端连接');
    page.ngOnDestroy();
  });
  it('an unknown mutation clears confirmed capacity/table but preserves its exact pending journal and creation block', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    await vi.waitFor(() => expect(page.ready).toBe(true));
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    expect(await page.write({ operation: 'start', expectedRevision: 1, taskId: 7 })).toBe(false);
    expect(page.capacity).toBeNull(); expect(page.revision).toBe(0); expect(page.records).toEqual([]); expect(page.targets).toEqual([]);
    expect(page.pending?.operation).toBe('start'); expect(page.pending && 'expectedRevision' in page.pending ? page.pending.expectedRevision : null).toBe(1);
    expect(page.creationHint).toContain('未确认'); expect(page.canCreate).toBe(false);
    expect(f.storage.size).toBe(1); page.ngOnDestroy();
  });
  it('closing a populated fresh table removes its revision/capacity rather than exposing an empty confirmed table', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.ready).toBe(true); expect(page.revision).toBe(1); expect(page.capacity).toBe(4); expect(page.records).toHaveLength(1);
    page.close(); expect(page.capacity).toBeNull(); expect(page.revision).toBe(0);
    expect(page.ready).toBe(false); expect(page.targets).toEqual([]); expect(page.records).toEqual([]);
    expect(page.capacityText).toBe('容量尚未确认'); expect(page.canWrite).toBe(false); expect(page.canCreate).toBe(false);
    page.ngOnDestroy();
  });
  it('never initializes merely by entering/refreshing; explicit initialization uses existing client', async () => {
    const f = fixture(); f.setInitialized(false); const page = f.page(); await page.open(id);
    expect(page.ready).toBe(false); expect(page.canInitialize).toBe(true);
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['catalog']);
    expect(await page.write({ operation: 'initialize' })).toBe(true);
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.ready).toBe(true); expect(page.canInitialize).toBe(false); page.ngOnDestroy();
  });
  it('requires explicit authority synchronization after a Key change instead of auto-rebinding on read', async () => {
    const f = fixture(), page = f.page();
    f.execute.mockRejectedValueOnce(Object.assign(new Error('TASK_AUTHORITY_REQUIRED'), { code: 'TASK_AUTHORITY_REQUIRED' }));
    await page.open(id);
    expect(page.ready).toBe(false); expect(page.canWrite).toBe(false); expect(page.canInitialize).toBe(true);
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['catalog']);
    expect(await page.write({ operation: 'initialize' })).toBe(true);
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.ready).toBe(true); expect(page.canInitialize).toBe(false);
    expect(f.execute.mock.calls.filter(c => c[1].operation === 'initialize')).toHaveLength(1);
    page.ngOnDestroy();
  });
  it('confirmed editor writes do not duplicate catalog/table reads or present stale data as ready', async () => {
    const f = fixture(), editor = f.page(); await editor.open(id); f.execute.mockClear();
    expect(await editor.write({ operation: 'create', expectedRevision: 0, definition }, false)).toBe(true);
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['create']);
    expect(editor.ready).toBe(false); expect(editor.pending).toBeUndefined(); expect(editor.canWrite).toBe(false);
    editor.close(); const list = f.page(); await list.open(id);
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['create', 'catalog', 'read']);
    expect(list.ready).toBe(true); expect(list.records[0].taskId).toBe(7);
    editor.ngOnDestroy(); list.ngOnDestroy();
  });
  it('Key rotation with an unknown write permits explicit sync but neither clears nor retries that write', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    const original = page.pending;
    f.execute.mockRejectedValueOnce(new Error('TASK_AUTHORITY_REQUIRED'));
    await page.refresh();
    expect(page.canInitialize).toBe(true); expect(page.canRetry).toBe(false); expect(page.canReviewPending).toBe(false);
    const calls = f.execute.mock.calls.length;
    expect(await page.retry()).toBe(false); expect(f.execute).toHaveBeenCalledTimes(calls);
    expect(await page.write({ operation: 'initialize' })).toBe(true);
    await vi.waitFor(() => expect(page.ready).toBe(true));
    expect(page.ready).toBe(true); expect(page.pending).toEqual(original); expect(page.journal.held).toBe(true);
    expect(page.notice).toBe('设备已确认授权同步；原操作仍需核对，不会自动重提。');
    expect(page.canWrite).toBe(false); expect(page.canRetry).toBe(false); expect(page.canReviewPending).toBe(true);
    expect(f.execute.mock.calls.slice(calls).map(c => c[1].operation)).toEqual(['initialize', 'catalog', 'catalog']);
    page.close(); await page.open(id);
    expect(page.canRetry).toBe(false); expect(page.pending).toEqual(original);
    await page.forget(page.journal); expect(page.canWrite).toBe(true); page.ngOnDestroy();
  });
  it('unknown sync survives reopening; only its original ID is resumed and original write remains held', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    const original = page.pending;
    f.execute.mockRejectedValueOnce(new Error('TASK_AUTHORITY_REQUIRED')); await page.refresh();
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    expect(await page.write({ operation: 'initialize' })).toBe(false);
    const authority = page.journal.authority;
    expect(authority).toBeDefined(); page.close(); await page.open(id);
    expect(page.canInitialize).toBe(true); expect(page.canRetry).toBe(false);
    const calls = f.execute.mock.calls.length;
    f.execute.mockImplementationOnce(async (_, request) => ({ contract: 'device-tasks/1', logicalDeviceId: id,
      requestId: request.requestId, state: 'verified', evidence: 'historical', result: null }));
    expect(await page.write({ operation: 'initialize' })).toBe(true);
    expect(f.execute.mock.calls[calls][1]).toEqual(authority);
    expect(page.notice).toBe('授权同步已有历史确认；原操作仍需核对，不会自动重提。');
    expect(page.pending).toEqual(original); expect(page.journal.authority).toBeUndefined();
    page.ngOnDestroy();
  });
  it('a fresh table may be reviewed without attributing a lost sync to successful execution', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    f.execute.mockRejectedValueOnce(new Error('TASK_AUTHORITY_REQUIRED')); await page.refresh();
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await page.write({ operation: 'initialize' });
    const expected = page.journal; await expect(page.forget(expected)).rejects.toThrow();
    await page.refresh(); expect(page.journal).toEqual(expected);
    const calls = f.execute.mock.calls.length;
    await page.forget(expected); expect(page.canWrite).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(f.storage.size).toBe(0); page.ngOnDestroy();
  });
  it('an unconfirmed editor write still stays pending and sends no follow-up read', async () => {
    const f = fixture(), editor = f.page(); await editor.open(id); f.execute.mockClear();
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    expect(await editor.write({ operation: 'create', expectedRevision: 0, definition }, false)).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(1); expect(editor.pending?.operation).toBe('create');
    expect(editor.ready).toBe(false); expect(editor.canWrite).toBe(false); editor.ngOnDestroy();
  });
  it('unknown write survives page close/reopen and fresh reads, retry uses exact original intent', async () => {
    const f = fixture(), first = f.page(); await first.open(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    expect(await first.write({ operation: 'create', expectedRevision: 0, definition })).toBe(false);
    const pending = first.pending; expect(pending?.operation).toBe('create');
    expect(first.canWrite).toBe(false); first.ngOnDestroy();
    const second = f.page(); await second.open(id);
    expect(second.pending).toEqual(pending); expect(second.canReviewPending).toBe(true);
    const count = f.execute.mock.calls.length;
    expect(await second.retry()).toBe(true);
    expect(f.execute.mock.calls[count][1]).toEqual(pending); expect(second.pending).toBeUndefined(); second.ngOnDestroy();
  });
  it('fresh table is required before explicit local forget, which sends no cancellation or new Start', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_HISTORY_EXPIRED'));
    await page.write({ operation: 'create', expectedRevision: 0, definition });
    const expected = page.journal; await expect(page.forget(expected)).rejects.toThrow();
    await page.refresh(); const calls = f.execute.mock.calls.length;
    await expect(page.forget({ ...expected, pending: { ...expected.pending!, requestId: base64UrlEncode(new Uint8Array(16).fill(99)) } })).rejects.toThrow();
    await page.forget(expected);
    expect(page.pending).toBeUndefined(); expect(f.execute).toHaveBeenCalledTimes(calls);
    expect(page.notice).toContain('没有被取消'); page.ngOnDestroy();
  });
  it('account epoch change cancels in-flight reads and removes old display but not its pending journal', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    let release!: (v: TaskResponse) => void;
    f.execute.mockImplementationOnce(async (_, request) => new Promise(resolve => {
      release = () => resolve({ contract: 'device-tasks/1', logicalDeviceId: id, requestId: request.requestId,
        state: 'verified', evidence: 'historical', result: null });
    }));
    const work = page.write({ operation: 'create', expectedRevision: 0, definition });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    f.data.sessionEpoch++; f.data.authDataChanged.next(); release({} as TaskResponse);
    expect(await work).toBe(false); expect(page.records).toEqual([]); expect(page.ready).toBe(false);
    expect(page.targets).toEqual([]); expect(page.capacity).toBeNull(); expect(page.revision).toBe(0);
    expect(page.pending).toBeUndefined(); expect(f.storage.size).toBe(1); page.ngOnDestroy();
  });
  it('page leave suppresses late refresh, while token refresh in the same epoch does not reset the page', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    f.data.authDataChanged.next(); expect(page.ready).toBe(true);
    let complete!: () => void;
    f.execute.mockImplementationOnce(async (_, request) => new Promise(resolve => {
      complete = () => resolve({ contract: 'device-tasks/1', logicalDeviceId: id, requestId: request.requestId,
        state: 'verified', evidence: 'historical', result: null });
    }));
    const work = page.refresh(); page.close(); complete(); await work;
    expect(page.ready).toBe(false); expect(page.records).toEqual([]); expect(page.busy).toBe(false); page.ngOnDestroy();
  });
  it('denies preview/shared/gateway/absent pages without any network request', async () => {
    for (const patch of [{ config: { mode: 'bbp2', isPreview: true } }, { config: { mode: 'bbp2', isShared: true } },
      { config: { mode: 'bbp2', disabled: true } }, { config: { mode: 'json' } },
      { config: { mode: 'bbp2' }, gatewayRouted: true }, { config: { mode: 'bbp2' }, deviceType: 'ble' },
      { config: { mode: 'bbp2' }, deviceType: 'edge-hub' }]) {
      const f = fixture(); Object.assign(f.data.device.dict[id], patch);
      const page = f.page(); await page.open(id); expect(page.ready).toBe(false); expect(f.execute).not.toHaveBeenCalled(); page.ngOnDestroy();
    }
    const f = fixture(), page = f.page(); await page.open('device_absent');
    expect(page.ready).toBe(false); expect(page.capacity).toBeNull(); expect(f.execute).not.toHaveBeenCalled(); page.ngOnDestroy();
  });
  it('refuses stale CAS and noncatalog target before journal/network I/O; readonly refresh failure is not an empty table', async () => {
    const f = fixture(), page = f.page(); await page.open(id); const calls = f.execute.mock.calls.length;
    await expect(page.write({ operation: 'create', expectedRevision: 10, definition })).rejects.toThrow('TASK_TABLE_CHANGED');
    await expect(page.write({ operation: 'create', expectedRevision: 0, definition: { ...definition, key: 'guess' } })).rejects.toThrow('TASK_TARGET_UNAVAILABLE');
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(f.storage.size).toBe(0);
    f.execute.mockRejectedValueOnce(new Error('offline')); await page.refresh();
    expect(page.ready).toBe(false); expect(page.canInitialize).toBe(false); expect(page.capacity).toBeNull();
    expect(page.revision).toBe(0); expect(page.records).toEqual([]); expect(page.targets).toEqual([]); page.ngOnDestroy();
  });
  it('storage failure blocks management rather than sending a request without a recoverable ID', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    vi.spyOn(f.storage, 'set').mockImplementationOnce(() => { throw new Error('quota'); });
    const calls = f.execute.mock.calls.length;
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(page.error).not.toBe(''); page.ngOnDestroy();
  });
});
