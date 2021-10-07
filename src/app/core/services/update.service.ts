import { Injectable } from '@angular/core';
// import { CodePush, InstallMode } from '@ionic-native/code-push/ngx';
import { AlertController, Platform } from '@ionic/angular';
import { AppVersion } from '@ionic-native/app-version/ngx';
import { FileOpener } from '@ionic-native/file-opener/ngx';
import { HttpClient } from '@angular/common/http';
import { FileTransfer, FileTransferObject } from '@ionic-native/file-transfer/ngx';
import { File } from '@ionic-native/file/ngx';
import { CONFIG } from 'src/app/configs/app.config';

@Injectable({
  providedIn: 'root'
})
export class UpdateService {

  lastApk;
  currentVersion;
  hasNewVersion;

  constructor(
    // private codePush: CodePush,
    private appVersion: AppVersion,
    private file: File,
    private fileOpener: FileOpener,
    private alertCtrl: AlertController,
    private http: HttpClient,
    private fileTransfer: FileTransfer,
    private platform: Platform,
  ) { }

  checkUpdate() {
    this.checkApkUpdate().then(result => {
      if (result) {
        this.hasNewVersion = true
        this.showConfirm(this.lastApk);
      } else {
        // try {
        //   this.checkCodePush()
        // } catch (error) {
        //   console.log('code push bei qiang');
        // }
      }
    })
  }


  checkCodePush() {
    // this.codePush.sync(
    //   {
    //     updateDialog: {
    //       updateTitle: "检测到可用更新",
    //       optionalUpdateMessage: "",
    //       optionalInstallButtonLabel: "立即安装",
    //       optionalIgnoreButtonLabel: "以后再说",
    //       appendReleaseDescription: true,
    //       descriptionPrefix: "变更说明：\n"
    //     },
    //     installMode: InstallMode.IMMEDIATE,
    //   },
    //   (progress) => {
    //     this.ev.publish('progressbar', progress.receivedBytes / progress.totalBytes)
    //   }
    // ).subscribe((status) => {
    //   // switch (status) {
    //   //   case SyncStatus.DOWNLOADING_PACKAGE:
    //   //     // this.ev.publish('loading:show', 'updateDownloading')
    //   //     break;
    //   //   case SyncStatus.INSTALLING_UPDATE:
    //   //     // this.ev.publish('loading:show', 'updateInstalling')
    //   //     break;
    //   //   case SyncStatus.UPDATE_INSTALLED:
    //   //     // this.ev.publish('provider:notice', 'updateInstalled')
    //   //     break;
    //   // }
    // },
    //   (err) => {
    //     console.log('CODE PUSH ERROR: ' + err);
    //   }
    // );
  }

  checkForUpdate(): Promise<boolean> {
    // return this.codePush.checkForUpdate()
    //   .then(result => {
    //     if (result) return true
    //     // if (result) this.hasNewVersion = true
    //   })
    return new Promise((reslove, reject) => { reslove(false) })
  }

  checkApkUpdate(): Promise<boolean> {
    return new Promise<boolean>(
      async (resolve) => {
        if (this.platform.is('ios')) resolve(false);
        this.currentVersion = await this.appVersion.getVersionNumber();
        this.lastApk = await this.http.get(CONFIG.UPDATE_FILE).toPromise();
        if (this.toNum(this.lastApk.version) > this.toNum(this.currentVersion)) {
          return resolve(true);
        } else {
          return resolve(false);
        }
      })
  }

  toNum(version: string) {
    return parseFloat(version.replace('.', ''));
  }

  async showConfirm(lastApk) {
    const confirm = await this.alertCtrl.create({
      header: '发现更新的版本',
      message: `blinker App ${lastApk.version}已发布，是否立即更新？`,
      buttons: [{
        text: '稍后再说',
        handler: () => {
        }
      }, {
        text: '下载并更新',
        handler: () => {
          this.downloadApk(lastApk.url);
        }
      }]
    });
    confirm.present();
  }

  downloadApk(url) {
    let path = this.file.externalDataDirectory + 'lastblinker.apk';
    // let path = this.file.externalRootDirectory + `download/blinker-${version}.apk`;
    const fileTransfer: FileTransferObject = this.fileTransfer.create();
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
        .catch(e => console.warn('打开apk包失败！', e));

    }, (error) => {
      // handle error
    });
  }
}
