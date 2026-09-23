import { ActivatedRoute } from '@angular/router';
import { LegacySource, legacySource } from '../../../core/model/legacy-import.model';
import { LegacyImportService } from '../../../core/services/legacy-import.service';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  Optional,
} from '@angular/core';

import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';
import {
  BleDirectSession,
  BleDirectTarget,
  BleDirectEnrollmentResult,
} from '../../../core/device-v2/ble-direct';
import { DataService } from '../../../core/services/data.service';
import { GatewayHttpError } from '../../../core/model/response.model';
import { DeviceV2BleService } from '../../../core/services/device-v2-ble.service';
import { UserService } from '../../../core/services/user.service';

type BleEnrollmentPhase =
  | 'idle'
  | 'discovering'
  | 'selecting'
  | 'enrolling'
  | 'recovering'
  | 'ready'
  | 'registered'
  | 'failed';

@Component({
  selector: 'app-ble-device-guide',
  templateUrl: './ble-device.page.html',
  styleUrls: ['../connection-method.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    FormsModule,
    TranslatePipe,
    HeroCardComponent,
  ],
})
export class BleDeviceGuidePage implements OnDestroy {
  deviceName = '';
  phase: BleEnrollmentPhase = 'idle';
  error = '';
  logicalDeviceId = '';
  endpointCount = 0;
  candidates: BleDirectTarget[] = [];
  pendingEnrollments: string[] = [];
  legacySource?: LegacySource;
  sourceLoading = false;
  private sourceBlocked = false;
  private replacingPendingId = '';

