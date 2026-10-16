import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { DeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { DeviceTaskClient, HttpTaskApi, TaskPendingState } from '../../../core/device-v2/tasks/client';
import { IndexedDbIntentStorage } from '../../../core/device-v2/intent-storage';
import { TaskIntent, TaskRecord, TaskResponse } from '../../../core/device-v2/tasks/contract';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ManifestCache } from '../../../core/services/device-v2-manifest-cache.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { capabilityBooleanLabel, capabilityDisplayName, deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { TaskTarget, taskEntryState, taskErrorCode, taskErrorText, taskTargets } from './device-timer.models';

function context(data: DataService): DeviceV2AccountContext {
  if (!data.auth?.uuid) throw new Error('TASK_ACCOUNT_CHANGED');
  return { authority: API.BASE_URL, accountId: data.auth.uuid, sessionEpoch: data.sessionEpoch };
}
// One client per app, page state per view. Ionic may retain both list and editor.
export const TASK_CLIENT = new InjectionToken<DeviceTaskClient>('task client', {
  providedIn: 'root', factory: () => {
    const data = inject(DataService);
    return new DeviceTaskClient(new HttpTaskApi(inject(HttpClient)),
      new IndexedDbIntentStorage('blinker-device-tasks', 'TASK_JOURNAL_UNAVAILABLE'), () => context(data));
  },
});
type Mutation = Exclude<TaskIntent, { operation: 'read' | 'catalog' }>;
type TaskPhase = 'idle' | 'submitting' | 'confirming' | 'confirmed' | 'refreshing';
interface TaskTimings {
  submissionMs: number | null; dispatchWaitMs: number | null; confirmationMs: number | null;
  refreshMs: number | null; evidence: 'fresh' | 'historical' | null;
}
const emptyTimings = (): TaskTimings => ({ submissionMs: null, dispatchWaitMs: null,
  confirmationMs: null, refreshMs: null, evidence: null });

