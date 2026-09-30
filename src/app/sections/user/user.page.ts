import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  AlertController,
  IonicModule,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import {
  MenuListComponent,
  MenuListItem,
} from 'src/app/core/components/menu-list/menu-list';
import { AuthService } from 'src/app/core/services/auth.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { UserService } from 'src/app/core/services/user.service';
import {
  AccountDeletionCodeData,
  GatewayHttpError,
} from 'src/app/core/model/response.model';

const ACCOUNT_DELETION_CODE_FORMAT_MESSAGE =
  '请输入 D- 开头并带 6 位数字的完整注销验证码';
const ACCOUNT_DELETION_SEND_FAILED_MESSAGE =
  '注销验证码发送失败，请稍后重试';
const ACCOUNT_DELETION_FAILED_MESSAGE =
  '账号注销暂未完成，请保留当前验证码并稍后重试';
const ACCOUNT_DELETION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  AUTH_TOKEN_MISSING: '当前登录状态无法验证，请重新登录后再试',
  INVALID_REQUEST: '注销请求无法处理，请更新应用后重试',
  ACCOUNT_DELETION_CODE_REQUIRED: '请输入完整的注销验证码',
  ACCOUNT_DELETION_CODE_INVALID: '注销验证码错误，请检查 D- 前缀和 6 位数字',
  ACCOUNT_DELETION_CODE_PURPOSE_MISMATCH:
    '该验证码不能用于账号注销，请手动重新发送注销验证码',
  ACCOUNT_DELETION_CODE_ACCOUNT_MISMATCH:
    '该验证码不属于当前账号，请手动重新发送注销验证码',
  ACCOUNT_DELETION_CODE_EMAIL_MISMATCH:
    '该验证码与当前账号邮箱不匹配，请手动重新发送注销验证码',
  ACCOUNT_DELETION_CODE_EXPIRED: '注销验证码已过期，请手动重新发送',
  ACCOUNT_DELETION_CODE_CONSUMED: '注销验证码已使用，请手动重新发送',
  ACCOUNT_DELETION_IN_PROGRESS:
    '账号正在注销中，请保留当前验证码并稍后再次确认',
  ACCOUNT_DELETION_CODE_RATE_LIMITED:
    '注销验证码请求过于频繁，请稍后重试',
  ACCOUNT_DELETION_EMAIL_UNAVAILABLE: '当前账号邮箱无法用于注销验证',
  ACCOUNT_DELETION_EMAIL_DELIVERY_UNAVAILABLE:
    '邮件服务暂时不可用，请稍后重试',
  BODY_TOO_LARGE: '注销请求无法处理，请更新应用后重试',
};

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss'],
  standalone: true,
  imports: [IonicModule, MenuListComponent, RouterModule, FormsModule],
})
export class UserPage implements OnInit, OnDestroy {
  private subscription?: Subscription;
  private alert?: HTMLIonAlertElement;
  private sendingCancelCode = false;
  private cancellingAccount = false;
  private deletionCodeInfo?: AccountDeletionCodeData;
  private deletionCodeExpiresAt = 0;
  private deletionCodeTimer?: number;
  private deletionCode = '';
  private resendAvailableAt = 0;
  private emailCodeTimer?: number;
  private currentEmailCodeTimer?: number;

  draftName = '';
  draftEmail = '';
  editingEmail = false;
  newEmail = '';
  emailCode = '';
  currentEmailCode = '';
  sendingEmailCode = false;
  sendingCurrentEmailCode = false;
  bindingEmail = false;
  emailCodeCountdown = 0;
  currentEmailCodeCountdown = 0;

  get emailIsVirtual(): boolean {
    return this.user?.emailIsVirtual === true;
  }

  get requiresCurrentEmailVerification(): boolean {
    return Boolean(this.user?.email?.trim()) && !this.emailIsVirtual;
  }

  get emailBusy(): boolean {
    return this.sendingEmailCode || this.sendingCurrentEmailCode || this.bindingEmail;
  }

  get user() {
    return this.dataService.user;
  }

  get avatar() {
    return this.user?.avatar || '';
  }

