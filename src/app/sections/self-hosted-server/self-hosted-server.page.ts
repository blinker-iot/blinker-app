import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { GatewayHttpError } from '../../core/model/response.model';
import {
  MigrationCleanupPreview, MigrationEndpoint, MigrationPreview, MigrationTarget, MigrationTask,
  SelfHostedServerConfig, SelfHostedServerService,
} from '../../core/services/self-hosted-server.service';
import { DataService } from '../../core/services/data.service';
import { DeviceV2Service } from '../../core/services/device-v2.service';
import { HeroCardComponent } from '../../core/components/hero-card/hero-card.component';

const ERROR_MESSAGES: Record<string, string> = {
  SELF_HOSTED_SERVER_INVALID_INPUT: '请检查服务器地址和密钥',
  SELF_HOSTED_SERVER_INVALID_URL: '请输入有效的公网 HTTP 或 HTTPS 地址',
  SELF_HOSTED_SERVER_ADDRESS_FORBIDDEN: '服务器必须能通过公网访问',
  SELF_HOSTED_SERVER_KEY_REQUIRED: '首次保存或更换地址时需要填写密钥',
  SELF_HOSTED_SERVER_AUTH_FAILED: '服务器密钥验证失败，请检查密钥',
  SELF_HOSTED_SERVER_INCOMPATIBLE: '服务器版本或 Gateway 公钥配置不匹配',
  SELF_HOSTED_SERVER_UNAVAILABLE: '暂时无法连接服务器，请稍后重试',
  SELF_HOSTED_SERVER_TIMEOUT: '连接服务器超时，请稍后重试',
  SELF_HOSTED_SERVER_KEY_UNAVAILABLE: '服务端暂时无法读取已保存的密钥',
  SELF_HOSTED_SERVER_HAS_DEVICES: '设备或配置已变化，请重新检查迁移条件',
  UNSUPPORTED_TENANT_RELATIONS: '请先处理账户的设备分享关系',
  SELF_HOSTED_SERVER_BUSY: '服务正在处理其他操作，请稍后重试',
  SELF_HOSTED_SERVER_REVISION_CONFLICT: '配置已发生变化，请重新读取后重试',
  SELF_HOSTED_SERVER_TENANT_NOT_ACTIVE: '账户当前不可用，请稍后重试',
  SELF_HOSTED_SERVER_MIGRATION_PREVIEW_STALE: '设备或配置已变化，请重新检查后确认',
  SELF_HOSTED_SERVER_MIGRATION_NOT_REQUIRED: '当前无需迁移，请重新读取配置后重试',
  SELF_HOSTED_SERVER_MIGRATION_IDEMPOTENCY_CONFLICT: '本次请求已变化，请重新读取迁移进度',
  SELF_HOSTED_SERVER_MIGRATION_TARGET_NOT_EMPTY: '目标服务器已有本账户的数据，暂时无法迁入',
  SELF_HOSTED_SERVER_MIGRATION_PENDING_OPERATIONS: '设备操作尚未完成，或包含暂不支持迁移的数据，请稍后重试',
  SELF_HOSTED_SERVER_MIGRATION_BUNDLE_TOO_LARGE: '设备数据超过当前迁移大小上限',
  SELF_HOSTED_SERVER_MIGRATION_HTTPS_REQUIRED: '迁移设备数据需要新旧服务器都支持 HTTPS',
  SELF_HOSTED_SERVER_MIGRATION_UNAVAILABLE: '暂时无法迁移，请检查服务器版本、连接和可用资源',
  SELF_HOSTED_SERVER_MIGRATION_TIMEOUT: '迁移超时',
  SELF_HOSTED_SERVER_MIGRATION_VERIFY_FAILED: '迁移数据未通过校验',
  SELF_HOSTED_SERVER_MIGRATION_FAILED: '迁移未完成',
  SELF_HOSTED_SERVER_MIGRATION_RECOVERY_REQUIRED: '迁移需要处理，请保持新旧服务器可访问',
  SELF_HOSTED_SERVER_MIGRATION_CLEANUP_STALE: '副本状态已变化，请重新检查后确认清理',
  SELF_HOSTED_SERVER_MIGRATION_CLEANUP_NOT_ALLOWED: '该副本当前不能清理，请重新检查',
  SELF_HOSTED_SERVER_MIGRATION_CLEANUP_UNAVAILABLE: '暂时无法处理副本，请稍后重试',
};

