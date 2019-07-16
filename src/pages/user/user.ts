import { LoginPage } from '../login/login';
import { Component } from '@angular/core';
import { NavController, App, Events } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { DeviceProvider } from '../../providers/device/device';
import { AppVersion } from '@ionic-native/app-version';
import { Platform } from 'ionic-angular';
import { CodePush, InstallMode, SyncStatus } from '@ionic-native/code-push';

@Component({
  selector: 'page-user',
  templateUrl: 'user.html',
  providers: [
    AppVersion, CodePush
  ]
})
export class UserPage {
  softVersion: string='0.0.0';
  showNew = false;
  err: string;
  constructor(
    public navCtrl: NavController,
    public userProvider: UserProvider,
    public deviceProvider: DeviceProvider,
    private app: App,
    private appVersion: AppVersion,
    public plt: Platform,
    private codePush: CodePush,
    private events: Events
  ) {

  }

  async getVersionNumber() {
    if (this.plt.is("cordova")) {
      this.softVersion = await this.appVersion.getVersionNumber();
      this.codePush.checkForUpdate().then((update) => {
        if (!update) {
          console.log("The app is up to date.");
        } else {
          this.showNew = true;
          console.log("An update is available! Should we download it?");
        }
      });
    }
  }

  ionViewDidLoad() {
    this.getVersionNumber();
  }

  logout() {
    this.deviceProvider.disconnectMqttBroker();
    this.userProvider.logout();
    this.app.getRootNav().setRoot(LoginPage);
    this.navCtrl.goToRoot;
  }

  goto(page) {
    this.navCtrl.push(page);
  }
  gotoUserInfoPage() {
    this.navCtrl.push("UserInfoPage");
  }

  gotoUserDevicesPage() {
    this.navCtrl.push("UserDevicesPage");
  }

  gotoUserSettingsPage() {
    this.navCtrl.push("UserSettingsPage");
  }

  gotoSceneSettingPage() {
    this.navCtrl.push('SceneButtonSettingPage');
  }

  gotoDevtoolPage() {
    this.navCtrl.push('DevtoolPage');
  }

  checkUpdate() {
    this.codePush.sync(
      {
        updateDialog: {
          updateTitle: "检测到可用更新",
          optionalUpdateMessage: "是否要立即安装更新？",
          optionalInstallButtonLabel: "立即安装",
          optionalIgnoreButtonLabel: "以后再说",
          // appendReleaseDescription: true,
          // descriptionPrefix: "\n\nChange log:\n"
        },
        installMode: InstallMode.IMMEDIATE,
      },
      //  downloadProgress
    ).subscribe(
      (status) => {
        console.log('CODE PUSH SUCCESSFUL: ' + status);
        switch (status) {
          case SyncStatus.DOWNLOADING_PACKAGE:
            // console.log("下载更新");
            this.events.publish('loading:show', 'updateDownloading')
            break;
          case SyncStatus.INSTALLING_UPDATE:
            this.events.publish('loading:show', 'updateInstalling')
            // console.log("正在更新");
            break;
          case SyncStatus.UPDATE_INSTALLED:
            this.events.publish('provider:notice', 'updateInstalled')
            // console.log("更新完成");
            break;
        }
      },
      (err) => {
        // this.err = JSON.stringify(err);
        console.log('CODE PUSH ERROR: ' + err);
      }
    );
  }
}