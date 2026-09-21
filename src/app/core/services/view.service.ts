import { Injectable, NgZone } from "@angular/core";
import {
  ActionSheetController,
  MenuController,
  ModalController,
  NavController,
  Platform,
} from "@ionic/angular/standalone";
import { PlatformLocation } from "@angular/common";
import { Router } from "@angular/router";
import { App } from "@capacitor/app";
import {
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from "@capacitor/core";
// import { ScreenOrientation,OrientationType } from '@capacitor/screen-orientation';
import { AndroidShortcuts } from "capacitor-android-shortcuts";
import {
  parseDeviceDeepLink,
  parseShortcutDeviceId,
} from "./device-deep-link";
import { parseMessageDeepLink } from "./message-deep-link";
import { parseShareInvitation } from "../device-v2/sharing/invitation-link";
import { DeviceV2ShareInvitationService } from "./device-v2-share-invitation.service";
import { NtfyService } from "./ntfy.service";
import {
  AppTheme,
  applyThemeToDocument,
  readStoredTheme,
  saveTheme,
} from "../theme/theme";

@Injectable({
  providedIn: "root",
})
export class ViewService {
  private activeTheme: AppTheme = "light";

  viewMode = "home";
  swipeEnable = true;
  menuSwipeEnable = false;
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
    private shareInvitation: DeviceV2ShareInvitationService,
    private ntfyService: NtfyService,
  ) {
    this.initializeTheme();
  }

  async init() {
    this.listenBackButton();
    this.checkShortcut();
    // ScreenOrientation.lock({ type: OrientationType.Portrait });
    this.getStatusBarHeight();
  }

  get theme(): AppTheme {
    return this.activeTheme;
  }

  get themeToggle(): boolean {
    return this.activeTheme === "dark";
  }

  initializeTheme(): void {
    this.applyTheme(readStoredTheme());
  }

  setTheme(theme: AppTheme): void {
    this.applyTheme(theme);
    saveTheme(theme);
  }

  initializeDarkTheme(isDark: boolean): void {
    this.setTheme(isDark ? "dark" : "light");
  }

  toggleDarkTheme(shouldAdd: boolean): void {
    this.setTheme(shouldAdd ? "dark" : "light");
  }

  private applyTheme(theme: AppTheme): void {
    this.activeTheme = theme;
    const isDark = theme === "dark";
    applyThemeToDocument(theme);

    if (this.platform.is("hybrid")) {
      void SystemBars.setStyle({
        bar: SystemBarType.StatusBar,
        style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      });
    }
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

  // Route shortcuts, app links and native notification taps through validated inputs.
  checkShortcut() {
    this.ntfyService.notificationActions$.subscribe(messageId => this.openMessageFromLink(messageId));
    void AndroidShortcuts.addListener("shortcut", (response) => {
      const deviceId = parseShortcutDeviceId(response.data, response.id);
      if (deviceId) this.openDeviceFromLink(deviceId);
    }).catch((error) => {
      console.warn("Unable to listen for Android shortcuts", error);
    });

    void App.addListener("appUrlOpen", ({ url }) => {
      this.openAppLink(url);
    }).catch((error) => {
      console.warn("Unable to listen for app links", error);
    });

    void App.getLaunchUrl()
      .then((launch) => {
        this.openAppLink(launch?.url);
      })
      .catch((error) => {
        console.warn("Unable to read the app launch URL", error);
      });
  }

  private openAppLink(url?: string): void {
    if (url?.startsWith('diandeng://share/') && parseShareInvitation(url)) {
      this.ngzone.run(() => {
        this.shareInvitation.stage(url);
        void this.router.navigate(['/share-invitation'], { replaceUrl: true });
      });
      return;
    }
    const message = parseMessageDeepLink(url);
    if (message) {
      this.openMessageFromLink(message.messageId);
      return;
    }

    const deviceId = parseDeviceDeepLink(url);
    if (deviceId) this.openDeviceFromLink(deviceId);
  }

  private openDeviceFromLink(deviceId: string): void {
    this.ngzone.run(() => {
      this.devicePageIsRoot = true;
      void this.router.navigate(["/device", deviceId], { replaceUrl: true });
    });
  }

  private openMessageFromLink(messageId: string | null): void {
    this.ngzone.run(() => {
      void this.router.navigate(["/message"], {
        queryParams: messageId ? { messageId } : undefined,
        replaceUrl: true,
      });
    });
  }

  statusBarHeight = 0;
  async getStatusBarHeight() {
    const tempElement = document.createElement('div');
    tempElement.style.position = 'fixed';
    tempElement.style.paddingTop = 'var(--ion-safe-area-top, 0px)';
    tempElement.style.visibility = 'hidden';
    document.body.appendChild(tempElement);

    const statusBarHeight = parseFloat(getComputedStyle(tempElement).paddingTop) || 0;
    document.body.removeChild(tempElement);
    this.statusBarHeight = statusBarHeight;
    console.log("Status Bar Height:", this.statusBarHeight);
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
