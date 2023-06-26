import { Component } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { ViewService } from 'src/app/core/services/view.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';
import { DocPage } from 'src/app/core/pages/doc/doc.page';
import { NoticeService } from 'src/app/core/services/notice.service';
import { FirstModalComponent } from '../first-modal/first-modal.component';

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

  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private noticeService: NoticeService,
    private navCtrl: NavController,
    private viewService: ViewService,
    private modalCtrl: ModalController
  ) {
  }

  ngOnInit(): void {
    if (localStorage.getItem('showFirstModal') == null) this.openFirstModal()
    this.viewService.setDarkStatusBar();
  }

  async login() {
    await this.noticeService.showLoading('login')
    if (this.username.length <= 0) {
      this.noticeService.showToast('needPhoneNumberOrUserName')
      return;
    }
    if (this.password.length < 8) {
      this.noticeService.showToast('needPassword')
      return;
    }
    if (await this.authService.login(this.username, this.password)) {
      await this.userService.getAllInfo();
      await this.noticeService.hideLoading()
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

  async openFirstModal() {
    const modal = await this.modalCtrl.create({
      component: FirstModalComponent,
      backdropDismiss: false,
    });
    modal.present();
  }

}
