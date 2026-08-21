import { Component, OnDestroy, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss'],
  standalone: true,
  imports: [IonicModule, MenuListComponent, RouterModule],
})
export class UserPage implements OnInit, OnDestroy {
  private subscription?: Subscription;
  private alert?: HTMLIonAlertElement;
  private sendingCancelCode = false;
  private cancellingAccount = false;

  draftName = '';
  draftEmail = '';

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
        value: this.draftEmail || '—',
        disabled: true,
        showChevron: false,
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
      case 'cancel-account':
        void this.showCancelAlert();
        break;
    }
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
      const email = this.draftEmail.trim();
      if (!email) {
        this.alert = await this.alertCtrl.create({
          header: '暂时无法注销',
          message: '当前账号未绑定邮箱，无法进行邮箱验证码验证。',
          buttons: ['知道了'],
        });
        await this.alert.present();
        return;
      }

      this.alert = await this.alertCtrl.create({
        header: '注销账号',
        message:
          `注销后相关数据将被永久删除且无法恢复。`
          + `请获取并输入发送至 ${email} 的邮箱验证码。`,
        inputs: [
          {
            name: 'code',
            placeholder: '输入邮箱验证码',
            type: 'text',
            attributes: {
              autocomplete: 'one-time-code',
              inputmode: 'numeric',
              maxlength: 6,
            },
          },
        ],
        buttons: [
          { text: '取消', role: 'cancel' },
          {
            text: '获取验证码',
            handler: async () => {
              await this.sendCancelCode(email);
              return false;
            },
          },
          {
            text: '确认注销',
            role: 'destructive',
            handler: (data) => this.cancelWithEmailCode(email, data?.code),
          },
        ],
      });
    }
    await this.alert.present();
  }

  private async sendCancelCode(email: string): Promise<void> {
    if (this.sendingCancelCode) return;
    this.sendingCancelCode = true;
    await this.noticeService.showLoading('sendingCode');
    try {
      const sent = await this.authService.sendEmailCode(email);
      await this.noticeService.showToast(sent ? 'codeSent' : 'sendCodeFailed');
    } finally {
      await this.noticeService.hideLoading();
      this.sendingCancelCode = false;
    }
  }

  private async cancelWithEmailCode(
    email: string,
    value: unknown,
  ): Promise<boolean> {
    const code = String(value ?? '').trim();
    if (code.length < 4) {
      await this.noticeService.showToast('needVerifyCode');
      return false;
    }
    if (this.cancellingAccount) return false;

    this.cancellingAccount = true;
    await this.noticeService.showLoading('cancelAccount');
    try {
      const verified = await this.authService.loginWithEmailCode(email, code);
      if (!verified) {
        await this.noticeService.showToast('邮箱验证码错误或已过期');
        return false;
      }

      const cancelled = await this.userService.cancelBlinkerAccount();
      if (!cancelled) {
        await this.noticeService.showToast('账号注销失败，请稍后重试');
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
}
