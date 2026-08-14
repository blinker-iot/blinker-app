import {
  Component,
  ViewChild,
  ElementRef,
  HostListener,
  OnInit,
  AfterViewInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Platform, NavController } from '@ionic/angular/standalone';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { UserService } from 'src/app/core/services/user.service';
import { ViewService } from './core/services/view.service';
import { NoticeService } from './core/services/notice.service';
import { PusherService } from './core/services/pusher.service';
import { UpdateService } from './core/services/update.service';
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
import { BTipComponent } from './core/components/b-tip/b-tip.component';
import { BToastComponent } from './core/components/b-toast/b-toast.component';
import { headerIconTransitionAnimation } from './core/animations/header-icon-transition.animation';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    IonApp,
    IonRouterOutlet,
    BTipComponent,
    BToastComponent,
  ],
  templateUrl: 'app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, AfterViewInit {
  isPWA = false;
  isPcBrowser = false;
  readonly routerAnimation = headerIconTransitionAnimation;

  get swipeEnable() {
    return this.viewService.swipeEnable;
  }

  get toastList() {
    return this.toastService.list;
  }

  get tipList() {
    return this.tipService.list;
  }

  @ViewChild('audio', { read: ElementRef, static: true }) audio: ElementRef;

  constructor(
    private platform: Platform,
    // private splashScreen: SplashScreen,
    private viewService: ViewService,
    private authService: AuthService,
    private userService: UserService,
    private dataService: DataService,
    private noticeService: NoticeService,
    // private pusherService: PusherService,
    private updateService: UpdateService,
    private networkService: NetworkService,
    // private deviceConfigService: DeviceConfigService,
    private navCtrl: NavController,
    private deviceService: DeviceService,
    // private screenOrientation: ScreenOrientation,
    private imageService: ImageService,
    private toastService: ToastService,
    private tipService: TipService,
    private translationService: TranslationService,
    private audioService: AudioService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // 在 ngOnInit 中初始化 isPcBrowser 以避免 ExpressionChangedAfterItHasBeenCheckedError
    this.isPcBrowser = this.checkIsPcBrowser();
  }

  ngAfterViewInit() {
    this.initApp();
  }

  initApp() {
    this.initService();
    if (this.isPcBrowser) {
      console.log('当前是PC端浏览器访问');
    }

    // if (!isDevMode() && this.platform.is("android")) this.checkApkUpdate();
    // if (!isDevMode())
    //   this.updateService.checkUpdate();
    //   // this.watchProgressbar();
    //   // this.splashScreen.hide();
    // } else {
    //   this.isPWA = true
    // }
  }

  @HostListener('window:resize')
  onWindowResize() {
    const newIsPcBrowser = this.checkIsPcBrowser();
    if (this.isPcBrowser !== newIsPcBrowser) {
      this.isPcBrowser = newIsPcBrowser;
      // 手动触发变更检测
      this.cdr.detectChanges();
    }
  }
  async initService() {
    console.log('init service');
    void this.checkLoginStatus();
    this.authService.init();
    // this.deviceConfigService.init();
    this.deviceService.init();
    this.noticeService.init();
    this.imageService.init();
    this.translationService.init();
    this.audioService.init(this.audio.nativeElement);

    // 原生内容加载
    if (Capacitor.isNativePlatform()) {
      console.log('init native service');
      this.viewService.init(); // 适配手机样式
      this.networkService.init();
      this.updateService.init();
      // 国内无法使用推送服务
      // this.pusherService.init();
    }
  }

  async checkLoginStatus() {
    if (this.authService.isLogin()) {
      if (!(await this.userService.getAllInfo())) await this.authService.logout();
    } else {
      this.navCtrl.navigateRoot('/login');
    }
  }

  checkIsPcBrowser(): boolean {
    // 判断屏幕宽度是否大于等于600px，且不是原生平台
    return window.innerWidth >= 600 && !Capacitor.isNativePlatform();
  }
}
