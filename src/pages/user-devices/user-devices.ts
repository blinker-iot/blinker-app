import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { DeviceProvider } from '../../providers/device/device';
import { UserProvider } from '../../providers/user/user';

@IonicPage()
@Component({
  selector: 'page-user-devices',
  templateUrl: 'user-devices.html',
})
export class UserDevicesPage {

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private deviceProvider: DeviceProvider,
    private userProvider: UserProvider,
  ) {
  }


  gotoSettingsPage(device) {
    console.log(device);
    if (device.deviceType == "DiyArduino" || device.deviceType == "DiyLinux") {
      this.navCtrl.push("Layout2SettingsPage", device);
    } else
      this.navCtrl.push(device.deviceType + "SettingsPage", device);
  }
}
