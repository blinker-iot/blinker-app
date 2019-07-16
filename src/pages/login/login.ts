import { TabsPage } from './../tabs/tabs';
import { Component, Input } from '@angular/core';
import { NavController, App, Events, Platform } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
// import { RegisterPage } from '../register/register';
// import { RetrievePage } from '../retrieve/retrieve';
import { LoadingController } from 'ionic-angular';
import { AppMinimize } from '@ionic-native/app-minimize';
// import { StatusBar } from '@ionic-native/status-bar';
// import { ToastController } from 'ionic-angular';

@Component({
  selector: 'page-login',
  templateUrl: 'login.html',
})
export class LoginPage {
  loading = this.loadingCtrl.create({
    content: `登录中...`
  });

  @Input()
  username: string = "";
  password: string = "";

  constructor(
    public navCtrl: NavController,
    private userProvider: UserProvider,
    public loadingCtrl: LoadingController,
    private appMinimize: AppMinimize,
    public appCtrl: App,
    public events: Events,
    public platform: Platform
    // private statusbar: StatusBar
  ) {
    this.registerBackButton()
  }

  async loginButton() {
    if (this.username.length <= 0) {
      this.events.publish("provider:notice", "needPhoneNumberOrUserName");
      // alert("请输入账号");
    } else if (this.password.length < 8) {
      this.events.publish("provider:notice", "needPassword");
      // alert("请输入密码");
    }
    else {
      if (await this.userProvider.login(this.username, this.password)) {
        this.appCtrl.getRootNav().setRoot(TabsPage);
        this.navCtrl.goToRoot;

        // this.statusbar.show();
        // this.statusbar.overlaysWebView(true);
      }
    }
  }

  gotoSignup() {
    this.navCtrl.push("RegisterPage");
  }

  gotoRetrieve() {
    this.navCtrl.push("RetrievePage");
  }

  registerBackButton() {
    this.platform.registerBackButtonAction(() => {
      //获取NavController
      let activeNav: NavController = this.appCtrl.getActiveNavs()[0];
      //如果可以返回上一页，则执行pop
      // console.log(activeNav.getViews());
      if (activeNav.canGoBack() || activeNav.getViews()[0].name == "ModalCmp") {
        this.events.publish('notice:hide', 'hide');
        activeNav.pop();
      } else {
        this.appMinimize.minimize();
      }
    });
  }

}
