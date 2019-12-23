import { Component, ChangeDetectorRef } from '@angular/core';
import { Platform, Events, NavController } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { UserService } from 'src/app/core/services/user.service';
import { ViewService } from './view/view.service';
import { NoticeService } from './core/services/notice.service';
import { PusherService } from './core/services/pusher.service';
import { UpdateService } from './core/services/update.service';
import { DevicelistService } from './core/services/devicelist.service';
import { DataService } from './core/services/data.service';
import { DeviceService } from './core/services/device.service';
import { AuthService } from './core/services/auth.service';
import { NetworkService } from './core/services/network.service';
import { ScreenOrientation } from '@ionic-native/screen-orientation/ngx';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html'
})
export class AppComponent {
  isPWA;

  constructor(
    private platform: Platform,
    private events: Events,
    private splashScreen: SplashScreen,
    private statusBar: StatusBar,
    private viewService: ViewService,
    private authService: AuthService,
    private userService: UserService,
    private dataService: DataService,
    private noticeService: NoticeService,
    private pusherService: PusherService,
    private updateService: UpdateService,
    private networkService: NetworkService,
    private devicelistService: DevicelistService,
    private changeDetectorRef: ChangeDetectorRef,
    private navCtrl: NavController,
    private deviceService: DeviceService,
    private screenOrientation:ScreenOrientation
  ) { }

  ngOnInit() {
    console.log('app init');
    this.initApp();
  }

  ngAfterViewInit() {
    this.initService();
  }

  initApp() {
    this.platform.ready().then(() => {
      if (this.platform.is("cordova")) {
        this.statusBar.overlaysWebView(true);
        this.screenOrientation.lock(this.screenOrientation.ORIENTATIONS.PORTRAIT);
        // if (!isDevMode() && this.platform.is("android")) this.checkApkUpdate();
        // if (!isDevMode())
        this.updateService.checkUpdate();
        this.watchProgressbar();
        this.splashScreen.hide();
      } else {
        this.isPWA = true
      }
    });
  }

  initService() {
    setTimeout(async () => {
      await this.dataService.init();
      this.checkLoginStatus();
    });
    this.authService.init();
    this.devicelistService.init();
    this.deviceService.init();
    this.networkService.init();
    this.noticeService.init();
    this.viewService.init();
    this.watchSwipeEnable();
    this.pusherService.init();
  }

  checkLoginStatus() {
    if (this.authService.isLogin()) {
      this.userService.getAllInfo();
    } else {
      this.navCtrl.navigateRoot('/login');
    }
  }

  progressValue = 0;
  watchProgressbar() {
    this.events.subscribe('progressbar', value => {
      this.progressValue = value;
      this.changeDetectorRef.detectChanges();
    })
  }

  swipeEnable = true;
  watchSwipeEnable() {
    this.events.subscribe("swipeEnable", (enable: boolean) => {
      setTimeout(() => {
        this.swipeEnable = enable;
      });
    })
  }

}



