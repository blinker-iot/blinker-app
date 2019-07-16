import { Component } from '@angular/core';
import { NavController, NavParams, IonicPage, AlertController, Events, Platform } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { deviceName2Mac } from '../../functions/func';

declare var window;
declare var plugins;

@IonicPage()
@Component({
  selector: 'page-layout2-settings',
  templateUrl: 'layout2-settings.html',
})
export class Layout2SettingsPage {
  device;
  macAddr;
  confirm;
  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private userProvider: UserProvider,
    public alertCtrl: AlertController,
    private events: Events,
    private platform: Platform
    // public modalCtrl: ModalController
  ) {
    this.device = navParams.data;
    this.macAddr = deviceName2Mac(this.device.deviceName);
  }

  ionViewWillLeave() {
    if (this.confirm)
      this.confirm.dismiss();
  }

  changeName() {
    this.showChangeNameConfirm();
  }

  showChangeNameConfirm() {
    this.confirm = this.alertCtrl.create({
      title: '自定义设备名',
      inputs: [
        {
          name: 'customName',
          placeholder: '新的设备名'
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
    if (await this.userProvider.saveDeviceConfig(this.device, newConfig))
      this.userProvider.loadConfig(this.device);
  }

  unbind() {
    this.showUnbindConfirm();
  }

  delDevice() {
    console.log('删除设备 ' + this.device.deviceName);
    this.userProvider.delDevice(this.device).then(result => {
      if (result) {
        console.log('删除设备成功');
        this.events.publish('page:home', 'refresh');
        this.navCtrl.popToRoot();
      } else {
        console.log('删除设备失败');
      }
    });
  }

  showUnbindConfirm() {
    this.confirm = this.alertCtrl.create({
      title: '确认解除绑定',
      message: '解绑后，你将无法控制这个设备，关联该设备的自动化规则也将失效',
      buttons: [
        {
          text: '取消',
          handler: () => {
          }
        },
        {
          text: '确认解除',
          handler: () => {
            this.delDevice();
          }
        }
      ]
    });
    this.confirm.present();
  }

  changeImage() {
    this.navCtrl.push('Layout2SettingsImagePage', this.device);
    // let modal = this.modalCtrl.create('LayoutSettingsImagePage', this.device);
    // modal.present();
  }

  loadExampleLayout() {

  }

  gotoAligenie() {
    this.navCtrl.push("AliGenieGuidePage");
  }

  async addShortcut() {
    if (!await this.checkSupportShort()) return;
    let base64Data = await this.getBase64Image('assets/img/devices/icon/' + this.device.config.image)
    let shortcut = {
      id: this.device.deviceName,
      shortLabel: this.device.config.customName,
      longLabel: 'a blinker device',
      iconBitmap: base64Data,
      intent: {
        data: 'iotapp://blinker.app/device/' + deviceName2Mac(this.device.deviceName),
      }
    }

    console.log(shortcut);
    window.plugins.Shortcuts.addPinned(shortcut, () => {
      // window.alert('Shortcut pinned successfully');
      this.events.publish("provider:notice", 'ShortcutPinnedSuccessfully');
    }, (error) => {
      window.alert('Error: ' + error);
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
        console.log(image.src);
        let ext = image.src.substring(image.src.lastIndexOf(".") + 1).toLowerCase();
        console.log(ext);
        let base64 = canvas.toDataURL("image/" + ext);
        base64 = base64.replace("data:image/png;base64,", '');
        // return dataURL;
        console.log(base64);
        return resolve(base64);
      }
    })
  }

  checkSupportShort(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      window.plugins.Shortcuts.supportsPinned((supported) => {
        if (supported) {
          return resolve(true)
        } else {
          window.alert('当前android版本不支持该功能');
          return resolve(false)
        }
      }, (error) => {
        window.alert('Error: ' + error);
      })
    })
  }

}
