import { Component } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { checkPhone, checkPassword, checkSmscode } from 'src/app/core/functions/check';
import { PusherService } from 'src/app/core/services/pusher.service';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';
import { DocPage } from 'src/app/core/pages/doc/doc.page';

@Component({
  selector: 'page-register',
  templateUrl: 'register.html',
  styleUrls: ['register.scss'],
})
export class RegisterPage {

  phone: string = '';
  password: string = '';
  smscode: string = '';
  smscodeButton: string = "ACCOUNT.SEND_SMSCODE";
  smscodeButtonDisabled: boolean = true;
  registerButtonDisabled: boolean = true;
  // waiting: boolean = false;

  countdownString = '';

  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;
  NAME = CONFIG.NAME;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private navCtrl: NavController,
    private pusherService: PusherService,
    private deviceConfigService: DeviceConfigService,
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
        this.smscodeButton = "ACCOUNT.RESEND_SMSCODE";
        this.countdownString = '';
        this.smscodeButtonDisabled = false;
        window.clearInterval(t);
      } else {
        this.smscodeButton = "ACCOUNT.RESEND_SMSCODE";
        this.countdownString = `(${countdown})`;
      }
    }, 1000);
  }

  async onRegisterButton() {
    if (await this.authService.register(this.phone, this.smscode, this.password)) {
      await this.userService.getAllInfo();
      this.deviceConfigService.init()
      this.pusherService.init();
      this.navCtrl.navigateRoot('/');
    }
  }

  async openUrl(url, title) {
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