import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { taskEntryState } from '../device-timer/device-timer.models';

import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { DeviceV2ManagementService } from 'src/app/core/services/device-v2-management.service';
import { DeviceV2ManifestCache } from 'src/app/core/services/device-v2-manifest-cache.service';
import { CapabilityDisplayMetadata, DeviceDisplayMetadata, displayText } from 'src/app/core/device-v2/display-metadata';
import { API } from 'src/app/configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext } from 'src/app/core/device-v2/account-scope';
import { CapacitorWiFiProvAllocationStore } from 'src/app/core/device-v2/provisioning/wifiprov-allocation-store';
import { CapacitorBleControllerCredentialStore } from 'src/app/core/device-v2/ble-direct/credential-store';
import { WiFiProvRetirement } from 'src/app/core/device-v2/provisioning/wifiprov-retirement';
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
  imports: [IonicModule, FormsModule, BDeviceImgComponent, MenuListComponent, TranslatePipe],
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
  displayOpen = false;
  displayBusy = false;
  displayError = '';
  displayRows: (CapabilityDisplayMetadata & { displayName: string; trueLabel: string; falseLabel: string })[] = [];
  private displayMetadata?: DeviceDisplayMetadata;
  private displayGeneration = 0;

  showKey = false;
  revealingKey = false;
  private revealedAuthKey = '';
  private rotateIdempotencyKey = '';
  private confirmDialog?: HTMLIonAlertElement;
  private readonly subscriptions = new Subscription();
  private destroyed = false;

  get loaded(): boolean {
    return !!this.device;
  }

  get isOwner(): boolean {
    return this.loaded && !this.isSharedDevice;
  }
  get canEditDisplay(): boolean { return this.isOwner && this.device.config.mode === 'bbp2'
    && !this.device.config.disabled && !this.device.config.isPreview; }

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

  get hasNewVersion() {
    return this.device?.data?.hasNewVersion;
  }

  get deviceMenuItems(): readonly MenuListItem[] {
    const timer = taskEntryState(this.device);
    const items: MenuListItem[] = [
      {
        id: 'timer',
        title: '定时任务',
        description: timer.description,
        icon: 'fa-timer',
        route: timer.available ? `/device-manager/${this.id}/timer` : undefined,
        disabled: !timer.available,
        showChevron: timer.available,
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
        title: '状态历史',
        description: '查看服务器实际收到的标量属性状态',
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
    private readonly manifests?: DeviceV2ManifestCache,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.activatedRoute.paramMap.subscribe(params => {
      this.id = params.get('id') ?? '';
      this.logicalDeviceId = this.id;
      ++this.displayGeneration; this.displayBusy = false;
      this.displayOpen = false; this.displayMetadata = undefined; this.displayRows = []; this.displayError = '';
      this.clearSecret();
      this.bindDevice();
    }));
    this.subscriptions.add(this.dataService.deviceDataLoader.subscribe(loaded => {
      if (loaded) this.bindDevice();
    }));
    this.subscriptions.add(this.dataService.authDataChanged?.subscribe(() => {
      ++this.displayGeneration; this.displayBusy = false; this.displayOpen = false;
      this.displayMetadata = undefined; this.displayRows = []; this.displayError = '';
      this.bindDevice();
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
    this.destroyed = true;
    ++this.displayGeneration;
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
      '请先在设备上触发 Blinker.resetNetwork()（或产品定义的网络重置操作），并确认设备开始广播 BLINKER_。仅重置网络时保留 Key 与 BLE 控制权；若清除了全部接入信息，重新配网将刷新 Key 并重建本地权限，仍保留原设备和控制页面。',
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
    if (!this.canEditDisplay || this.displayBusy) return;
    const id = this.logicalDeviceId, account = captureDeviceV2AccountContext(this.dataService, API.BASE_URL);
    const generation = ++this.displayGeneration;
    this.displayBusy = true; this.displayError = ''; this.cd.markForCheck();
    try {
      const baseline = await this.management.getDisplayMetadataV2(id);
      this.assertDisplayCurrent(id, account, generation);
      this.dataService.updateDeviceV2DisplayMetadata(baseline);
      const dialog = await this.alertCtrl.create({
        header: '自定义设备名',
        inputs: [{ name: 'customName', value: baseline.name, placeholder: baseline.name, attributes: { maxlength: 128 } }],
        buttons: [
          { text: '取消', role: 'cancel' },
          { text: '确认修改', handler: (data) => {
            if (this.displayCurrent(id, account, generation)) void this.saveName(data.customName, baseline);
          } },
        ],
      });
      this.assertDisplayCurrent(id, account, generation);
      this.confirmDialog = dialog;
      await dialog.present();
    } catch (error) {
      if (this.displayCurrent(id, account, generation)) this.displayError = this.displayErrorMessage(error);
    } finally { if (generation === this.displayGeneration) { this.displayBusy = false; if (!this.destroyed) this.cd.markForCheck(); } }
  }

  async saveName(customName: string, baseline?: DeviceDisplayMetadata): Promise<void> {
    if (!this.canEditDisplay || this.displayBusy) return;
    const id = this.logicalDeviceId, account = captureDeviceV2AccountContext(this.dataService, API.BASE_URL);
    const generation = ++this.displayGeneration;
    this.displayBusy = true; this.displayError = ''; this.cd.markForCheck();
    try {
      const name = displayText(customName);
      // The dialog freezes its base revision before editing. A direct caller
      // obtains its own baseline; neither path retries a CAS conflict.
      const current = baseline ?? await this.management.getDisplayMetadataV2(id);
      this.assertDisplayCurrent(id, account, generation);
      if (current.logicalDeviceId !== id) throw Error('DEVICE_V2_DISPLAY_INVALID');
      const saved = await this.management.saveDisplayMetadataV2({ ...current, name });
      this.assertDisplayCurrent(id, account, generation);
      this.dataService.updateDeviceV2DisplayMetadata(saved);
      // A previously opened alias form must be explicitly reloaded after rename.
      this.displayMetadata = undefined;
      await this.noticeService.showToast('设备名称已保存');
    } catch (error) {
      if (this.displayCurrent(id, account, generation)) this.displayError = this.displayErrorMessage(error);
    } finally { if (generation === this.displayGeneration) { this.displayBusy = false; if (!this.destroyed) this.cd.markForCheck(); } }
  }

  async loadDisplayMetadata(): Promise<void> {
    if (!this.canEditDisplay || this.displayBusy) return;
    const id = this.logicalDeviceId, account = captureDeviceV2AccountContext(this.dataService, API.BASE_URL);
    const generation = ++this.displayGeneration;
    this.displayOpen = true; this.displayBusy = true; this.displayError = ''; this.displayMetadata = undefined;
    this.cd.markForCheck();
    try {
      const current = await this.management.getDisplayMetadataV2(id);
      this.assertDisplayCurrent(id, account, generation);
      this.dataService.updateDeviceV2DisplayMetadata(current);
      this.displayMetadata = current;
      this.displayRows = (this.manifests?.load(id)?.fields ?? []).map(field => {
        const alias = current.capabilities.find(item => item.key === field.key && item.kind === field.kind && item.type === field.type);
        return { key: field.key, kind: field.kind, type: field.type,
          displayName: alias?.displayName ?? '', trueLabel: alias?.trueLabel ?? '', falseLabel: alias?.falseLabel ?? '' };
      });
    } catch (error) {
      if (this.displayCurrent(id, account, generation)) this.displayError = this.displayErrorMessage(error);
    } finally { if (generation === this.displayGeneration) { this.displayBusy = false; if (!this.destroyed) this.cd.markForCheck(); } }
  }

  get canSaveDisplay(): boolean { return this.canEditDisplay && !this.displayBusy && !!this.displayMetadata && this.displayRows.length > 0; }
  async saveDisplayMetadata(): Promise<void> {
    if (!this.canSaveDisplay) return;
    const id = this.logicalDeviceId, account = captureDeviceV2AccountContext(this.dataService, API.BASE_URL);
    const generation = ++this.displayGeneration;
    const current = this.displayMetadata!;
    this.displayBusy = true; this.displayError = ''; this.cd.markForCheck();
    try {
      // Preserve orphaned/incompatible aliases. Only visible compatible entries
      // are removed by blank inputs, or explicitly replaced with a new alias.
      const aliases = new Map(current.capabilities.map(item => [item.key, item]));
      for (const row of this.displayRows) {
        const alias: CapabilityDisplayMetadata = { key: row.key, kind: row.kind, type: row.type };
        for (const key of ['displayName', 'trueLabel', 'falseLabel'] as const) {
          if (row[key].trim()) alias[key] = displayText(row[key], true);
        }
        const old = aliases.get(row.key);
        if (old?.kind === row.kind && old.type === row.type) aliases.delete(row.key);
        if (alias.displayName || alias.trueLabel || alias.falseLabel) aliases.set(row.key, alias);
      }
      const saved = await this.management.saveDisplayMetadataV2({ ...current, capabilities: [...aliases.values()] });
      this.assertDisplayCurrent(id, account, generation);
      this.dataService.updateDeviceV2DisplayMetadata(saved); this.displayMetadata = saved;
      await this.noticeService.showToast('功能名称已保存，控制、自动化和定时页面共用');
    } catch (error) {
      if (this.displayCurrent(id, account, generation)) this.displayError = this.displayErrorMessage(error);
    } finally { if (generation === this.displayGeneration) { this.displayBusy = false; if (!this.destroyed) this.cd.markForCheck(); } }
  }

  private assertDisplayCurrent(id: string, account: ReturnType<typeof captureDeviceV2AccountContext>, generation: number): void {
    assertDeviceV2AccountContext(this.dataService, account);
    if (this.destroyed || generation !== this.displayGeneration || id !== this.logicalDeviceId || !this.canEditDisplay) throw Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
  }
  private displayCurrent(id: string, account: ReturnType<typeof captureDeviceV2AccountContext>, generation: number): boolean {
    try { this.assertDisplayCurrent(id, account, generation); return true; } catch { return false; }
  }
  private displayErrorMessage(error: unknown): string {
    if (error instanceof GatewayHttpError && error.httpStatus === 409) {
      this.displayMetadata = undefined;
      return '设备名称或功能名称已被修改，请重新加载后核对；不会自动覆盖。';
    }
    return error instanceof Error && error.message === 'DEVICE_V2_DISPLAY_INVALID'
      ? '名称过长或包含无效字符，请检查后再保存。'
      : '尚未确认保存结果，请重新加载核对；不会自动重发。';
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
      header: this.isSharedDevice ? '确认退出分享' : '确认移除设备',
      message: this.isSharedDevice ? '退出后，你将失去该设备的分享权限'
        : '移除后，云端归属和分享权限将失效；如有设备 Key，也会失效。蓝牙或局域网设备交给他人前仍需现场重置授权，再重新添加。仅重启或移除云端记录不代表本地权限已清除。',
      buttons: [
        {
          text: '取消',
          handler: () => { },
        },
        {
          text: this.isSharedDevice ? '退出分享' : '移除设备',
          handler: async () => {
            if (this.isSharedDevice) {
              try {
                const result = await this.sharing.leaveShare(this.device.id);
                await this.noticeService.showToast(result.realtimeRefreshPending
                  ? '已退出分享，通信权限同步中' : '已退出分享');
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
        const expected = captureDeviceV2AccountContext(this.dataService, API.BASE_URL);
        const current = () => {
          if (this.destroyed || this.logicalDeviceId !== id) throw Error('DEVICE_REMOVAL_CONTEXT_CHANGED');
          assertDeviceV2AccountContext(this.dataService, expected);
          return expected;
        };
        const retirement = new WiFiProvRetirement(new CapacitorWiFiProvAllocationStore(current),
          new CapacitorBleControllerCredentialStore(current), this.management, current);
        const { response: result, allocationCleanupPending } = await retirement.removeOwned(id);
        this.clearSecret();
        await this.noticeService.showToast(allocationCleanupPending
          ? '云端授权已撤销，本机配网记录清理未完成；重置设备后再次配网可重试清理'
          : result.data.brokerCleanupPending || result.data.realtimeRefreshPending
          ? '云端授权已撤销，通信清理中；本地权限尚未确认清除'
          : '设备已从云端移除；本地权限尚未确认清除');
        return true;
      }
      await this.noticeService.showToast('当前仅支持 V2 设备移除，请先确认设备接入类型');
      return false;
    } catch (error) {
      // No raw HTTP error bodies or secret-bearing request objects in logs.
      const code = error instanceof GatewayHttpError ? error.code : undefined;
      await this.noticeService.showToast(code === 'DEVICE_V2_REMOVAL_LOCAL_LIFECYCLE_REQUIRED'
        ? '该接入类型的移除流程尚未开放，设备未被移除'
        : code === 'DEVICE_V2_REMOVAL_ROUTE_CHANGING'
          ? '设备通信路由正在调整，请稍后重试'
          : '设备移除未确认，请刷新设备列表后重试');
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
    if (item.disabled || (item.id === 'timer' && !taskEntryState(this.device).available)) return;
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
