import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { UserService } from '../../../core/services/user.service';

interface OldDeviceMigrationResponse {
  message?: number | string;
  success?: boolean;
  detail?: unknown;
  reason?: unknown;
}

@Component({
  selector: 'app-old-device',
  templateUrl: './old-device.page.html',
  styleUrls: ['./old-device.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonicModule, TranslatePipe],
})
export class OldDevicePage {
  phoneNumber = '';
  deviceKey = '';
  keyVisible = false;
  isMigrating = false;
  errorMessage = '';

  constructor(
    private navController: NavController,
    private toastController: ToastController,
    private translate: TranslateService,
    private userService: UserService,
    private cd: ChangeDetectorRef
  ) {}

  onFormChange(): void {
    this.errorMessage = '';
  }

  toggleKeyVisibility(): void {
    this.keyVisible = !this.keyVisible;
  }

  async migrateData(): Promise<void> {
    if (this.isMigrating) return;

    const phoneNumber = this.phoneNumber.trim();
    const deviceKey = this.deviceKey.trim();

    if (!phoneNumber) {
      this.errorMessage = this.translate.instant(
        'DEVICE_GUIDE.OLD_DEVICE_PHONE_REQUIRED'
      );
      return;
    }
    if (!deviceKey) {
      this.errorMessage = this.translate.instant(
        'DEVICE_GUIDE.OLD_DEVICE_KEY_REQUIRED'
      );
      return;
    }

    this.isMigrating = true;
    this.errorMessage = '';
    this.cd.markForCheck();

    try {
      const response = await this.requestMigration({ phoneNumber, deviceKey });

      if (!this.isMigrationSuccessful(response)) {
        this.errorMessage = this.getFailureReason(response);
        return;
      }

      await this.finishMigration();
    } catch (error) {
      this.errorMessage = this.getFailureReason(error);
    } finally {
      this.isMigrating = false;
      this.cd.markForCheck();
    }
  }

  protected requestMigration(payload: {
    phoneNumber: string;
    deviceKey: string;
  }): Promise<OldDeviceMigrationResponse> {
    // TODO: 后端迁移接口确定后，在这里发送 payload 并返回服务器响应。
    void payload;
    return Promise.resolve({
      success: false,
      reason: this.translate.instant('DEVICE_GUIDE.OLD_DEVICE_API_PENDING'),
    });
  }

  private isMigrationSuccessful(response: OldDeviceMigrationResponse): boolean {
    return response.success === true || String(response.message) === '1000';
  }

  private getFailureReason(value: unknown): string {
    const reason = this.findMessage(value);
    return reason || this.translate.instant('DEVICE_GUIDE.OLD_DEVICE_FAILED');
  }

  private findMessage(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (value instanceof Error) return value.message.trim();
    if (!value || typeof value !== 'object') return '';

    const candidate = value as Record<string, unknown>;
    for (const key of ['reason', 'detail', 'error', 'message']) {
      const nestedMessage = this.findMessage(candidate[key]);
      if (nestedMessage) return nestedMessage;
    }
    return '';
  }

  private async finishMigration(): Promise<void> {
    const toast = await this.toastController.create({
      message: this.translate.instant('DEVICE_GUIDE.OLD_DEVICE_SUCCESS'),
      duration: 1800,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();

    try {
      await this.userService.getAllInfo();
    } catch (error) {
      console.warn('刷新迁移后的设备列表失败:', error);
    }

    await this.navController.navigateRoot('/home', {
      queryParams: { tab: 'device' },
    });
  }
}
