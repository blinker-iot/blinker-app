import { Injectable, NgZone } from '@angular/core';
import { ActionSheetController, NavController, Platform, MenuController, ModalController } from '@ionic/angular';
// import { StatusBar } from '@ionic-native/status-bar/ngx';
import { AppMinimize } from '@ionic-native/app-minimize/ngx';
import { PlatformLocation } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';

declare var window;
declare var StatusBar;

@Injectable({
  providedIn: 'root'
})
export class ViewService {
  viewMode = 'home';
  swipeEnable = true;
  menuSwipeEnable = false;
  showSpeechModal = false;
  devicePageIsRoot = false;

  // statusBar = StatusBar
  statusBarHeight = new BehaviorSubject(0);
  appReady = new BehaviorSubject(false);

  get isIos() {
    return this.platform.is('ios');
  }

  constructor(
    private actionSheetController: ActionSheetController,
    private navCtrl: NavController,
    private platform: Platform,
    // private statusBar: StatusBar,
    private platformLocation: PlatformLocation,
    private menu: MenuController,
    private appMinimize: AppMinimize,
    private router: Router,
    private modalCtrl: ModalController,
    private ngzone: NgZone
  ) { }

  async init() {
    this.platform.ready().then(result => {
      if (result) this.appReady.next(true)
    })
    this.getStatusBarHeight().then(value => {
      this.statusBarHeight.next(value)
    })
    this.listenRouter();
    this.listenBackButton();
    this.checkShortcut();
  }

  listenBackButton() {
    this.platform.backButton.subscribeWithPriority(9999, async () => {
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
      } else {
        this.navCtrl.pop()
      }
    })
  }

  disableSwipeBack() {
    setTimeout(() => {
      this.swipeEnable = false
    });
  }

  enableSwipeBack() {
    setTimeout(() => {
      this.swipeEnable = true
    });
  }

  disableMenuSwipe() {
    this.menuSwipeEnable = false;
  }

  enableMenuSwipe() {
    this.menuSwipeEnable = true;
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
        //   text: '卡片视图',
        //   handler: () => {
        //     this.viewMode = 'card'
        //     this.navCtrl.navigateRoot('/view/card');
        //   }
        // },
        // {
        //   text: '列表视图',
        //   handler: () => {
        //     this.viewMode = 'list'
        //     this.navCtrl.navigateRoot('/view/list');
        //   }
        // },
        // {
        //   text: '聚合视图',
        //   handler: () => {
        //     this.viewMode = 'dashboard'
        //     this.navCtrl.navigateRoot('/view/dashboard');
        //   }
        // }
      ]
    });
    await actionSheet.present();
  }

  // lastStatusBar = 'dark';
  currentStatusBar = 'dark'
  setLightStatusBar() {
    if (!this.platform.is('cordova')) return;
    // this.lastStatusBar = this.currentStatusBar;
    StatusBar.styleLightContent();
    this.currentStatusBar = 'light';
  }

  setDarkStatusBar() {
    if (!this.platform.is('cordova')) return;
    // this.lastStatusBar = this.currentStatusBar;
    StatusBar.styleDefault();
    this.currentStatusBar = 'dark';
  }

  // 用于改变StatusBar颜色
  listenRouter() {
    this.changeStatusBar(this.router.url)
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.changeStatusBar(e.url)
      }
    })
  }

  changeStatusBar(url) {
    console.log('url:', url);
    // if (url == '/view/home' || url == '/view/gis') this.setDarkStatusBar()
    // else if (url == '/device-manager/') this.setDarkStatusBar()
    // else if (url == '/device-manager') this.setLightStatusBar()
    // else if (url == '/timer/') this.setDarkStatusBar()
    // else if (url == '/location') this.setLightStatusBar()
    setTimeout(() => {
      let els = document.querySelectorAll('ion-header')
      if (typeof els[els.length - 1].attributes['whitebg'] != 'undefined') {
        this.setDarkStatusBar()
      } else {
        this.setLightStatusBar()
      }
    }, 800);

  }

  // 从shortcut进入app
  newIntentData = new Subject<any>();
  checkShortcut() {
    if (!this.platform.is("cordova")) return
    this.getIntentData().then(url => {
      if (url != null) {
        this.devicePageIsRoot = true;
        this.navCtrl.navigateRoot(url);
      }
    })
    this.getNewIntentData();
    this.newIntentData.subscribe(url => {
      console.log(url);
      this.ngzone.run(() => {
        if (url == null) {
          if (this.platformLocation.pathname.indexOf('/device/') > -1) {
            this.navCtrl.navigateRoot('/');
          }
        } else {
          if (this.platformLocation.pathname.indexOf('/device/') > -1 && this.devicePageIsRoot) {
            this.navCtrl.navigateRoot(url);
            setTimeout(() => {
              this.devicePageIsRoot = true;
            }, 500);
          } else
            this.router.navigate([url]);
        }
      })

    })
    // window.plugins.Shortcuts.getIntent(intent => {
    //   if (typeof intent.data != 'undefined') {
    //     this.devicePageIsRoot = true;
    //     this.navCtrl.navigateRoot(intent.data);
    //   }
    // })
    // window.plugins.Shortcuts.onNewIntent(intent => {
    //   // 设备shortcut进入
    //   if (typeof intent.data != 'undefined') {
    //     if (this.platformLocation.pathname.indexOf('/device/') > -1 && this.devicePageIsRoot) {
    //       this.navCtrl.navigateRoot(intent.data);
    //       setTimeout(() => {
    //         this.devicePageIsRoot = true;
    //       }, 500);
    //     } else
    //       this.router.navigate([intent.data]);
    //   }
    //   // blinker icon进入
    //   else if (this.platformLocation.pathname.indexOf('/device/') > -1) {
    //     this.navCtrl.navigateRoot('/');
    //   }
    // })

  }

  getIntentData(): Promise<any> {
    return new Promise((resolve, reject) => {
      window.plugins.Shortcuts.getIntent(intent => {
        if (typeof intent.data != 'undefined') {
          resolve(intent.data)
        } else
          resolve(null)
      })
    })
  }

  getNewIntentData() {
    window.plugins.Shortcuts.onNewIntent(intent => {
      console.log(intent);
      if (typeof intent.data != 'undefined') {
        this.newIntentData.next(intent.data)
      }
    })
  }

  getStatusBarHeight(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.platform.is("cordova"))
        resolve(0)
      else
        this.platform.ready().then(() => {
          StatusBar.height((height) => {
            resolve(height)
          }, (error) => {
            console.log(error);
            resolve(0)
          });
        })

    })
  }

}

