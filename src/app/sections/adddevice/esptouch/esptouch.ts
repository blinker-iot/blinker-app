import { Component, ChangeDetectorRef } from '@angular/core';
import {
  Platform,
  ModalController,
} from '@ionic/angular';
import { PermissionService } from 'src/app/core/services/permission.service';
// import { OpenNativeSettings } from '@awesome-cordova-plugins/open-native-settings/ngx';
import { ConfigStatePage } from './config-state/config-state';
// import { Geolocation } from '@awesome-cordova-plugins/geolocation/ngx';
import { Location } from '@angular/common';
import { NoticeService } from 'src/app/core/services/notice.service';
import { Subscription } from 'rxjs';

declare var wifi;

@Component({
  selector: 'esptouch',
  templateUrl: 'esptouch.html',
  styleUrls: ['../config.scss']
})
export class EsptouchPage {

  mode = 1;  //esptouch v1:1 , esptouch v2:2

  editable = false;

  showModeBtn = false

  myssid: string = '';
  mypasswd: string = '';
  customData: string = '';

  stateIndex: number;  //见html

  is5G: boolean;

  pwshow = false; //密码可见
  cdshow = false; //密钥可见, 仅esptouch v2

  platformResume: Subscription;

  savePassword = false

  passwordList = {}

  constructor(
    private platform: Platform,
    // private openNativeSettings: OpenNativeSettings,
    private changeDetectorRef: ChangeDetectorRef,
    private modalCtrl: ModalController,
    private geo: Geolocation,
    private location: Location,
    private notice: NoticeService
  ) {
  }

  ngOnInit(): void {
    let path = this.location.path()
    if (path.includes('/devcenter/tool/espTouch')) {
      this.showModeBtn = true
    } else if (path.includes('/espTouchV2')) {
      this.mode = 2
    } else if (path.includes('/espTouch')) {
      this.mode = 1
    }
  }

  ngAfterViewInit() {
    if (!this.platform.is("cordova")) return;
    this.loadSavePasswordConfig();
    if (this.platform.is("android")) {
      wifi.checkLocation(result => {
        if (!result) {
          this.notice.showToast('请开启位置服务，以获取WiFi信息');
          this.stateIndex = -2;
        } else {
          this.getConnectedInfo();
        }
      });
    } else if (this.platform.is("ios")) {
      // this.geo.getCurrentPosition();
      this.getConnectedInfo();
    }
    this.platformResume = this.platform.resume.subscribe(() => {
      this.getConnectedInfo();
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

  getConnectedInfo() {
    this.stateIndex = 1;
    this.changeDetectorRef.detectChanges();
    wifi.getConnectedInfo(
      info => {
        console.log('getConnectedInfo:', info);
        if (this.mode == 1) this.stateIndex = 11
        else if (this.mode == 2) this.stateIndex = 12
        this.myssid = info.ssid;
        if (this.platform.is('android'))
          this.is5G = info.is5G;
        this.loadLocalPassowrd();
        this.changeDetectorRef.detectChanges();
      },
      error => {
        if (error.state == 'Connecting') {
          this.stateIndex = 2
          setTimeout(() => {
            this.getConnectedInfo()
          }, 1000)
        } else if (error.state == 'NotConnected') {
          this.stateIndex = -1
          this.notice.showToast('请先连接到WiFi热点，再进行配置');
        }
      }
    )
  }

  openWifiSetting() {
    // this.openNativeSettings.open("wifi");
  }

  async startConfig() {
    if (this.myssid == '') return
    const modal = await this.modalCtrl.create({
      component: ConfigStatePage,
      componentProps: {
        ssid: this.myssid,
        password: this.mypasswd,
        mode: this.mode,
        customData: this.customData
      }
    });
    modal.present();
  }

  showPassword() {
    this.pwshow = !this.pwshow
  }

  showCustomData() {
    this.cdshow = !this.cdshow
  }

  loadSavePasswordConfig() {
    let val = localStorage.getItem('saveWiFiPassword')
    if (val == 'null') return
    this.savePassword = val == 'true' ? true : false
  }

  clickSavePassword() {
    this.savePassword = !this.savePassword
    localStorage.setItem('saveWiFiPassword', JSON.stringify(this.savePassword));
  }

  saveLocalPassowrd() {
    if (this.savePassword && this.myssid != 'unknown ssid' && this.myssid != '') {
      this.passwordList[this.myssid] = this.mypasswd
      localStorage.setItem('passwordList', JSON.stringify(this.passwordList));
    }
  }

  loadLocalPassowrd() {
    if (this.myssid != 'unknown ssid' && this.myssid != '') {
      let val = localStorage.getItem('passwordList')
      if (val == null) return
      let passwordList = JSON.parse(val)
      if (typeof passwordList[this.myssid] != 'undefined') {
        this.mypasswd = passwordList[this.myssid]
      }
    }
  }

  delLocalPassowrd() {
    localStorage.removeItem('passwordList');
  }

  changeMode() {
    if (this.mode == 1) {
      this.mode = 2
      this.stateIndex = 12
    } else {
      this.mode = 1
      this.stateIndex = 11
    }
  }

}
