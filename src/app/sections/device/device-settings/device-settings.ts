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
import { DeviceShortcutService } from 'src/app/core/services/device-shortcut.service';
import { NoticeService } from 'src/app/core/services/notice.service';

import { ShareService } from '../device-share/share.service';
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
        title: '设备位置设置',
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
        id: 'layouter',
        title: '界面配置',
        description: '配置该设备的界面',
        icon: 'fa-grid-4',
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
    private activatedRoute: ActivatedRoute,
    private userService: UserService,
    private deviceService: DeviceService,
    private dataService: DataService,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private shareService: ShareService,
    private deviceShortcutService: DeviceShortcutService,
    private noticeService: NoticeService
  ) { }

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
    this.confirm.present();
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
    this.confirm = await this.alertCtrl.create({
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
