import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, AlertController,Events} from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { deviceName2Mac } from '../../functions/func';


@IonicPage()
@Component({
  selector: 'page-device-settings',
  templateUrl: 'device-settings.html',
})
export class DeviceSettingsPage {
  device;
  macAddr;
  confirm;
  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private userProvider: UserProvider,
    public alertCtrl: AlertController,
    private events: Events,
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

}
