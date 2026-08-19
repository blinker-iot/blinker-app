import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
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

import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { UserService } from '../../../core/services/user.service';
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';

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
export class KeyDeviceGuidePage {
  deviceName = '';
  secretKey = '';
  keyVisible = true;
  isCreatingKey = false;
  keyError = '';
  private idempotencyKey = '';
  private idempotencyName = '';

  constructor(
    private dataService: DataService,
    private deviceService: DeviceService,
    private userService: UserService,
    private navController: NavController,
    private toastController: ToastController,
    private translate: TranslateService,
    private cd: ChangeDetectorRef
  ) {}

  async createKeyDevice(): Promise<void> {
    if (this.isCreatingKey) return;

    const auth = this.dataService.auth;
    if (!auth?.accessToken) {
      await this.showToast('DEVICE_GUIDE.AUTH_EXPIRED');
      return;
    }

    const customName =
      this.deviceName.trim() ||
      this.translate.instant('DEVICE_GUIDE.DEFAULT_DEVICE_NAME');

    this.isCreatingKey = true;
    this.keyError = '';
    this.cd.markForCheck();

    try {
      if (!this.idempotencyKey || this.idempotencyName !== customName) {
        this.idempotencyKey = this.createIdempotencyKey();
        this.idempotencyName = customName;
      }
      const response = await this.deviceService.createDevice(
        customName,
        this.idempotencyKey,
      );
      const authKey = response.authKey?.trim() || '';
      if (!authKey) {
        throw new Error(
          this.translate.instant('DEVICE_GUIDE.CREATE_FAILED')
        );
      }

      this.secretKey = authKey;
      this.keyVisible = true;
    } catch (error) {
      this.keyError =
        error instanceof Error && error.message
          ? error.message
          : this.translate.instant('DEVICE_GUIDE.CREATE_FAILED');
    } finally {
      this.isCreatingKey = false;
      this.cd.markForCheck();
    }
  }

  async copyKey(): Promise<void> {
    if (!this.secretKey) return;
    await Clipboard.write({ string: this.secretKey });
    await this.showToast('DEVICE_GUIDE.COPIED');
  }

  toggleKeyVisibility(): void {
    this.keyVisible = !this.keyVisible;
  }

  async finishKeySetup(): Promise<void> {
    await this.userService.getAllInfo();
    await this.navController.navigateRoot('/home/device');
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
    return 'device-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2);
  }
}
