import { Component } from '@angular/core';
import {
  IonicPage,
  NavController,
  NavParams,
  Events,
} from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { DeviceProvider } from '../../providers/device/device';

@IonicPage()
@Component({
  selector: 'page-adddevice-bwconfig',
  templateUrl: 'adddevice-bwconfig.html',
})
export class AdddeviceBwconfigPage {
  mode: string;
  type: string;
  found: boolean = false;
  timer;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public userProvider: UserProvider,
    public deviceProvider: DeviceProvider,
    public events: Events
  ) {
    this.mode = navParams.data.mode;
    this.type = navParams.data.type;
  }

  ionViewDidLoad() {
    this.deviceProvider.startScanDevice(this.type, this.mode);
    this.timer = window.setTimeout(() => {
      this.found = true;
    }, 3000)
  }

  ionViewWillUnload() {
    this.deviceProvider.stopScanDevice(this.type, this.mode);
    window.clearTimeout(this.timer);
  }

  async registerDevice(item) {
    this.events.publish("loading:show", "addDevice");
    let device = {
      "deviceType": this.type,
      "deviceName": item.deviceName,
      "config": {
        "mode": this.mode,
        "image": this.type.toLowerCase() + ".png",
        "customName": this.type == 'DiyArduino' ? "Arduino" : "Linux设备",
        "showSwitch": true
      }
    }
    if (await this.userProvider.addDevice(device)) {
      this.events.publish("provider:notice", "addDeviceSuccess");
      this.events.publish('page:home', 'refresh');
      this.navCtrl.popToRoot();
    } else {
      console.log('设备注册失败');
    }
  }

}