interface PendingStart {
  target: MigrationTarget;
  revision: string;
  key: string;
  previousTaskId: string | null;
}

@Component({
  selector: 'app-self-hosted-server',
  standalone: true,
  templateUrl: './self-hosted-server.page.html',
  styleUrls: ['./self-hosted-server.page.scss'],
  imports: [FormsModule, IonicModule, HeroCardComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SelfHostedServerPage implements OnDestroy {
  serverAddress = '';
  serverKey = '';
  showKey = false;
  addressError = '';
  keyError = '';
  errorMessage = '';
  progressError = '';
  refreshError = '';
  saved = false;
  loading = true;
  saving = false;
  refreshing = false;
  startUncertain = false;
  config: SelfHostedServerConfig | null = null;
  preview: MigrationPreview | null = null;
  task: MigrationTask | null = null;
  cleanupTaskId: string | null = null;
  cleanupTask: MigrationTask | null = null;
  cleanupPreview: MigrationCleanupPreview | null = null;

  private previewTarget: MigrationTarget | null = null;
  private blockedTarget: MigrationTarget | null = null;
  private pendingStart: PendingStart | null = null;
  private visible = false;
  private generation = 0;
  private epoch: number;
  private timer?: ReturnType<typeof setTimeout>;
  private polling = false;
  private refreshedTaskId: string | null = null;
  private readonly authSubscription: Subscription;

  constructor(
    private readonly serverService: SelfHostedServerService,
    private readonly deviceV2: DeviceV2Service,
    private readonly data: DataService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.epoch = data.sessionEpoch;
    this.authSubscription = data.authDataChanged.subscribe(() => {
      if (this.epoch === data.sessionEpoch) return; // Token refresh keeps the same account session.
      this.epoch = data.sessionEpoch;
      this.refreshedTaskId = null;
      this.invalidate();
      this.resetView();
      if (this.visible) void this.ionViewWillEnter();
      this.cdr.markForCheck();
    });
  }

  get hasSavedConfig(): boolean { return !!this.config?.keyConfigured; }

  get migrationRunning(): boolean {
    return !!this.task && !this.isServiceRestored(this.task);
  }

  get cleanupProcessing(): boolean {
    return this.cleanupTask?.cleanup.state === 'processing' || this.task?.cleanup.state === 'processing';
  }

  get busy(): boolean {
    return this.loading || this.saving || this.refreshing || this.migrationRunning
      || this.startUncertain || !!this.progressError || this.cleanupProcessing;
  }

  get statusText(): string {
    if (this.loading) return '正在读取配置';
    if (!this.config) return '配置读取失败';
    if (this.config.state === 'enabled') return '已启用';
    if (this.config.state === 'unavailable') return '暂不可用';
    return '使用平台服务器';
  }

  get taskMessage(): string {
    if (!this.task) return '';
    if (this.task.status === 'completed' && this.task.serviceState === 'target') {
      return '迁移完成，设备正在重新连接';
    }
    if (this.task.status === 'failed' && this.task.serviceState === 'source') {
      return '迁移失败，原服务器已恢复';
    }
    return {
      queued: '正在准备迁移',
      migrating: '正在迁移并校验设备数据',
      switching: '正在切换服务器',
      restoring: '正在恢复服务，请保持新旧服务器正常运行',
      blocked: '迁移需要处理，请保持新旧服务器可访问',
    }[this.task.status] ?? '正在确认服务恢复状态';
  }

  endpointLabel(endpoint: MigrationEndpoint): string {
    return endpoint.kind === 'managed' ? '平台服务器' : endpoint.serverUrl;
  }

  taskError(): string {
    return this.task?.errorCode ? ERROR_MESSAGES[this.task.errorCode] ?? '迁移需要处理' : '';
  }

  async ionViewWillEnter(): Promise<void> {
    this.visible = true;
    this.epoch = this.data.sessionEpoch;
    this.refreshedTaskId = null;
    const generation = this.invalidate();
    this.resetView();
    this.loading = true;
    if (!this.data.auth?.accessToken) {
      this.loading = false;
      this.errorMessage = '请先登录';
      return;
    }
    const [configuration, migration] = await Promise.allSettled([
      this.serverService.getConfig(), this.serverService.getMigration(),
    ]);
    if (!this.current(generation)) return;
    if (configuration.status === 'fulfilled') this.applyConfig(configuration.value);
    else this.errorMessage = this.describeError(configuration.reason);
    if (migration.status === 'fulfilled') this.task = migration.value;
    else this.progressError = '暂时无法获取进度，请稍后重试';
    this.loading = false;
    await this.refreshRestoredTask(generation);
    if (this.current(generation)) {
      this.schedulePoll();
      this.cdr.markForCheck();
    }
  }

  ionViewWillLeave(): void {
    this.visible = false;
    this.invalidate();
    this.serverKey = '';
    this.showKey = false;
    this.preview = null;
    this.previewTarget = null;
    this.blockedTarget = null;
    this.pendingStart = null;
    this.cleanupPreview = null;
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
    this.authSubscription.unsubscribe();
  }

  async save(): Promise<void> {
    if (this.busy || !this.config) return;
    this.addressError = '';
    this.keyError = '';
    const address = this.serverService.normalizeAddress(this.serverAddress);
    if (!address) this.addressError = '请输入有效的公网 HTTP 或 HTTPS 地址';
    const keepKey = this.hasSavedConfig && address === this.config.serverUrl && this.serverKey === '';
    if (!keepKey && !this.serverKey) this.keyError = '请输入服务器密钥';
    if (!address || this.keyError) return;
    await this.prepare({
      kind: 'self_hosted', serverUrl: address,
      ...(keepKey ? {} : { serverKey: this.serverKey }),
    });
  }

  async confirmClear(): Promise<void> {
    if (this.busy || !this.hasSavedConfig) return;
    await this.prepare({ kind: 'managed' });
  }

  clearValidation(field: 'address' | 'key'): void {
    this.cancelPreview();
    this.saved = false;
    this.errorMessage = '';
    this.cleanupTaskId = null;
    this.blockedTarget = null;
    this.cleanupTask = null;
    this.cleanupPreview = null;
    if (field === 'address') this.addressError = '';
    if (field === 'key') this.keyError = '';
  }

  toggleKeyVisibility(): void { if (!this.busy) this.showKey = !this.showKey; }

  cancelPreview(): void {
    this.preview = null;
    this.previewTarget = null;
  }

  private async prepare(target: MigrationTarget): Promise<void> {
    const generation = this.beginOperation();
    this.cancelPreview();
    this.blockedTarget = null;
    this.cleanupTaskId = null;
    this.cleanupTask = null;
    this.cleanupPreview = null;
    try {
      const preview = await this.serverService.previewMigration(target);
      if (!this.current(generation)) return;
      if (preview.action === 'configure' && target.kind === 'self_hosted') {
        await this.configure(target, generation);
      } else {
        this.preview = preview;
        this.previewTarget = target;
      }
    } catch (error) {
      if (this.current(generation)) {
        this.showOperationError(error);
        if (this.cleanupTaskId) this.blockedTarget = target;
      }
    } finally { this.endOperation(generation); }
  }

  async retryMigrationPreview(): Promise<void> {
    if (!this.busy && this.blockedTarget && this.cleanupTask?.cleanup.state === 'completed') {
      await this.prepare(this.blockedTarget);
    }
  }

  async confirmMigration(): Promise<void> {
    if (this.busy || !this.preview || !this.previewTarget) return;
    const preview = this.preview;
    const target = this.previewTarget;
    const generation = this.beginOperation();
    this.cancelPreview();
    if (preview.action === 'configure') {
      try { await this.configure(target, generation); }
      catch (error) { if (this.current(generation)) this.showOperationError(error); }
      finally { this.endOperation(generation); }
      return;
    }
    this.pendingStart = {
      target, revision: preview.previewRevision, key: crypto.randomUUID(),
      previousTaskId: this.task?.id ?? null,
    };
    await this.submitStart(generation);
    this.endOperation(generation);
  }

  private async configure(target: MigrationTarget, generation: number): Promise<void> {
    const config = target.kind === 'managed'
      ? await this.serverService.clearConfig()
      : await this.serverService.saveConfig(target.serverUrl, target.serverKey);
    if (!this.current(generation)) return;
    this.applyConfig(config);
    this.saved = true;
    try {
      await this.deviceV2.stop();
      if (this.current(generation)) await this.deviceV2.start();
    } catch {
      if (this.current(generation)) this.refreshError = '配置已生效，但设备连接尚未恢复，请重试刷新';
    }
  }

  private async submitStart(generation: number): Promise<void> {
    const request = this.pendingStart;
    if (!request) return;
    try {
      const task = await this.serverService.startMigration(request.target, request.revision, request.key);
      if (!this.current(generation)) return;
      this.acceptTask(task);
      await this.refreshRestoredTask(generation);
    } catch (error) {
      if (!this.current(generation)) return;
      if (error instanceof GatewayHttpError && error.httpStatus >= 400 && error.httpStatus < 500
        && error.httpStatus !== 408) {
        this.pendingStart = null;
        this.startUncertain = false;
        this.showOperationError(error);
        if (this.cleanupTaskId) this.blockedTarget = request.target;
        return;
      }
      this.startUncertain = true;
      await this.recoverStart(generation);
    }
  }

  private async recoverStart(generation: number): Promise<boolean> {
    const request = this.pendingStart;
    if (!request) return true;
    try {
      const task = await this.serverService.getMigration();
      if (!this.current(generation)) return false;
      this.progressError = '';
      if (task && BigInt(task.id) > BigInt(request.previousTaskId ?? '0')) {
        this.acceptTask(task);
        await this.refreshRestoredTask(generation);
        return true;
      }
    } catch {
      if (this.current(generation)) this.progressError = '暂时无法获取进度，请稍后重试';
    }
    return false;
  }

  async retryStart(): Promise<void> {
    if (!this.startUncertain || !this.pendingStart || this.loading || this.saving) return;
    const generation = this.beginOperation();
    if (!await this.recoverStart(generation) && this.current(generation) && !this.progressError) {
      await this.submitStart(generation); // Reuse this confirmation's key, target and revision.
    }
    this.endOperation(generation);
  }

  private acceptTask(task: MigrationTask): void {
    this.task = task;
    this.pendingStart = null;
    this.blockedTarget = null;
    this.startUncertain = false;
    this.progressError = '';
    this.serverKey = '';
    this.showKey = false;
    this.cancelPreview();
  }

  async refreshProgress(): Promise<void> {
    if (!this.visible || this.loading || this.saving || this.polling) return;
    this.clearTimer();
    const generation = this.generation;
    this.polling = true;
    try {
      if (this.startUncertain) {
        await this.recoverStart(generation);
      } else {
        const task = await this.serverService.getMigration(this.task?.id);
        if (!this.current(generation)) return;
        this.task = task;
        if (this.cleanupTaskId) {
          const cleanup = task?.id === this.cleanupTaskId ? task
            : await this.serverService.getMigration(this.cleanupTaskId);
          if (!this.current(generation)) return;
          this.cleanupTask = cleanup;
        }
        this.progressError = '';
        await this.refreshRestoredTask(generation);
      }
    } catch {
      if (this.current(generation)) this.progressError = '暂时无法获取进度，请稍后重试';
    } finally {
      if (this.current(generation)) {
        this.polling = false;
        this.schedulePoll();
        this.cdr.markForCheck();
      }
    }
  }

  async inspectCleanup(): Promise<void> {
    if (!this.cleanupTaskId || this.busy) return;
    const taskId = this.cleanupTaskId;
    const generation = this.beginOperation();
    this.cleanupPreview = null;
    try {
      const task = await this.serverService.getMigration(taskId);
      if (!this.current(generation)) return;
      this.cleanupTask = task;
      if (task?.cleanup.state === 'processing' || task?.cleanup.state === 'completed') return;
      const preview = await this.serverService.previewCleanup(taskId);
      if (this.current(generation)) this.cleanupPreview = preview;
    } catch (error) {
      if (this.current(generation)) this.errorMessage = this.describeError(error);
    } finally { this.endOperation(generation); }
  }

  cancelCleanup(): void { this.cleanupPreview = null; }

  async confirmCleanup(): Promise<void> {
    if (this.busy || !this.cleanupPreview) return;
    const preview = this.cleanupPreview;
    const generation = this.beginOperation();
    this.cleanupPreview = null;
    try {
      const task = await this.serverService.confirmCleanup(preview.taskId, preview.cleanupRevision);
      if (this.current(generation)) this.cleanupTask = task;
    } catch (error) {
      if (!this.current(generation)) return;
      this.errorMessage = this.describeError(error);
      // Confirmation may have committed. Only query; never automatically confirm again.
      try {
        const task = await this.serverService.getMigration(preview.taskId);
        if (this.current(generation)) this.cleanupTask = task;
      } catch {
        if (this.current(generation)) this.progressError = '暂时无法获取进度，请稍后重试';
      }
    } finally { this.endOperation(generation); }
  }

  async retryRefresh(): Promise<void> {
    if (!this.visible || this.loading || this.saving || this.refreshing) return;
    const generation = this.beginOperation();
    await this.refreshDevices(generation);
    this.endOperation(generation);
  }

  private isServiceRestored(task: MigrationTask): boolean {
    return task.status === 'completed' && task.serviceState === 'target'
      || task.status === 'failed' && task.serviceState === 'source';
  }

  private async refreshRestoredTask(generation: number): Promise<void> {
    if (!this.task || !this.isServiceRestored(this.task) || this.refreshedTaskId === this.task.id) return;
    // Attempt once; failures use the explicit refresh button, not every progress poll.
    this.refreshedTaskId = this.task.id;
    await this.refreshDevices(generation);
  }

  private async refreshDevices(generation: number): Promise<void> {
    if (!this.current(generation)) return;
    this.refreshing = true;
    this.refreshError = '';
    const [configuration, devices] = await Promise.allSettled([
      this.serverService.getConfig(), this.deviceV2.refreshAfterServerMigration(),
    ]);
    if (!this.current(generation)) return;
    this.refreshing = false;
    if (configuration.status === 'fulfilled') this.applyConfig(configuration.value);
    else this.config = null;
    if (configuration.status === 'rejected' || devices.status === 'rejected') {
      this.refreshError = '服务端任务结果已保留，但配置或设备列表尚未刷新，请重试刷新';
    }
    this.cdr.markForCheck();
  }

  private beginOperation(): number {
    const generation = this.invalidate();
    this.saving = true;
    this.saved = false;
    this.errorMessage = '';
    return generation;
  }

  private endOperation(generation: number): void {
    if (!this.current(generation)) return;
    this.saving = false;
    this.schedulePoll();
    this.cdr.markForCheck();
  }

  private current(generation: number): boolean {
    return this.visible && generation === this.generation && this.epoch === this.data.sessionEpoch
      && !!this.data.auth?.accessToken;
  }

  private invalidate(): number {
    this.clearTimer();
    this.polling = false;
    return ++this.generation;
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedulePoll(): void {
    this.clearTimer();
    if (this.visible && this.data.auth?.accessToken
      && (this.migrationRunning || this.cleanupProcessing || this.startUncertain || this.progressError)) {
      this.timer = setTimeout(() => { void this.refreshProgress(); }, 2000);
    }
  }

  private resetView(): void {
    this.serverAddress = '';
    this.serverKey = '';
    this.showKey = false;
    this.addressError = '';
    this.keyError = '';
    this.errorMessage = '';
    this.progressError = '';
    this.refreshError = '';
    this.saved = false;
    this.saving = false;
    this.refreshing = false;
    this.startUncertain = false;
    this.config = null;
    this.task = null;
    this.cancelPreview();
    this.pendingStart = null;
    this.blockedTarget = null;
    this.cleanupTaskId = null;
    this.cleanupTask = null;
    this.cleanupPreview = null;
  }

  private applyConfig(config: SelfHostedServerConfig): void {
    this.config = config;
    this.serverAddress = config.serverUrl ?? '';
    this.serverKey = '';
    this.showKey = false;
    this.addressError = '';
    this.keyError = '';
    this.errorMessage = config.lastErrorCode
      ? ERROR_MESSAGES[config.lastErrorCode] ?? '服务器暂不可用，请稍后重试' : '';
  }

  private showOperationError(error: unknown): void {
    this.errorMessage = this.describeError(error);
    if (error instanceof GatewayHttpError && error.code === 'SELF_HOSTED_SERVER_MIGRATION_TARGET_NOT_EMPTY') {
      const taskId = (error.data as { cleanupTaskId?: unknown } | null)?.cleanupTaskId;
      if (typeof taskId === 'string' && /^[1-9]\d*$/.test(taskId)) {
        this.cleanupTaskId = taskId;
      }
    }
  }

  private describeError(error: unknown): string {
    const response = error instanceof GatewayHttpError ? error : null;
    if (response && ERROR_MESSAGES[response.code]) return ERROR_MESSAGES[response.code];
    if (response?.httpStatus === 401) return '登录已过期，请重新登录';
    return '操作未完成，请检查网络后重试';
  }
}
