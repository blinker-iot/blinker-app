import { Injectable } from '@angular/core';
import { Events, Platform } from 'ionic-angular';
import { JPush } from "@jiguang-ionic/jpush";
import { UserProvider } from '../user/user';

@Injectable()
export class PusherProvider {
  id = 1;
  constructor(
    public events: Events,
    public jpush: JPush,
    public platform: Platform,
    public userProvider: UserProvider
  ) {
  }

  init() {
    this.events.subscribe("provider:push", content => {
      if (this.userProvider.localStorage.app.allowNotice)
        this.localNotify(content);
    });
    if (this.platform.is('cordova'))
      this.jiguang();
    // console.log("set push alias(token): " + this.userProvider.localUser.token)
    this.setAlias(this.userProvider.token);
  }

  // 本地推送
  localNotify(content: string) {
    if (this.platform.is('android')) {
      this.jpush.addLocalNotification(0, content, "blinker!", this.id, 1000);
    } else {
      this.jpush.addLocalNotificationForIOS(1, content, 1, "localNoti1");
    }
    this.id = this.id + 1;
  }


  //极光推送
  public registrationId: string;

  devicePlatform: string;
  sequence: number = 0;

  tagResultHandler = function (result) {
    let sequence: number = result.sequence;
    let tags: Array<string> = result.tags == null ? [] : result.tags;
    // alert(
    //   "Success!" + "\nSequence: " + sequence + "\nTags: " + tags.toString()
    // );
  };

  aliasResultHandler = function (result) {
    let sequence: number = result.sequence;
    let alias: string = result.alias;
    // alert("Success!" + "\nSequence: " + sequence + "\nAlias: " + alias);
  };

  errorHandler = function (err) {
    let sequence: number = err.sequence;
    let code = err.code;
    // alert("Error!" + "\nSequence: " + sequence + "\nCode: " + code);
  };

  jiguang() {
    document.addEventListener('jpush.receiveRegistrationId', (event: any) => {
      console.log("jpushID:" + event.registrationId)
    }, false)

    document.addEventListener(
      "jpush.openNotification",
      (event: any) => {
        let content;
        if (this.platform.is('android')) {
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
        // alert("open notification: " + JSON.stringify(event));
        console.log(event)
      },
      false
    );

    document.addEventListener(
      "jpush.receiveLocalNotification",
      (event: any) => {
        // iOS(*,9) Only , iOS(10,*) 将在 jpush.openNotification 和 jpush.receiveNotification 中触发。
        let content;
        if (this.platform.is('android')) {
        } else {
          content = event.content;
        }

        // alert("receive local notification: " + JSON.stringify(event));
        console.log(event);
      },
      false
    );

    // this.jpush.init();
    this.getRegistrationID();
  }

  getRegistrationID() {
    this.jpush.getRegistrationID().then(rId => {
      this.registrationId = rId;
      console.log(this.registrationId);
    });
  }

  setTags() {
    this.jpush
      .setTags({ sequence: this.sequence++, tags: ["Tag1", "Tag2"] })
      .then(this.tagResultHandler)
      .catch(this.errorHandler);
  }

  addTags() {
    this.jpush
      .addTags({ sequence: this.sequence++, tags: ["Tag3", "Tag4"] })
      .then(this.tagResultHandler)
      .catch(this.errorHandler);
  }

  checkTagBindState() {
    this.jpush
      .checkTagBindState({ sequence: this.sequence++, tag: "Tag1" })
      .then(result => {
        let sequence = result.sequence;
        let tag = result.tag;
        let isBind = result.isBind;
        // alert(
        //   "Sequence: " + sequence + "\nTag: " + tag + "\nIsBind: " + isBind
        // );
      })
      .catch(this.errorHandler);
  }

  deleteTags() {
    this.jpush
      .deleteTags({ sequence: this.sequence++, tags: ["Tag4"] })
      .then(this.tagResultHandler)
      .catch(this.errorHandler);
  }

  getAllTags() {
    this.jpush
      .getAllTags({ sequence: this.sequence++ })
      .then(this.tagResultHandler)
      .catch(this.errorHandler);
  }

  cleanTags() {
    this.jpush
      .cleanTags({ sequence: this.sequence++ })
      .then(this.tagResultHandler)
      .catch(this.errorHandler);
  }

  setAlias(uuid) {
    this.jpush
      .setAlias({ sequence: 0, alias: uuid })
    // .then(this.aliasResultHandler)
    // .catch(this.errorHandler);
    // this.jpush
    //   .setAlias({ sequence: this.sequence++, alias: uuid })
    //   .then(this.aliasResultHandler)
    //   .catch(this.errorHandler);
  }

  getAlias() {
    this.jpush
      .getAlias({ sequence: this.sequence++ })
      .then(this.aliasResultHandler)
      .catch(this.errorHandler);
  }

  deleteAlias() {
    this.jpush
      .deleteAlias({ sequence: this.sequence++ })
      .then(this.aliasResultHandler)
      .catch(this.errorHandler);
  }

  // addLocalNotification() {
  //   if (this.platform.is('android')) {
  //     this.jpush.addLocalNotification(0, "Hello JPush", "JPush", 1, 5000);
  //   } else {
  //     this.jpush.addLocalNotificationForIOS(5, "Hello JPush", 1, "localNoti1");
  //   }
  // }

}
