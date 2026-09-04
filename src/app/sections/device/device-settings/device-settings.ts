import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import {
  AlertController,
  IonicModule,
  ModalController,
  NavController,
} from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { DeviceIconPage } from '../../../core/pages/device-icon/device-icon';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import {
  DeviceKeyContext,
  DeviceKeyLogicalDevice,
  GatewayHttpError,
} from 'src/app/core/model/response.model';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { DeviceShortcutService } from 'src/app/core/services/device-shortcut.service';
import { NoticeService } from 'src/app/core/services/notice.service';

import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { DeviceV2ManagementService } from 'src/app/core/services/device-v2-management.service';
import {
  MenuListComponent,
  MenuListItem,
} from 'src/app/core/components/menu-list/menu-list';

type KeyOperation = '' | 'reveal' | 'rotate';
type ManagedDevice = BlinkerDevice
  & Partial<DeviceKeyLogicalDevice>
  & Partial<DeviceKeyContext>;

@Component({
  selector: 'app-device-settings',
  standalone: true,
  templateUrl: 'device-settings.html',
  styleUrls: ['device-settings.scss'],
  imports: [IonicModule, BDeviceImgComponent, MenuListComponent, TranslatePipe],
})
export class DeviceSettingsPage implements OnInit, OnDestroy {
  id = '';
  logicalDeviceId = '';
  device!: ManagedDevice;

  secretKey = '';
  keyVisible = false;
  keyOperation: KeyOperation = '';
  keyError = '';
  supportsWifiProvisioning = false;
  supportsGatewayEnrollment = false;

  showKey = false;
  revealingKey = false;
  private revealedAuthKey = '';
  private rotateIdempotencyKey = '';
  private confirmDialog?: HTMLIonAlertElement;
  private readonly subscriptions = new Subscription();

  get loaded(): boolean {
    return !!this.device;
  }

  get isOwner(): boolean {
    return this.loaded && !this.isSharedDevice;
  }

  get keyBusy(): boolean {
    return this.keyOperation !== '';
  }

  get hasDeviceKeyContext(): boolean {
    return this.deviceKeyContext !== null;
  }

  get isSharedDevice() {
    return Boolean(this.device?.config?.isShared);
  }

  get canRevealAuthKey(): boolean {
    return !!this.device?.config?.authKey || this.deviceKeyContext !== null;
  }

  get displayedAuthKey(): string {
    return this.revealedAuthKey || this.device?.config?.authKey || '';
  }

  get hasTimerTask() {
    if (typeof this.device?.data?.timer != 'undefined') {
      if (this.device.data.timer != '000') {
        return true;
      }
    }
    return false;
  }

  get hasNewVersion() {
    return this.device?.data?.hasNewVersion;
  }

  get deviceMenuItems(): readonly MenuListItem[] {
    const items: MenuListItem[] = [
      {
        id: 'timer',
        title: '定时任务',
        description: '设置设备按计划自动执行',
        icon: 'fa-timer',
        badge: this.hasTimerTask ? '已启用' : undefined,
        route: `/device-manager/${this.id}/timer`,
      },
      {
        id: 'location',
        title: '设备位置',
        description: '查看并更新设备所在位置',
        icon: 'fa-location-dot',
        route: `/device-manager/${this.id}/location`,
      },
      {
        id: 'logs',
        title: '运行日志',
        description: '查看设备事件、操作和系统记录',
        icon: 'fa-rectangle-list',
        route: `/device-manager/${this.id}/logs`,
      },
      {
        id: 'storage',
        title: '数据存储',
        description: '查看设备上报的数据与存储用量',
        icon: 'fa-database',
        route: `/device-manager/${this.id}/storage`,
      },
    ];

    if (this.deviceShortcutService.isAvailable) {
      items.push({
        id: 'shortcut',
        title: '添加桌面快捷方式',
        description: '使用设备图片创建直达该设备的桌面图标',
        icon: 'fa-grid-2-plus',
      });
    }

    return items;
  }

  get managementMenuItems(): readonly MenuListItem[] {
    const items: MenuListItem[] = [
      {
        id: 'update',
        title: '固件更新',
        description: '检查版本并更新设备固件',
        icon: 'fa-cloud-arrow-up',
        badge: this.hasNewVersion ? '有新版本' : undefined,
        route: `/device-manager/${this.id}/update`,
      },
      {
        id: 'guide',
        title: '设备配置',
        description: '重新配置该设备网络和密钥',
        icon: 'fa-screwdriver-wrench',
      },
      {
        id: 'uic',
        title: '界面配置',
        description: '配置该设备的界面',
        icon: 'fa-grid-4',
        route: `/device-manager/${this.id}/uic`,
      },
    ];
    if (!this.isSharedDevice) {
      items.push({
        id: 'sharing',
        title: '设备共享',
        description: '邀请其他用户共同控制这台设备',
        icon: 'fa-user-group',
        route: `/share-manager/${this.id}?from=device-settings`,
      });
    }

    items.push(
      {
        id: 'unbind',
        title: this.isSharedDevice ? '退出设备共享' : '解除设备绑定',
        description: this.isSharedDevice
          ? '移除这台由其他用户共享的设备'
          : '从账户中移除设备及其关联自动化',
        icon: 'fa-link-slash',
        danger: true,
        showChevron: false,
      },
    );
    return items;
  }

