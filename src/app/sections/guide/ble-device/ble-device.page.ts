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
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';
import { BleDirectSession } from '../../../core/device-v2/ble-direct';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2BleService } from '../../../core/services/device-v2-ble.service';
import { UserService } from '../../../core/services/user.service';

type BleEnrollmentPhase =
  | 'idle'
  | 'discovering'
  | 'enrolling'
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

  private operation = 0;
  private session?: BleDirectSession;

  constructor(
    private readonly ble: DeviceV2BleService,
    private readonly data: DataService,
    private readonly users: UserService,
    private readonly navController: NavController,
    private readonly translate: TranslateService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  get busy(): boolean {
    return this.phase === 'discovering' || this.phase === 'enrolling';
  }

  get actionKey(): string {
    if (this.phase === 'discovering') return 'DEVICE_GUIDE.BLE_DISCOVERING';
    if (this.phase === 'enrolling') return 'DEVICE_GUIDE.BLE_ENROLLING';
    if (this.phase === 'failed') return 'DEVICE_GUIDE.BLE_RETRY';
    return 'DEVICE_GUIDE.BLE_START';
  }

  ionViewWillEnter(): void {
    if (!this.data.auth?.accessToken) {
      void this.navController.navigateRoot('/login');
    }
  }

  async startDiscovery(): Promise<void> {
    if (this.busy || this.phase === 'ready') return;
    if (!this.data.auth?.accessToken) {
      await this.navController.navigateRoot('/login');
      return;
    }

    const operation = ++this.operation;
    this.phase = 'discovering';
    this.error = '';
    this.changeDetector.markForCheck();

    try {
      const target = await this.ble.discoverProvisioning();
      if (operation !== this.operation) return;
      this.phase = 'enrolling';
      this.changeDetector.markForCheck();

      const result = await this.ble.enroll(target, {
        displayName: this.deviceName.trim()
          || this.translate.instant('DEVICE_GUIDE.DEFAULT_DEVICE_NAME'),
      });
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
      void this.users.getAllInfo();
    } catch (error) {
      if (operation !== this.operation) return;
      console.error('[BLE_DIRECT_ENROLLMENT]', error instanceof Error ? error.message : 'UNKNOWN');
      this.phase = 'failed';
      this.error = this.messageOf(error);
    }
    this.changeDetector.markForCheck();
  }

  async finish(): Promise<void> {
    await this.closeSession();
    await this.navController.navigateRoot('/home/device');
  }

  ionViewWillLeave(): void {
    this.operation += 1;
    void this.closeSession();
  }

  ngOnDestroy(): void {
    this.operation += 1;
    void this.closeSession();
  }

  private async closeSession(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    if (session) await session.close().catch(() => undefined);
  }

  private messageOf(error: unknown): string {
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
