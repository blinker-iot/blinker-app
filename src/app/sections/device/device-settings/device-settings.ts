import { Component, OnDestroy, OnInit } from '@angular/core';
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
import { TranslatePipe } from '@ngx-translate/core';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { firstValueFrom } from 'rxjs';
import { ManagedDeviceService } from 'src/app/core/gateway/managed-device.service';
import { DeviceShortcutService } from 'src/app/core/services/device-shortcut.service';
import { NoticeService } from 'src/app/core/services/notice.service';

import { ShareService } from '../device-share/share.service';
import { LayouterService } from 'src/app/device/layouter.service';
import {
  MenuListComponent,
  MenuListItem,
} from 'src/app/core/components/menu-list/menu-list';

@Component({
  selector: 'app-device-settings',
  standalone: true,
  templateUrl: 'device-settings.html',
  styleUrls: ['device-settings.scss'],
  imports: [IonicModule, BDeviceImgComponent, MenuListComponent, TranslatePipe],
})
export class DeviceSettingsPage implements OnInit, OnDestroy {
  id;
  device: BlinkerDevice;

  showKey = false;

  confirm;

  loaded;

  get isSharedDevice() {
    return Boolean(this.device?.config?.isShared);
  }

  get isAdvancedDeveloper() {
    return this.dataService.isAdvancedDeveloper;
  }

  get isDevDevice() {
    return Boolean(this.device?.config?.isDev);
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

  get isManaged() {
    return this.device?.config?.mode === 'managed-http';
  }

  get deviceMenuItems(): readonly MenuListItem[] {
    if (this.isManaged) return [];
    return [
      {
        id: 'timer',
        title: '定时任务',
        description: '设置设备按计划自动执行',
        icon: 'fa-timer',
        badge: this.hasTimerTask ? '已启用' : undefined,
        route: `/device-manager/${this.id}/timer`,
      },
      {
        id: 'guide',
        title: '配置向导',
        description: '重新查看设备面板的配置说明',
        icon: 'fa-message-bot',
      },
    ];
  }

  get dangerMenuItems(): readonly MenuListItem[] {
    const items: MenuListItem[] = [];
    if (this.deviceShortcutService.isAvailable) {
      items.push({
        id: 'shortcut',
        title: '添加桌面快捷方式',
        description: '使用设备图片创建直达该设备的桌面图标',
        icon: 'fa-grid-2-plus',
      });
    }

    items.push(
      {
        id: 'unbind',
        title: this.isManaged
          ? '删除设备'
          : (this.isSharedDevice ? '退出设备共享' : '解除设备绑定'),
        description: this.isManaged
          ? '从当前账户中删除这台设备'
          : this.isSharedDevice
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
    private activatedRoute: ActivatedRoute,
    private userService: UserService,
    private deviceService: DeviceService,
    private dataService: DataService,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private shareService: ShareService,
    private managedDevices: ManagedDeviceService,
    private layouterService: LayouterService,
    private deviceShortcutService: DeviceShortcutService,
    private noticeService: NoticeService
  ) {}

  subscription;
  ngOnInit() {
    this.bindDevice();
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) {
        this.bindDevice();
      }
    });
  }

  private bindDevice() {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = !!this.device;
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    if (this.confirm) {
      this.confirm.dismiss();
    }
  }

  changeName() {
    this.showChangeNameConfirm();
  }

  showAuthKey() {
    this.showKey = true;
  }

  async showChangeNameConfirm() {
    this.confirm = await this.alertCtrl.create({
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
          handler: () => {},
        },
        {
          text: '确认修改',
          handler: (data) => {
            this.saveName(data.customName);
          },
        },
      ],
    });
    this.confirm.present();
  }

  async saveName(customName) {
    if (this.isManaged) {
      const name = String(customName ?? '').trim();
      if (!name) return;
      await firstValueFrom(this.managedDevices.updateConfig(
        this.device.deviceName,
        { displayName: name },
      ));
      this.device.config.customName = name;
      return;
    }
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
      if (this.isManaged) {
        await firstValueFrom(this.managedDevices.updateConfig(
          this.device.deviceName,
          { image: image.data },
        ));
        this.device.config.image = image.data;
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
    this.confirm = await this.alertCtrl.create({
      header: this.isManaged ? '确认删除设备' : '确认解除绑定',
      message: this.isManaged
        ? '删除后将无法再从当前账户访问这台设备。'
        : '解绑后，你将无法控制这个设备，关联该设备的自动化规则也将失效',
      buttons: [
        {
          text: '取消',
          handler: () => {},
        },
        {
          text: '确认解除',
          handler: async () => {
            if (this.isManaged) {
              await firstValueFrom(this.managedDevices.deleteDevice(this.device.deviceName));
              this.navCtrl.navigateRoot('/');
            } else if (this.isSharedDevice) {
              if (await this.shareService.deleteSharedDevice(this.device.id)) {
                this.navCtrl.navigateRoot('/');
              }
              this.userService.getAllInfo();
            } else if (await this.userService.delDevice(this.device)) {
              this.navCtrl.navigateRoot('/');
              this.userService.getAllInfo();
            }
          },
        },
      ],
    });
    this.confirm.present();
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
    this.navCtrl.navigateBack('/device/' + this.device.id);
    setTimeout(() => {
      this.layouterService.action.next({
        name: 'showGuide',
        data: this.device.id,
      });
    }, 100);
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
