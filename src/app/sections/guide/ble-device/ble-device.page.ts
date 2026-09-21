import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
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
      void this.closeSession();
      void this.navController.navigateRoot(
        this.data.auth?.accessToken ? '/home/device' : '/login',
      );
      this.changeDetector.markForCheck();
    }));
  }

  get busy(): boolean {
    return this.phase === 'discovering' || this.phase === 'enrolling' || this.phase === 'recovering';
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
    void this.loadPending(this.operation);
  }

  private async loadPending(operation: number): Promise<void> {
    try {
      const pending = await this.ble.pendingEnrollmentLogicalDeviceIds();
      if (operation !== this.operation) return;
      this.pendingEnrollments = pending;
    } catch {
      if (operation !== this.operation) return;
      this.pendingEnrollments = [];
      if (!this.error) this.error = this.translate.instant('DEVICE_GUIDE.BLE_RECOVERY_LOAD_FAILED');
    }
    this.changeDetector.markForCheck();
  }

  async resumeEnrollment(logicalDeviceId: string): Promise<void> {
    if (this.busy || this.recovery || this.phase === 'ready' || !this.pendingEnrollments.includes(logicalDeviceId)) return;
    if (!this.data.auth?.accessToken) return;
    const operation = ++this.operation;
    const recovery = this.recovery = new AbortController();
    this.phase = 'recovering';
    this.candidates = [];
    this.error = '';
    this.changeDetector.markForCheck();
    try {
      await this.acceptEnrollment(await this.ble.resume(logicalDeviceId, recovery.signal), operation);
    } catch (error) {
      this.fail(operation, error);
    } finally {
      if (this.recovery === recovery) this.recovery = undefined;
    }
  }

  async startDiscovery(): Promise<void> {
    if (this.busy || this.recovery || this.phase === 'ready') return;
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

    const result = await this.ble.enroll(target, {
      displayName: this.deviceName.trim()
        || this.translate.instant('DEVICE_GUIDE.DEFAULT_DEVICE_NAME'),
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
    const code = error instanceof Error ? error.message : '';
    if (/permission|denied/i.test(code)) {
      return this.translate.instant('DEVICE_GUIDE.BLE_PERMISSION_FAILED');
    }
    if (code === 'BLE_DIRECT_SCAN_TIMEOUT' || code === 'BLE_DIRECT_SCAN_FAILED') {
      return this.translate.instant('DEVICE_GUIDE.BLE_NOT_FOUND');
    }
    return this.translate.instant('DEVICE_GUIDE.BLE_ENROLL_FAILED');
  }
}
