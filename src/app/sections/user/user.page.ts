import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonicModule,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class UserPage implements OnInit, OnDestroy {
  private subscription?: Subscription;
  private alert?: HTMLIonAlertElement;

  draftName = '张小北';
  draftPhone = '138 0000 8888';
  draftRegion = '中国大陆 · 上海市';
  localAvatar = '';
  selectedAvatarFile?: File;
  saving = false;

  get user() {
    return this.dataService.user;
  }

  get avatar() {
    return this.localAvatar || this.user?.avatar || '';
  }

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private noticeService: NoticeService,
    private dataService: DataService,
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
    if (this.user?.username) this.draftName = this.user.username;
    if (this.user?.phone) this.draftPhone = this.formatPhone(this.user.phone);
  }

  private formatPhone(phone: string) {
    const digits = phone.replace(/\s/g, '');
    return digits.length === 11
      ? `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
      : phone;
  }

  async saveProfile() {
    const name = this.draftName.trim();
    if (this.getStrLength(name) < 2) {
      await this.noticeService.showToast('用户名至少需要 2 个字符');
      return;
    }

    this.saving = true;
    try {
      if (this.user && name !== this.user.username) {
        const saved = await this.userService.changeProfile(name);
        if (!saved) {
          await this.noticeService.showToast('保存失败，请稍后重试');
          return;
        }
        this.user.username = name;
      }
      if (this.user && this.selectedAvatarFile) {
        const avatarSaved = await this.userService.uploadAvatar(this.selectedAvatarFile);
        if (!avatarSaved) {
          await this.noticeService.showToast('头像上传失败，请稍后重试');
          return;
        }
        this.selectedAvatarFile = undefined;
        this.dataService.updateAvatarCache();
      }
      if (!this.user) {
        this.dataService.user = {
          username: name,
          avatar: '',
          phone: this.draftPhone.replace(/\s/g, ''),
          level: 0,
        };
      }
      await this.noticeService.showToast('资料已保存');
    } finally {
      this.saving = false;
    }
  }

  async selectRegion() {
    const sheet = await this.actionSheetCtrl.create({
      header: '选择所在地区',
      buttons: [
        { text: '中国大陆 · 上海市', handler: () => { this.draftRegion = '中国大陆 · 上海市'; } },
        { text: '中国大陆 · 北京市', handler: () => { this.draftRegion = '中国大陆 · 北京市'; } },
        { text: '中国大陆 · 广东省', handler: () => { this.draftRegion = '中国大陆 · 广东省'; } },
        { text: '取消', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      await this.noticeService.showToast('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      await this.noticeService.showToast('头像图片不能超过 5MB');
      return;
    }

    const reader = new FileReader();
    this.selectedAvatarFile = file;
    reader.onload = () => {
      this.localAvatar = typeof reader.result === 'string' ? reader.result : '';
      if (this.user && this.localAvatar) this.user.avatar = this.localAvatar;
    };
    reader.readAsDataURL(file);
  }

  async showChangePassword() {
    this.alert = await this.alertCtrl.create({
      header: '修改登录密码',
      inputs: [
        { name: 'oldPassword', placeholder: '当前密码', type: 'password' },
        { name: 'newPassword', placeholder: '新密码（至少 8 位）', type: 'password' },
        { name: 'newPassword2', placeholder: '再次输入新密码', type: 'password' },
      ],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确认修改',
          handler: (data) => this.changePassword(data.oldPassword, data.newPassword, data.newPassword2),
        },
      ],
    });
    await this.alert.present();
  }

  private async changePassword(oldPassword: string, newPassword: string, confirmation: string) {
    if (newPassword !== confirmation) {
      await this.noticeService.showToast('两次输入的新密码不一致');
      return false;
    }
    if (!newPassword || newPassword.length < 8) {
      await this.noticeService.showToast('新密码至少需要 8 位');
      return false;
    }

    const changed = await this.userService.changePassword(oldPassword, newPassword);
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
        inputs: [{ name: 'password', placeholder: '输入当前密码', type: 'password' }],
        buttons: [
          { text: '取消', role: 'cancel' },
          {
            text: '确认注销',
            role: 'destructive',
            handler: async (data) => {
              const cancelled = await this.userService.cancelAccount(data.password);
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

  private getStrLength(value: string) {
    return Array.from(value).reduce((length, character) => {
      return length + (character.charCodeAt(0) <= 128 ? 1 : 2);
    }, 0);
  }
}
