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

import {
  DeviceKeyContext,
  GatewayHttpError,
} from '../../../core/model/response.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ManagementService } from '../../../core/services/device-v2-management.service';
import { UserService } from '../../../core/services/user.service';

type KeyDevicePhase =
  | 'idle'
  | 'creating'
  | 'create-failed'
  | 'create-blocked'
  | 'revealing'
  | 'reveal-failed'
  | 'reveal-blocked'
  | 'recent-auth-required'
  | 'step-up-blocked'
  | 'revealed';

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
  ],
})
export class KeyDeviceGuidePage implements OnDestroy {
  readonly arduinoExample = `#include <BlinkerWiFi.h>

BLINKER_PROPERTY(power, bool, blinker::readWrite());

void setup() {
  Blinker.begin(
      "REPLACE_WITH_DEVICE_KEY",
      "YOUR_WIFI_SSID",
      "YOUR_WIFI_PASSWORD",
      power);
}

void loop() {
  Blinker.run();
}`;

  deviceName = '';
  secretKey = '';
  keyVisible = false;
  keyError = '';
  createBlockedTitleKey = 'DEVICE_GUIDE.KEY_CREATE_BLOCKED_TITLE';
  phase: KeyDevicePhase = 'idle';

  private idempotencyKey = '';
  private idempotencyName = '';
  private revealContext: DeviceKeyContext | null = null;
  private operationGeneration = 0;
  private observedSessionEpoch: number;
  private readonly authChangeSubscription: Subscription;

  constructor(
    private dataService: DataService,
    private deviceService: DeviceV2ManagementService,
    private userService: UserService,
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
        || (error instanceof GatewayHttpError && [405, 410].includes(error.httpStatus))
        ? 'create-blocked'
        : 'create-failed';
      const failure = this.createFailureKeys(error);
      this.createBlockedTitleKey = failure.title;
      this.keyError = this.translate.instant(failure.description);
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
    if (this.phase !== 'revealed' || !this.secretKey) return;
    try {
      await this.writeClipboard(this.secretKey);
      await this.showToast('DEVICE_GUIDE.KEY_COPIED');
    } catch {
      await this.showToast('DEVICE_GUIDE.KEY_COPY_FAILED');
    }
  }

  toggleKeyVisibility(): void {
    if (!this.secretKey) return;
    this.keyVisible = !this.keyVisible;
  }

  async finishKeySetup(): Promise<void> {
    const logicalDeviceId = this.revealContext?.logicalDeviceId;
    if (logicalDeviceId) await this.userService.getAllInfo().catch(() => false);
    this.resetProvisioningState();
    await this.navController.navigateRoot(
      logicalDeviceId ? `/device/${encodeURIComponent(logicalDeviceId)}` : '/home/device'
    );
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
      this.secretKey = response.data.deviceKey;
      this.keyVisible = false;
      this.phase = 'revealed';
      void this.userService.getAllInfo().catch(() => false);
    } catch (error) {
      if (!this.isOperationActive(operationGeneration, sessionEpoch)) return;
      this.clearSecretKey();
      if (this.isErrorCode(error, 'DEVICE_KEY_RECENT_AUTH_REQUIRED')) {
        this.phase = 'recent-auth-required';
        this.keyError = this.translate.instant(
          'DEVICE_GUIDE.KEY_RECENT_AUTH_DESCRIPTION'
        );
      } else if (this.isErrorCode(error, 'DEVICE_KEY_STEP_UP_UNAVAILABLE')) {
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
    this.createBlockedTitleKey = 'DEVICE_GUIDE.KEY_CREATE_BLOCKED_TITLE';
    this.phase = 'idle';
  }

  private createFailureKeys(error: unknown): { title: string; description: string } {
    let key = 'KEY_CREATE_BLOCKED';
    if (error instanceof GatewayHttpError) {
      switch (error.httpStatus) {
        case 0:
          key = error.code === 'GATEWAY_TIMEOUT' ? 'KEY_CREATE_TIMEOUT' : 'KEY_CREATE_NETWORK';
          break;
        case 400:
          key = 'KEY_CREATE_INVALID';
          break;
        case 401:
          key = 'KEY_CREATE_AUTH';
          break;
        case 403:
          key = error.code === 'DEVICE_LIMIT_REACHED'
            ? 'KEY_DEVICE_LIMIT'
            : error.code === 'DEVICE_ENTITLEMENT_INVALID'
              ? 'KEY_DEVICE_ENTITLEMENT'
              : 'KEY_CREATE_DENIED';
          break;
        case 404:
        case 405:
          key = 'KEY_CREATE_ENDPOINT';
          break;
        case 409:
          key = 'KEY_CREATE_CONFLICT';
          break;
        case 410:
          if (error.code === 'SERVICE_ACCOUNT_DELETED') key = 'KEY_CREATE_ACCOUNT_UNAVAILABLE';
          break;
        case 429:
          key = 'KEY_CREATE_RATE_LIMITED';
          break;
        default:
          if (error.httpStatus >= 500) {
            key = error.httpStatus === 503 && error.code === 'BROKER_ALLOCATION_PENDING'
              ? 'KEY_CREATE_PREPARING'
              : 'KEY_CREATE_SERVICE';
          }
      }
    }
    return {
      title: `DEVICE_GUIDE.${key}_TITLE`,
      description: `DEVICE_GUIDE.${key}_DESCRIPTION`,
    };
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

  private async writeClipboard(value: string): Promise<void> {
    await Clipboard.write({ string: value });
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
