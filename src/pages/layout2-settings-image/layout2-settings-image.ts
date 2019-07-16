import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';

@IonicPage()
@Component({
  selector: 'page-layout2-settings-image',
  templateUrl: 'layout2-settings-image.html',
})
export class Layout2SettingsImagePage {
  device;

  constructor(
    public navParams: NavParams,
    public userProvider: UserProvider,
    public navCtrl: NavController,
    // public viewCtrl: ViewController,
  ) {
    this.device = navParams.data;
  }

  async select(filename) {
    console.log(filename);
    let newConfig = {
      "image": filename + '.png'
    }
    if (await this.userProvider.saveDeviceConfig(this.device, newConfig)) {
      this.userProvider.loadConfig(this.device);
    }
    // this.viewCtrl.dismiss();
    this.navCtrl.pop();
  }

  //可用的图片文件名
  imageList = [
    'diyarduino', 'arduino-red',
    'wifiduino', 'wifiduino-blue', 'esp32',
    'diylinux', 'raspberrypi-blue', 'raspberrypi-zero',
    'linux-logo', 'raspberrypi-logo',
    'ownplug','ownairdetector','ownbulb','ownledstrip'
  ]

}
