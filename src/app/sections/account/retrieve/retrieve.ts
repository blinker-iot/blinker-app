import { Component } from '@angular/core';
import { LoadingController, AlertController, NavController } from '@ionic/angular';
import { checkPhone, checkPassword, checkSmscode } from 'src/app/core/functions/check';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';

@Component({
  selector: 'page-retrieve',
  templateUrl: 'retrieve.html',
  styleUrls: ['retrieve.scss'],
})
export class RetrievePage {

  phone: string = '';
  password: string = '';
  smscode: string = '';
  smscodeButton: string = "ACCOUNT.SEND_SMSCODE";
  smscodeButtonDisabled: boolean = true;
  retrieveButtonDisabled: boolean = true;
  // waiting: boolean = false;

  countdownString = ''

  NAME = CONFIG.NAME;

  constructor(
    private authService: AuthService,
    public loadingCtrl: LoadingController,
    public alertCtrl: AlertController,
    private navCtrl: NavController
  ) {
  }

  checkPhone() {
    if (checkPhone(this.phone)) this.smscodeButtonDisabled = false;
    else this.smscodeButtonDisabled = true;
  }

  checkAll() {
    if (checkPhone(this.phone) && checkPassword(this.password) && checkSmscode(this.smscode))
      return this.retrieveButtonDisabled = false;
    return this.retrieveButtonDisabled = true;
  }

  onSmscodeButton() {
    this.authService.getSmscode(this.phone, 'reset').then(result => {
      if (result) {
        console.log("验证码短信已发送至" + this.phone);
      } else {
        console.log("短信发送失败,请60秒后重新尝试");
      }
    })
    this.smscodeButtonDisabled = true;
    // this.waiting = true;
    let countdown = 60;
    let t = window.setInterval(() => {
      countdown = countdown - 1;
      if (countdown == 0) {
        this.smscodeButton = "ACCOUNT.RESEND_SMSCODE";
        this.countdownString = '';
        this.smscodeButtonDisabled = false;
        // this.waiting = false;
        window.clearInterval(t);
      } else {
        this.smscodeButton = "ACCOUNT.RESEND_SMSCODE";
        this.countdownString = `(${countdown})`;
      }
    }, 1000)
  }

  async onRetrieveButton() {
    let loadding = await this.loadingCtrl.create({
      message: "请稍后...",
    });
    loadding.present();
    this.authService.retrieve(this.phone, this.smscode, this.password)
      .then(async result => {
        if (result) {
          console.log("密码重设成功");
          loadding.dismiss();
          let alert = await this.alertCtrl.create({
            header: '重设密码成功',
            subHeader: '请使用新密码登录',
            buttons: ['登录']
          });
          alert.present();
          this.navCtrl.pop();
        }
        else {
          console.log("密码重设失败");
          loadding.dismiss();
          let alert = await this.alertCtrl.create({
            header: '重设密码失败',
            subHeader: '请重新尝试',
            buttons: ['重试']
          });
          alert.present();
        }
      });
  }

}
