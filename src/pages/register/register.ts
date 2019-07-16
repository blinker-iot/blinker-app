import { Component} from '@angular/core';
import { NavController, LoadingController, App, AlertController, IonicPage } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { TabsPage } from './../tabs/tabs';

@IonicPage()
@Component({
  selector: 'page-register',
  templateUrl: 'register.html'
})
export class RegisterPage {

  phone: string;
  password: string;
  smscode: string;
  smscodeButton: string = "发送验证码";
  smscodeButtonDisabled: boolean = true;
  registerButtonDisabled: boolean = true;
  waiting: boolean = false;

  constructor(
    public navCtrl: NavController,
    public userProvider: UserProvider,
    private app: App,
    public loadingCtrl: LoadingController,
    public alertCtrl: AlertController
  ) { }

  ionViewDidLoad() {
    console.log('ionViewDidLoad RegisterPage');
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
            this.registerButtonDisabled = false;
            return;
          }
          else{
            
          }
    this.registerButtonDisabled = true;
  }

  onSmscodeButton() {
    this.userProvider.getSmscode(this.phone, 'new');
    this.smscodeButtonDisabled = true;
    let countdown = 60;
    let t = window.setInterval(() => {
      countdown = countdown - 1;
      if (countdown == 0) {
        this.smscodeButton = "重新发送";
        this.smscodeButtonDisabled = false;
        window.clearInterval(t);
      } else {
        this.smscodeButton = "重新发送(" + countdown + ")";
      }
    }, 1000);
  }

  async onRegisterButton() {
    if ((this.phone.length == 11) && (parseInt(this.phone) >= 10000000000))
      if ((this.smscode.length == 6) && (parseInt(this.smscode) != NaN))
        if (this.password.length > 7)
          if (await this.userProvider.register(this.phone, this.smscode, this.password)) {
            this.app.getRootNav().setRoot(TabsPage);
            this.navCtrl.goToRoot;
          }
  }

}
