import { Injectable } from '@angular/core';
import { ActionSheetController, NavController, Events, Platform, MenuController, ModalController } from '@ionic/angular';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { AppMinimize } from '@ionic-native/app-minimize/ngx';
import { PlatformLocation } from '@angular/common';
import { Router } from '@angular/router';

declare var window;

@Injectable({
  providedIn: 'root'
})
export class ViewService {
  viewMode = 'home';
  menuSwipeEnable = false;
  showSpeechModal = false;
  devicePageIsRoot = false;

  constructor(
    private actionSheetController: ActionSheetController,
    private navCtrl: NavController,
    private events: Events,
    private platform: Platform,
    private statusBar: StatusBar,
    private platformLocation: PlatformLocation,
    private menu: MenuController,
    private appMinimize: AppMinimize,
    private router: Router,
    private modalCtrl: ModalController
  ) { }

  init() {
    this.events.subscribe('changeView', () => {
      this.changeView()
    })
    this.events.subscribe('menuSwipeEnable', enable => {
      setTimeout(() => {
        this.menuSwipeEnable = enable;
      });
    })
    this.checkShortcut();
    this.platform.backButton.subscribe(async () => {
      if (typeof await this.modalCtrl.getTop() != 'undefined') {
        console.log('close modal');
        this.modalCtrl.dismiss();
      } else if (this.menuSwipeEnable && this.platformLocation.pathname.indexOf('/view') > -1) {
        console.log('close menu');
        this.menu.close();
      } else if (this.showSpeechModal) {
        this.showSpeechModal = false
      }
      else if (this.platformLocation.pathname.indexOf('/view') > -1) {
        this.appMinimize.minimize();
      }
      else if (this.devicePageIsRoot && this.platformLocation.pathname.indexOf('/device/') > -1) {
        this.appMinimize.minimize();
      }
    })
  }

  async changeView() {
    const actionSheet = await this.actionSheetController.create({
      header: '视图模式切换',
      buttons: [{
        text: '常规视图',
        handler: () => {
          this.viewMode = 'home'
          this.navCtrl.navigateRoot('/view/home')
        }
      },
      {
        text: '地理视图',
        handler: () => {
          this.viewMode = 'gis'
          this.navCtrl.navigateRoot('/view/gis');
        }
      },
        // {
        //   text: '列表视图',
        //   handler: () => {
        //     if (!isDevMode()) {
        //       this.events.publish('provider:notice', 'permissionDenied')
        //       return
        //     }
        //     this.viewMode = 'list'
        //     this.navCtrl.navigateRoot('/view/list');
        //   }
        // },
        // {
        //   text: '聚合视图',
        //   handler: () => {
        //     if (!isDevMode()) {
        //       this.events.publish('provider:notice', 'permissionDenied')
        //       return
        //     }
        //     this.viewMode = 'dashboard'
        //     this.navCtrl.navigateRoot('/view/dashboard');
        //   }
        // }
      ]
    });
    await actionSheet.present();
  }

  setLightStatusBar() {
    this.statusBar.styleLightContent();
  }

  setDarkStatusBar() {
    this.statusBar.styleDefault()
  }

  // 从shortcut进入app
  checkShortcut() {
    if (this.platform.is("cordova")) {
      window.plugins.Shortcuts.getIntent(intent => {
        if (typeof intent.data != 'undefined') {
          this.devicePageIsRoot = true;
          this.navCtrl.navigateRoot(intent.data);
        }
      })
      window.plugins.Shortcuts.onNewIntent(intent => {
        // 设备shortcut进入
        if (typeof intent.data != 'undefined') {
          if (this.platformLocation.pathname.indexOf('/device/') > -1 && this.devicePageIsRoot) {
            this.navCtrl.navigateRoot(intent.data);
            setTimeout(() => {
              this.devicePageIsRoot = true;
              console.log(this.devicePageIsRoot);

            }, 500);
          } else
            this.router.navigate([intent.data]);
        }
        // blinker icon进入
        else if (this.platformLocation.pathname.indexOf('/device/') > -1) {
          this.navCtrl.navigateRoot('/');
        }
      })
    }
  }
}
