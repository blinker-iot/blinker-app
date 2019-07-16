import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';


@IonicPage()
@Component({
  selector: 'page-diy-linux-guide',
  templateUrl: 'diy-linux-guide.html',
})
export class DiyLinuxGuidePage {

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams
  ) {
  }

  gotoConfig(mode, type) {
    this.navCtrl.push('AdddeviceBwconfigPage', { mode: mode, type: type });
  }

  gotoMqttkey(deviceType) {
    this.navCtrl.push("MqttkeyPage", deviceType);
  }

}
