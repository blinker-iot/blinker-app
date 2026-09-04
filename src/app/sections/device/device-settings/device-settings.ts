import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonicModule,
  NavController,
  ToastController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';

import { BDeviceImgComponent } from '../../../core/components/b-device-img/b-device-img.component';
import { BlinkerDevice } from '../../../core/model/device.model';
import {
  DeviceKeyContext,
  DeviceKeyLogicalDevice,
  GatewayHttpError,
} from '../../../core/model/response.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ManagementService } from '../../../core/services/device-v2-management.service';
import { UserService } from '../../../core/services/user.service';

type KeyOperation = '' | 'reveal' | 'rotate';
type ManagedDevice = BlinkerDevice & DeviceKeyLogicalDevice & DeviceKeyContext;

@Component({
  selector: 'app-device-settings',
  standalone: true,
  templateUrl: 'device-settings.html',
  styleUrls: ['device-settings.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, BDeviceImgComponent],
})
export class DeviceSettingsPage implements OnDestroy {
  logicalDeviceId = '';
  device?: ManagedDevice;
  secretKey = '';
  keyVisible = false;
  keyOperation: KeyOperation = '';
  keyError = '';
  supportsWifiProvisioning = false;
  supportsGatewayEnrollment = false;

  private rotateIdempotencyKey = '';
  private readonly subscriptions = new Subscription();

  constructor(
    route: ActivatedRoute,
    private readonly data: DataService,
    private readonly management: DeviceV2ManagementService,
    private readonly users: UserService,
    private readonly alerts: AlertController,
    private readonly nav: NavController,
    private readonly toasts: ToastController,
    private readonly cd: ChangeDetectorRef,
  ) {
    this.subscriptions.add(route.paramMap.subscribe(params => {
      this.logicalDeviceId = params.get('id') ?? '';
      this.bindDevice();
    }));
    this.subscriptions.add(this.data.deviceDataLoader.subscribe(loaded => {
      if (loaded) this.bindDevice();
    }));
  }

  get loaded(): boolean {
    return !!this.device;
  }

  get isOwner(): boolean {
    return !!this.device && !this.device.config.isShared;
  }

  get keyBusy(): boolean {
    return this.keyOperation !== '';
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearSecret();
  }

  async toggleKey(): Promise<void> {
    if (this.secretKey) {
      this.keyVisible = !this.keyVisible;
      this.cd.markForCheck();
      return;
    }
    await this.revealKey();
  }

  async revealKey(): Promise<void> {
    const context = this.context();
    if (!context || this.keyBusy) return;
    this.keyOperation = 'reveal';
    this.keyError = '';
    this.cd.markForCheck();
    try {
      const response = await this.management.revealDeviceKeyV2(context);
      this.secretKey = response.data.deviceKey;
      this.keyVisible = true;
    } catch (error) {
      this.clearSecret();
      this.keyError = this.keyErrorMessage(error, '无法读取设备 Key，请稍后重试');
    } finally {
      this.keyOperation = '';
      this.cd.markForCheck();
    }
  }

  async copyKey(): Promise<void> {
    if (this.keyBusy) return;
    if (!this.secretKey) await this.revealKey();
    if (!this.secretKey) return;
    try {
      await this.writeClipboard(this.secretKey);
      await this.toast('设备 Key 已复制；请勿发送给不信任的人');
    } catch {
      await this.toast('复制失败，请重试');
    }
  }

  async refreshKey(): Promise<void> {
    const context = this.context();
    if (!context || this.keyBusy) return;
    const confirmed = await this.confirm(
      '刷新设备 Key？',
      '刷新后，使用旧 Key 的设备会立即离线且无法重新连接。你需要把新 Key 写入代码，或随后执行重新配网。',
      '确认刷新',
    );
    if (!confirmed) return;

    this.rotateIdempotencyKey ||= this.requestId('device-key-rotate');
    this.keyOperation = 'rotate';
    this.keyError = '';
    this.clearSecret();
    this.cd.markForCheck();
    try {
      const response = await this.management.rotateDeviceKeyV2(
        context,
        this.rotateIdempotencyKey,
      );
      this.applyContext(response.data);
      this.secretKey = response.data.deviceKey;
      this.keyVisible = true;
      this.rotateIdempotencyKey = '';
      await this.users.getAllInfo().catch(() => false);
      this.bindDevice();
      await this.toast('设备 Key 已刷新，旧 Key 已失效');
    } catch (error) {
      // A timeout can happen after commit; a retry must keep the same request id.
      this.keyError = this.keyErrorMessage(error, '刷新失败；重试会继续同一笔刷新事务');
    } finally {
      this.keyOperation = '';
      this.cd.markForCheck();
    }
  }

  async startReconfigure(): Promise<void> {
    if (!this.isOwner || !this.supportsWifiProvisioning || this.keyBusy) return;
    const confirmed = await this.confirm(
      '先重置设备网络',
      '请先在设备上触发 Blinker.resetNetwork()（或产品定义的网络重置操作），并确认设备开始广播 BLINKER_。重新配网只更新 Wi-Fi，不会刷新 Key 或清除 BLE 控制权。',
      '我已重置网络',
    );
    if (!confirmed) return;
    await this.nav.navigateForward('/tools/esp32-provision', {
      queryParams: {
        mode: 'reconfigure',
        logicalDeviceId: this.logicalDeviceId,
      },
    });
  }

  async startGatewayEnrollment(): Promise<void> {
    if (!this.supportsGatewayEnrollment || this.keyBusy) return;
    await this.nav.navigateForward(
      `/device/${encodeURIComponent(this.logicalDeviceId)}/gateway-enrollment`,
    );
  }

  private bindDevice(): void {
    const candidate = this.data.getDevice(this.logicalDeviceId) as ManagedDevice | undefined;
    this.device = candidate && this.validContext(candidate) ? candidate : undefined;
    // Reconfiguration belongs to an activated, cloud-capable logical device.
    // Requiring a previous Cloud lastSeen would strand a valid BLE-onboarded
    // hybrid device when its first Wi-Fi or broker connection did not finish.
    this.supportsWifiProvisioning = this.isOwner
      && this.device?.state === 'active'
      && this.device.cloudEnabled === true;
    this.supportsGatewayEnrollment = this.isOwner
      && this.device?.deviceType === 'edge-hub'
      && Number.isSafeInteger(this.device.cloudLastSeenAt)
      && (this.device.cloudLastSeenAt ?? 0) > 0;
    this.cd.markForCheck();
  }

  private context(): DeviceKeyContext | undefined {
    if (!this.device || !this.isOwner || !this.validContext(this.device)) return undefined;
    return {
      logicalDeviceId: this.device.logicalDeviceId,
      credentialVersion: this.device.credentialVersion,
      locator: this.device.locator,
    };
  }

  private applyContext(context: DeviceKeyContext): void {
    if (!this.device) return;
    this.device.credentialVersion = context.credentialVersion;
    this.device.locator = context.locator;
  }

  private validContext(value: Partial<DeviceKeyContext>): value is DeviceKeyContext {
    return value.logicalDeviceId === this.logicalDeviceId
      && Number.isSafeInteger(value.credentialVersion)
      && (value.credentialVersion ?? 0) > 0
      && typeof value.locator === 'string'
      && value.locator.length > 0;
  }

  private clearSecret(): void {
    this.secretKey = '';
    this.keyVisible = false;
  }

  private async confirm(header: string, message: string, confirmText: string): Promise<boolean> {
    const alert = await this.alerts.create({
      header,
      message,
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: confirmText, role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 2200, position: 'bottom' });
    await toast.present();
  }

  private async writeClipboard(value: string): Promise<void> {
    await Clipboard.write({ string: value });
  }

  private keyErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof GatewayHttpError) {
      if (error.httpStatus === 403) return '只有设备所有者可以管理设备 Key';
      if (error.code === 'DEVICE_KEY_STEP_UP_UNAVAILABLE') return '当前登录状态不能查看或刷新设备 Key';
    }
    return fallback;
  }

  private requestId(prefix: string): string {
    const suffix = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }
}
