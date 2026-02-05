import { Component } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular/standalone';
import { IonicModule } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { ViewService } from 'src/app/core/services/view.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';
import { DocPage } from 'src/app/core/pages/doc/doc.page';
import { NoticeService } from 'src/app/core/services/notice.service';
import { FirstModalComponent } from './first-modal/first-modal.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { LangSelectorComponent } from 'src/app/core/components/lang-selector/lang-selector.component';

@Component({
    selector: 'page-login',
    templateUrl: 'login.html',
    styleUrls: ['login.scss'],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        TranslateModule,
        LangSelectorComponent
    ]
})
export class LoginPage {
  LOGO = CONFIG.LOGIN_LOGO;

  email: string = "";
  code: string = "";
  countdown: number = 0;
  private countdownTimer: any;

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

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  // 验证邮箱格式
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // 发送验证码
  async sendCode(event: Event) {
    event.preventDefault();
    
    if (!this.email || !this.isValidEmail(this.email)) {
      this.noticeService.showToast('needValidEmail');
      return;
    }

    await this.noticeService.showLoading('sendingCode');
    
    const success = await this.authService.sendEmailCode(this.email);
    await this.noticeService.hideLoading();
    
    if (success) {
      this.noticeService.showToast('codeSent');
      this.startCountdown();
    } else {
      this.noticeService.showToast('sendCodeFailed');
    }
  }

  // 开始倒计时
  startCountdown() {
    this.countdown = 60;
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer);
      }
    }, 1000);
  }

  async login() {
    if (!this.email || !this.isValidEmail(this.email)) {
      this.noticeService.showToast('needValidEmail');
      return;
    }
    if (!this.code || this.code.length < 4) {
      this.noticeService.showToast('needVerifyCode');
      return;
    }

    await this.noticeService.showLoading('login');
    
    // 使用邮箱+验证码登录，如果账号不存在会自动创建
    if (await this.authService.loginWithEmailCode(this.email, this.code)) {
      await this.userService.getAllInfo();
      await this.noticeService.hideLoading();
      this.navCtrl.navigateRoot('/');
    } else {
      await this.noticeService.hideLoading();
    }
  }

  onFocus() {
    this.showPoweredBy = false;
  }

  onBlur() {
    this.showPoweredBy = true;
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

  async openFirstModal() {
    const modal = await this.modalCtrl.create({
      component: FirstModalComponent,
      backdropDismiss: false,
    });
    modal.present();
  }

  async loginWithGithub() {
    await this.noticeService.showLoading('login');
    try {
      if (await this.authService.loginWithGithub()) {
        await this.userService.getAllInfo();
        await this.noticeService.hideLoading();
        this.navCtrl.navigateRoot('/');
      } else {
        await this.noticeService.hideLoading();
      }
    } catch (error) {
      await this.noticeService.hideLoading();
      this.noticeService.showToast('loginFailed');
    }
  }

  async loginWithWechat() {
    await this.noticeService.showLoading('login');
    try {
      if (await this.authService.loginWithWechat()) {
        await this.userService.getAllInfo();
        await this.noticeService.hideLoading();
        this.navCtrl.navigateRoot('/');
      } else {
        await this.noticeService.hideLoading();
      }
    } catch (error) {
      await this.noticeService.hideLoading();
      this.noticeService.showToast('loginFailed');
    }
  }

}
