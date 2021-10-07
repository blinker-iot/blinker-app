import { Component, ChangeDetectorRef } from '@angular/core';
import {
  Platform,
  ModalController,
} from '@ionic/angular';
import { PermissionService } from 'src/app/core/services/permission.service';
import { OpenNativeSettings } from '@ionic-native/open-native-settings/ngx';
import { ConfigStatePage } from './config-state/config-state';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { NoticeService } from 'src/app/core/services/notice.service';
import { Storage } from '@ionic/storage';

declare var WifiWizard2;

@Component({
  selector: 'esptouch',
  templateUrl: 'esptouch.html',
  styleUrls: ['../config.scss']
})
export class EsptouchPage {
  myssid: string = '';
  mypasswd: string = '';

  is5G: boolean;

  pwshow = false;

  platformResume;

  savePassword = false

  passwordList = {}

  constructor(
    private platform: Platform,
    private noticeService: NoticeService,
    private permissionService: PermissionService,
    private openNativeSettings: OpenNativeSettings,
    private changeDetectorRef: ChangeDetectorRef,
    private modalCtrl: ModalController,
    private geo:Geolocation,
    private storage: Storage
  ) {
    this.geo.getCurrentPosition();
  }

  ngOnInit(): void {
    this.loadSavePasswordConfig()
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
    if (this.savePassword)
      this.saveLocalPassowrd();
    else
      this.delLocalPassowrd()
    if (this.platform.is("cordova")) this.platformResume.unsubscribe();
  }

  getSsid() {
    WifiWizard2.getConnectedSSID().then(
      ssid => {
        this.ssidHandler(ssid);
      },
      error => {
        console.log(error);
        this.noticeService.showAlert("openWifi");
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
    if (ssid == "unknown ssid" || ssid == '<unknown ssid>') {
      this.noticeService.showAlert("openWifi");
    } else {
      this.myssid = ssid;
      this.is5G = false;
      if (this.myssid.toLowerCase().indexOf('5g') > -1)
        this.is5G = true;
      this.loadLocalPassowrd();
    }
  };

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

  loadSavePasswordConfig() {
    this.storage.get('saveWiFiPassword').then((val) => {
      if (val == null) return
      this.savePassword = val
    });
  }

  clickSavePassword() {
    this.savePassword = !this.savePassword
    this.storage.set('saveWiFiPassword', this.savePassword);
  }

  saveLocalPassowrd() {
    if (this.savePassword && this.myssid != 'unknown ssid' && this.myssid != '') {
      this.passwordList[this.myssid] = this.mypasswd
      this.storage.set('passwordList', this.passwordList);
    }
  }

  loadLocalPassowrd() {
    if (this.myssid != 'unknown ssid' && this.myssid != '') {
      this.storage.get('passwordList').then((val) => {
        if (val == null) return
        if (typeof val[this.myssid] != 'undefined') {
          this.mypasswd = val[this.myssid]
        }
      });
    }
  }

  delLocalPassowrd() {
    this.storage.set('passwordList', null);
  }

}
