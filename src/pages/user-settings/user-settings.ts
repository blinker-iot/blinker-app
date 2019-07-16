import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, Platform, Events } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user'
import { Autostart } from '@ionic-native/autostart';
import { PusherProvider } from '../../providers/pusher/pusher';

@IonicPage()
@Component({
  selector: 'page-user-settings',
  templateUrl: 'user-settings.html',
})
export class UserSettingsPage {
  isAndroid = false;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public userProvider: UserProvider,
    private autostart: Autostart,
    // private backgroundMode: BackgroundMode,
    public events: Events,
    public plt: Platform,
    public pusher: PusherProvider
  ) {
    if (plt.is('android')) this.isAndroid = true;
  }

  valueChange() {
    if (this.userProvider.localStorage.app.autoStart) {
      // this.backgroundMode.enable();
      // this.backgroundMode.on('activate').subscribe(() => {
      //   console.log('background mode is begin');
      //   window.setInterval(() => {
      //     // this.events.publish("provider:push", 'background mode is running');
      //     this.pusher.notify('background mode is running');
      //   }, 3000);
      // });

      // this.backgroundMode.on('deactivate').subscribe(() => {
      //
      // });
      this.autostart.enable();
      // this.autostart.enableService('MyService');
    } else {
      // this.backgroundMode.disable();
      // console.log("关闭自启动")
      this.autostart.disable();
    }
    // this.userProvider.saveLocalConfig();
  }

}
