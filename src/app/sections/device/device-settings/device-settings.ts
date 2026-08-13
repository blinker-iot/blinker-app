import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AlertController,
  IonicModule,
  ModalController,
  NavController,
  Platform,
} from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { DeviceIconPage } from '../../../core/pages/device-icon/device-icon';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { ImageService } from 'src/app/core/services/image.service';
import { AndroidShortcuts } from 'capacitor-android-shortcuts';
import { TranslatePipe } from '@ngx-translate/core';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';

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

  get deviceMenuItems(): readonly MenuListItem[] {
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
        id: 'shortcut',
        title: '添加到桌面',
        description: '创建快速访问设备的桌面入口',
        icon: 'fa-grid-2-plus',
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
    return [
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
    ];
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
    public platform: Platform,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private shareService: ShareService,
    private imageService: ImageService,
    private layouterService: LayouterService
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
          handler: () => {},
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
    if (!(await this.checkSupportShort()).result) return;
    let base64Data: any;
    if (
      this.device.config.image.indexOf('https://') > -1 ||
      this.device.config.image.indexOf('http://') > -1
    ) {
      base64Data = await this.getBase64ImageByUrl(this.device.config.image);
    } else {
      base64Data = await this.getBase64Image(
        this.getImagePath(this.device.config.image)
      );
    }
    let shortcut: any = {
      id: this.device.id,
      shortLabel: this.device.config.customName,
      longLabel: 'a blinker device',
      icon: {
        type: 'Bitmap',
        name: base64Data,
      },
      data: '/device/' + this.device.id,
    };
    AndroidShortcuts.pin(shortcut);
  }

  getBase64ImageByUrl(imgurl) {
    // return new Promise<string>((resolve, reject) => {
    //   console.log(imgurl);
    //   let path = this.file.externalDataDirectory + 'temp.png';
    //   const fileTransfer: FileTransferObject = this.fileTransfer.create();
    //   fileTransfer.download(imgurl, path).then((entry) => {
    //     console.log('download complete: ' + entry.toURL());
    //     // let filename=entry.toURL().slice(entry.toURL().lastIndexOf("/"))
    //     this.file.readAsDataURL(this.file.externalDataDirectory, 'temp.png').then(base64 => {
    //       base64 = base64.replace("data:image/png;base64,", '');
    //       return resolve(base64);
    //     })
    //   })
    // })
  }

  getBase64Image(imgurl) {
    return new Promise<string>((resolve, reject) => {
      let image = new Image();
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = imgurl;
      image.onload = () => {
        let canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);
        // console.log(image.src);
        let base64 = canvas.toDataURL('image/png');
        base64 = base64.replace(/^data:image\/png;base64,/, '');
        return resolve(base64);
      };
    });
  }

  getImagePath(filename) {
    return this.imageService.resolveDeviceImage(filename).light;
  }

  async checkSupportShort() {
    return AndroidShortcuts.isPinnedSupported();
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
