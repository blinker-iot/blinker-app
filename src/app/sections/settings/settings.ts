import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
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
