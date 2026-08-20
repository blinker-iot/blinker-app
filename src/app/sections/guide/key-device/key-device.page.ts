import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Clipboard } from '@capacitor/clipboard';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';
import {
  DeviceKeyContext,
  GatewayHttpError,
} from '../../../core/model/response.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';

type KeyDevicePhase =
  | 'idle'
  | 'creating'
  | 'create-failed'
  | 'create-blocked'
  | 'revealing'
  | 'reveal-failed'
  | 'reveal-blocked'
  | 'step-up-blocked'
  | 'revealed'
  | 'production-blocked';

@Component({
  selector: 'app-key-device-guide',
  templateUrl: './key-device.page.html',
  styleUrls: ['./key-device.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSpinner,
    TranslatePipe,
    HeroCardComponent,
  ],
})
export class KeyDeviceGuidePage implements OnDestroy {
  readonly diagnosticKeyDisplayEnabled = !environment.production;

  deviceName = '';
  secretKey = '';
  keyVisible = false;
  keyError = '';
  phase: KeyDevicePhase = environment.production
    ? 'production-blocked'
    : 'idle';

  private idempotencyKey = '';
  private idempotencyName = '';
  private revealContext: DeviceKeyContext | null = null;
  private operationGeneration = 0;
  private observedSessionEpoch: number;
  private readonly authChangeSubscription: Subscription;

  constructor(
    private dataService: DataService,
    private deviceService: DeviceService,
    private navController: NavController,
    private toastController: ToastController,
    private translate: TranslateService,
    private cd: ChangeDetectorRef
  ) {
    this.observedSessionEpoch = this.dataService.sessionEpoch;
    this.authChangeSubscription = this.dataService.authDataChanged.subscribe(
      () => {
        const sessionEpoch = this.dataService.sessionEpoch;
        const sessionChanged = sessionEpoch !== this.observedSessionEpoch;
        this.observedSessionEpoch = sessionEpoch;
        if (!this.dataService.auth || sessionChanged) {
          this.resetProvisioningState();
          this.cd.markForCheck();
          if (!this.dataService.auth) {
            void this.navController.navigateRoot('/login');
          }
        }
      }
    );
  }

  get isBusy(): boolean {
    return this.phase === 'creating' || this.phase === 'revealing';
  }

  get showsCreateForm(): boolean {
    return (
      this.phase === 'idle' ||
      this.phase === 'creating' ||
      this.phase === 'create-failed' ||
      this.phase === 'revealing'
    );
  }

  ionViewWillEnter(): void {
    if (!this.dataService.auth?.accessToken) {
      this.resetProvisioningState();
      void this.navController.navigateRoot('/login');
    }
  }

  async createKeyDevice(): Promise<void> {
    if (!this.dataService.auth?.accessToken) {
      this.resetProvisioningState();
      await this.navController.navigateRoot('/login');
      return;
    }
    if (environment.production) {
      this.phase = 'production-blocked';
      this.keyError = this.translate.instant(
        'DEVICE_GUIDE.KEY_PRODUCTION_BLOCKED_DESCRIPTION'
      );
      this.cd.markForCheck();
      return;
    }
    if (this.phase !== 'idle' && this.phase !== 'create-failed') return;

    const customName =
      this.deviceName.trim() ||
      this.translate.instant('DEVICE_GUIDE.DEFAULT_DEVICE_NAME');

    if (!this.idempotencyKey || this.idempotencyName !== customName) {
      this.idempotencyKey = this.createIdempotencyKey();
      this.idempotencyName = customName;
    }

    this.clearSecretKey();
    this.revealContext = null;
    const operationGeneration = ++this.operationGeneration;
    const sessionEpoch = this.dataService.sessionEpoch;
    this.phase = 'creating';
    this.keyError = '';
    this.cd.markForCheck();

    try {
      const response = await this.deviceService.createDeviceKeyV2(
        customName,
        this.idempotencyKey,
        'diy'
      );
      if (!this.isOperationActive(operationGeneration, sessionEpoch)) return;
      const device = response.data.device;
      this.revealContext = {
        logicalDeviceId: device.logicalDeviceId,
        credentialVersion: device.credentialVersion,
        locator: device.locator,
      };
    } catch (error) {
      if (!this.isOperationActive(operationGeneration, sessionEpoch)) return;
      this.phase = this.isTerminalV2Error(error)
        ? 'create-blocked'
        : 'create-failed';
      this.keyError = this.translate.instant(
        this.isErrorCode(error, 'IDEMPOTENCY_CONFLICT')
          ? 'DEVICE_GUIDE.KEY_CREATE_CONFLICT'
          : this.phase === 'create-blocked'
            ? 'DEVICE_GUIDE.KEY_CREATE_BLOCKED_DESCRIPTION'
          : 'DEVICE_GUIDE.CREATE_FAILED'
      );
      this.cd.markForCheck();
      return;
    }

    await this.revealDeviceKey(operationGeneration, sessionEpoch);
  }

