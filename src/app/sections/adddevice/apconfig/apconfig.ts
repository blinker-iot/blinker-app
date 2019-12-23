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
  selector: 'page-apconfig',
  templateUrl: 'apconfig.html',
  styleUrls: ['apconfig.scss']
})

export class ApconfigPage {
  myssid: string;
  mypasswd: string;

  is5G: boolean;

  pwshow = false;

  platformResume;

  constructor(
    private platform: Platform,
    private events: Events,
    private changeDetectorRef: ChangeDetectorRef,
    private permissionService: PermissionService,
    private openNativeSettings: OpenNativeSettings,
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
    this.listenResume();
  }

  ngOnDestroy() {
    this.unlistenResume();
  }

  listenResume() {
    this.platformResume = this.platform.resume.subscribe(() => {
      console.log("resume getwifissid")
      this.getSsid();
      this.changeDetectorRef.detectChanges();
    });
  }

  unlistenResume() {
    this.platformResume.unsubscribe();
  }


  getSsid() {
    WifiWizard2.getConnectedSSID().then(
      ssid => {
        if (ssid == "unknown ssid") {
          this.events.publish("provider:notice", "openWifi");
        } else {
          this.myssid = ssid;
          this.is5G = false;
          if (this.myssid.toLowerCase().indexOf('5g') > -1)
            this.is5G = true;
        }
      },
      error => {
        console.log(error);
        this.events.publish("provider:notice", "openWifi");
      }
    )
  }

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
    if (this.platform.is("cordova")) {
      this.unlistenResume();
      modal.onWillDismiss().then(result => {
        this.listenResume();
      })
    }
    modal.present();
  }

  showPassword() {
    this.pwshow = !this.pwshow
  }

}
