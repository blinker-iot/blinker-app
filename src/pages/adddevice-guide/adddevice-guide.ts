import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-adddevice-guide',
  templateUrl: 'adddevice-guide.html',
})
export class AdddeviceGuidePage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {

  }

  gotoConfig(mode) {
    this.navCtrl.push('DiyArduinoConfigPage', mode);
  }

  gotoEspTouch() {
    this.navCtrl.push("EsptouchPage", "DiyArduino");
  }

  gotoMqttkey(deviceType) {
    this.navCtrl.push("MqttkeyPage", deviceType);
  }
}
