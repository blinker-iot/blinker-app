import { Component } from '@angular/core';
import { Platform, Events } from '@ionic/angular';
// import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
// import { Autostart } from '@ionic-native/autostart';
import { PusherService } from 'src/app/core/services/pusher.service';


@Component({
  selector: 'page-settings',
  templateUrl: 'settings.html',
  styleUrls:['settings.scss']
})
export class SettingsPage {
  isAndroid = false;

  constructor(
    public userService: UserService,
    // private autostart: Autostart,
    // private backgroundMode: BackgroundMode,
    public events: Events,
    public plt: Platform,
    public pusher: PusherService
  ) {
    if (plt.is('android')) this.isAndroid = true;
  }

  valueChange() {
    // if (this.userService.localStorage.app.autoStart) {
    //   // this.autostart.enable();
    // } else {
    //   // this.autostart.disable();
    // }
  }

}
