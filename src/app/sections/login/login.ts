import { parseConsoleLink } from '../../core/services/device-console.service';
import { isServiceRegion } from '../../configs/service-region.config';
import { parseShareInvitation } from '../../core/device-v2/sharing/invitation-link';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  ChangeDetectorRef,
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
import { AppVisibilityService } from 'src/app/core/services/app-visibility.service';

const CODE_COOLDOWN_MS = 60_000;

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
  private countdownTimer?: ReturnType<typeof setInterval>;
  private countdownUntil = 0;
  private pageVisible = false;
  private readonly visibilitySubscription: Subscription;
  private sendingCode = false;
  private destroyed = false;

  showPoweredBy = true;
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
    private route: ActivatedRoute,
    private readonly cd: ChangeDetectorRef,
    private readonly visibility: AppVisibilityService,
  ) {
    this.visibilitySubscription = visibility.active.subscribe(() => this.syncCountdown());
  }

  ionViewWillEnter(): void {
    if (this.destroyed) return;
    this.pageVisible = true;
    this.syncCountdown();
  }

  ionViewWillLeave(): void {
    this.pageVisible = false;
    this.stopCountdownTimer();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.visibilitySubscription.unsubscribe();
    this.stopCountdownTimer();
  }

  openSettings(): void {
    this.navCtrl.navigateForward('/settings', {
      queryParams: { from: 'login' },
    });
  }

  openSharedDevices(): void {
    void this.navCtrl.navigateForward('/share-manager');
  }

  private returnAfterLogin(): void {
    const token = parseConsoleLink('diandeng://console/' + this.route.snapshot.queryParamMap.get('returnConsole'));
    const region = this.route.snapshot.queryParamMap.get('returnConsoleRegion');
    const invitation = parseShareInvitation(this.route.snapshot.queryParamMap.get('returnInvitation'));
    const sharing = this.route.snapshot.queryParamMap.get('returnSharing') === '1';

    const target = token ? '/s/' + token : invitation ? '/share-invitation/' + invitation
      : this.shareInvitation.hasPending ? '/share-invitation' : sharing ? '/share-manager' : '/';
    if (token && isServiceRegion(region)) {
      void this.navCtrl.navigateRoot(target, { queryParams: { region } });
    } else {
      void this.navCtrl.navigateRoot(target);
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
    if (!this.canPresent || this.sendingCode) return;
    this.syncCountdown();
    if (this.countdown > 0) return;

    if (!this.email || !this.isValidEmail(this.email)) {
      this.noticeService.showToast('needValidEmail');

      return;
    }

    this.sendingCode = true;
    try {
      await this.noticeService.showLoading('sendingCode');
      if (!this.canPresent) {
        await this.noticeService.hideLoading();
        return;
      }

      const success = await this.authService.sendEmailCode(this.email);
      // Accepted response starts the UI cooldown, not a delayed overlay close.
      // A hidden page retains the deadline without owning a ticking resource.
      if (success) this.startCountdown();

      await this.noticeService.hideLoading();
      if (!this.canPresent) return;

      if (success) {
        this.noticeService.showToast('codeSent');
      } else {
        this.noticeService.showToast('sendCodeFailed');
      }
    } finally {
      this.sendingCode = false;
    }
  }

  private get canPresent(): boolean {
    return !this.destroyed && this.pageVisible && this.visibility.active.value;
  }

  // UI only: authoritative send limits remain on the existing Auth service.
  startCountdown() {
    if (this.destroyed) return;
    this.countdownUntil = Date.now() + CODE_COOLDOWN_MS;
    this.syncCountdown();
  }

  private syncCountdown(): void {
    if (!this.canPresent) {
      this.stopCountdownTimer();
      return;
    }
    this.countdown = Math.max(0, Math.ceil((this.countdownUntil - Date.now()) / 1000));
    if (this.countdown === 0) this.countdownUntil = 0;
    if (this.countdown === 0) this.stopCountdownTimer();
    else if (this.countdownTimer === undefined) {
      this.countdownTimer = setInterval(() => this.syncCountdown(), 1000);
    }
    this.cd.markForCheck();
  }

  private stopCountdownTimer(): void {
    if (this.countdownTimer === undefined) return;
    clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
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
      this.returnAfterLogin();
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
        docTitle: title,
        docUrl: url,
      },
    });

    modal.present();
  }

  async loginWithGithub() {
    await this.noticeService.showLoading('login');

    try {
      if (await this.authService.loginWithGithub()) {
        await this.userService.getAllInfo();
        await this.noticeService.hideLoading();
        this.returnAfterLogin();
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
        this.returnAfterLogin();
      } else {
        await this.noticeService.hideLoading();
      }
    } catch (error) {
      await this.noticeService.hideLoading();
      this.noticeService.showToast('loginFailed');
    }
  }
}