  private operation = 0;
  private recovery?: AbortController;
  private session?: BleDirectSession;
  private observedSessionEpoch: number;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly ble: DeviceV2BleService,
    private readonly data: DataService,
    private readonly users: UserService,
    private readonly navController: NavController,
    private readonly translate: TranslateService,
    private readonly changeDetector: ChangeDetectorRef,
    @Optional() private readonly route: ActivatedRoute | null = null,
    @Optional() private readonly legacyImports: LegacyImportService | null = null,
  ) {
    this.observedSessionEpoch = this.data.sessionEpoch;
    this.subscriptions.add(this.data.authDataChanged.subscribe(() => {
      if (this.observedSessionEpoch === this.data.sessionEpoch) return;
      this.observedSessionEpoch = this.data.sessionEpoch;
      this.operation += 1;
      this.recovery?.abort();
      this.phase = 'idle';
      this.error = '';
      this.logicalDeviceId = '';
      this.endpointCount = 0;
      this.candidates = [];
      this.pendingEnrollments = [];
      this.legacySource = undefined;
      this.replacingPendingId = '';
      this.sourceBlocked = true;
      this.sourceLoading = false;
      void this.closeSession();
      void this.navController.navigateRoot(
        this.data.auth?.accessToken ? '/home/device' : '/login',
      );
      this.changeDetector.markForCheck();
    }));
  }

  get busy(): boolean {
    return this.sourceLoading || this.phase === 'discovering' || this.phase === 'enrolling' || this.phase === 'recovering';
  }

  get actionKey(): string {
    if (this.phase === 'discovering') return 'DEVICE_GUIDE.BLE_DISCOVERING';
    if (this.phase === 'enrolling') return 'DEVICE_GUIDE.BLE_ENROLLING';
    if (this.phase === 'recovering') return 'DEVICE_GUIDE.BLE_RECOVERING';
    if (this.phase === 'failed') return 'DEVICE_GUIDE.BLE_RETRY';
    return 'DEVICE_GUIDE.BLE_START';
  }

  ionViewWillEnter(): void {
    if (!this.data.auth?.accessToken) {
      void this.navController.navigateRoot('/login');
      return;
    }
    void this.loadSourceAndPending();
  }

  private async loadSourceAndPending(): Promise<void> {
    const operation = this.operation;
    this.sourceLoading = true;
    this.legacySource = undefined;
    this.replacingPendingId = '';
    try {
      if (this.route?.snapshot.queryParamMap.has('sourceId')) {
        const source = legacySource({
          sourceCollection: this.route.snapshot.queryParamMap.get('sourceCollection'),
          sourceId: this.route.snapshot.queryParamMap.get('sourceId'),
        });
        const record = await this.legacyImports!.detail(source);
        if (operation !== this.operation) return;
        if (record.snapshot.disabled) throw new Error('旧设备已禁用，请重新核对');
        this.legacySource = source;
        this.deviceName = record.snapshot.displayName;
      }
      await this.loadPending(operation);
      if (operation === this.operation) this.sourceBlocked = false;
    } catch (error) {
      if (operation === this.operation) {
        this.sourceBlocked = true;
        this.error = error instanceof Error ? error.message : '接入资料读取失败';
      }
    } finally {
      if (operation === this.operation) {
        this.sourceLoading = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  private async loadPending(operation: number): Promise<void> {
    try {
      const pending = await this.ble.pendingEnrollmentSources();
      if (operation !== this.operation) return;
      this.pendingEnrollments = pending.filter(item => this.legacySource
        ? item.legacySource?.sourceCollection === this.legacySource.sourceCollection
          && item.legacySource?.sourceId === this.legacySource.sourceId
        : !item.legacySource).map(item => item.logicalDeviceId);
    } catch {
      if (operation !== this.operation) return;
      this.pendingEnrollments = [];
      if (!this.error) this.error = this.translate.instant('DEVICE_GUIDE.BLE_RECOVERY_LOAD_FAILED');
    }
    this.changeDetector.markForCheck();
  }

  async resumeEnrollment(logicalDeviceId: string): Promise<void> {
    if (this.busy || this.recovery || this.phase === 'ready' || this.phase === 'registered'
      || !this.pendingEnrollments.includes(logicalDeviceId)) return;
    if (!this.data.auth?.accessToken) return;
    const operation = ++this.operation;
    const recovery = this.recovery = new AbortController();
    this.phase = 'recovering';
    this.candidates = [];
    this.error = '';
    this.changeDetector.markForCheck();
    try {
      const committed = await this.ble.replayPendingCommit(logicalDeviceId);
      if (operation !== this.operation || recovery.signal.aborted) return;
      if (committed) {
        this.logicalDeviceId = logicalDeviceId;
        this.phase = 'registered';
        this.pendingEnrollments = this.pendingEnrollments.filter(id => id !== logicalDeviceId);
      } else {
        await this.acceptEnrollment(await this.ble.resume(logicalDeviceId, recovery.signal), operation);
      }
    } catch (error) {
      this.fail(operation, error);
    } finally {
      if (this.recovery === recovery) this.recovery = undefined;
      this.changeDetector.markForCheck();
    }
  }

  async replacePendingEnrollment(logicalDeviceId: string): Promise<void> {
    if (this.busy || !this.pendingEnrollments.includes(logicalDeviceId)) return;
    this.replacingPendingId = logicalDeviceId;
    await this.startDiscovery();
  }

  async startDiscovery(): Promise<void> {
    if (this.sourceBlocked || (this.pendingEnrollments.length && !this.replacingPendingId)) return;
    if (this.busy || this.recovery || this.phase === 'ready' || this.phase === 'registered') return;
    if (!this.data.auth?.accessToken) {
      await this.navController.navigateRoot('/login');
      return;
    }

    const operation = ++this.operation;
    this.phase = 'discovering';
    this.error = '';
    this.changeDetector.markForCheck();

    try {
      const candidates = await this.ble.discoverProvisioningDevices();
      if (operation !== this.operation) return;
      if (candidates.length === 0) throw new Error('BLE_DIRECT_SCAN_TIMEOUT');
      this.candidates = candidates.sort(
        (left, right) => (right.rssi ?? -127) - (left.rssi ?? -127),
      );
      if (this.candidates.length > 1) {
        this.phase = 'selecting';
        this.changeDetector.markForCheck();
        return;
      }
      await this.enrollTarget(this.candidates[0], operation);
    } catch (error) {
      this.fail(operation, error);
    }
  }

  async selectCandidate(target: BleDirectTarget): Promise<void> {
    if (this.phase !== 'selecting') return;
    const operation = this.operation;
    try {
      await this.enrollTarget(target, operation);
    } catch (error) {
      this.fail(operation, error);
    }
  }

  candidateName(target: BleDirectTarget): string {
    return target.device.name?.trim() || 'Blinker';
  }

  candidateId(target: BleDirectTarget): string {
    const id = target.device.deviceId;
    return id.includes(':') ? id.slice(-8) : id.slice(-8).toUpperCase();
  }

  private async enrollTarget(
    target: BleDirectTarget,
    operation: number,
  ): Promise<void> {
    this.phase = 'enrolling';
    this.changeDetector.markForCheck();

    const sessionEpoch = this.data.sessionEpoch;
    const result = await this.ble.enroll(target, {
      ownerAccountId: this.data.auth?.uuid,
      ...(this.legacySource ? { legacySource: this.legacySource } : {}),
      ...(this.replacingPendingId ? { replacePendingLogicalDeviceId: this.replacingPendingId } : {}),
      displayName: this.deviceName.trim()
        || this.translate.instant('DEVICE_GUIDE.DEFAULT_DEVICE_NAME'),
    }, {
      pendingCredentialSaved: async () => {
        if (operation !== this.operation || sessionEpoch !== this.data.sessionEpoch || !this.data.auth?.accessToken) {
          throw new Error('登录账号已改变，尚未写入硬件');
        }
      },
    });
    await this.acceptEnrollment(result, operation);
  }

  private async acceptEnrollment(result: BleDirectEnrollmentResult, operation: number): Promise<void> {
    if (operation !== this.operation) {
      await result.session.close();
      return;
    }

    this.session = result.session;
    this.logicalDeviceId = result.logicalDeviceId;
    this.endpointCount = result.session.store.snapshot(
      result.logicalDeviceId,
    ).manifest?.fields.length ?? 0;
    this.phase = 'ready';
    this.candidates = [];
    this.pendingEnrollments = this.pendingEnrollments.filter(id => id !== result.logicalDeviceId);
    this.changeDetector.markForCheck();
  }

  private fail(operation: number, error: unknown): void {
    if (operation !== this.operation) return;
    if (operation !== this.operation) return;
    console.error('[BLE_DIRECT_ENROLLMENT]', error instanceof Error ? error.message : 'UNKNOWN');
    this.phase = 'failed';
    this.candidates = [];
    this.error = this.messageOf(error);
    this.changeDetector.markForCheck();
    void this.loadPending(operation);
  }

  async finish(): Promise<void> {
    const operation = this.operation;
    const logicalDeviceId = this.logicalDeviceId;
    if (logicalDeviceId) await this.users.getAllInfo();
    if (operation !== this.operation) return;
    await this.closeSession();
    if (operation !== this.operation) return;
    await this.navController.navigateRoot(
      logicalDeviceId ? `/device/${encodeURIComponent(logicalDeviceId)}` : '/home/device',
    );
  }

  ionViewWillLeave(): void {
    this.operation += 1;
    this.recovery?.abort();
    this.pendingEnrollments = [];
    this.legacySource = undefined;
    this.replacingPendingId = '';
    this.sourceLoading = false;
    // Ionic can retain this page. Re-entry must not leave an aborted operation
    // displayed as busy or a closed session displayed as ready.
    this.phase = 'idle';
    this.error = '';
    this.candidates = [];
    this.logicalDeviceId = '';
    this.endpointCount = 0;
    void this.closeSession();
  }

  ngOnDestroy(): void {
    this.operation += 1;
    this.recovery?.abort();
    this.subscriptions.unsubscribe();
    void this.closeSession();
  }

  private async closeSession(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    if (session) await session.close().catch(() => undefined);
  }

  private messageOf(error: unknown): string {
    if (error instanceof GatewayHttpError) {
      if (error.httpStatus === 409 && error.code === 'DEVICE_V2_BLE_RESET_REQUIRED') {
        return this.translate.instant('DEVICE_GUIDE.BLE_RESET_REQUIRED');
      }
      if (error.httpStatus === 410 && error.code === 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED') {
        return this.translate.instant('DEVICE_GUIDE.BLE_DEVICE_RETIRED');
      }
      if (error.httpStatus === 403 && error.code === 'DEVICE_V2_BLE_ENROLLMENT_OWNER_INACTIVE') {
        return this.translate.instant('DEVICE_GUIDE.BLE_OWNER_INACTIVE');
      }
    }
    const code = error instanceof GatewayHttpError ? error.code : error instanceof Error ? error.message : '';
    if (/DEVICE_V2_BLE_ENROLLMENT_(EXPIRED|CANCELLED|SUPERSEDED)/.test(code)) {
      return '服务器确认原注册授权已失效。恢复材料已保留，请将同一硬件重新进入 setup 后办理恢复；不要直接重试旧授权或清除本地凭据。';
    }
    if (code === 'BLE_DIRECT_REPLACEMENT_CONTEXT_MISMATCH') return '不是原设备、来源不一致或硬件尚未进入新的配网状态；旧恢复材料已保留。';
    if (code === 'BLE_DIRECT_REPLACEMENT_ALREADY_REGISTERED') return '原注册已成功，请打开已注册设备；没有创建替代注册。';
    if (code === 'BLE_DIRECT_ENROLLMENT_PENDING') return '这台硬件有尚未完成的注册，请先使用下方恢复入口确认原提交结果。';
    if (error instanceof GatewayHttpError) return '注册尚未完成：' + error.message + '。恢复材料已保留，可处理原因后重试。';
    if (/permission|denied/i.test(code)) {
      return this.translate.instant('DEVICE_GUIDE.BLE_PERMISSION_FAILED');
    }
    if (code === 'BLE_DIRECT_SCAN_TIMEOUT' || code === 'BLE_DIRECT_SCAN_FAILED') {
      return this.translate.instant('DEVICE_GUIDE.BLE_NOT_FOUND');
    }
    return this.translate.instant('DEVICE_GUIDE.BLE_ENROLL_FAILED');
  }
}
