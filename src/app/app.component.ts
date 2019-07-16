import { Component, isDevMode, ViewChild } from '@angular/core';
import {
  Platform,
  Events,
  AlertController,
  NavController,
  App,
  Nav
} from 'ionic-angular';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';
import { ScreenOrientation } from '@ionic-native/screen-orientation';
import { TabsPage } from '../pages/tabs/tabs';
import { LoginPage } from '../pages/login/login';
import { UserProvider } from '../providers/user/user';
import { CodePush, InstallMode, SyncStatus } from '@ionic-native/code-push';
import { JPush } from '@jiguang-ionic/jpush';
import { AppVersion } from '@ionic-native/app-version';
import { FileTransfer, FileTransferObject } from '@ionic-native/file-transfer';
import { File } from '@ionic-native/file';
import { FileOpener } from '@ionic-native/file-opener';
import { Deeplinks } from '@ionic-native/deeplinks';
import { HomePage } from '../pages/home/home';
import { DeviceLoadingPage } from '../pages/device-loading/device-loading';
import { UserPage } from '../pages/user/user';
import { DeviceProvider } from '../providers/device/device';


@Component({
  templateUrl: 'app.html',
  providers: [
    ScreenOrientation,
    CodePush,
    AppVersion,
    FileOpener
  ]
})
export class MyApp {
  rootPage: any;

  // @ViewChild(Nav) navChild:Nav;

  constructor(
    private platform: Platform,
    private statusbar: StatusBar,
    private splashScreen: SplashScreen,
    private screenOrientation: ScreenOrientation,
    private userProvider: UserProvider,
    private deviceProvider: DeviceProvider,
    private codePush: CodePush,
    private appVersion: AppVersion,
    private events: Events,
    private jpush: JPush,
    private alertCtrl: AlertController,
    private transfer: FileTransfer,
    private file: File,
    private fileOpener: FileOpener,
    private deeplinks: Deeplinks,
    public appCtrl: App
  ) {
    this.platform.ready().then(() => {
      if (this.platform.is("cordova")) {
        this.statusbar.overlaysWebView(true);
        this.screenOrientation.lock(this.screenOrientation.ORIENTATIONS.PORTRAIT_PRIMARY);
        // 检查apk更新
        // if (this.platform.is("android")) this.checkUpdate();
        // 检查热更新
        this.checkCodePush();
        // 初始化推送功能
        this.jpush.init()
        this.jpush.setDebugMode(true);
        // 初始化deeplinks
        this.initDeeplinks();
      }

      //调试用，直接进入home页
      // this.rootPage = TabsPage;
      // splashScreen.hide();

      this.userProvider.isLogin().then(result => {
        if (result) {
          if (this.rootPage != DeviceLoadingPage)
            this.rootPage = TabsPage;
            // this.rootPage = DeviceLoadingPage;
        } else {
          this.rootPage = LoginPage;
        }
        if (platform.is("cordova"))
          this.splashScreen.hide();
      });


    })
    if (isDevMode()) {
      console.log("当前为开发模式")
    }
  }

  async initApp() {
    let loaded = await this.userProvider.getAllInfo();
    if (!loaded) return;
    this.deviceProvider.init();
  }

  checkCodePush() {
    this.codePush.sync({
      updateDialog: {
        updateTitle: "检测到可用更新",
        optionalUpdateMessage: "是否要立即安装更新？",
        optionalInstallButtonLabel: "立即安装",
        optionalIgnoreButtonLabel: "以后再说",
        // appendReleaseDescription: true,
        // descriptionPrefix: "\n\nChange log:\n"
      },
      installMode: InstallMode.IMMEDIATE,
    }).subscribe((status) => {
      switch (status) {
        case SyncStatus.DOWNLOADING_PACKAGE:
          this.events.publish('loading:show', 'updateDownloading')
          break;
        case SyncStatus.INSTALLING_UPDATE:
          this.events.publish('loading:show', 'updateInstalling')
          break;
        case SyncStatus.UPDATE_INSTALLED:
          this.events.publish('provider:notice', 'updateInstalled')
          break;
      }
    },
      (err) => {
        console.log('CODE PUSH ERROR: ' + err);
      }
    );
  }


  // 暂时没有使用，SDK>23时需要修改android项目
  checkUpdate() {
    this.appVersion.getVersionNumber().then(version => {
      // console.log(version);
      this.userProvider.checkUpdate().then(lastApk => {
        console.log(lastApk);
        console.log(this.toNum(lastApk.version));
        console.log(this.toNum(version));
        if (this.toNum(lastApk.version) > this.toNum(version)) {
          console.log("有更新的apk可供下载")
          this.showConfirm(lastApk);
        } else {
          console.log("当前app已经是最新版本")
        }
      });
    }, error => console.error(error => {
      //获取版本号失败
    }));
  }

  toNum(version: string) {
    return parseFloat(version.replace('.', ''));
  }

  showConfirm(lastApk) {
    const confirm = this.alertCtrl.create({
      title: '发现blinker' + lastApk.version,
      message: '新版blinker发布啦，马上更新吧！',
      buttons: [{
        text: '稍后再说',
        handler: () => {
          console.log('稍后再说');
        }
      }, {
        text: '马上更新',
        handler: () => {
          console.log('马上更新');
          this.downloadApk(lastApk.url);
        }
      }]
    });
    confirm.present();
  }

  downloadApk(url) {
    let path = this.file.externalDataDirectory + 'lastblinker.apk';
    const fileTransfer: FileTransferObject = this.transfer.create();
    fileTransfer.onProgress(progressEvent => {
      var present = new Number((progressEvent.loaded / progressEvent.total) * 100);
      console.log('当前进度为：' + present.toFixed(0));
      // var presentInt = present.toFixed(0);
      // this.loadingService.presentProgress(presentInt);
    });
    fileTransfer.download(url, path).then((entry) => {
      console.log('download complete: ' + entry.toURL());

      this.fileOpener.open(entry.toURL(), "application/vnd.android.package-archive")
        .then(() => console.log('打开apk包成功！'))
        .catch(e => console.log('打开apk包失败！', e));

    }, (error) => {
      // handle error
    });
  }

  initDeeplinks() {
    console.log("init deeplinks");
    this.deeplinks.route({
      '/home': HomePage,
      '/user': UserPage,
      '/device/:deviceName': DeviceLoadingPage,
    }).subscribe(match => {
      console.log('Successfully matched route', match);
      this.gotoDeviceLoadingPage(match.$args.deviceName)
    }, nomatch => {
      console.error('Got a deeplink that didn\'t match', nomatch);
    });
  }

  async gotoDeviceLoadingPage(deviceName) {

    this.userProvider.isLogin().then(result => {
      if (result) {
        //判断当前rootPage是否为TabsPage
        //如果是则加入导航堆栈
        //如果不是则直接设置为DeviceLoadingPage
        if (this.rootPage == TabsPage) {
          this.appCtrl.getActiveNavs()[0].popToRoot();
          this.appCtrl.getActiveNavs()[0].push('Layout2Page', this.deviceProvider.devices[deviceName]);
        } else {
          this.rootPage = DeviceLoadingPage;
        }
        this.deviceProvider.oneDeviceName = deviceName;
      }
    });
  }
}
