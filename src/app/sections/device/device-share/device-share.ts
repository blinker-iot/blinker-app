import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { MsToDatePipe } from 'src/app/core/pipes/ms-to-date';
import { DeviceV2ShareRole } from 'src/app/core/model/response.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'device-share',
  templateUrl: 'device-share.html',
  styleUrls: ['device-share.scss'],
  imports: [IonicModule, MsToDatePipe],
})
export class DeviceSharePage implements OnInit, OnDestroy {
  id = '';
  device;
  busyId = '';

  private loadSubscription?: Subscription;

  get access() {
    return this.dataService.share.byDevice[this.id];
  }

  get pendingShares() {
    return this.access?.invitations ?? [];
  }

  get activeShares() {
    return this.access?.shares.filter((share) => share.state === 'active') ?? [];
  }

  get sharedUserCount(): number {
    return this.pendingShares.length + this.activeShares.length;
  }

  get defaultBackHref(): string {
    return this.route.snapshot.queryParamMap.get('from') === 'device-settings'
      ? `/device-manager/${this.id}`
      : '/share-manager';
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly dataService: DataService,
    private readonly sharing: DeviceV2SharingService,
    private readonly alerts: AlertController,
    private readonly notices: NoticeService,
  ) {}

  ngOnInit(): void {
    this.bindDevice();
    this.loadSubscription = this.dataService.deviceDataLoader.subscribe((loaded) => {
      if (loaded) this.bindDevice();
    });
    void this.refresh();
  }

  ngOnDestroy(): void {
    this.loadSubscription?.unsubscribe();
  }

  async addShare(): Promise<void> {
    if (this.sharedUserCount >= 9) {
      await this.notices.showToast('每台设备最多保留 9 个共享成员或待领取邀请');
      return;
    }
    const alert = await this.alerts.create({
      header: '创建共享邀请',
      message: '邀请码需通过可信渠道发给对方，有效期内只能由一个账号领取。',
      inputs: [
        { type: 'radio', label: '可查看和控制', value: 'operator', checked: true },
        { type: 'radio', label: '仅查看', value: 'viewer' },
      ],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '生成邀请码',
          handler: (role: DeviceV2ShareRole) => {
            void this.createInvitation(role);
          },
        },
      ],
    });
    await alert.present();
  }

  async cancelInvitation(invitationId: string): Promise<void> {
    await this.run(invitationId, async () => {
      await this.sharing.revokeInvitation(this.id, invitationId);
      await this.refresh();
    });
  }

  async toggleRole(shareId: string, role: DeviceV2ShareRole): Promise<void> {
    const next = role === 'operator' ? 'viewer' : 'operator';
    await this.run(shareId, async () => {
      await this.sharing.updateShare(this.id, shareId, next);
      await this.refresh();
    });
  }

  async removeShare(shareId: string): Promise<void> {
    await this.run(shareId, async () => {
      await this.sharing.revokeShare(this.id, shareId);
      await this.refresh();
    });
  }

  roleLabel(role: DeviceV2ShareRole): string {
    return role === 'operator' ? '可控制' : '仅查看';
  }

  private bindDevice(): void {
    this.id = this.route.snapshot.params['id'] ?? '';
    this.device = this.dataService.getDevice(this.id);
  }

  private async createInvitation(role: DeviceV2ShareRole): Promise<void> {
    try {
      const invitation = await this.sharing.createInvitation(
        this.id,
        role,
        `app-share-${Date.now()}-${this.randomSuffix()}`,
      );
      await this.refresh();
      await this.showInvitationCode(invitation.invitationCode!);
    } catch (error) {
      console.error('Failed to create Device V2 invitation', error);
      await this.notices.showToast('创建共享邀请失败，请稍后重试');
    }
  }

  private async showInvitationCode(code: string): Promise<void> {
    const alert = await this.alerts.create({
      header: '共享邀请码',
      message: '请让对方在“接收的设备”中输入此邀请码。离开后不会再次显示。',
      inputs: [{
        name: 'invitationCode',
        type: 'text',
        value: code,
        attributes: { readonly: true },
      }],
      buttons: [
        {
          text: '复制',
          handler: () => {
            void this.copyCode(code);
            return false;
          },
        },
        { text: '完成', role: 'confirm' },
      ],
    });
    await alert.present();
  }

  private async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      await this.notices.showToast('邀请码已复制');
    } catch {
      await this.notices.showToast('复制失败，请长按邀请码手动复制');
    }
  }

  private async refresh(): Promise<void> {
    if (!this.id || this.device?.config?.isShared) return;
    try {
      const access = await this.sharing.listDevice(this.id);
      this.dataService.share = {
        ...this.dataService.share,
        byDevice: { ...this.dataService.share.byDevice, [this.id]: access },
      };
    } catch (error) {
      console.error('Failed to load Device V2 shares', error);
    }
  }

  private async run(id: string, work: () => Promise<void>): Promise<void> {
    if (this.busyId) return;
    this.busyId = id;
    try {
      await work();
    } catch (error) {
      console.error('Failed to mutate Device V2 share', error);
      await this.notices.showToast('更新共享权限失败，请稍后重试');
    } finally {
      this.busyId = '';
    }
  }

  private randomSuffix(): string {
    return globalThis.crypto?.randomUUID?.().slice(0, 12)
      ?? Math.random().toString(36).slice(2, 14);
  }
}
