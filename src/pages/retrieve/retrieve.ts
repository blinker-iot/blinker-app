import { Component, Input } from '@angular/core';
import { NavController, LoadingController, AlertController, IonicPage } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';

@IonicPage()
@Component({
  selector: 'page-retrieve',
  templateUrl: 'retrieve.html',
})
export class RetrievePage {
  @Input() events: any;

  phone: string;
  password: string;
  smscode: string;
  smscodeButton: string = "发送验证码";
  smscodeButtonDisabled: boolean = true;
  retrieveButtonDisabled: boolean = true;
  waiting: boolean = false;
  constructor(
    public navCtrl: NavController,
    private userProvider: UserProvider,
    public loadingCtrl: LoadingController,
    public alertCtrl: AlertController
  ) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad RetrievePage');
  }

  ionViewDidLeave() {
    // window.clearInterval(t);
  }

  checkPhone() {
    if ((this.phone.length == 11) && (parseInt(this.phone) != NaN)) {
      this.smscodeButtonDisabled = false;
    } else {
      this.smscodeButtonDisabled = true;
    }
    this.checkAll();
  }

  checkAll() {
    if (typeof (this.phone) != "undefined" && typeof (this.smscode) != "undefined" && typeof (this.password) != "undefined")
      if ((this.phone.length == 11) && (parseInt(this.phone) != NaN))
        if ((this.smscode.length == 6) && (parseInt(this.smscode) != NaN))
          if (this.password.length > 7) {
            this.retrieveButtonDisabled = false;
            return;
          }
    this.retrieveButtonDisabled = true;
  }

  onSmscodeButton() {
    this.userProvider.getSmscode(this.phone, 'reset').then(result => {
      if (result) {
        console.log("验证码短信已发送至" + this.phone);
      } else {
        console.log("短信发送失败,请60秒后重新尝试");
      }
    })
    this.smscodeButtonDisabled = true;
    this.waiting = true;
    let countdown = 60;
    let t = window.setInterval(() => {
      countdown = countdown - 1;
      if (countdown == 0) {
        this.smscodeButton = "重新发送";
        this.smscodeButtonDisabled = false;
        this.waiting = false;
        window.clearInterval(t);
      } else {
        this.smscodeButton = "重新发送(" + countdown + ")";
      }
    }, 1000)
  }

  onRetrieveButton() {
    let loader = this.loadingCtrl.create({
      content: "请稍后...",
    });
    loader.present();
    this.userProvider.retrieve(this.phone, this.smscode, this.password)
      .then(result => {
        if (result) {
          console.log("密码重设成功");
          loader.dismiss();
          let alert = this.alertCtrl.create({
            title: '重设密码成功',
            subTitle: '请使用新密码登录',
            buttons: ['登录']
          });
          alert.present();
          this.navCtrl.pop();
        }
        else {
          console.log("密码重设失败");
          loader.dismiss();
          let alert = this.alertCtrl.create({
            title: '重设密码失败',
            subTitle: '请重新尝试',
            buttons: ['重试']
          });
          alert.present();
        }
      });
  }

}