  async retryReveal(): Promise<void> {
    if (this.phase !== 'reveal-failed' || !this.revealContext) return;
    const operationGeneration = ++this.operationGeneration;
    await this.revealDeviceKey(
      operationGeneration,
      this.dataService.sessionEpoch
    );
  }

  async copyKey(): Promise<void> {
    if (
      !this.diagnosticKeyDisplayEnabled ||
      this.phase !== 'revealed' ||
      !this.secretKey
    ) {
      return;
    }
    await Clipboard.write({ string: this.secretKey });
    await this.showToast('DEVICE_GUIDE.KEY_DIAGNOSTIC_COPIED');
  }

  toggleKeyVisibility(): void {
    if (!this.diagnosticKeyDisplayEnabled || !this.secretKey) return;
    this.keyVisible = !this.keyVisible;
  }

  async finishKeySetup(): Promise<void> {
    this.resetProvisioningState();
    await this.navController.navigateRoot('/guide');
  }

  ionViewWillLeave(): void {
    this.resetProvisioningState();
  }

  ngOnDestroy(): void {
    this.authChangeSubscription.unsubscribe();
    this.resetProvisioningState();
  }

  private async revealDeviceKey(
    operationGeneration: number,
    sessionEpoch: number
  ): Promise<void> {
    const context = this.revealContext;
    if (
      !context ||
      !this.isOperationActive(operationGeneration, sessionEpoch)
    ) {
      return;
    }

    this.clearSecretKey();
    this.phase = 'revealing';
    this.keyError = '';
    this.cd.markForCheck();

    try {
      const response = await this.deviceService.revealDeviceKeyV2(context);
      if (!this.isOperationActive(operationGeneration, sessionEpoch)) return;
      if (!this.diagnosticKeyDisplayEnabled) {
        this.clearSecretKey();
        this.phase = 'production-blocked';
        this.revealContext = null;
        return;
      }
      this.secretKey = response.data.deviceKey;
      this.keyVisible = false;
      this.phase = 'revealed';
    } catch (error) {
      if (!this.isOperationActive(operationGeneration, sessionEpoch)) return;
      this.clearSecretKey();
      if (this.isErrorCode(error, 'DEVICE_KEY_STEP_UP_UNAVAILABLE')) {
        this.phase = 'step-up-blocked';
        this.keyError = this.translate.instant(
          'DEVICE_GUIDE.KEY_STEP_UP_BLOCKED_DESCRIPTION'
        );
      } else if (this.isTerminalV2Error(error)) {
        this.phase = 'reveal-blocked';
        this.keyError = this.translate.instant(
          'DEVICE_GUIDE.KEY_REVEAL_BLOCKED_DESCRIPTION'
        );
      } else {
        this.phase = 'reveal-failed';
        this.keyError = this.translate.instant(
          'DEVICE_GUIDE.KEY_REVEAL_FAILED_DESCRIPTION'
        );
      }
    }
    this.cd.markForCheck();
  }

  private resetProvisioningState(): void {
    this.operationGeneration += 1;
    this.clearSecretKey();
    this.revealContext = null;
    this.idempotencyKey = '';
    this.idempotencyName = '';
    this.keyError = '';
    this.phase = environment.production ? 'production-blocked' : 'idle';
  }

  private clearSecretKey(): void {
    this.secretKey = '';
    this.keyVisible = false;
  }

  private isErrorCode(error: unknown, code: string): boolean {
    return error instanceof GatewayHttpError && error.code === code;
  }

  private isTerminalV2Error(error: unknown): boolean {
    return (
      error instanceof GatewayHttpError &&
      [400, 401, 403, 404, 409].includes(error.httpStatus)
    );
  }

  private isOperationActive(
    operationGeneration: number,
    sessionEpoch: number
  ): boolean {
    return (
      this.operationGeneration === operationGeneration &&
      this.dataService.sessionEpoch === sessionEpoch &&
      !!this.dataService.auth?.accessToken
    );
  }

  private async showToast(messageKey: string): Promise<void> {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }

  private createIdempotencyKey(): string {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
    return (
      'device-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2)
    );
  }
}
