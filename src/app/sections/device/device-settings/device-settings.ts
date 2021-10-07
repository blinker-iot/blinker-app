import { Component } from '@angular/core';
import { AlertController, Platform, NavController, ModalController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { DeviceIconPage } from '../../../core/pages/device-icon/device-icon';
import { ShareService } from '../../share/share.service';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { NoticeService } from 'src/app/core/services/notice.service';
import { ImageList } from 'src/app/configs/app.config';
import { ImageService } from 'src/app/core/services/image.service';
import { FileTransfer, FileTransferObject } from '@ionic-native/file-transfer/ngx';
import { File } from '@ionic-native/file/ngx';

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

  get isAdvancedDeveloper() {
    return this.dataService.isAdvancedDeveloper
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
    private noticeService: NoticeService,
    public platform: Platform,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private shareService: ShareService,
    private imageService: ImageService,
    private fileTransfer: FileTransfer,
    private file: File
  ) {
  }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id]
        this.loaded = loaded
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
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
      if (typeof image.data == 'undefined') return
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
              this.userService.getAllInfo();
            } else if (await this.userService.delDevice(this.device)) {
              this.navCtrl.navigateRoot('/');
              this.userService.getAllInfo();
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
    // console.log(this.device.config.image);
    let base64Data;
    if (this.device.config.image.indexOf('https://') > -1 || this.device.config.image.indexOf('http://') > -1) {
      base64Data = await this.getBase64ImageByUrl(this.device.config.image)
    } else {
      base64Data = await this.getBase64Image(this.getImagePath(this.device.config.image))
    }
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
        this.noticeService.showAlert('ShortcutPinnedSuccessfully')
      },
      error => {
        // window.alert('Error: ' + error);ShortcutPinnedfailed
        this.noticeService.showAlert('ShortcutPinnedfailed');
        // console.log(error);
      })
  }

  getBase64ImageByUrl(imgurl): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      console.log(imgurl);
      let path = this.file.externalDataDirectory + 'temp.png';
      const fileTransfer: FileTransferObject = this.fileTransfer.create();
      fileTransfer.download(imgurl, path).then((entry) => {
        console.log('download complete: ' + entry.toURL());
        // let filename=entry.toURL().slice(entry.toURL().lastIndexOf("/"))
        this.file.readAsDataURL(this.file.externalDataDirectory, 'temp.png').then(base64 => {
          base64 = base64.replace("data:image/png;base64,", '');
          return resolve(base64);
        })
      })
    })
  }

  getBase64Image(imgurl) {
    return new Promise<string>((resolve, reject) => {
      let image = new Image();
      image.setAttribute('crossOrigin', 'anonymous');
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

  getImagePath(filename) {
    let url
    if (filename.indexOf('.png') > -1)
      filename = filename.substring(0, filename.indexOf('.png'))
    if (ImageList.indexOf(filename) > -1) {
      url = `assets/img/devices/icon/${filename}.png`
    } else if (this.imageService.deviceIconList.indexOf(filename) > -1) {
      url = this.imageService.deviceIconDict[filename]
    } else {
      url = `assets/img/devices/icon/unknown.png`
    }
    return url
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
