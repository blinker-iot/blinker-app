import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular/standalone';
import { UserService } from 'src/app/core/services/user.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CONFIG } from 'src/app/configs/app.config';
import { DocPage } from 'src/app/core/pages/doc/doc.page';
import { NoticeService } from 'src/app/core/services/notice.service';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2ShareInvitationService } from 'src/app/core/services/device-v2-share-invitation.service';

@Component({
  selector: 'app-login',
  templateUrl: 'login.html',
  styleUrls: ['login.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    TranslatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
  ],
})
export class LoginPage implements OnDestroy {
  LOGO = CONFIG.LOGIN_LOGO;

  email: string = '';
  code: string = '';
  countdown: number = 0;
  private countdownTimer: any;

  showPoweredBy = true;
  githubStarting = false;
  wechatStarting = false;
  emailStarting = false;
  sendingCode = false;
  choosingEmail = false;

  get loginBusy(): boolean {
    return this.githubStarting || this.wechatStarting || this.emailStarting || this.sendingCode;
  }

  get emailNeedsWechatBinding(): boolean {
    return this.authService.emailNeedsWechatBinding;
  }

  get wechatNeedsBinding(): boolean {
    return this.authService.wechatNeedsBinding;
  }

  get title(): string {
    if (this.emailNeedsWechatBinding) return 'ACCOUNT.BIND_WECHAT';
    if (this.wechatNeedsBinding) return 'ACCOUNT.BIND_EMAIL';
    return 'ACCOUNT.LOGIN';
  }

  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private noticeService: NoticeService,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private dataService: DataService,
    private shareInvitation: DeviceV2ShareInvitationService,
  ) { }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  openSettings(): void {
    this.navCtrl.navigateForward('/settings', {
      queryParams: { from: 'login' },
    });
  }

  private returnAfterLogin(): void {
    void this.navCtrl.navigateRoot(this.shareInvitation.hasPending ? '/share-invitation' : '/');
  }

  // 验证邮箱格式
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // 发送验证码
  async sendCode(event: Event) {
    event.preventDefault();
    if (this.loginBusy || this.countdown > 0 || this.emailNeedsWechatBinding) return;

    if (!this.email || !this.isValidEmail(this.email)) {
      this.noticeService.showToast('needValidEmail');
      return;
    }

    this.sendingCode = true;
    try {
      await this.noticeService.showLoading('sendingCode');
      if (await this.authService.sendEmailCode(this.email)) {
        await this.noticeService.showToast('codeSent');
        this.startCountdown();
      } else {
        await this.noticeService.showToast('sendCodeFailed');
      }
    } catch {
      await this.noticeService.showToast('sendCodeFailed');
    } finally {
      this.sendingCode = false;
      await this.noticeService.hideLoading();
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
    if (this.loginBusy || this.emailNeedsWechatBinding) return;
    if (this.wechatNeedsBinding && !this.choosingEmail) return;
    if (!this.email || !this.isValidEmail(this.email)) {
      this.noticeService.showToast('needValidEmail');
      return;
    }
    if (!this.code || this.code.length < 4) {
      this.noticeService.showToast('needVerifyCode');
      return;
    }

    if (this.wechatNeedsBinding) {
      await this.completeWechatLogin(false);
      return;
    }

    this.emailStarting = true;
    try {
      await this.noticeService.showLoading('login');
      if (await this.authService.loginWithEmailCode(this.email, this.code)) {
        await this.userService.getAllInfo();
        this.returnAfterLogin();
      } else if (this.emailNeedsWechatBinding) {
        this.code = '';
      } else {
        await this.noticeService.showToast('emailLoginFailed');
      }
    } catch {
      await this.noticeService.showToast('emailLoginFailed');
    } finally {
      this.emailStarting = false;
      await this.noticeService.hideLoading();
    }
  }

  async bindWechatForLogin() {
    if (this.loginBusy || !this.emailNeedsWechatBinding) return;
    this.wechatStarting = true;
    try {
      await this.noticeService.showLoading('wechatBinding');
      const result = await this.authService.bindWechatForLogin();
      if (result === 'success') {
        await this.userService.getAllInfo();
        this.returnAfterLogin();
        return;
      }
      if (result === 'expired') {
        this.authService.cancelEmailWechatBinding();
        this.code = '';
      }
      const messages = {
        cancelled: 'wechatBindingCancelled',
        not_installed: 'wechatNotInstalled',
        unsupported: 'wechatNativeOnly',
        expired: 'emailBindingExpired',
        conflict: 'wechatBindingConflict',
        failed: 'wechatBindingFailed',
      };
      await this.noticeService.showToast(messages[result]);
    } catch {
      await this.noticeService.showToast('wechatBindingFailed');
    } finally {
      this.wechatStarting = false;
      await this.noticeService.hideLoading();
    }
  }

  cancelEmailWechatBinding(): void {
    if (this.loginBusy) return;
    this.authService.cancelEmailWechatBinding();
    this.code = '';
  }

  chooseEmailBinding(): void {
    if (this.loginBusy) return;
    this.choosingEmail = true;
    this.code = '';
  }

  backToEmailChoice(): void {
    if (this.loginBusy) return;
    this.choosingEmail = false;
    this.code = '';
  }

  cancelWechatLogin(): void {
    if (this.loginBusy) return;
    this.authService.cancelEmailWechatBinding();
    this.choosingEmail = false;
    this.code = '';
  }

  async completeWechatLogin(skipEmail: boolean): Promise<void> {
    if (this.loginBusy || !this.wechatNeedsBinding) return;
    this.emailStarting = true;
    try {
      await this.noticeService.showLoading('login');
      const result = await this.authService.completeWechatLogin(
        skipEmail ? undefined : this.email, skipEmail ? undefined : this.code,
      );
      if (result === 'success') {
        await this.userService.getAllInfo();
        this.returnAfterLogin();
      } else {
        if (result === 'expired') {
          this.choosingEmail = false;
          this.code = '';
        }
        await this.noticeService.showToast({
          expired: 'wechatAuthorizationExpired',
          conflict: 'emailBindingConflict',
          failed: skipEmail ? 'wechatLoginFailed' : 'emailBindingFailed',
        }[result]);
      }
    } catch {
      await this.noticeService.showToast(skipEmail ? 'wechatLoginFailed' : 'emailBindingFailed');
    } finally {
      this.emailStarting = false;
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
        docTitle: title,
        docUrl: url,
      },
    });
    modal.present();
  }

  async loginWithGithub() {
    if (this.loginBusy || this.emailNeedsWechatBinding || this.wechatNeedsBinding) return;
    if (!this.authService.githubLoginSupported) {
      await this.noticeService.showToast('githubNativeOnly');
      return;
    }
    this.githubStarting = true;
    try {
      await this.noticeService.showLoading('login');
      if (!await this.authService.loginWithGithub()) {
        await this.noticeService.showToast('githubLoginFailed');
      }
    } catch {
      await this.noticeService.showToast('githubLoginFailed');
    } finally {
      this.githubStarting = false;
      await this.noticeService.hideLoading();
    }
  }

  async loginWithWechat() {
    if (this.loginBusy || this.emailNeedsWechatBinding || this.wechatNeedsBinding) return;
    this.wechatStarting = true;
    try {
      await this.noticeService.showLoading('login');
      if (await this.authService.loginWithWechat()) {
        await this.userService.getAllInfo();
        this.returnAfterLogin();
      } else if (this.wechatNeedsBinding) {
        this.choosingEmail = false;
        this.code = '';
      } else {
        await this.noticeService.showToast('wechatLoginFailed');
      }
    } catch {
      await this.noticeService.showToast('wechatLoginFailed');
    } finally {
      this.wechatStarting = false;
      await this.noticeService.hideLoading();
    }
  }
}
