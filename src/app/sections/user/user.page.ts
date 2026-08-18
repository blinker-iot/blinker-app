import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonicModule,
  ModalController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import {
  AvatarCropResult,
  AvatarPickerComponent,
} from './avatar/avatar-picker.component';
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
  private localAvatarUrl?: string;

  draftName = '张小北';
  draftPhone = '138 0000 8888';
  draftRegion = '中国大陆 · 上海市';
  localAvatar = '';

  get user() {
    return this.dataService.user;
  }

  get avatar() {
    return this.localAvatar || this.user?.avatar || '';
  }

  get profileMenuItems(): readonly MenuListItem[] {
    return [
      {
        id: 'username',
        title: '用户名',
        icon: 'fa-user',
        value: this.draftName,
      },
      {
        id: 'phone',
        title: '手机号',
        icon: 'fa-mobile-screen-button',
        value: this.draftPhone,
        disabled: true,
        showChevron: false,
      },
      {
        id: 'region',
        title: '所在地区',
        icon: 'fa-location-dot',
        value: this.draftRegion,
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
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
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
    this.revokeLocalAvatarUrl();
  }

  private syncDraft() {
    if (this.user?.username) this.draftName = this.user.username;
    if (this.user?.phone) this.draftPhone = this.formatPhone(this.user.phone);
  }

  private formatPhone(phone: string) {
    const digits = phone.replace(/\s/g, '');
    return digits.length === 11
      ? `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
      : phone;
  }

  selectMenuItem(item: MenuListItem): void {
    switch (item.id) {
      case 'username':
        void this.showChangeUsername();
        break;
      case 'region':
        void this.selectRegion();
        break;
      case 'password':
        void this.showChangePassword();
        break;
      case 'cancel-account':
        void this.showCancelAlert();
        break;
    }
  }

  private async showChangeUsername(): Promise<void> {
    this.alert = await this.alertCtrl.create({
      header: '修改用户名',
      inputs: [
        {
          name: 'username',
          value: this.draftName,
          placeholder: '请输入用户名',
          attributes: { maxlength: 32 },
        },
      ],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确认',
          handler: (data) => {
            const username = String(data.username ?? '').trim();
            if (!username) return false;
            this.draftName = username;
            return true;
          },
        },
      ],
    });
    await this.alert.present();
  }

  async selectRegion() {
    const sheet = await this.actionSheetCtrl.create({
      header: '选择所在地区',
      buttons: [
        {
          text: '中国大陆 · 上海市',
          handler: () => {
            this.draftRegion = '中国大陆 · 上海市';
          },
        },
        {
          text: '中国大陆 · 北京市',
          handler: () => {
            this.draftRegion = '中国大陆 · 北京市';
          },
        },
        {
          text: '中国大陆 · 广东省',
          handler: () => {
            this.draftRegion = '中国大陆 · 广东省';
          },
        },
        { text: '取消', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      await this.noticeService.showToast('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      await this.noticeService.showToast('头像图片不能超过 5MB');
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    try {
      const modal = await this.modalCtrl.create({
        component: AvatarPickerComponent,
        componentProps: {
          imageSource: sourceUrl,
          fileName: file.name,
        },
        cssClass: 'avatar-crop-modal',
        backdropDismiss: false,
      });
      await modal.present();

      const { data, role } = await modal.onDidDismiss<AvatarCropResult>();
      if (role !== 'confirm' || !data?.file) return;

      this.revokeLocalAvatarUrl();
      this.localAvatarUrl = URL.createObjectURL(data.file);
      this.localAvatar = this.localAvatarUrl;
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  private revokeLocalAvatarUrl(): void {
    if (!this.localAvatarUrl) return;
    URL.revokeObjectURL(this.localAvatarUrl);
    this.localAvatarUrl = undefined;
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
