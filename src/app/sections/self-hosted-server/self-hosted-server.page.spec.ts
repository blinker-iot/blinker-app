import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayHttpError } from '../../core/model/response.model';
import { DataService } from '../../core/services/data.service';
import { DeviceV2Service } from '../../core/services/device-v2.service';
import {
  MigrationCleanupPreview, MigrationPreview, MigrationTask,
  SelfHostedServerConfig, SelfHostedServerService,
} from '../../core/services/self-hosted-server.service';
import { SelfHostedServerPage } from './self-hosted-server.page';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

describe('SelfHostedServerPage', () => {
  const enabled: SelfHostedServerConfig = {
    state: 'enabled', serverUrl: 'https://broker.example.com/', keyConfigured: true,
    lastVerifiedAt: 1, lastErrorCode: null,
  };
  const hostedTarget = { kind: 'self_hosted' as const, serverUrl: 'https://target.example.com/' };
  const preview: MigrationPreview = {
    action: 'migrate', previewRevision: 'a'.repeat(64), target: hostedTarget, deviceCount: 3,
  };
  const cleanupPreview: MigrationCleanupPreview = {
    taskId: '9007199254740993', side: 'source', endpoint: hostedTarget, deviceCount: 3,
    recoverability: 'not_guaranteed', cleanupRevision: 'b'.repeat(64),
  };
  const networkError = () => new GatewayHttpError({
    httpStatus: 0, code: 'GATEWAY_TIMEOUT', message: 'Timed out',
  });
  const migrationTask = (patch: Partial<MigrationTask> = {}): MigrationTask => ({
    id: '10', status: 'queued', source: { kind: 'managed' }, target: hostedTarget,
    serviceState: 'source', errorCode: null, cleanup: { state: 'none', side: null },
    updatedAt: 1, ...patch,
  });
  const completed = (patch: Partial<MigrationTask> = {}) => migrationTask({
    status: 'completed', serviceState: 'target', ...patch,
  });
  let service: Record<'getConfig' | 'saveConfig' | 'clearConfig' | 'normalizeAddress'
    | 'previewMigration' | 'startMigration' | 'getMigration' | 'previewCleanup'
    | 'confirmCleanup', ReturnType<typeof vi.fn>>;
  let connection: Record<'stop' | 'start' | 'refreshAfterServerMigration', ReturnType<typeof vi.fn>>;
  let data: { sessionEpoch: number; auth: { accessToken: string } | null; authDataChanged: Subject<void> };
  let page: SelfHostedServerPage;

  beforeEach(async () => {
    vi.useFakeTimers();
    service = {
      getConfig: vi.fn().mockResolvedValue(enabled),
      saveConfig: vi.fn().mockResolvedValue({ ...enabled, lastVerifiedAt: 2 }),
      clearConfig: vi.fn().mockResolvedValue({ ...enabled, state: 'not_configured', serverUrl: null, keyConfigured: false }),
      normalizeAddress: vi.fn().mockImplementation((address: string) => address),
      previewMigration: vi.fn().mockResolvedValue({ ...preview, action: 'configure' }),
      startMigration: vi.fn().mockResolvedValue(migrationTask()),
      getMigration: vi.fn().mockResolvedValue(null),
      previewCleanup: vi.fn().mockResolvedValue(cleanupPreview),
      confirmCleanup: vi.fn().mockResolvedValue(completed({
        id: '9007199254740993', cleanup: { state: 'processing', side: 'source' },
      })),
    };
    connection = {
      stop: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined),
      refreshAfterServerMigration: vi.fn().mockResolvedValue(undefined),
    };
    data = { sessionEpoch: 1, auth: { accessToken: 'account-a' }, authDataChanged: new Subject<void>() };
    page = new SelfHostedServerPage(
      service as unknown as SelfHostedServerService,
      connection as unknown as DeviceV2Service,
      data as unknown as DataService,
      { markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    );
    await page.ionViewWillEnter();
  });

  afterEach(() => {
    page.ngOnDestroy();
    vi.useRealTimers();
  });

  async function prepareMigration() {
    page.serverAddress = hostedTarget.serverUrl;
    page.serverKey = 'candidate-key';
    service.previewMigration.mockResolvedValue(preview);
    await page.save();
  }

  async function blockWithKnownCopy() {
    service.previewMigration.mockRejectedValue(new GatewayHttpError({
      httpStatus: 409, code: 'SELF_HOSTED_SERVER_MIGRATION_TARGET_NOT_EMPTY',
      message: 'Existing data', data: { cleanupTaskId: '9007199254740993' },
    }));
    await page.save();
    service.getMigration.mockResolvedValue(completed({
      id: '9007199254740993', cleanup: { state: 'awaiting_confirmation', side: 'source' },
    }));
  }

  it('preserves the omitted key for same-instance configuration and reconnects only after saving', async () => {
    await page.save();
    expect(service.previewMigration).toHaveBeenCalledWith({ kind: 'self_hosted', serverUrl: enabled.serverUrl });
    expect(service.saveConfig).toHaveBeenCalledWith(enabled.serverUrl, undefined);
    expect(service.startMigration).not.toHaveBeenCalled();
    expect(connection.stop).toHaveBeenCalledOnce();
    expect(connection.start).toHaveBeenCalledOnce();
    expect(page.saved).toBe(true);
  });

  it('waits for separate migration confirmation, then clears the key and refreshes after confirmed completion', async () => {
    await prepareMigration();
    expect(page.preview?.deviceCount).toBe(3);
    expect(service.startMigration).not.toHaveBeenCalled();
    expect(service.saveConfig).not.toHaveBeenCalled();
    expect(page.serverKey).toBe('candidate-key');
    await page.confirmMigration();
    expect(service.startMigration).toHaveBeenCalledWith(
      { ...hostedTarget, serverKey: 'candidate-key' }, preview.previewRevision, expect.any(String),
    );
    expect(page.serverKey).toBe('');
    expect(page.preview).toBeNull();
    expect(page.taskMessage).toBe('正在准备迁移');
    expect(connection.refreshAfterServerMigration).not.toHaveBeenCalled();
    service.getMigration.mockResolvedValue(completed());
    await vi.advanceTimersByTimeAsync(2000);
    expect(page.taskMessage).toBe('迁移完成，设备正在重新连接');
    expect(connection.refreshAfterServerMigration).toHaveBeenCalledOnce();
    expect(service.saveConfig).not.toHaveBeenCalled();
  });

  it('requires confirmation before clearing an empty account configuration', async () => {
    service.previewMigration.mockResolvedValue({ ...preview, action: 'configure', target: { kind: 'managed' }, deviceCount: 0 });
    await page.confirmClear();
    expect(service.previewMigration).toHaveBeenCalledWith({ kind: 'managed' });
    expect(service.clearConfig).not.toHaveBeenCalled();
    await page.confirmMigration();
    expect(service.clearConfig).toHaveBeenCalledOnce();
    expect(service.startMigration).not.toHaveBeenCalled();
    expect(page.hasSavedConfig).toBe(false);
  });

  it('discards the preview when input changes and preserves the configuration after a preflight error', async () => {
    await prepareMigration();
    page.serverKey = 'revised-key';
    page.clearValidation('key');
    expect(page.preview).toBeNull();
    await page.confirmMigration();
    expect(service.startMigration).not.toHaveBeenCalled();
    service.previewMigration.mockRejectedValue(new GatewayHttpError({
      httpStatus: 503, code: 'SELF_HOSTED_SERVER_AUTH_FAILED', message: 'Rejected',
    }));
    await page.save();
    expect(page.errorMessage).toBe('服务器密钥验证失败，请检查密钥');
    expect(page.config).toBe(enabled);
    expect(connection.stop).not.toHaveBeenCalled();
  });

  it('queries after a lost start response, rejects an older result and replays only the same confirmation key', async () => {
    page.task = completed({ id: '9' });
    await prepareMigration();
    service.startMigration.mockRejectedValueOnce(networkError());
    service.getMigration.mockResolvedValue(completed({ id: '9' }));
    await page.confirmMigration();
    expect(page.startUncertain).toBe(true);
    expect(page.task?.id).toBe('9');
    expect(service.startMigration).toHaveBeenCalledOnce();
    const initialRequest = service.startMigration.mock.calls[0];
    await page.retryStart();
    expect(service.startMigration).toHaveBeenCalledTimes(2);
    expect(service.startMigration.mock.calls[1]).toEqual(initialRequest);
    expect(service.getMigration.mock.invocationCallOrder.at(-1))
      .toBeLessThan(service.startMigration.mock.invocationCallOrder[1]);
    expect(page.task?.id).toBe('10');
    expect(page.startUncertain).toBe(false);
  });

  it('recovers an accepted BIGINT task after timeout without a second start request', async () => {
    page.task = completed({ id: '9007199254740992' });
    await prepareMigration();
    service.startMigration.mockRejectedValueOnce(networkError());
    service.getMigration.mockResolvedValue(migrationTask({ id: '9007199254740993' }));
    await page.confirmMigration();
    expect(page.task?.id).toBe('9007199254740993');
    expect(page.startUncertain).toBe(false);
    expect(page.serverKey).toBe('');
    expect(service.startMigration).toHaveBeenCalledOnce();
  });

  it('keeps the last task on query failure and only says the source recovered after server confirmation', async () => {
    page.task = migrationTask({ status: 'restoring', serviceState: 'paused' });
    service.getMigration.mockRejectedValueOnce(networkError());
    await page.refreshProgress();
    expect(page.progressError).toContain('暂时无法获取进度');
    expect(page.task?.status).toBe('restoring');
    expect(page.taskMessage).not.toContain('原服务器已恢复');
    expect(connection.refreshAfterServerMigration).not.toHaveBeenCalled();
    service.getMigration.mockResolvedValue(migrationTask({ status: 'failed', serviceState: 'source' }));
    await page.refreshProgress();
    expect(page.progressError).toBe('');
    expect(page.taskMessage).toBe('迁移失败，原服务器已恢复');
    expect(connection.refreshAfterServerMigration).toHaveBeenCalledOnce();
  });

  it('stops polling on leave, ignores late responses, and recovers the current task on re-entry', async () => {
    const read = deferred<MigrationTask>();
    page.task = migrationTask({ status: 'migrating', serviceState: 'paused' });
    service.getMigration.mockReturnValueOnce(read.promise);
    const polling = page.refreshProgress();
    page.ionViewWillLeave();
    read.resolve(completed());
    await polling;
    await vi.advanceTimersByTimeAsync(10000);
    expect(service.getMigration).toHaveBeenCalledTimes(2);
    expect(page.task?.status).toBe('migrating');
    expect(connection.refreshAfterServerMigration).not.toHaveBeenCalled();
    service.getMigration.mockResolvedValue(completed());
    await page.ionViewWillEnter();
    expect(page.task?.status).toBe('completed');
    expect(connection.refreshAfterServerMigration).toHaveBeenCalledOnce();
  });

  it('discards confirmation, keys, and late preflight results on account change but not token refresh', async () => {
    const read = deferred<MigrationPreview>();
    page.serverKey = 'old-account-key';
    service.previewMigration.mockReturnValueOnce(read.promise);
    const saving = page.save();
    data.auth = { accessToken: 'same-account-refreshed' };
    data.authDataChanged.next();
    expect(page.serverKey).toBe('old-account-key');
    expect(page.saving).toBe(true);
    data.sessionEpoch += 1;
    data.auth = { accessToken: 'account-b' };
    data.authDataChanged.next();
    await vi.advanceTimersByTimeAsync(0);
    read.resolve(preview);
    await saving;
    expect(page.serverKey).toBe('');
    expect(page.preview).toBeNull();
    expect(page.task).toBeNull();
    expect(page.saving).toBe(false);
    await page.confirmMigration();
    expect(service.startMigration).not.toHaveBeenCalled();
  });

  it('does not let an older progress response overwrite an operation started while it was in flight', async () => {
    const read = deferred<MigrationTask>();
    const checked = deferred<MigrationPreview>();
    service.getMigration.mockReturnValueOnce(read.promise);
    const polling = page.refreshProgress();
    service.previewMigration.mockReturnValueOnce(checked.promise);
    const saving = page.save();
    read.resolve(migrationTask({ status: 'migrating', serviceState: 'paused' }));
    await polling;
    expect(page.saving).toBe(true);
    expect(page.task).toBeNull();
    checked.resolve(preview);
    await saving;
    expect(page.preview).toBe(preview);
  });

  it('retries device refresh without replaying a migration and retries again after leaving a failed refresh', async () => {
    service.getMigration.mockResolvedValue(completed());
    connection.refreshAfterServerMigration.mockRejectedValue(new Error('offline'));
    await page.ionViewWillEnter();
    expect(page.task?.status).toBe('completed');
    expect(page.refreshError).toContain('尚未刷新');
    await page.refreshProgress();
    expect(connection.refreshAfterServerMigration).toHaveBeenCalledOnce();
    await page.retryRefresh();
    expect(connection.refreshAfterServerMigration).toHaveBeenCalledTimes(2);
    page.ionViewWillLeave();
    connection.refreshAfterServerMigration.mockResolvedValue(undefined);
    await page.ionViewWillEnter();
    expect(connection.refreshAfterServerMigration).toHaveBeenCalledTimes(3);
    expect(page.refreshError).toBe('');
    expect(service.startMigration).not.toHaveBeenCalled();
  });

  it('offers cleanup only for an identified blocking copy and requires a separate fresh confirmation', async () => {
    page.task = completed({ cleanup: { state: 'awaiting_confirmation', side: 'source' } });
    expect(page.cleanupTaskId).toBeNull();
    await blockWithKnownCopy();
    expect(page.cleanupTaskId).toBe('9007199254740993');
    expect(service.confirmCleanup).not.toHaveBeenCalled();
    await page.inspectCleanup();
    expect(page.cleanupPreview).toBe(cleanupPreview);
    expect(service.confirmCleanup).not.toHaveBeenCalled();
    await page.confirmCleanup();
    expect(service.confirmCleanup).toHaveBeenCalledWith('9007199254740993', cleanupPreview.cleanupRevision);
    expect(page.cleanupPreview).toBeNull();
    expect(page.cleanupProcessing).toBe(true);
    service.getMigration.mockImplementation((taskId?: string) => Promise.resolve(
      taskId === '9007199254740993' ? completed({ id: '9007199254740993', cleanup: { state: 'awaiting_confirmation', side: 'source' } })
        : completed(),
    ));
    await vi.advanceTimersByTimeAsync(2000);
    expect(page.cleanupProcessing).toBe(false);
    expect(page.cleanupPreview).toBeNull();
    expect(service.confirmCleanup).toHaveBeenCalledOnce();
    await page.inspectCleanup();
    expect(service.previewCleanup).toHaveBeenCalledTimes(2);
  });

  it('rechecks a target blocked at start after cleanup and still waits for a new confirmation', async () => {
    await prepareMigration();
    service.startMigration.mockRejectedValueOnce(new GatewayHttpError({
      httpStatus: 409, code: 'SELF_HOSTED_SERVER_MIGRATION_TARGET_NOT_EMPTY',
      message: 'Existing data', data: { cleanupTaskId: '9007199254740993' },
    }));
    await page.confirmMigration();
    service.getMigration.mockResolvedValue(completed({
      id: '9007199254740993', cleanup: { state: 'awaiting_confirmation', side: 'source' },
    }));
    await page.inspectCleanup();
    service.confirmCleanup.mockResolvedValue(completed({
      id: '9007199254740993', cleanup: { state: 'completed', side: 'source' },
    }));
    await page.confirmCleanup();
    service.previewMigration.mockResolvedValue(preview);
    await page.retryMigrationPreview();
    expect(service.previewMigration).toHaveBeenLastCalledWith({
      ...hostedTarget, serverKey: 'candidate-key',
    });
    expect(page.preview).toBe(preview);
    expect(page.cleanupTaskId).toBeNull();
    expect(service.startMigration).toHaveBeenCalledOnce();
  });

  it('does not offer deletion for unknown existing target data', async () => {
    service.previewMigration.mockRejectedValue(new GatewayHttpError({
      httpStatus: 409, code: 'SELF_HOSTED_SERVER_MIGRATION_TARGET_NOT_EMPTY', message: 'Existing data',
    }));
    await page.save();
    expect(page.cleanupTaskId).toBeNull();
    await page.inspectCleanup();
    expect(service.previewCleanup).not.toHaveBeenCalled();
  });

  it('queries an uncertain cleanup confirmation and never automatically sends a second deletion approval', async () => {
    await blockWithKnownCopy();
    await page.inspectCleanup();
    service.confirmCleanup.mockRejectedValueOnce(networkError());
    service.getMigration.mockResolvedValue(completed({
      id: '9007199254740993', cleanup: { state: 'processing', side: 'source' },
    }));
    await page.confirmCleanup();
    expect(page.cleanupTask?.cleanup.state).toBe('processing');
    await vi.advanceTimersByTimeAsync(2000);
    expect(service.confirmCleanup).toHaveBeenCalledOnce();
    expect(service.getMigration).toHaveBeenCalledWith('9007199254740993');
  });

  it('blocks writes when the current configuration could not be read', async () => {
    service.getConfig.mockRejectedValue(networkError());
    await page.ionViewWillEnter();
    expect(page.statusText).toBe('配置读取失败');
    await page.save();
    expect(service.previewMigration).not.toHaveBeenCalled();
  });
});
