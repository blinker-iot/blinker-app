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
import { TaskTarget, taskErrorCode, taskErrorText, taskTargets } from './device-timer.models';

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

@Injectable()
export class TimerService implements OnDestroy {
  // Ionic lifecycle and storage/HTTP completions can run outside an Angular
  // template event. Signal-backed accessors notify every consuming page/status
  // view without injecting a view's ChangeDetectorRef into this service.
  private readonly state = signal({ id: '', busy: false, ready: false, error: '', notice: '',
    capacity: 0, revision: 0, records: [] as TaskRecord[], targets: [] as TaskTarget[], journal: { held: false } as TaskPendingState });
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
  get capacity(): number { return this.state().capacity; }
  set capacity(value: number) { this.state.update(s => ({ ...s, capacity: value })); }
  get revision(): number { return this.state().revision; }
  set revision(value: number) { this.state.update(s => ({ ...s, revision: value })); }
  get records(): TaskRecord[] { return this.state().records; }
  set records(value: TaskRecord[]) { this.state.update(s => ({ ...s, records: value })); }
  get targets(): TaskTarget[] { return this.state().targets; }
  set targets(value: TaskTarget[]) { this.state.update(s => ({ ...s, targets: value })); }
  get journal(): TaskPendingState { return this.state().journal; }
  private set journal(value: TaskPendingState) { this.state.update(s => ({ ...s, journal: value })); }
  get pending() { return this.journal.pending; }
  private controller?: AbortController;
  private account?: DeviceV2AccountContext;
  private readonly subscription: Subscription;
  private viewGeneration = 0;
  get generation(): number { return this.viewGeneration; }
  constructor(@Inject(TASK_CLIENT) private readonly client: DeviceTaskClient,
    private readonly data: DataService, private readonly manifests: DeviceV2ManifestCache) {
    this.subscription = data.authDataChanged.subscribe(() => {
      if (this.account && (data.auth?.uuid !== this.account.accountId || data.sessionEpoch !== this.account.sessionEpoch)) {
        this.close(); this.error = taskErrorText(new Error('TASK_ACCOUNT_CHANGED'));
      }
    });
  }
  get deviceName(): string { return this.data.device?.dict?.[this.id]?.config?.customName || '设备'; }
  get canWrite(): boolean { return this.ready && !this.busy && !this.pending; }
  get canInitialize(): boolean {
    return !this.busy && !!this.controller && !this.recoveryUnsupported
      && (!!this.journal.authority || ['TASK_SCOPE_REQUIRED', 'TASK_AUTHORITY_REQUIRED'].includes(this.lastCode));
  }
  get canRetry(): boolean { return !!this.pending && !this.busy && !this.journal.held && !this.canInitialize && !this.recoveryUnsupported; }
  private get recoveryUnsupported(): boolean { return this.lastCode === 'TASK_AUTHORITY_RECOVERY_UNSUPPORTED'; }
  private lastCode = '';
  async open(id: string): Promise<void> {
    this.close(); this.id = id; this.notice = '';
    const generation = this.viewGeneration;
    try {
      this.account = context(this.data);
      const device = this.data.device?.dict?.[id];
      if (!device || device.config?.isPreview || device.config?.isShared || device.config?.disabled
        || device.config?.mode !== 'bbp2' || device.deviceType === 'ble' || device.deviceType === 'edge-hub'
        || device.gatewayRouted) throw new Error('TASK_PAGE_UNAVAILABLE');
      const controller = this.controller = new AbortController();
      this.busy = true;
      const journal = await this.client.inspect(id); this.assertCurrent(controller);
      this.journal = journal; this.busy = false;
      await this.refresh();
    } catch (error) { if (generation === this.viewGeneration) { this.busy = false; this.fail(error); } }
  }
  close(): void {
    ++this.viewGeneration;
    this.controller?.abort(); this.controller = undefined;
    this.ready = false; this.busy = false; this.records = []; this.targets = []; this.capacity = 0;
    this.journal = { held: false };
    this.lastCode = '';
  }
  ngOnDestroy(): void { this.close(); this.subscription.unsubscribe(); }
  async refresh(): Promise<void> {
    if (this.busy) return;
    if (!this.controller) { if (this.id) await this.open(this.id); return; }
    const controller = this.controller; this.busy = true; this.ready = false; this.error = ''; this.lastCode = '';
    try {
      const catalog = await this.client.catalog(this.id, controller.signal);
      const table = await this.client.table(this.id, controller.signal);
      const journal = await this.client.inspect(this.id);
      this.assertCurrent(controller);
      if (table.records.length > catalog.capacity) throw new Error('TASK_CONTRACT_INVALID');
      this.targets = taskTargets(catalog, this.manifests.load(this.id));
      this.capacity = catalog.capacity; this.revision = table.revision; this.records = table.records;
      this.journal = journal; this.ready = true;
    } catch (error) { if (this.controller === controller) { this.records = []; this.targets = []; this.fail(error); } }
    finally { if (this.controller === controller) this.busy = false; }
  }
  async write(intent: Mutation, refreshAfter = true): Promise<boolean> {
    if (intent.operation === 'initialize' ? !this.canInitialize : !this.canWrite) return false;
    if ('expectedRevision' in intent && intent.expectedRevision !== this.revision) throw new Error('TASK_TABLE_CHANGED');
    if ('definition' in intent && !this.targets.some(t => t.key === intent.definition.key && t.valueType === intent.definition.valueType))
      throw new Error('TASK_TARGET_UNAVAILABLE');
    const expected = this.journal;
    const authorityRecovery = intent.operation === 'initialize' && !!expected.pending;
    return this.mutate(signal => authorityRecovery
      ? this.client.synchronizeAuthority(this.id, expected, signal)
      : this.client.submit(this.id, intent, signal), refreshAfter, authorityRecovery);
  }
  async retry(): Promise<boolean> {
    if (!this.canRetry) return false;
    return this.mutate(signal => this.client.retry(this.id, signal));
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
  private async mutate(send: (signal: AbortSignal) => Promise<TaskResponse>, refreshAfter = true, authorityRecovery = false): Promise<boolean> {
    const controller = this.controller; if (!controller) return false;
    this.busy = true; this.ready = false; this.error = ''; this.notice = ''; let confirmed = false;
    try {
      const response = await send(controller.signal); this.assertCurrent(controller);
      confirmed = true;
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
        if (this.controller === controller) this.busy = false;
      }
    }
    // An editor returning to the list leaves the fresh read to that view. Do
    // not read the entire catalog/table twice or mark this stale view ready.
    if (confirmed && refreshAfter && this.controller === controller) await this.refresh();
    return confirmed && this.controller === controller;
  }
  private assertCurrent(controller: AbortController): void {
    controller.signal.throwIfAborted();
    if (this.controller !== controller || this.account?.accountId !== this.data.auth?.uuid
      || this.account.sessionEpoch !== this.data.sessionEpoch) throw new Error('TASK_ACCOUNT_CHANGED');
  }
  private fail(error: unknown): void {
    this.lastCode = taskErrorCode(error); this.error = taskErrorText(error);
  }
}