  settingList = [
    'CustomName',
    'CustomIcon',
    'LoadingExample',
    'VoiceAssistant',
    'AddShortcut',
    'UpdateFirmware',
  ];
  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly userService: UserService,
    private readonly deviceService: DeviceService,
    private readonly dataService: DataService,
    private readonly alertCtrl: AlertController,
    private readonly navCtrl: NavController,
    private readonly modalCtrl: ModalController,
    private readonly sharing: DeviceV2SharingService,
    private readonly management: DeviceV2ManagementService,
    private readonly deviceShortcutService: DeviceShortcutService,
    private readonly noticeService: NoticeService,
    private readonly cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.activatedRoute.paramMap.subscribe(params => {
      this.id = params.get('id') ?? '';
      this.logicalDeviceId = this.id;
      this.clearSecret();
      this.bindDevice();
    }));
    this.subscriptions.add(this.dataService.deviceDataLoader.subscribe(loaded => {
      if (loaded) this.bindDevice();
    }));
  }

  private bindDevice(): void {
    this.device = this.dataService.getDevice(this.logicalDeviceId) as ManagedDevice;
    this.supportsWifiProvisioning = this.isOwner
      && this.hasDeviceKeyContext
      && this.device.state === 'active'
      && this.device.cloudEnabled === true;
    this.supportsGatewayEnrollment = this.isOwner
      && this.hasDeviceKeyContext
      && this.device.deviceType === 'edge-hub'
      && Number.isSafeInteger(this.device.cloudLastSeenAt)
      && (this.device.cloudLastSeenAt ?? 0) > 0;
    this.cd.markForCheck();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearSecret();
    void this.confirmDialog?.dismiss();
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
    const context = this.deviceKeyContext;
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
      await this.noticeService.showToast('设备 Key 已复制；请勿发送给不信任的人');
    } catch {
      await this.noticeService.showToast('复制失败，请重试');
    }
  }

  async refreshKey(): Promise<void> {
    const context = this.deviceKeyContext;
    if (!context || this.keyBusy) return;
    const confirmed = await this.confirmAction(
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
      await this.userService.getAllInfo().catch(() => false);
      this.bindDevice();
      await this.noticeService.showToast('设备 Key 已刷新，旧 Key 已失效');
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
    const confirmed = await this.confirmAction(
      '先重置设备网络',
      '请先在设备上触发 Blinker.resetNetwork()（或产品定义的网络重置操作），并确认设备开始广播 BLINKER_。重新配网只更新 Wi-Fi，不会刷新 Key 或清除 BLE 控制权。',
      '我已重置网络',
    );
    if (!confirmed) return;
    await this.navCtrl.navigateForward('/tools/esp32-provision', {
      queryParams: {
        mode: 'reconfigure',
        logicalDeviceId: this.logicalDeviceId,
      },
    });
  }

  async startGatewayEnrollment(): Promise<void> {
    if (!this.supportsGatewayEnrollment || this.keyBusy) return;
    await this.navCtrl.navigateForward(
      `/device/${encodeURIComponent(this.logicalDeviceId)}/gateway-enrollment`,
    );
  }

  changeName() {
    this.showChangeNameConfirm();
  }

  private get deviceKeyContext(): DeviceKeyContext | null {
    if (!this.device || this.device.config.mode !== 'bbp2') return null;
    const logicalDeviceId = this.device.logicalDeviceId
      || this.device.id
      || this.device.deviceName;
    if (
      logicalDeviceId !== this.logicalDeviceId
      || !Number.isSafeInteger(this.device.credentialVersion)
      || (this.device.credentialVersion ?? 0) < 1
      || !this.device.locator
    ) {
      return null;
    }
    return {
      logicalDeviceId,
      credentialVersion: this.device.credentialVersion!,
      locator: this.device.locator,
    };
  }

  async showAuthKey(): Promise<void> {
    if (this.device.config.authKey) {
      this.showKey = true;
      return;
    }
    const context = this.deviceKeyContext;
    if (!context || this.revealingKey) return;

    this.revealingKey = true;
    try {
      const response = await this.management.revealDeviceKeyV2(context);
      this.revealedAuthKey = response.data.deviceKey;
      this.showKey = true;
    } catch (error) {
      console.error('Failed to reveal Device V2 key', error);
      await this.noticeService.showToast('设备密钥读取失败，请稍后重试');
    } finally {
      this.revealingKey = false;
    }
  }

  async showChangeNameConfirm() {
    this.confirmDialog = await this.alertCtrl.create({
      header: '自定义设备名',
      inputs: [
        {
          name: 'customName',
          value: this.device.config.customName,
          placeholder: this.device.config.customName,
        },
      ],
      buttons: [
        {
          text: '取消',
          handler: () => { },
        },
        {
          text: '确认修改',
          handler: (data) => {
            this.saveName(data.customName);
          },
        },
      ],
    });
    await this.confirmDialog.present();
  }

  async saveName(customName) {
    let newConfig = {
      customName: customName,
    };
    if (await this.deviceService.saveDeviceConfig(this.device, newConfig)) {
      this.device.config.customName = customName;
    }
  }

  async selectIcon() {
    let modal = await this.modalCtrl.create({
      component: DeviceIconPage,
      componentProps: {
        currentImage: this.device.config.image,
      },
    });
    modal.onDidDismiss().then(async (image) => {
      if (typeof image.data == 'undefined') return;
      let newConfig = {
        image: image.data,
      };
      if (this.device.config.isPreview) {
        this.device.config.image = image.data;
        this.device.subject.next({ key: 'image', value: image.data });
        return;
      }
      if (await this.deviceService.saveDeviceConfig(this.device, newConfig)) {
        this.device.config.image = image.data;
      }
    });
    modal.present();
  }

  unbind() {
    this.showUnbindConfirm();
  }

  async showUnbindConfirm() {
    this.confirmDialog = await this.alertCtrl.create({
      header: '确认解除绑定',
      message: '解绑后，你将无法控制这个设备，关联该设备的自动化规则也将失效',
      buttons: [
        {
          text: '取消',
          handler: () => { },
        },
        {
          text: '确认解除',
          handler: async () => {
            if (this.isSharedDevice) {
              try {
                await this.sharing.leaveShare(this.device.id);
                this.navCtrl.navigateRoot('/');
              } catch (error) {
                console.error('Failed to leave Device V2 share', error);
              }
              this.userService.getAllInfo();
            } else if (await this.removeOwnedDevice()) {
              this.navCtrl.navigateRoot('/');
              this.userService.getAllInfo();
            }
          },
        },
      ],
    });
    await this.confirmDialog.present();
  }

  private async removeOwnedDevice(): Promise<boolean> {
    try {
      if (this.device.config.mode === 'bbp2') {
        const id = this.device.id || this.device.deviceName;
        if (!id) throw new Error('设备标识无效');
        await this.management.deleteDeviceV2(id);
        return true;
      }
      return await this.userService.delDevice(this.device);
    } catch (error) {
      console.error('Failed to remove device', error);
      await this.noticeService.showToast('设备解绑失败，请稍后重试');
      return false;
    }
  }

  private applyContext(context: DeviceKeyContext): void {
    this.device.credentialVersion = context.credentialVersion;
    this.device.locator = context.locator;
  }

  private clearSecret(): void {
    this.secretKey = '';
    this.keyVisible = false;
  }

  private async writeClipboard(value: string): Promise<void> {
    await Clipboard.write({ string: value });
  }

  private async confirmAction(
    header: string,
    message: string,
    confirmText: string,
  ): Promise<boolean> {
    this.confirmDialog = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: confirmText, role: 'confirm' },
      ],
    });
    await this.confirmDialog.present();
    const result = await this.confirmDialog.onDidDismiss();
    this.confirmDialog = undefined;
    return result.role === 'confirm';
  }

  private keyErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof GatewayHttpError) {
      if (error.httpStatus === 403) return '只有设备所有者可以管理设备 Key';
      if (error.code === 'DEVICE_KEY_STEP_UP_UNAVAILABLE') {
        return '当前登录状态不能查看或刷新设备 Key';
      }
    }
    return fallback;
  }

  private requestId(prefix: string): string {
    const suffix = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  async addShortcut() {
    try {
      const result = await this.deviceShortcutService.pinDevice(this.device);
      if (result === 'requested') {
        await this.noticeService.showToast('已提交添加桌面快捷方式请求');
      } else {
        await this.noticeService.showToast('当前设备或桌面不支持添加快捷方式');
      }
    } catch (error) {
      console.error('Failed to add the device shortcut', error);
      await this.noticeService.showToast('添加桌面快捷方式失败，请稍后重试');
    }
  }

  showGuide() {
    void this.navCtrl.navigateForward('/guide', {
      queryParams: {
        mode: 'reconfigure',
        deviceId: this.device.id,
      },
    });
  }

  selectMenuItem(item: MenuListItem): void {
    if (item.route) {
      void this.navCtrl.navigateForward(item.route);
      return;
    }

    if (item.id === 'shortcut') {
      void this.addShortcut();
      return;
    }

    if (item.id === 'guide') {
      this.showGuide();
      return;
    }

    if (item.id === 'unbind') {
      this.unbind();
    }
  }
}
