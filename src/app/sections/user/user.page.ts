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
        id: 'password',
        title: '登录密码',
        icon: 'fa-lock-keyhole',
        value: '修改',
      },
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
    private noticeService: NoticeService,
    private dataService: DataService
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
      case 'password':
        void this.showChangePassword();
        break;
      case 'cancel-account':
        void this.showCancelAlert();
        break;
    }
  }

  async showChangePassword() {
    this.alert = await this.alertCtrl.create({
      header: '修改登录密码',
      inputs: [
        { name: 'oldPassword', placeholder: '当前密码', type: 'password' },
        {
          name: 'newPassword',
          placeholder: '新密码（至少 8 位）',
          type: 'password',
        },
        {
          name: 'newPassword2',
          placeholder: '再次输入新密码',
          type: 'password',
        },
      ],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确认修改',
          handler: (data) =>
            this.changePassword(
              data.oldPassword,
              data.newPassword,
              data.newPassword2
            ),
        },
      ],
    });
    await this.alert.present();
  }

  private async changePassword(
    oldPassword: string,
    newPassword: string,
    confirmation: string
  ) {
    if (newPassword !== confirmation) {
      await this.noticeService.showToast('两次输入的新密码不一致');
      return false;
    }
    if (!newPassword || newPassword.length < 8) {
      await this.noticeService.showToast('新密码至少需要 8 位');
      return false;
    }

    const changed = await this.userService.changePassword(
      oldPassword,
      newPassword
    );
    if (changed) {
      await this.noticeService.showToast('密码修改成功，请重新登录');
      this.logout();
    }
    return changed;
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
        message: '注销后相关数据将被永久删除且无法恢复，请谨慎操作。',
        inputs: [
          { name: 'password', placeholder: '输入当前密码', type: 'password' },
        ],
        buttons: [
          { text: '取消', role: 'cancel' },
          {
            text: '确认注销',
            role: 'destructive',
            handler: async (data) => {
              const cancelled = await this.userService.cancelAccount(
                data.password
              );
              if (cancelled) this.logout();
            },
          },
        ],
      });
    }
    await this.alert.present();
  }

  logout() {
    this.authService.logout();
  }
}
