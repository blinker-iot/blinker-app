import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, Platform, AlertController } from 'ionic-angular';
import { AppAvailability } from '@ionic-native/app-availability';
import { InAppBrowser } from '@ionic-native/in-app-browser';

@IonicPage()
@Component({
  selector: 'page-ali-genie-guide',
  templateUrl: 'ali-genie-guide.html',
  providers:[AppAvailability,InAppBrowser]
})
export class AliGenieGuidePage {

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private appAvailability: AppAvailability,
    private platform: Platform,
    private iab: InAppBrowser,
    public alertCtrl: AlertController
  ) {
  }

  ionViewDidLoad() {

  }

  openApp() {
    // 检测是否安装天猫精灵
    let app;
    if (this.platform.is('ios')) {
      app = 'assistant://';
    } else if (this.platform.is('android')) {
      app = 'com.alibaba.ailabs.tg';
    }
    this.appAvailability.check(app)
      .then(
        (yes: boolean) => {
          console.log(app + ' is available')
          const browser = this.iab.create('assistant://home/', '_system');
        },
        (no: boolean) => {
          console.log(app + ' is NOT available')
          this.showAlert();
        }
      );
    //如果没有安装
  }

  showAlert() {
    const alert = this.alertCtrl.create({
      title: '天猫精灵APP未安装',
      subTitle: '是否要安装天猫精灵app？',
      buttons: [
        {
          text: '取消',
          handler: data => {
            console.log('Cancel clicked');
          }
        },
        {
          text: '立即安装',
          handler: data => {
            let url;
            if (this.platform.is('ios')) {
              url = 'https://itunes.apple.com/cn/app/%E5%A4%A9%E7%8C%AB%E7%B2%BE%E7%81%B5/id1158753204';
            } else if (this.platform.is('android')) {
              url = 'https://app-aicloud.alibaba.com/download';
            }
            const browser = this.iab.create(url, '_system');
          }
        }
      ]
    });
    alert.present();
  }

}