  get profileMenuItems(): readonly MenuListItem[] {
    return [
      {
        id: 'username',
        title: '昵称',
        icon: 'fa-user',
        value: this.draftName || '—',
        disabled: true,
        showChevron: false,
      },
      {
        id: 'email',
        title: '邮箱',
        icon: 'fa-envelope',
        value: this.emailIsVirtual ? '虚拟邮箱' : this.draftEmail || '—',
        disabled: false,
        showChevron: true,
      },
    ];
  }

  get securityMenuItems(): readonly MenuListItem[] {
    return [
      {
        id: 'security',
        title: '账号与安全',
        icon: 'fa-shield-check',
        value: '已保护',
        disabled: true,
        showChevron: false,
      },
      {
        id: 'cancel-account',
        title: '注销账号',
        icon: 'fa-user-xmark',
        danger: true,
        showChevron: false,
      },
    ];
  }

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private alertCtrl: AlertController,
    private dataService: DataService,
    private noticeService: NoticeService,
  ) {}

  ngOnInit() {
    this.syncDraft();
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) this.syncDraft();
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.clearDeletionTimer();
    window.clearInterval(this.emailCodeTimer);
    window.clearInterval(this.currentEmailCodeTimer);
    void this.alert?.dismiss();
  }

  private syncDraft() {
    this.draftName = this.user?.nickname?.trim()
      || this.user?.username?.trim()
      || this.user?.email?.trim()
      || '';
    this.draftEmail = this.user?.email?.trim() || '';
  }

  selectMenuItem(item: MenuListItem): void {
    switch (item.id) {
      case 'email':
        this.editingEmail = true;
        break;
      case 'cancel-account':
        void this.showCancelAlert();
        break;
    }
  }

  closeEmailEditor(): void {
    if (this.emailBusy) return;
    this.editingEmail = false;
    this.emailCode = '';
    this.currentEmailCode = '';
  }

  changeNewEmail(value: string): void {
    const changed = value.trim().toLowerCase() !== this.newEmail.trim().toLowerCase();
    this.newEmail = value;
    if (!changed) return;
    this.emailCode = '';
    this.currentEmailCode = '';
    window.clearInterval(this.emailCodeTimer);
    window.clearInterval(this.currentEmailCodeTimer);
    this.emailCodeCountdown = 0;
    this.currentEmailCodeCountdown = 0;
  }

  async sendEmailCode(target: 'new' | 'current' = 'new'): Promise<void> {
    const current = target === 'current';
    if (this.emailBusy || (current && !this.requiresCurrentEmailVerification)) return;
    if ((current ? this.currentEmailCodeCountdown : this.emailCodeCountdown) > 0) return;
    const email = this.newEmail.trim().toLowerCase();
    if (!this.validEmail(email)) {
      await this.noticeService.showToast('needValidEmail');
      return;
    }
    if (current) this.sendingCurrentEmailCode = true;
    else this.sendingEmailCode = true;
    try {
      if (current) {
        await this.userService.requestEmailChangeCode(email, 'current');
        this.currentEmailCodeCountdown = 60;
        this.currentEmailCodeTimer = window.setInterval(() => {
          this.currentEmailCodeCountdown--;
          if (this.currentEmailCodeCountdown <= 0) window.clearInterval(this.currentEmailCodeTimer);
        }, 1000);
        await this.noticeService.showToast(`验证码已发送至 ${this.draftEmail}，请在原邮箱中查收`);
      } else {
        await this.userService.requestEmailChangeCode(email);
        this.emailCodeCountdown = 60;
        this.emailCodeTimer = window.setInterval(() => {
          this.emailCodeCountdown--;
          if (this.emailCodeCountdown <= 0) window.clearInterval(this.emailCodeTimer);
        }, 1000);
        await this.noticeService.showToast(`验证码已发送至 ${email}，请在新邮箱中查收`);
      }
    } catch {
      await this.noticeService.showToast('验证码发送失败，请确认邮箱未被使用后重试');
    } finally {
      this.sendingEmailCode = false;
      this.sendingCurrentEmailCode = false;
    }
  }

  async bindEmail(): Promise<void> {
    if (this.emailBusy) return;
    const email = this.newEmail.trim().toLowerCase();
    if (!this.validEmail(email)) {
      await this.noticeService.showToast('needValidEmail');
      return;
    }
    const code = this.emailCode.trim();
    const currentCode = this.currentEmailCode.trim();
    if (this.requiresCurrentEmailVerification && !/^\d{6}$/.test(currentCode)) {
      await this.noticeService.showToast('请输入原邮箱收到的 6 位验证码');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      await this.noticeService.showToast('needVerifyCode');
      return;
    }
    this.bindingEmail = true;
    try {
      if (this.requiresCurrentEmailVerification) await this.userService.bindEmail(email, code, currentCode);
      else await this.userService.bindEmail(email, code);
      this.editingEmail = false;
      await this.authService.logout();
      await this.noticeService.showToast('邮箱更换成功，请使用新邮箱或微信重新登录');
    } catch {
      await this.noticeService.showToast(this.requiresCurrentEmailVerification
        ? '邮箱更换失败，请检查原邮箱和新邮箱验证码后重试'
        : '邮箱更换失败，请检查新邮箱验证码或更换邮箱后重试');
    } finally {
      this.bindingEmail = false;
    }
  }

  private validEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async showCancelAlert() {
    this.resetDeletionState();
    const deviceCount = this.dataService.device?.list?.length || 0;
    if (deviceCount > 0) {
      this.alert = await this.alertCtrl.create({
        header: '暂时无法注销',
        message: `账号中还有 ${deviceCount} 个绑定设备，请先解绑全部设备。`,
        buttons: ['知道了'],
      });
    } else {
      this.alert = await this.alertCtrl.create({
        header: '注销账号',
        message: this.deletionMessage(),
        inputs: this.emailIsVirtual ? [] : [
          {
            name: 'code',
            placeholder: 'D-123456',
            type: 'text',
            attributes: {
              autocomplete: 'one-time-code',
              inputmode: 'text',
              maxlength: 8,
            },
          },
        ],
        buttons: [
          {
            text: '取消',
            role: 'cancel',
            handler: () => this.resetDeletionState(),
          },
          ...(this.emailIsVirtual ? [] : [{
            text: '发送/重发验证码',
            handler: async () => {
              await this.sendCancelCode();
              return false;
            },
          }]),
          {
            text: '确认注销',
            role: 'destructive',
            handler: (data) => this.cancelAccount(data?.code),
          },
        ],
      });
    }
    await this.alert.present();
  }

  private async sendCancelCode(): Promise<void> {
    if (this.sendingCancelCode) return;
    const retryAfter = this.remainingSeconds(this.resendAvailableAt);
    if (retryAfter > 0) {
      await this.noticeService.showToast(
        `请求过于频繁，请在 ${retryAfter} 秒后重试`,
      );
      return;
    }
    this.sendingCancelCode = true;
    await this.noticeService.showLoading('sendingCode');
    try {
      const info = await this.userService.requestAccountDeletionCode();
      this.setDeletionCodeInfo(info);
      await this.noticeService.showToast('codeSent');
    } catch (error) {
      await this.showDeletionError(error, 'send');
    } finally {
      await this.noticeService.hideLoading();
      this.sendingCancelCode = false;
    }
  }

  private async cancelAccount(
    value: unknown,
  ): Promise<boolean> {
    const enteredCode = String(value ?? '').trim();
    const code = enteredCode || this.deletionCode;
    if (!this.emailIsVirtual && !/^D-\d{6}$/.test(code)) {
      await this.noticeService.showToast(ACCOUNT_DELETION_CODE_FORMAT_MESSAGE);
      return false;
    }
    if (this.cancellingAccount) return false;

    this.deletionCode = code;
    this.cancellingAccount = true;
    await this.noticeService.showLoading('cancelAccount');
    try {
      try {
        if (this.emailIsVirtual) await this.userService.cancelBlinkerAccount();
        else await this.userService.cancelBlinkerAccount(code);
      } catch (error) {
        await this.showDeletionError(error, 'delete');
        return false;
      }
      this.resetDeletionState();
      await this.logout();
      return true;
    } finally {
      await this.noticeService.hideLoading();
      this.cancellingAccount = false;
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }

  private setDeletionCodeInfo(info: AccountDeletionCodeData): void {
    this.deletionCodeInfo = info;
    this.deletionCode = '';
    this.clearAlertCodeInput();
    this.resendAvailableAt = 0;
    this.deletionCodeExpiresAt = Date.now() + info.expiresIn * 1000;
    this.updateDeletionMessage();
    this.startDeletionTimer();
  }

  private deletionMessage(): string {
    const warning = '注销后相关数据将被永久删除且无法恢复。';
    if (this.emailIsVirtual) return warning;
    const codeRemaining = this.remainingSeconds(this.deletionCodeExpiresAt);
    const resendRemaining = this.remainingSeconds(this.resendAvailableAt);
    let verification = '请先发送注销验证码，再输入完整的 D- 前缀和 6 位数字。';
    if (this.deletionCodeInfo) {
      verification = codeRemaining > 0
        ? `验证码已发送至 ${this.deletionCodeInfo.maskedEmail}，`
          + `有效期剩余 ${this.formatDuration(codeRemaining)}。`
        : `发送至 ${this.deletionCodeInfo.maskedEmail} 的验证码已失效，`
          + '请手动重新发送。';
    }
    const retry = resendRemaining > 0
      ? ` 请在 ${this.formatDuration(resendRemaining)} 后重试发送。`
      : '';
    return warning + verification + retry;
  }

  private updateDeletionMessage(): void {
    if (this.alert) this.alert.message = this.deletionMessage();
  }

  private startDeletionTimer(): void {
    this.clearDeletionTimer();
    if (
      this.remainingSeconds(this.deletionCodeExpiresAt) === 0
      && this.remainingSeconds(this.resendAvailableAt) === 0
    ) {
      return;
    }
    this.deletionCodeTimer = window.setInterval(() => {
      this.updateDeletionMessage();
      if (
        this.remainingSeconds(this.deletionCodeExpiresAt) === 0
        && this.remainingSeconds(this.resendAvailableAt) === 0
      ) {
        this.clearDeletionTimer();
      }
    }, 1000);
  }

  private clearDeletionTimer(): void {
    window.clearInterval(this.deletionCodeTimer);
    this.deletionCodeTimer = undefined;
  }

  private resetDeletionState(): void {
    this.clearDeletionTimer();
    this.deletionCodeInfo = undefined;
    this.deletionCodeExpiresAt = 0;
    this.deletionCode = '';
    this.resendAvailableAt = 0;
  }

  private clearAlertCodeInput(): void {
    if (!this.alert?.inputs?.length) return;
    this.alert.inputs = this.alert.inputs.map((input, index) =>
      index === 0 ? { ...input, value: '' } : input
    );
  }

  private remainingSeconds(expiresAt: number): number {
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainder = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  private async showDeletionError(
    error: unknown,
    action: 'send' | 'delete',
  ): Promise<void> {
    const gatewayError = error instanceof GatewayHttpError ? error : undefined;
    const code = gatewayError?.code;
    if (code === 'ACCOUNT_DELETION_CODE_RATE_LIMITED') {
      const retryAfter = gatewayError?.retryAfterSeconds;
      if (retryAfter !== undefined) {
        this.resendAvailableAt = Date.now() + retryAfter * 1000;
        this.updateDeletionMessage();
        this.startDeletionTimer();
        await this.noticeService.showToast(
          `请求过于频繁，请在 ${retryAfter} 秒后重试`,
        );
        return;
      }
    }
    if (
      code === 'ACCOUNT_DELETION_CODE_EXPIRED'
      || code === 'ACCOUNT_DELETION_CODE_CONSUMED'
    ) {
      this.deletionCodeExpiresAt = 0;
      this.deletionCode = '';
      this.updateDeletionMessage();
    }
    const message = this.emailIsVirtual && code === 'ACCOUNT_DELETION_IN_PROGRESS'
      ? '账号正在注销中，请稍后再次确认'
      : code ? ACCOUNT_DELETION_ERROR_MESSAGES[code] : undefined;
    if (message) {
      await this.noticeService.showToast(message);
      return;
    }
    await this.noticeService.showToast(
      action === 'send'
        ? ACCOUNT_DELETION_SEND_FAILED_MESSAGE
        : this.emailIsVirtual ? '账号注销暂未完成，请稍后重试' : ACCOUNT_DELETION_FAILED_MESSAGE,
    );
  }
}
