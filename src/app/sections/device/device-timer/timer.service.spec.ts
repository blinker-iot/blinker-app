import '@angular/compiler';
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
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
function fixture() {
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
      const meta = { capacity: 4, total: 1, fingerprint: base64UrlEncode(new Uint8Array(32).fill(8)), tableRevision: revision, count: records.length };
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
  const page = () => new TimerService(client, data as any, manifests as any);
  return { data, records, storage, execute, client, page, setInitialized: (v: boolean) => { initialized = v; } };
}
const definition = { schedule: { kind: 'countdown' as const, durationMillis: 3000 }, enabled: true,
  key: 'power', valueType: 'boolean' as const, value: false };

describe('V2 task page lifecycle and original intent', () => {
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
      await page.write({ operation: 'create', expectedRevision: 0, definition }); f.execute.mockClear();
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
    expect(page.records[0].taskId).toBe(7); expect(page.revision).toBe(1); expect(page.pending).toBeUndefined();
    expect(f.execute.mock.calls.filter(c => !['read', 'catalog'].includes(c[1].operation)).map(c => c[1].operation)).toEqual(['create']);
    page.ngOnDestroy();
  });
  it('never initializes merely by entering/refreshing; explicit initialization uses existing client', async () => {
    const f = fixture(); f.setInitialized(false); const page = f.page(); await page.open(id);
    expect(page.ready).toBe(false); expect(page.canInitialize).toBe(true);
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['catalog']);
    expect(await page.write({ operation: 'initialize' })).toBe(true);
    expect(page.ready).toBe(true); expect(page.canInitialize).toBe(false); page.ngOnDestroy();
  });
  it('requires explicit authority synchronization after a Key change instead of auto-rebinding on read', async () => {
    const f = fixture(), page = f.page();
    f.execute.mockRejectedValueOnce(Object.assign(new Error('TASK_AUTHORITY_REQUIRED'), { code: 'TASK_AUTHORITY_REQUIRED' }));
    await page.open(id);
    expect(page.ready).toBe(false); expect(page.canWrite).toBe(false); expect(page.canInitialize).toBe(true);
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['catalog']);
    expect(await page.write({ operation: 'initialize' })).toBe(true);
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
    expect(f.execute.mock.calls.map(c => c[1].operation)).toEqual(['create', 'catalog', 'catalog', 'read', 'read']);
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
    expect(page.ready).toBe(true); expect(page.pending).toEqual(original); expect(page.journal.held).toBe(true);
    expect(page.notice).toBe('设备已确认授权同步；原操作仍需核对，不会自动重提。');
    expect(page.canWrite).toBe(false); expect(page.canRetry).toBe(false); expect(page.canReviewPending).toBe(true);
    expect(f.execute.mock.calls.slice(calls).map(c => c[1].operation)).toEqual(['initialize', 'catalog', 'catalog', 'read']);
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
      { config: { mode: 'bbp2' }, gatewayRouted: true }, { config: { mode: 'bbp2' }, deviceType: 'ble' }]) {
      const f = fixture(); Object.assign(f.data.device.dict[id], patch);
      const page = f.page(); await page.open(id); expect(page.ready).toBe(false); expect(f.execute).not.toHaveBeenCalled(); page.ngOnDestroy();
    }
  });
  it('refuses stale CAS and noncatalog target before journal/network I/O; readonly refresh failure is not an empty table', async () => {
    const f = fixture(), page = f.page(); await page.open(id); const calls = f.execute.mock.calls.length;
    await expect(page.write({ operation: 'create', expectedRevision: 10, definition })).rejects.toThrow('TASK_TABLE_CHANGED');
    await expect(page.write({ operation: 'create', expectedRevision: 0, definition: { ...definition, key: 'guess' } })).rejects.toThrow('TASK_TARGET_UNAVAILABLE');
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(f.storage.size).toBe(0);
    f.execute.mockRejectedValueOnce(new Error('offline')); await page.refresh();
    expect(page.ready).toBe(false); expect(page.canInitialize).toBe(false); page.ngOnDestroy();
  });
  it('storage failure blocks management rather than sending a request without a recoverable ID', async () => {
    const f = fixture(), page = f.page(); await page.open(id);
    vi.spyOn(f.storage, 'set').mockImplementationOnce(() => { throw new Error('quota'); });
    const calls = f.execute.mock.calls.length;
    expect(await page.write({ operation: 'create', expectedRevision: 0, definition })).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(calls); expect(page.error).not.toBe(''); page.ngOnDestroy();
  });
});
