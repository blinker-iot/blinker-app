import { Component, ViewChild, ElementRef } from '@angular/core';
import { Platform, NavController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { ViewService } from './core/services/view.service';
import { NoticeService } from './core/services/notice.service';
import { PusherService } from './core/services/pusher.service';
import { UpdateService } from './core/services/update.service';
import { DeviceConfigService } from './core/services/device-config.service';
import { DataService } from './core/services/data.service';
import { DeviceService } from './core/services/device.service';
import { AuthService } from './core/services/auth.service';
import { NetworkService } from './core/services/network.service';
import { ImageService } from './core/services/image.service';
import { ToastService } from './core/services/toast.service';
import { TipService } from './core/services/tip.service';
import { TranslationService } from './core/services/translation.service';
import { AudioService } from './core/services/audio.service';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls:['./app.component.scss']
})
export class AppComponent {
  isPWA;

  get swipeEnable() {
    return this.viewService.swipeEnable
  }

  get toastList() {
    return this.toastService.list
  }

  get tipList() {
    return this.tipService.list
  }

  @ViewChild("audio", { read: ElementRef, static: true }) audio: ElementRef;

  constructor(
    private platform: Platform,
    // private splashScreen: SplashScreen,
    // private statusBar: StatusBar,
    private viewService: ViewService,
    private authService: AuthService,
    private userService: UserService,
    private dataService: DataService,
    private noticeService: NoticeService,
    private pusherService: PusherService,
    private updateService: UpdateService,
    private networkService: NetworkService,
    private deviceConfigService: DeviceConfigService,
    private navCtrl: NavController,
    private deviceService: DeviceService,
    // private screenOrientation: ScreenOrientation,
    private imageService: ImageService,
    private toastService: ToastService,
    private tipService: TipService,
    private translationService: TranslationService,
    private audioService: AudioService
  ) { }
  
  ngAfterViewInit() {
    this.initApp();
  }

  initApp() {
      this.initService()
      //   // if (!isDevMode() && this.platform.is("android")) this.checkApkUpdate();
      //   // if (!isDevMode())
      //   this.updateService.checkUpdate();
      //   // this.watchProgressbar();
      //   // this.splashScreen.hide();
      // } else {
      //   this.isPWA = true
      // }
  }

  async initService() {
    console.log('init service');
    
    await this.dataService.init();
    this.checkLoginStatus();
    this.authService.init();
    this.deviceConfigService.init();
    this.deviceService.init();
    this.noticeService.init();
    this.imageService.init();
    this.translationService.init()
    this.audioService.init(this.audio.nativeElement)

    // 原生内容加载
    if(Capacitor.isNativePlatform()){
      console.log('init native service');
      this.viewService.init(); // 适配手机样式
      this.networkService.init();
      this.updateService.init();
      // 国内无法使用推送服务
      // this.pusherService.init();
    }

    // 应相关部门要求，在通过同意后，才能使用推送服务
    // if (localStorage.getItem('showFirstModal') == '1') this.pusherService.init()
  }

  checkLoginStatus() {
    if (this.authService.isLogin()) {
      this.userService.getAllInfo();
    } else {
      this.navCtrl.navigateRoot('/login');
    }
  }

}



