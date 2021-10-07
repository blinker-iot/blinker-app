import { Component, ChangeDetectorRef } from '@angular/core';
import {
  Platform,
  ModalController,
} from '@ionic/angular';
import { PermissionService } from 'src/app/core/services/permission.service';
import { OpenNativeSettings } from '@ionic-native/open-native-settings/ngx';
import { ConfigStatePage } from './config-state/config-state';
import { NoticeService } from 'src/app/core/services/notice.service';
import { Storage } from '@ionic/storage';

declare var WifiWizard2;

@Component({
  selector: 'page-apconfig',
  templateUrl: 'apconfig.html',
  styleUrls: ['../config.scss']
})

export class ApconfigPage {
  myssid: string = '';
  mypasswd: string = '';

  is5G: boolean;

  pwshow = false;

  platformResume;

  savePassword = false

  passwordList = {}

  isConnecting = false;

  get isIos() {
    return this.platform.is('ios');
  }

  constructor(
    private platform: Platform,
    private changeDetectorRef: ChangeDetectorRef,
    private permissionService: PermissionService,
    private openNativeSettings: OpenNativeSettings,
    private modalCtrl: ModalController,
    private noticeService: NoticeService,
    private storage: Storage
  ) {
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
    this.listenResume();
  }

  ngOnDestroy() {
    if (this.savePassword)
      this.saveLocalPassowrd();
    else
      this.delLocalPassowrd();
    if (!this.platform.is("cordova")) return;
    this.unlistenResume();
  }

  listenResume() {
    this.platformResume = this.platform.resume.subscribe(() => {
      console.log("resume getwifissid")
      this.getSsid();
    });
  }

  unlistenResume() {
    this.platformResume.unsubscribe();
  }

  getSsid() {
    WifiWizard2.getConnectedSSID().then(
      ssid => {
        if (ssid == "unknown ssid" || ssid == '<unknown ssid>') {
          this.noticeService.showAlert('openWifi');
        } else {
          this.myssid = ssid;
          this.isConnecting = false;
          this.is5G = false;
          if (this.myssid.toLowerCase().indexOf('5g') > -1)
            this.is5G = true;
          this.loadLocalPassowrd();
          setTimeout(() => {
            this.changeDetectorRef.detectChanges();
          }, 100);
        }
      },
      error => {
        console.log(error);
        if (error == 'CONNECTION_NOT_COMPLETED') {
          this.isConnecting = true;
          setTimeout(() => {
            this.getSsid()
          }, 1000);
        } else {
          this.noticeService.showAlert('openWifi');
        }
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
