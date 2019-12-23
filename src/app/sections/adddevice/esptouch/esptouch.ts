import { Component, ChangeDetectorRef } from '@angular/core';
import {
  Platform,
  Events,
  ModalController,
} from '@ionic/angular';
import { PermissionService } from 'src/app/core/services/permission.service';
import { OpenNativeSettings } from '@ionic-native/open-native-settings/ngx';
import { ConfigStatePage } from './config-state/config-state';

declare var WifiWizard2;

@Component({
  selector: 'esptouch',
  templateUrl: 'esptouch.html',
  styleUrls: ['esptouch.scss']
})
export class EsptouchPage {
  myssid: string;
  mypasswd: string;

  is5G: boolean;

  pwshow = false;

  platformResume;

  constructor(
    private platform: Platform,
    private events: Events,
    private permissionService: PermissionService,
    private openNativeSettings: OpenNativeSettings,
    private changeDetectorRef: ChangeDetectorRef,
    private modalCtrl: ModalController
  ) {
  }

  ngAfterViewInit() {
    if (!this.platform.is("cordova")) return;
    // android 9.0获取ssid需要定位权限
    if (this.platform.is("android"))
      this.permissionService.checkCoarseLocation().then((result) => {
        if (result) this.getSsid();
      })
    else this.getSsid();
    this.platformResume = this.platform.resume.subscribe(() => {
      console.log("resume getwifissid")
      this.getSsid();
      this.changeDetectorRef.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.platform.is("cordova")) this.platformResume.unsubscribe();
  }

  getSsid() {
    WifiWizard2.getConnectedSSID().then(
      ssid => {
        this.ssidHandler(ssid);
      },
      error => {
        console.log(error);
        this.events.publish("provider:notice", "openWifi");
      }
    )
    // WifiWizard2.getConnectedSSID(ssid => { this.ssidHandler(ssid) }, err => { this.ssidFail(err) })
    // WifiWizard2.getConnectedBSSID(ssid => { console.log(ssid) }, err => { console.log(err) })
  }

  ssidHandler(ssid) {
    //这里android会多返回两个冒号""
    if (this.platform.is('android'))
      // ssid = ssid.slice(1, ssid.length - 1);
    console.log("当前WiFi：" + ssid);
    //WiFi打开，但未连接到任何网络
    if (ssid == "unknown ssid") {
      this.events.publish("provider:notice", "openWifi");
    } else {
      this.myssid = ssid;
      this.is5G = false;
      if (this.myssid.toLowerCase().indexOf('5g') > -1)
        this.is5G = true;
    }
  };

  // ssidFail(err) {
  //   console.log(err);
  //   this.events.publish("provider:notice", "openWifi");
  // };

  openWifiSetting() {
    this.openNativeSettings.open("wifi");
  }

  async startConfig() {
    const modal = await this.modalCtrl.create({
      component: ConfigStatePage,
      componentProps: {
        'ssid': this.myssid,
        'password': this.mypasswd
      }
    });
    modal.present();
  }

  showPassword() {
    this.pwshow = !this.pwshow
  }
}
