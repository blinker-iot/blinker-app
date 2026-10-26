import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clipboard } from '@capacitor/clipboard';

import {
  AlertController,
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular/standalone';

import { DeviceService } from 'src/app/core/services/device.service';
import { DevicePanelService } from 'src/app/core/services/device-panel.service';
import type { PanelMode } from 'src/app/core/device-v2/custom-panel';
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

import { readDevicePanelMode, saveSharedDevicePanelMode } from 'src/app/device/device-panel-mode';
import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { DeviceV2ManagementService } from 'src/app/core/services/device-v2-management.service';
import { DeviceV2ManifestCache } from 'src/app/core/services/device-v2-manifest-cache.service';
import { CapabilityDisplayMetadata, DeviceDisplayMetadata, displayText } from 'src/app/core/device-v2/display-metadata';
import { API } from 'src/app/configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext } from 'src/app/core/device-v2/account-scope';
import { CapacitorWiFiProvAllocationStore } from 'src/app/core/device-v2/provisioning/wifiprov-allocation-store';
import { CapacitorBleControllerCredentialStore } from 'src/app/core/device-v2/ble-direct/credential-store';
import { WiFiProvRetirement } from 'src/app/core/device-v2/provisioning/wifiprov-retirement';
import { RoomService, roomErrorMessage } from '../../room/room.service';
import { DeviceCardEditor } from '../../../home/device-card-editor.service';
import { DeviceCardSettingsPanel } from '../../../home/components/device-card-settings/device-card-settings';
import { environment } from 'src/environments/environment';
import { PanelModeSelectorComponent } from './panel-mode-selector/panel-mode-selector.component';

import {
  MenuListComponent,
  MenuListItem,
} from 'src/app/core/components/menu-list/menu-list';

type KeyOperation = '' | 'reveal' | 'rotate';

type ManagedDevice = BlinkerDevice
  & Partial<DeviceKeyLogicalDevice>
  & Partial<DeviceKeyContext>;

interface PanelModeSelectionScope {
  device: ManagedDevice;
  id: string;
  accountId: string | undefined;
  sessionEpoch: number;
}

@Component({
  selector: 'app-device-settings',
  standalone: true,
  templateUrl: 'device-settings.html',
  styleUrls: ['device-settings.scss'],
  providers: [DeviceCardEditor],
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonModal,
    IonSpinner,
    IonTitle,
    IonToolbar,
    FormsModule,
    BDeviceImgComponent,
    MenuListComponent,
    TranslatePipe,
    DeviceCardSettingsPanel,
    PanelModeSelectorComponent,
  ],
})

export class DeviceSettingsPage implements OnInit, OnDestroy {
  id = '';
  logicalDeviceId = '';

  device!: ManagedDevice;

  imageSaving = false;
  panelModeSaving = false;
  panelModeLoading = false;
  panelModeSelectionOpen = false;
  panelModeError = '';
  private panelModeSelectionScope?: PanelModeSelectionScope;
  @ViewChild('panelModeDialog') private panelModeDialog?: IonModal;
  readonly canDismissPanelMode = (_data?: unknown, role?: string): boolean =>
    role === 'scope-change' || !this.panelModeSaving;
  debugModeSaving = false;
  roomSelectionBusy = false;
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
  private roomDialog?: HTMLIonAlertElement;
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

  get canEditHomeCard(): boolean {
    const id = this.logicalDeviceId || this.device?.deviceName;
    return !this.destroyed && !!this.cardEditor && !!this.dataService.auth?.uuid && !!id
      && this.dataService.getDevice(id) === this.device && this.device?.config.mode === 'bbp2'
      && !this.device.config.disabled && !this.device.config.isPreview;
  }

  get panelMode(): PanelMode {
    return readDevicePanelMode(this.device);
  }

