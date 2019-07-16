import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';


@IonicPage()
@Component({
  selector: 'page-diy-arduino-guide',
  templateUrl: 'diy-arduino-guide.html',
})
export class DiyArduinoGuidePage {

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams
  ) {
  }

  gotoConfig(mode, type) {
    this.navCtrl.push('AdddeviceBwconfigPage', { mode: mode, type: type });
  }

  gotoEspTouch() {
    this.navCtrl.push("EsptouchPage", "DiyArduino");
  }

  gotoMqttkey(deviceType) {
    this.navCtrl.push("MqttkeyPage", deviceType);
  }

}
