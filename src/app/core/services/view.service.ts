import { Injectable, NgZone } from "@angular/core";
import {
  ActionSheetController,
  MenuController,
  ModalController,
  NavController,
  Platform,
} from "@ionic/angular";
import { PlatformLocation } from "@angular/common";
import { NavigationEnd, Router } from "@angular/router";
import { Subject } from "rxjs";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SafeArea } from "@aashu-dubey/capacitor-statusbar-safe-area";
// import { ScreenOrientation,OrientationType } from '@capacitor/screen-orientation';
import { AndroidShortcuts } from "capacitor-android-shortcuts";

@Injectable({
  providedIn: "root",
})
export class ViewService {
  viewMode = "home";
  swipeEnable = true;
  menuSwipeEnable = false;
  showSpeechModal = false;
  devicePageIsRoot = false;

  get isIos() {
    return this.platform.is("ios");
  }

  get keyboardHeight() {
    let val = localStorage.getItem("keyboardHeight");
    if (val == null) return 0;
    return JSON.parse(localStorage.getItem("keyboardHeight"));
  }

  constructor(
    private actionSheetController: ActionSheetController,
    private navCtrl: NavController,
    private platform: Platform,
    private platformLocation: PlatformLocation,
    private menu: MenuController,
    private router: Router,
    private modalCtrl: ModalController,
    private ngzone: NgZone,
  ) {}

  async init() {
    this.listenBackButton();
    this.checkShortcut();
    this.listenRouter();
    // ScreenOrientation.lock({ type: OrientationType.Portrait });
    StatusBar.setOverlaysWebView({ overlay: true });
    this.getStatusBarHeight();
  }

  themeToggle = false;
  initializeDarkTheme(isDark) {
    this.themeToggle = isDark;
    this.toggleDarkTheme(isDark);
  }

  toggleDarkTheme(shouldAdd) {
    document.body.classList.toggle("dark", shouldAdd);
  }

  listenBackButton() {
    this.platform.backButton.subscribeWithPriority(9999, async () => {
      if (typeof await this.modalCtrl.getTop() != "undefined") {
        console.log("close modal");
        this.modalCtrl.dismiss();
      } else if (
        this.menuSwipeEnable &&
        this.platformLocation.pathname.indexOf("/view") > -1
      ) {
        console.log("close menu");
        this.menu.close();
      } else if (this.showSpeechModal) {
        this.showSpeechModal = false;
      } else if (this.platformLocation.pathname.indexOf("/view") > -1) {
        App.minimizeApp();
      } else if (
        this.devicePageIsRoot &&
        this.platformLocation.pathname.indexOf("/device/") > -1
      ) {
        App.minimizeApp();
      } else {
        this.navCtrl.pop();
      }
    });
  }

  disableSwipeBack() {
    setTimeout(() => {
      this.swipeEnable = false;
    });
  }

  enableSwipeBack() {
    setTimeout(() => {
      this.swipeEnable = true;
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
      header: "视图模式切换",
      buttons: [{
        text: "常规视图",
        handler: () => {
          this.viewMode = "home";
          this.navCtrl.navigateRoot("/view/home");
        },
      }, {
        text: "地理视图",
        handler: () => {
          this.viewMode = "gis";
          this.navCtrl.navigateRoot("/view/gis");
        },
      }// {
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
      ],
    });
    await actionSheet.present();
  }

  lastStatusBar = "dark";
  currentStatusBar = "dark";
  setLightStatusBar() {
    this.lastStatusBar = this.currentStatusBar;
    // StatusBar.setStyle({ style: Style.Light });
    this.currentStatusBar = "light";
  }

  setDarkStatusBar() {
    this.lastStatusBar = this.currentStatusBar;
    // StatusBar.setStyle({ style: Style.Dark });
    this.currentStatusBar = "dark";
  }

  // 用于改变StatusBar颜色
  listenRouter() {
    this.changeStatusBar(this.router.url);
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.changeStatusBar(e.url);
      }
    });
  }

  changeStatusBar(url) {
    // console.log('url:', url);
    // if (url == '/view/home' || url == '/view/gis') this.setDarkStatusBar()
    // else if (url == '/device-manager/') this.setDarkStatusBar()
    // else if (url == '/device-manager') this.setLightStatusBar()
    // else if (url == '/timer/') this.setDarkStatusBar()
    // else if (url == '/location') this.setLightStatusBar()
    setTimeout(() => {
      let els = document.querySelectorAll("ion-header");
      if (typeof els[els.length - 1] == "undefined") return;
      if (typeof els[els.length - 1].attributes["whitebg"] != "undefined") {
        this.setDarkStatusBar();
      } else {
        this.setLightStatusBar();
      }
    }, 800);
  }

  // 从shortcut进入app
  newIntentData = new Subject<any>();
  checkShortcut() {
    AndroidShortcuts.addListener("shortcut", (response: any) => {
      // response.data contains the content of the 'data' property of the created shortcut
      let url = response.data;
      if (url == null) {
        if (this.platformLocation.pathname.indexOf("/device/") > -1) {
          this.navCtrl.navigateRoot("/");
        }
      } else {
        if (
          this.platformLocation.pathname.indexOf("/device/") > -1 &&
          this.devicePageIsRoot
        ) {
          this.navCtrl.navigateRoot(url);
          setTimeout(() => {
            this.devicePageIsRoot = true;
          }, 500);
        } else {
          this.router.navigate([url]);
        }
      }
    });

   
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

  statusBarHeight = 0;
  async getStatusBarHeight() {
    const { height } = await SafeArea.getStatusBarHeight();
    this.statusBarHeight = height;
  }

  listenKeyboardShow;
  listenKeyboardHide;
  listenKeyboard() {
    // this.listenKeyboardShow = this.renderer.listen('window', 'native.keyboardshow', e => {
    //   // this.keyboardHeight = e.keyboardHeight
    //   localStorage.setItem('keyboardHeight', JSON.stringify(e.keyboardHeight))
    // });
  }

  unlistenKeyboard() {
    // if (typeof (this.listenKeyboardShow) === 'function') this.listenKeyboardShow();
  }
}
