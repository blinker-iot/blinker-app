import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, Events } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { Clipboard } from '@ionic-native/clipboard';

@IonicPage()
@Component({
  selector: 'page-mqttkey',
  templateUrl: 'mqttkey.html',
  providers: [Clipboard]
})
export class MqttkeyPage {
  showKey = false;
  secretKey: string;
  showBroker: string;
  deviceType: string;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public userProvider: UserProvider,
    public events: Events,
    private clipboard: Clipboard
  ) {
    this.deviceType = navParams.data;
  }

  ionViewDidLoad() {
    this.events.subscribe("adddevice:mqttkey", authkey => {
      console.log("获取到key：" + authkey);
      this.secretKey = authkey;
    });
  }

  ionViewWillUnload() {
    this.events.unsubscribe("adddeive:mqttkey");
  }

  async registerDevice(broker) {
    this.events.publish("loading:show", "addDevice");
    let image;
    let customName;
    if (this.deviceType == 'DiyArduino') {
      image = "diyarduino.png"
      customName = "Arduino";
    } else if (this.deviceType == 'DiyLinux') {
      image = "diylinux.png";
      customName = "Linux设备";
    }
    let device = {
      "deviceType": this.deviceType,
      "config": {
        "mode": "mqtt",
        "broker": broker,
        "image": image,
        "customName": customName,
        "showSwitch": true
      }
    }

    this.showBroker = broker;
    if (await this.userProvider.getMqttKey(device)) {
      this.events.publish("loading:hide", "getMqttKeySuccess");
      this.showKey = true;
    } else {
      console.log('注册失败');
    }
  }

  copyKey() {
    this.clipboard.copy(this.secretKey);
    this.events.publish("provider:notice", "copySuccess")
  }

  gotoHome() {
    this.navCtrl.popToRoot();
    this.events.publish('page:home', 'refresh');
  }
}
