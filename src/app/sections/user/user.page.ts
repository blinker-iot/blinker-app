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
import { GatewayHttpError } from 'src/app/core/model/response.model';

const ACCOUNT_DELETION_FAILED_MESSAGE = '账号注销暂未完成，请稍后重试';
const ACCOUNT_DELETION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  AUTH_TOKEN_MISSING: '当前登录状态无法验证，请重新登录后再试',
  INVALID_REQUEST: '注销请求无法处理，请更新应用后重试',
  ACCOUNT_DELETION_IN_PROGRESS: '账号正在注销中，请稍后再次确认',
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
  private cancellingAccount = false;
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
        message: '注销后相关数据将被永久删除且无法恢复。请输入“确认注销”继续。',
        inputs: [
          {
            name: 'confirmation',
            placeholder: '确认注销',
            type: 'text',
            attributes: {
              autocomplete: 'off',
              inputmode: 'text',
            },
          },
        ],
        buttons: [
          {
            text: '取消',
            role: 'cancel',
          },
          {
            text: '确认注销',
            role: 'destructive',
            handler: (data) => this.cancelAccount(data?.confirmation),
          },
        ],
      });
      const message = this.alert.querySelector('.alert-message');
      if (message) {
        const [before, after] = message.textContent!.split('确认注销');
        const confirmation = document.createElement('strong');
        confirmation.textContent = '确认注销';
        confirmation.style.color = 'var(--ion-color-danger)';
        confirmation.style.fontWeight = '700';
        message.replaceChildren(before, confirmation, after);
      }
    }
    await this.alert.present();
  }

  private async cancelAccount(
    value: unknown,
  ): Promise<boolean> {
    if (String(value ?? '').trim() !== '确认注销') {
      await this.noticeService.showToast('请输入“确认注销”以确认注销账号');
      return false;
    }
    if (this.cancellingAccount) return false;

    this.cancellingAccount = true;
    await this.noticeService.showLoading('cancelAccount');
    try {
      try {
        await this.userService.cancelBlinkerAccount();
      } catch (error) {
        await this.showDeletionError(error);
        return false;
      }
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

  private async showDeletionError(error: unknown): Promise<void> {
    const code = error instanceof GatewayHttpError ? error.code : undefined;
    const message = code ? ACCOUNT_DELETION_ERROR_MESSAGES[code] : undefined;
    await this.noticeService.showToast(message || ACCOUNT_DELETION_FAILED_MESSAGE);
  }
}