  get debugEnabled(): boolean {
    return this.device?.config.component === 'TestDashboard';
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


  get hasNewVersion() {
    return this.device?.data?.hasNewVersion;
  }

  get deviceMenuItems(): readonly MenuListItem[] {
    const timer = environment.deployment.tasks ? taskEntryState(this.device)
      : { available: false, description: '当前服务环境暂未开放定时任务；已有设备任务不受此入口影响。' };
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
        title: '地理位置',
        icon: 'fa-location-dot',
        description: this.isSharedDevice ? '地理位置暂不向分享用户开放'
          : '在地图上查看或调整设备位置',
        route: `/device-manager/${this.id}/location`,
      },
      {
        id: 'logs',
        title: '活动记录',
        icon: 'fa-list-check',
        description: this.isSharedDevice ? '活动记录暂不向分享用户开放' : '查看最近 7 天保留的云端控制投递',
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

    if (this.canEditHomeCard) {
      items.push({ id: 'home-card', title: '首页卡片', icon: 'fa-table-cells',
        description: '设置当前账号在本机的卡片大小和显示数据' });
    }

    if (this.device?.config.mode === 'bbp2' && !this.device.config.isPreview && !this.device.config.disabled) {
      items.push({ id: 'trends', title: '在线趋势', description: '查看云在线时周期归档的数值样本',
        icon: 'fa-chart-line', route: `/device-manager/${this.id}/trends` });
    }

    if (this.deviceShortcutService.isAvailable) {
      items.push({
        id: 'shortcut',
        title: '添加桌面快捷方式',
        icon: 'fa-arrow-up-right-from-square',
        description: '使用设备图片创建直达该设备的桌面图标',
      });
    }

    return items;
  }

  get managementMenuItems(): readonly MenuListItem[] {
    const rooms = this.dataService.room.list.filter(name => this.dataService.room.dict[name].includes(this.id));

    const items: MenuListItem[] = [
      {
        id: 'rooms',
        title: '所属区域',
        icon: 'fa-house',
        description: this.device?.config.isPreview ? '预览设备不支持分配区域'
          : this.roomSelectionBusy ? '正在设置区域…'
          : this.dataService.roomRevision === null ? '选择设备所属区域'
          : rooms.join('、') || '未分配区域',
        disabled: this.roomSelectionBusy || Boolean(this.device?.config.isPreview),
      },
      {
        id: 'update',
        title: '固件更新',
        icon: 'fa-microchip',
        description: '检查版本并更新设备固件',
        badge: this.hasNewVersion ? '有新版本' : undefined,
        route: `/device-manager/${this.id}/update`,
      },
      {
        id: 'guide',
        title: '设备配置',
        icon: 'fa-gear',
        description: '重新配置该设备网络和密钥',
      },
      {
        id: 'uic',
        title: '界面配置',
        icon: 'fa-pen-ruler',
        description: '配置该设备的界面',
        route: `/device-manager/${this.id}/uic`,
      },
    ];

    if (this.device?.config.mode === 'bbp2') {
      items.push({
        id: 'component-preview',
        title: '组件预览',
        icon: 'fa-grid-2',
        description: '查看所有组件与主题效果',
        route: `/device-manager/${this.id}/component-preview`,
      });
    }

    if (this.device?.config.mode === 'bbp2' && !this.isSharedDevice) {
      items.push({
        id: 'components',
        title: '组件配置中心',
        icon: 'fa-sliders',
        description: '选择控制页面显示的设备字段',
        route: `/device-manager/${this.id}/components`,
      });
    }

    if (!this.isSharedDevice) {
      items.push({
        id: 'sharing',
        title: '设备共享',
        icon: 'fa-share-nodes',
        description: '邀请其他用户共同控制这台设备',
        route: `/share-manager/${this.id}?from=device-settings`,
      });
    }

    items.push(
      {
        id: 'unbind',
        title: this.isSharedDevice ? '退出设备共享' : '解除设备绑定',
        icon: 'fa-link-slash',
        description: this.isSharedDevice
          ? '移除这台由其他用户共享的设备'
          : '从账户中移除设备及其关联自动化',
        danger: true,
        showChevron: false,
      },
    );

    return items;
  }

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
    private readonly panels?: DevicePanelService,
    private readonly roomService?: RoomService,
    readonly cardEditor?: DeviceCardEditor,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.activatedRoute.paramMap.subscribe(params => {
      const nextId = params.get('id') ?? '';
      if (nextId !== this.id) this.closePanelModeSelector(true);
      if (this.id && nextId !== this.id) this.cardEditor?.cancel();
      this.id = nextId;
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
      this.closePanelModeSelector(true);
      ++this.displayGeneration; this.displayBusy = false; this.displayOpen = false;
      this.displayMetadata = undefined; this.displayRows = []; this.displayError = '';
      this.bindDevice();
    }));
    this.subscriptions.add(this.dataService.userDataLoader?.subscribe(() => {
      this.cd.markForCheck();
    }));
  }

  private bindDevice(): void {
    const previous = this.device;

    this.device = this.dataService.getDevice(this.logicalDeviceId) as ManagedDevice;
    if (previous !== this.device) this.closePanelModeSelector(true);

    this.supportsWifiProvisioning = environment.deployment.directAccess && this.isOwner
      && this.hasDeviceKeyContext
      && this.device.state === 'active'
      && this.device.cloudEnabled === true;

    this.supportsGatewayEnrollment = environment.deployment.directAccess && this.isOwner
      && this.hasDeviceKeyContext
      && this.device.deviceType === 'edge-hub'
      && Number.isSafeInteger(this.device.cloudLastSeenAt)
      && (this.device.cloudLastSeenAt ?? 0) > 0;

    if (this.device && this.device !== previous && this.device.config.mode !== 'bbp2') {
      void this.loadPanelMode();
    }

    this.cd.markForCheck();
  }

  private async loadPanelMode(): Promise<void> {
    const device = this.device;

    this.panelModeLoading = true;

    try {
      const record = await this.panels!.get(device);

      if (record && !this.destroyed && this.device === device) this.panels!.install(device, record);
    } catch {
      if (!this.destroyed) await this.noticeService.showToast('读取界面模式失败，请稍后重试');
    } finally {
      if (this.device === device) this.panelModeLoading = false;
      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  openPanelModeSelector(): void {
    if (this.destroyed || !this.device || this.panelModeSelectionScope || this.panelModeSaving
      || this.panelModeLoading || this.debugModeSaving) return;
    this.panelModeSelectionScope = {
      device: this.device, id: this.id,
      accountId: this.dataService.auth?.uuid, sessionEpoch: this.dataService.sessionEpoch,
    };
    this.panelModeError = '';
    this.panelModeSelectionOpen = true;
  }

  closePanelModeSelector(force = false): void {
    if (this.panelModeSaving && !force) return;
    this.panelModeSelectionOpen = false;
    // Keep the modal mounted until Ionic has cleaned up focus and scroll locks.
    if (force) void this.panelModeDialog?.dismiss(undefined, 'scope-change');
  }

  panelModeDismissed(): void {
    this.panelModeSelectionOpen = false;
    this.panelModeSelectionScope = undefined;
    this.panelModeError = '';
  }

  private panelModeScopeCurrent(scope: PanelModeSelectionScope): boolean {
    return !this.destroyed && this.panelModeSelectionOpen && this.panelModeSelectionScope === scope
      && this.device === scope.device && this.id === scope.id
      && this.dataService.auth?.uuid === scope.accountId && this.dataService.sessionEpoch === scope.sessionEpoch;
  }

  async confirmPanelMode(mode: PanelMode): Promise<void> {
    const scope = this.panelModeSelectionScope;
    if (!scope || !this.panelModeScopeCurrent(scope)) {
      this.closePanelModeSelector(true);
      return;
    }
    if ((mode !== 'normal' && mode !== 'custom') || this.panelModeSaving || this.panelModeLoading
      || this.debugModeSaving || (mode === 'custom' && this.isSharedDevice && !this.device.config.customPanel)) return;
    this.panelModeError = '';
    if (mode === 'custom' && !this.device.config.customPanel) {
      // Creating content is navigation, not a successful mode switch.
      this.closePanelModeSelector();
      await this.setPanelMode(mode);
      return;
    }
    await this.setPanelMode(mode);
    if (!this.panelModeScopeCurrent(scope)) return;
    if (this.panelMode === mode) this.closePanelModeSelector();
    else this.panelModeError = '未能保存显示模式，请重试。当前使用的模式未改变。';
    this.cd.markForCheck();
  }

  async setPanelMode(mode: PanelMode): Promise<void> {
    if (!this.device || (mode !== 'normal' && mode !== 'custom') || this.panelModeSaving
      || this.panelModeLoading || this.debugModeSaving) return;

    const device = this.device;

    if (mode === 'custom' && !device.config.customPanel) {
      if (this.isSharedDevice) return;

      await this.navCtrl.navigateForward(`/device-manager/${encodeURIComponent(this.id)}/uic/custom`);

      return;
    }

    if (mode === this.panelMode) return;

    this.panelModeSaving = true;

    try {
      if (this.isSharedDevice) {
        if (!saveSharedDevicePanelMode(device, mode)) throw new Error('mode-save-failed');

        device.subject.next({ key: 'component', value: device.config.component, source: 'device-settings' });
      } else if (device.config.mode === 'bbp2') {
        const context = device.config.isPreview ? undefined
          : captureDeviceV2AccountContext(this.dataService, API.BASE_URL);

        const config = { panelMode: mode, component: 'DeviceV2' };

        if (!device.config.isPreview && !await this.deviceService.saveDeviceConfig(device, config)) throw new Error('mode-save-failed');
        if (context) assertDeviceV2AccountContext(this.dataService, context);

        Object.assign(device.config, config);
        device.subject.next({ key: 'component', value: config.component, source: 'device-settings' });
      } else {
        await this.panels!.setView(device, mode);
      }
    } catch {
      if (!this.destroyed) await this.noticeService.showToast('切换界面模式失败，请稍后重试');
    } finally {
      this.panelModeSaving = false;

      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  async setDebugMode(enabled: boolean): Promise<void> {
    if (!this.device || this.isSharedDevice || this.debugModeSaving || this.panelModeSaving
      || this.panelModeLoading || enabled === this.debugEnabled) return;

    const device = this.device;

    this.debugModeSaving = true;

    this.cd.markForCheck();

    try {
      if (device.config.mode !== 'bbp2') {
        await this.panels!.setView(device, enabled ? 'debug' : this.panelMode);
      } else {
        const context = device.config.isPreview ? undefined
          : captureDeviceV2AccountContext(this.dataService, API.BASE_URL);

        const component = enabled ? 'TestDashboard' : 'DeviceV2';

        if (!device.config.isPreview && !await this.deviceService.saveDeviceConfig(device, { component })) throw new Error('mode-save-failed');
        if (context) assertDeviceV2AccountContext(this.dataService, context);

        device.config.component = component;
        device.subject.next({ key: 'component', value: component, source: 'device-settings' });
      }

      if (!this.destroyed && this.device === device) {
        await this.navCtrl.navigateRoot(`/device/${encodeURIComponent(this.id)}`);
      }
    } catch {
      if (!this.destroyed) await this.noticeService.showToast('切换调试模式失败，请稍后重试');
    } finally {
      this.debugModeSaving = false;

      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  ionViewWillLeave(): void {
    // Ionic may cache this page rather than destroy it on navigation.
    this.cardEditor?.cancel();
    this.closePanelModeSelector(true);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.closePanelModeSelector(true);
    this.cardEditor?.cancel();
    ++this.displayGeneration;
    this.subscriptions.unsubscribe();
    this.clearSecret();
    void this.confirmDialog?.dismiss();
    void this.roomDialog?.dismiss();
  }

  async selectRooms(): Promise<void> {
    const roomService = this.roomService;
    if (!this.loaded || !roomService || this.roomSelectionBusy || this.device.config.isPreview) return;

    const deviceId = this.id;
    const sessionEpoch = this.dataService.sessionEpoch;

    this.roomSelectionBusy = true;

    this.cd.markForCheck();

    try {
      const snapshot = await roomService.load();

      if (this.destroyed || this.id !== deviceId) return;

      let saving = false;

      const alert = await this.alertCtrl.create({
        header: '所属区域',
        message: snapshot.order.length ? '可选择多个区域，全部取消即为未分配。' : '还没有区域，请先创建区域。',
        backdropDismiss: false,
        inputs: snapshot.order.map(name => ({
          type: 'checkbox',
          label: name,
          value: name,
          checked: snapshot.rooms[name].includes(deviceId),
        })),
        buttons: [
          { text: '取消', role: 'cancel', handler: () => !saving },
          snapshot.order.length ? {
            text: '保存',
            handler: async (selected: string[]) => {
              if (saving || this.destroyed || this.id !== deviceId) return false;

              const selectedRooms = new Set(selected);

              const changed = snapshot.order.some(name =>
                selectedRooms.has(name) !== snapshot.rooms[name].includes(deviceId));

              if (!changed) return true;

              const draft = { list: [...snapshot.order], dict: structuredClone(snapshot.rooms) };

              for (const name of draft.list) {
                const devices = draft.dict[name];

                if (selectedRooms.has(name)) {
                  if (!devices.includes(deviceId)) devices.push(deviceId);
                } else {
                  draft.dict[name] = devices.filter(id => id !== deviceId);
                }
              }

              saving = true;
              alert.message = '正在保存…';

              try {
                await roomService.saveData(draft, snapshot.revision, sessionEpoch);

                return true;
              } catch (error) {
                alert.message = roomErrorMessage(error);

                return false;
              } finally {
                saving = false;
              }
            },
          } : { text: '管理区域', role: 'manage' },
        ],
      });

      this.roomDialog = alert;

      if (this.destroyed || this.id !== deviceId) {
        alert.remove();

        return;
      }

      await alert.present();

      const result = await alert.onDidDismiss();

      if (result.role === 'manage' && !this.destroyed && this.id === deviceId) {
        await this.navCtrl.navigateForward('/room-manager', {
          state: { backHref: `/device/${deviceId}/settings` },
        });
      }
    } catch (error) {
      if (!this.destroyed) await this.noticeService.showToast(roomErrorMessage(error));
    } finally {
      this.roomDialog = undefined;
      this.roomSelectionBusy = false;

      if (!this.destroyed) this.cd.markForCheck();
    }
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
      await this.noticeService.showToast(this.keyErrorMessage(error, '设备密钥读取失败，请稍后重试'));
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

  async selectIcon(): Promise<void> {
    if (this.isSharedDevice || this.imageSaving) return;

    const device = this.device;

    this.imageSaving = true;

    try {
      const context = device.config.isPreview ? undefined
        : captureDeviceV2AccountContext(this.dataService, API.BASE_URL);

      const modal = await this.modalCtrl.create({
        component: DeviceIconPage,
        componentProps: { currentImage: device.config.image },
      });

      await modal.present();

      const { data: image } = await modal.onDidDismiss<string>();

      if (typeof image !== 'string' || image === device.config.image || this.destroyed) return;
      if (context) assertDeviceV2AccountContext(this.dataService, context);

      if (!device.config.isPreview && !await this.deviceService.saveDeviceConfig(device, { image })) {
        throw new Error('image-save-failed');
      }

      if (context) assertDeviceV2AccountContext(this.dataService, context);
      if (this.destroyed) return;

      device.config.image = image;

      device.subject.next({ key: 'image', value: image });
      this.cd.markForCheck();
    } catch {
      if (!this.destroyed) await this.noticeService.showToast('保存设备图片失败，请稍后重试');
    } finally {
      this.imageSaving = false;

      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  async copyDeviceId(): Promise<void> {
    const id = this.device.id || this.device.deviceName;

    try {
      await this.writeClipboard(id);
      await this.noticeService.showToast('设备 ID 已复制');
    } catch {
      await this.noticeService.showToast('复制失败，请重试');
    }
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
      if (error.code === 'DEVICE_KEY_RECENT_AUTH_REQUIRED') {
        return '为保护设备 Key，请先退出并重新登录，再重试本次操作；无需删除或重新创建设备';
      }

      if (error.code === 'DEVICE_KEY_STEP_UP_UNAVAILABLE') {
        return '设备 Key 安全校验暂时不可用，请稍后重试；无需重新创建设备';
      }

      if (error.httpStatus === 403) return '只有设备所有者可以管理设备 Key';
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
    if (item.disabled || (item.id === 'timer' && (!environment.deployment.tasks || !taskEntryState(this.device).available))) return;
    if (item.id === 'home-card') {
      this.openHomeCardSettings();
      return;
    }
    if (item.id === 'rooms') {
      void this.selectRooms();

      return;
    }
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

  openHomeCardSettings(): void {
    if (!this.canEditHomeCard) return;
    const id = this.logicalDeviceId || this.device.deviceName;
    if (this.cardEditor!.beginSingle(id)) this.cardEditor!.openSettings(id);
  }
}
