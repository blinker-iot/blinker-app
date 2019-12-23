import { Component } from '@angular/core';
import { AlertController, Events, Platform, NavController, ModalController } from '@ionic/angular';
import { deviceName12 } from 'src/app/core/functions/func';

import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { DeviceIconPage } from '../../../core/pages/device-icon/device-icon';
import { ViewService } from 'src/app/view/view.service';
import { ShareService } from '../../share/share.service';
import { DataService } from 'src/app/core/services/data.service';
// import { IeconfigPage } from 'src/app/core/device/layouter2/ieconfig/ieconfig.page';

declare var window;

@Component({
  selector: 'device-settings',
  templateUrl: 'device-settings.html',
  styleUrls: ['device-settings.scss']
})
export class DeviceSettingsPage {
  id;
  device: BlinkerDevice;

  showKey = false;

  confirm;

  loaded;

  get isSharedDevice() {
    return this.device.config.isShared
  }

  get isDevDevice() {
    return this.device.config.isDev
  }

  get hasTimerTask() {
    if (typeof this.device.data.timer != 'undefined')
      if (this.device.data.timer != '000')
        return true
    return false
  }

  get hasNewVersion() {
    return this.device.data.hasNewVersion
  }

  settingList = [
    'CustomName',
    'CustomIcon',
    'LoadingExample',
    'VoiceAssistant',
    'AddShortcut',
    'UpdateFirmware',
  ]
  constructor(
    private activatedRoute: ActivatedRoute,
    private userService: UserService,
    private deviceService: DeviceService,
    private dataService: DataService,
    private alertCtrl: AlertController,
    private events: Events,
    public platform: Platform,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private viewService: ViewService,
    private shareService: ShareService
  ) {
  }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id]
        this.loaded = loaded
      }
    })
    this.viewService.setDarkStatusBar();
  }

  ngOnDestroy() {
    this.viewService.setLightStatusBar();
    if (this.confirm)
      this.confirm.dismiss();
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
          placeholder: this.device.config.customName
        },
      ],
      buttons: [
        {
          text: '取消',
          handler: () => {
          }
        },
        {
          text: '确认修改',
          handler: data => {
            this.saveName(data.customName);
          }
        }
      ]
    });
    this.confirm.present();
  }

  async saveName(customName) {
    let newConfig = {
      "customName": customName
    }
    if (await this.deviceService.saveDeviceConfig(this.device, newConfig))
      this.device.config.customName = customName
  }

  async selectIcon() {
    let modal = await this.modalCtrl.create({
      component: DeviceIconPage,
    });
    modal.onDidDismiss().then(async image => {
      let newConfig = {
        "image": image.data
      }
      if (await this.deviceService.saveDeviceConfig(this.device, newConfig)) {
        this.device.config.image = image.data
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
          handler: () => {
          }
        },
        {
          text: '确认解除',
          handler: async () => {
            if (this.isSharedDevice) {
              if (await this.shareService.deleteSharedDevice(this.device.id))
                this.navCtrl.navigateRoot('/')
            } else {
              if (await this.userService.delDevice(this.device)) {
                this.navCtrl.navigateRoot('/');
                this.userService.getAllInfo();
              }
            }
          }
        }
      ]
    });
    this.confirm.present();
  }

  async addShortcut() {
    if (!this.platform.is('cordova')) {
      console.warn('该功能需要android真机运行');
      return;
    }
    if (!await this.checkSupportShort()) return;
    let base64Data = await this.getBase64Image('assets/img/devices/icon/' + this.device.config.image)
    let shortcut = {
      id: this.device.id,
      shortLabel: this.device.config.customName,
      longLabel: 'a blinker device',
      iconBitmap: base64Data,
      intent: {
        data: '/device/' + this.device.id,
      }
    }

    window.plugins.Shortcuts.addPinned(shortcut,
      () => {
        this.events.publish("provider:notice", 'ShortcutPinnedSuccessfully');
      },
      error => {
        window.alert('Error: ' + error);
        console.log(error);
        // this.androidPermissions.requestPermission(this.androidPermissions.PERMISSION.INSTALL_SHORTCUT);
      })
  }

  getBase64Image(imgurl): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let image = new Image();
      image.src = imgurl;
      image.onload = () => {
        let canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, image.width, image.height);
        // console.log(image.src);
        let ext = image.src.substring(image.src.lastIndexOf(".") + 1).toLowerCase();
        // console.log(ext);
        let base64 = canvas.toDataURL("image/" + ext);
        base64 = base64.replace("data:image/png;base64,", '');
        return resolve(base64);
      }
    })
  }

  checkSupportShort(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      window.plugins.Shortcuts.supportsPinned(
        supported => {
          if (supported) {
            return resolve(true)
          } else {
            window.alert('当前android版本不支持该功能');
            return resolve(false)
          }
        },
        error => {
          console.log(error);
        })
    })
  }

}
