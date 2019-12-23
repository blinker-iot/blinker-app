import { Component } from '@angular/core';
import { LoadingController, AlertController, NavController, ModalController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
// import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';
import { checkPhone, checkPassword, checkSmscode } from 'src/app/core/functions/check';
import { PusherService } from 'src/app/core/services/pusher.service';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';
import { DocPage } from 'src/app/core/pages/doc/doc.page';

@Component({
  selector: 'page-register',
  templateUrl: 'register.html',
  styleUrls: ['register.scss'],
  // providers: [InAppBrowser]
})
export class RegisterPage {

  phone: string = '';
  password: string = '';
  smscode: string = '';
  smscodeButton: string = "发送验证码";
  smscodeButtonDisabled: boolean = true;
  registerButtonDisabled: boolean = true;
  waiting: boolean = false;

  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;

  constructor(
    private authService: AuthService,
    // private iab: InAppBrowser,
    private userService: UserService,
    private navCtrl: NavController,
    private pusherService: PusherService,
    private devicelistService: DevicelistService,
    private modalCtrl: ModalController,
  ) { }

  checkPhone() {
    if (checkPhone(this.phone)) this.smscodeButtonDisabled = false;
    else this.smscodeButtonDisabled = true;
  }

  checkAll() {
    if (checkPhone(this.phone) && checkPassword(this.password) && checkSmscode(this.smscode))
      return this.registerButtonDisabled = false;
    return this.registerButtonDisabled = true;
  }

  onSmscodeButton() {
    this.authService.getSmscode(this.phone, 'new');
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
    // console.log(this.phone);
    // console.log(this.smscode);
    // console.log(this.password);
    if (await this.authService.register(this.phone, this.smscode, this.password)) {
      await this.userService.getAllInfo();
      this.devicelistService.init()
      this.pusherService.init();
      this.navCtrl.navigateRoot('/');
    }
  }

  async openUrl(url, title) {
    // let browser = this.iab.create(url, '_system', 'location=no,hidden=no');
    const modal = await this.modalCtrl.create({
      component: DocPage,
      backdropDismiss: false,
      componentProps: {
        'docTitle': title,
        'docUrl': url,
      }
    });
    modal.present();
  }
}