import { Component } from '@angular/core';
import { Events, NavController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { ViewService } from 'src/app/view/view.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';

@Component({
  selector: 'page-login',
  templateUrl: 'login.html',
  styleUrls: ['login.scss'],
})
export class LoginPage {
  LOGO = CONFIG.LOGIN_LOGO;

  username: string = "";
  password: string = "";

  pwshow = false;

  showPoweredBy = true;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private events: Events,
    private navCtrl: NavController,
    private viewService: ViewService
  ) {
  }

  ngOnInit(): void {
    this.viewService.setDarkStatusBar();
  }

  async login() {
    if (this.username.length <= 0) {
      this.events.publish("provider:notice", "needPhoneNumberOrUserName");
      return;
    }
    if (this.password.length < 8) {
      this.events.publish("provider:notice", "needPassword");
      return;
    }
    if (await this.authService.login(this.username, this.password)) {
      await this.userService.getAllInfo();
      this.navCtrl.navigateRoot('/');
    }

  }

  showPassword() {
    this.pwshow = !this.pwshow
  }

  onFocus() {
    this.showPoweredBy = false;
  }

  onBlur() {
    this.showPoweredBy = true;
  }

}
