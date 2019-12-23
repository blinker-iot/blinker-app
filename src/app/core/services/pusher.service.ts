import { Injectable } from '@angular/core';
import { Events, Platform } from '@ionic/angular';
import { JPush } from '@jiguang-ionic/jpush/ngx';
import { DataService } from './data.service';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class PusherService {
  id = 1;
  constructor(
    private events: Events,
    private jpush: JPush,
    private platform: Platform,
    private dataService: DataService,
    private router: Router
  ) {
  }

  init() {
    if (!this.platform.is('cordova')) return;
    this.jpush.init();
    this.initPush();
    this.initLocalPush();
    this.dataService.authDataLoader.subscribe(loaded => {
      if (loaded) {
        this.setAlias(this.dataService.auth.token);
      }
    })
    this.dataService.authDataExpire.subscribe(state => {
      if (state) {
        this.deleteAlias();
      }
    })
  }

  // 本地推送
  initLocalPush() {
    this.events.subscribe("PusherService:local", content => {
      // if (this.userService.localStorage.app.allowNotice)
      this.localNotify(content);
    });
  }

  // 本地推送
  localNotify(content: string) {
    if (this.platform.is('android')) {
      this.jpush.addLocalNotification(0, content, "blinker!", this.id, 1000);
      // JPush.addLocalNotification(0, content, "blinker!", this.id, 1000);
    } else {
      this.jpush.addLocalNotificationForIOS(1, content, 1, "localNoti1");
      // JPush.addLocalNotificationForIOS(1, content, 1, "localNoti1");
    }
    this.id = this.id + 1;
  }

  public registrationId: string;

  devicePlatform: string;
  sequence: number = 0;

  aliasResultHandler(result) {
    let sequence: number = result.sequence;
    let alias: string = result.alias;
    // alert("Success!" + "\nSequence: " + sequence + "\nAlias: " + alias);
  };

  errorHandler(error) {
    let sequence: number = error.sequence;
    let code = error.code;
    // alert("Error!" + "\nSequence: " + sequence + "\nCode: " + code);
  };

  initPush() {
    document.addEventListener(
      "jpush.openNotification",
      (event: any) => {
        var content;
        if (this.devicePlatform == "Android") {
          content = event.alert;
        } else {
          // iOS
          if (event.aps == undefined) {
            // 本地通知
            content = event.content;
          } else {
            // APNS
            content = event.aps.alert;
          }
        }
        this.router.navigate(['/message']);
      },
      false
    );

  }

  getRegistrationID() {
    this.jpush
      .getRegistrationID().then(rId => {
        this.registrationId = rId;
        console.log(this.registrationId);
      });
  }

  setAlias(uuid) {
    this.jpush
      .setAlias({ sequence: 0, alias: uuid })
      .then(e => this.aliasResultHandler(e))
      .catch(e => this.errorHandler(e));
  }

  getAlias() {
    this.jpush
      .getAlias({ sequence: this.sequence++ })
      .then(e => this.aliasResultHandler(e))
      .catch(e => this.errorHandler(e));
  }

  deleteAlias() {
    this.jpush
      .deleteAlias({ sequence: this.sequence++ })
      .then(e => this.aliasResultHandler(e))
      .catch(e => this.errorHandler(e));
  }

  setApplicationIconBadgeNumber(number) {
    this.jpush
      .setApplicationIconBadgeNumber(number);
  }

  processCmd(event) {
    let cmd = '';
    if (this.platform.is("android")) {
      if (typeof event.extras["cn.jpush.android.EXTRA"]["cmd"] != 'undefined')
        cmd = event.extras["cn.jpush.android.EXTRA"]["cmd"]
    } else {
      if (typeof event["cmd"] != 'undefined')
        cmd = event["cmd"]
    }
    // if (cmd == 'updateShareList') this.shareService.getShareList();

  }


}