@Injectable()
export class TimerService implements OnDestroy {
  // Ionic lifecycle and storage/HTTP completions can run outside an Angular
  // template event. Signal-backed accessors notify every consuming page/status
  // view without injecting a view's ChangeDetectorRef into this service.
  private readonly state = signal({ id: '', busy: false, ready: false, error: '', notice: '',
    phase: 'idle' as TaskPhase, timings: emptyTimings(),
    capacity: null as number | null, revision: 0, records: [] as TaskRecord[], targets: [] as TaskTarget[], journal: { held: false } as TaskPendingState });
  get id(): string { return this.state().id; }
  set id(value: string) { this.state.update(s => ({ ...s, id: value })); }
  get busy(): boolean { return this.state().busy; }
  set busy(value: boolean) { this.state.update(s => ({ ...s, busy: value })); }
  get ready(): boolean { return this.state().ready; }
  set ready(value: boolean) { this.state.update(s => ({ ...s, ready: value })); }
  get error(): string { return this.state().error; }
  set error(value: string) { this.state.update(s => ({ ...s, error: value })); }
  get notice(): string { return this.state().notice; }
  set notice(value: string) { this.state.update(s => ({ ...s, notice: value })); }
  get capacity(): number | null { return this.state().capacity; }
  set capacity(value: number | null) { this.state.update(s => ({ ...s, capacity: value })); }
  get revision(): number { return this.state().revision; }
  set revision(value: number) { this.state.update(s => ({ ...s, revision: value })); }
  get records(): TaskRecord[] { return this.state().records; }
  set records(value: TaskRecord[]) { this.state.update(s => ({ ...s, records: value })); }
  get targets(): TaskTarget[] { return this.state().targets; }
  set targets(value: TaskTarget[]) { this.state.update(s => ({ ...s, targets: value })); }
  get journal(): TaskPendingState { return this.state().journal; }
  private set journal(value: TaskPendingState) { this.state.update(s => ({ ...s, journal: value })); }
  get pending() { return this.journal.pending; }
  get phase(): TaskPhase { return this.state().phase; }
  private set phase(value: TaskPhase) { this.state.update(s => ({ ...s, phase: value })); }
  get timings(): Readonly<TaskTimings> { return this.state().timings; }
  private set timings(value: TaskTimings) { this.state.update(s => ({ ...s, timings: value })); }
  get statusText(): string {
    switch (this.phase) {
      case 'submitting': return '正在准备提交任务请求…';
      case 'confirming': return '请求已提交，等待设备确认…';
      case 'confirmed': return this.timings.evidence === 'historical' ? '已收到历史确认，正在整理请求记录…' : '设备已确认，正在整理请求记录…';
      case 'refreshing': return '正在更新任务目录与列表；不会重复下发已确认的操作…';
      default: return this.busy ? '正在更新本地请求记录…' : '';
    }
  }
  get timingText(): string {
    const t = this.timings, parts: string[] = [];
    const confirmation = t.evidence === 'historical' ? '历史确认' : '设备确认';
    if (t.dispatchWaitMs !== null) parts.push(`提交准备 ${Math.round(t.dispatchWaitMs)} ms`);
    if (t.confirmationMs !== null) parts.push(`HTTP开始至${confirmation} ${Math.round(t.confirmationMs)} ms`);
    else if (t.submissionMs !== null) parts.push(`提交至${t.evidence ? confirmation : '本次请求结束'} ${Math.round(t.submissionMs)} ms`);
    if (t.refreshMs !== null) parts.push(`列表读取 ${Math.round(t.refreshMs)} ms`);
    return parts.join('；');
  }
  private controller?: AbortController;
  private resumeId?: string;
  private account?: DeviceV2AccountContext;
  private readonly subscription: Subscription;
  private viewGeneration = 0;
  get generation(): number { return this.viewGeneration; }
  constructor(@Inject(TASK_CLIENT) private readonly client: DeviceTaskClient,
    private readonly data: DataService, private readonly manifests: DeviceV2ManifestCache,
    @Inject(AppVisibilityService) private readonly visibility: AppVisibilityService | null = null) {
    this.subscription = data.authDataChanged.subscribe(() => {
      if (this.account && (data.auth?.uuid !== this.account.accountId || data.sessionEpoch !== this.account.sessionEpoch)) {
        this.close(); this.error = taskErrorText(new Error('TASK_ACCOUNT_CHANGED'));
      }
    });
    if (visibility) this.subscription.add(visibility.active.subscribe(active => {
      if (!active && this.controller) {
        const id = this.id; this.close(); this.resumeId = id;
      } else if (active && this.resumeId) {
        const id = this.resumeId; this.resumeId = undefined;
        void this.open(id); // Read only. Never resume/retry an unresolved write.
      }
    }));
  }
  get deviceName(): string { return deviceDisplayName(this.data.device?.dict?.[this.id]); }
  targetLabel(key: string, valueType?: TaskRecord['definition']['valueType']): string {
    const field = this.displayField(key, valueType);
    return field ? capabilityDisplayName(this.data.device?.dict?.[this.id], field) : key;
  }
  valueLabel(key: string, value: unknown, valueType?: TaskRecord['definition']['valueType']): string {
    const field = this.displayField(key, valueType);
    return field?.type === 0 && typeof value === 'boolean'
      ? capabilityBooleanLabel(this.data.device?.dict?.[this.id], field, value)
      : typeof value === 'boolean' ? value ? '开' : '关' : String(value);
  }
  private displayField(key: string, valueType?: TaskRecord['definition']['valueType']) {
    const expected = valueType ?? this.targets.find(target => target.key === key)?.valueType;
    const types = ['boolean', 'int', 'uint', 'float32', 'float64'];
    return expected && this.manifests.load(this.id)?.fields.find(field => field.key === key
      && field.kind === 0 && types[field.type] === expected);
  }
  private get foreground(): boolean { return this.visibility?.active.value ?? true; }
  get canWrite(): boolean { return this.foreground && this.ready && !this.busy && !this.pending; }
  get canCreate(): boolean {
    return this.canWrite && this.targets.length > 0 && this.capacity !== null && this.records.length < this.capacity;
  }
  get capacityText(): string {
    return this.ready && this.capacity !== null ? `已用 ${this.records.length} / ${this.capacity} 条` : '容量尚未确认';
  }
  get creationHint(): string {
    if (this.busy) return '正在查询或确认任务，请稍候。';
    if (this.pending) return '有未确认的管理操作，请先查询并核对原请求。';
    if (!this.ready || this.capacity === null) return '容量尚未确认，请先查询设备的定时能力和当前任务。';
    if (!this.targets.length) return '固件未提供可用于定时的属性，请检查设备代码。';
    if (this.records.length >= this.capacity) return '任务容量已满；仍可编辑、停用或删除已有任务。';
    return '';
  }
  get sourceText(): string { return '设备本地执行，通过云端查询和管理；查询与管理需要设备云端连接。'; }
  get canInitialize(): boolean {
    return this.foreground && !this.busy && !!this.controller && !this.recoveryUnsupported
      && (!!this.journal.authority || ['TASK_SCOPE_REQUIRED', 'TASK_AUTHORITY_REQUIRED'].includes(this.lastCode));
  }
  get canRetry(): boolean { return !!this.pending && !this.busy && !this.journal.held && !this.canInitialize && !this.recoveryUnsupported; }
  private get recoveryUnsupported(): boolean { return this.lastCode === 'TASK_AUTHORITY_RECOVERY_UNSUPPORTED'; }
  private lastCode = '';
  async open(id: string): Promise<void> {
    this.close(); this.id = id; this.notice = '';
    if (!this.foreground) { this.resumeId = id; return; }
    const generation = this.viewGeneration;
    try {
      this.account = context(this.data);
      if (!taskEntryState(this.data.device?.dict?.[id]).available) throw new Error('TASK_PAGE_UNAVAILABLE');
      const controller = this.controller = new AbortController();
      this.busy = true;
      const journal = await this.client.inspect(id); this.assertCurrent(controller);
      this.journal = journal; this.busy = false;
      await this.refresh();
    } catch (error) { if (generation === this.viewGeneration) { this.busy = false; this.fail(error); } }
  }
  close(): void {
    ++this.viewGeneration;
    this.resumeId = undefined;
    this.controller?.abort(); this.controller = undefined;
    this.clearTable(); this.busy = false;
    this.phase = 'idle'; this.timings = emptyTimings(); this.notice = '';
    this.journal = { held: false };
    this.lastCode = '';
  }
  private clearTable(): void {
    this.state.update(s => ({ ...s, ready: false, capacity: null, revision: 0, records: [], targets: [] }));
  }
  ngOnDestroy(): void { this.close(); this.subscription.unsubscribe(); }
  async refresh(): Promise<void> {
    if (this.busy || !this.foreground) return;
    if (!this.controller) { if (this.id) await this.open(this.id); return; }
    const controller = this.controller, started = performance.now();
    this.busy = true; this.phase = 'refreshing'; this.clearTable(); this.error = ''; this.lastCode = '';
    this.timings = { ...this.timings, refreshMs: null };
    try {
      const { catalog, table } = await this.client.snapshot(this.id, controller.signal);
      const journal = await this.client.inspect(this.id);
      this.assertCurrent(controller);
      if (table.records.length > catalog.capacity) throw new Error('TASK_CONTRACT_INVALID');
      this.targets = taskTargets(catalog, this.manifests.load(this.id));
      this.capacity = catalog.capacity; this.revision = table.revision; this.records = table.records;
      this.journal = journal; this.ready = true;
    } catch (error) { if (this.controller === controller) this.fail(error); }
    finally {
      if (this.controller === controller) {
        this.timings = { ...this.timings, refreshMs: Math.max(0, performance.now() - started) };
        this.busy = false; this.phase = 'idle';
      }
    }
  }
  async write(intent: Mutation, refreshAfter = true): Promise<boolean> {
    if (intent.operation === 'initialize' ? !this.canInitialize : !this.canWrite) return false;
    if (intent.operation === 'create' && !this.canCreate) return false;
    if ('expectedRevision' in intent && intent.expectedRevision !== this.revision) throw new Error('TASK_TABLE_CHANGED');
    if ('definition' in intent && !this.targets.some(t => t.key === intent.definition.key && t.valueType === intent.definition.valueType))
      throw new Error('TASK_TARGET_UNAVAILABLE');
    const expected = this.journal;
    const authorityRecovery = intent.operation === 'initialize' && !!expected.pending;
    return this.mutate((signal, onDispatch) => authorityRecovery
      ? this.client.synchronizeAuthority(this.id, expected, signal, onDispatch)
      : this.client.submit(this.id, intent, signal, onDispatch), refreshAfter, authorityRecovery);
  }
  async retry(): Promise<boolean> {
    if (!this.canRetry) return false;
    return this.mutate((signal, onDispatch) => this.client.retry(this.id, signal, onDispatch));
  }
  // UI must first show the fresh table and explicitly explain that this is NOT
  // a device cancellation. Exact request comparison prevents clearing a new intent.
  async forget(expected: TaskPendingState): Promise<void> {
    if (!this.canReviewPending) throw new Error('TASK_TABLE_UNAVAILABLE');
    const controller = this.controller!; this.assertCurrent(controller); this.busy = true;
    try {
      await this.client.forgetPending(this.id, expected); this.assertCurrent(controller); this.journal = { held: false };
      this.notice = '仅停止追踪原请求；设备上可能已安装/执行的任务没有被取消。';
    } finally { if (this.controller === controller) this.busy = false; }
  }
  get canReviewPending(): boolean { return this.ready && !!this.pending && !this.busy; }
  private async mutate(send: (signal: AbortSignal, onDispatch: () => void) => Promise<TaskResponse>, refreshAfter = true, authorityRecovery = false): Promise<boolean> {
    const controller = this.controller; if (!controller) return false;
    const started = performance.now(); let dispatched: number | undefined;
    this.busy = true; this.phase = 'submitting'; this.timings = emptyTimings();
    this.clearTable(); this.error = ''; this.notice = ''; let confirmed = false;
    try {
      const response = await send(controller.signal, () => {
        if (this.controller !== controller || controller.signal.aborted || confirmed || dispatched !== undefined) return;
        dispatched = performance.now(); this.phase = 'confirming';
        this.timings = { ...this.timings, dispatchWaitMs: Math.max(0, dispatched - started) };
      });
      this.assertCurrent(controller);
      confirmed = true;
      const now = performance.now();
      this.timings = { ...this.timings, submissionMs: Math.max(0, now - started),
        confirmationMs: dispatched === undefined ? null : Math.max(0, now - dispatched), evidence: response.evidence };
      this.phase = 'confirmed';
      this.notice = authorityRecovery
        ? (response.evidence === 'historical' ? '授权同步已有历史确认；原操作仍需核对，不会自动重提。'
          : '设备已确认授权同步；原操作仍需核对，不会自动重提。')
        : response.evidence === 'historical' ? '原请求已有历史确认；仍需新鲜查询核对当前任务。'
          : '设备已确认本次管理操作；不代表到期动作或物理输出已完成。';
    } catch (error) { if (this.controller === controller) this.fail(error); }
    finally {
      if (this.controller === controller) {
        try {
          const journal = await this.client.inspect(this.id);
          if (this.controller === controller) this.journal = journal;
        } catch (error) { if (this.controller === controller) this.fail(error); }
        if (this.controller === controller) {
          if (!confirmed) this.timings = { ...this.timings, submissionMs: Math.max(0, performance.now() - started) };
          this.busy = false; this.phase = 'idle';
        }
      }
    }
    // An editor returning to the list leaves the fresh read to that view. Do
    // not read the entire catalog/table twice or mark this stale view ready.
    // Confirmation is complete before this read. Its eventual failure cannot
    // turn the confirmed mutation into an unknown write or delay feedback.
    if (confirmed && refreshAfter && this.controller === controller && this.foreground) void this.refresh();
    return confirmed && this.controller === controller;
  }
  private assertCurrent(controller: AbortController): void {
    controller.signal.throwIfAborted();
    if (this.controller !== controller || this.account?.accountId !== this.data.auth?.uuid
      || this.account.sessionEpoch !== this.data.sessionEpoch) throw new Error('TASK_ACCOUNT_CHANGED');
  }
  private fail(error: unknown): void {
    this.clearTable();
    this.lastCode = taskErrorCode(error); this.error = taskErrorText(error);
  }
}
