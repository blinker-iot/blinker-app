import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
// import { JPush } from '@jiguang-ionic/jpush/ngx';
import { DataService } from './data.service';
import { Router } from '@angular/router';
import { AliyunPush } from 'libs/@ionic-native/aliyun-push/ngx';

@Injectable({
  providedIn: 'root'
})
export class PusherService {
  id = 1;
  jpush;
  constructor(
    private platform: Platform,
    private dataService: DataService,
    private router: Router,
    private aliPush: AliyunPush
  ) {
  }


  init() {
    if (!this.platform.is('cordova')) return;
    this.aliPush.getRegisterId().then(id => {
      console.log(id);
      this.aliPush.onMessage().subscribe(mess => {
        console.log(mess);
      })
      this.dataService.userDataLoader.subscribe(loaded => {
        if (loaded) {
          this.aliPush.bindAccount(this.dataService.user.phone);
        }
      });
    }).catch(err => {
      console.log(err);
    })
  }

  // 本地推送
  // localNotify(content: string) {
  //   this.localNotifications.schedule({
  //     id: this.id,
  //     text: content
  //   });
  //   this.id = this.id + 1;
  // }

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

  processCmd(event) {

  }


}
