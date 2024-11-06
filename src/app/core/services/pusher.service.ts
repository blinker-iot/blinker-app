import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { DataService } from './data.service';
import { Router } from '@angular/router';
import { PushNotifications } from '@capacitor/push-notifications';

@Injectable({
  providedIn: 'root'
})
export class PusherService {
  id = 1;
  constructor(
    private platform: Platform,
    private dataService: DataService,
    private router: Router,
  ) {
  }


  async init() {
    await PushNotifications.addListener('registration', token => {
      console.info('Registration token: ', token.value);
    });

    await PushNotifications.addListener('registrationError', err => {
      console.error('Registration error: ', err.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', notification => {
      console.log('Push notification received: ', notification);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', notification => {
      console.log('Push notification action performed', notification.actionId, notification.inputValue);
    });

    await this.registerNotifications();
  }


  async registerNotifications() {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      throw new Error('User denied permissions!');
    }

    await PushNotifications.register();
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
