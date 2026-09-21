import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { MsToDatePipe } from 'src/app/core/pipes/ms-to-date';
import { DeviceV2ShareRole } from 'src/app/core/model/response.model';
import { shareInvitationLink } from 'src/app/core/device-v2/sharing/invitation-link';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { DeviceV2BleService } from 'src/app/core/services/device-v2-ble.service';
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
  private destroyed = false;
  private pendingInvitation?: { role: DeviceV2ShareRole; recipientAccount?: string; idempotencyKey: string; epoch: number; deviceId: string };

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
    private readonly ble: DeviceV2BleService,
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
    this.destroyed = true;
    this.pendingInvitation = undefined;
    this.loadSubscription?.unsubscribe();
  }

  async inviteAccount(): Promise<void> {
    if (this.busyId || this.destroyed) return;
    const epoch = this.dataService.sessionEpoch;
    const alert = await this.alerts.create({
      header: '通过邮箱邀请',
      message: '填写对方注册使用的邮箱。只有该账号可以在“分享给我的”接受或拒绝；不会自动获得设备权限。',
      inputs: [{ name: 'email', type: 'email', placeholder: '对方的注册邮箱', attributes: { maxlength: 254 } }],
      buttons: [{ text: '取消', role: 'cancel' }, {
        text: '选择权限', handler: (value: { email?: string }) => {
          if (!this.current(epoch)) return;
          try { void this.addShare(this.sharing.recipientEmail(value?.email ?? '')); }
          catch { void this.notices.showToast('请输入对方注册使用的邮箱'); return false; }
        },
      }],
    });
    if (this.current(epoch)) await alert.present();
  }

  async addShare(recipientAccount?: string): Promise<void> {
    if (this.busyId || this.destroyed) return;
    const epoch = this.dataService.sessionEpoch;
    const alert = await this.alerts.create({
      header: '创建共享邀请',
      message: recipientAccount ? '指定邮箱的账号确认接受后生效；默认仅查看，稍后可以修改或解除分享。'
        : '邀请码需通过可信渠道发给对方，有效期内只能由一个账号领取。',
      inputs: [
        { type: 'radio', label: '仅查看', value: 'viewer', checked: true },
        { type: 'radio', label: '可查看和控制', value: 'operator' },
      ],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: recipientAccount ? '创建定向邀请' : '生成邀请码',
          handler: (role: DeviceV2ShareRole) => {
            if (this.current(epoch)) void this.createInvitation(role, recipientAccount);
          },
        },
      ],
    });
    if (this.current(epoch)) await alert.present();
  }

  async cancelInvitation(invitationId: string): Promise<void> {
    await this.run(invitationId, async () => {
      const invitation = await this.sharing.revokeInvitation(this.id, invitationId);
      await this.refresh();
      await this.notices.showToast(invitation.state === 'accepted'
        ? '邀请已被领取，请在共享成员中解除分享' : '邀请已取消');
    });
  }

  async toggleRole(shareId: string, role: DeviceV2ShareRole): Promise<void> {
    const next = role === 'operator' ? 'viewer' : 'operator';
    await this.run(shareId, async () => {
      const result = await this.sharing.updateShare(this.id, shareId, next);
      await this.refresh();
      await this.notices.showToast(result.realtimeRefreshPending
        ? '权限已保存，通信权限同步中' : '权限已保存');
    });
  }

  async removeShare(shareId: string): Promise<void> {
    await this.run(shareId, async () => {
      const result = await this.sharing.revokeShare(this.id, shareId);
      if (await this.ble.canManagePresenceCredential(this.id).catch(() => false)) {
        // Cloud ACL is already committed. BLE rotation is best effort here and
        // remains durable server-side if the peripheral is currently offline.
        void this.ble.syncPresenceCredential(this.id).catch(() => undefined);
      }
      await this.refresh();
      await this.notices.showToast(result.realtimeRefreshPending
        ? '已解除分享，通信权限同步中；离线本地凭据需设备同步或到期后失效'
        : '已解除分享；离线本地凭据需设备同步或到期后失效');
    });
  }

  roleLabel(role: DeviceV2ShareRole): string {
    return role === 'operator' ? '可控制' : '仅查看';
  }

  private bindDevice(): void {
    this.id = this.route.snapshot.params['id'] ?? '';
    this.device = this.dataService.getDevice(this.id);
  }

  private async createInvitation(role: DeviceV2ShareRole, recipientAccount?: string): Promise<void> {
    if (this.busyId || this.destroyed) return;
    const epoch = this.dataService.sessionEpoch, deviceId = this.id;
    this.busyId = 'create-invitation';
    if (this.pendingInvitation?.role !== role || this.pendingInvitation.recipientAccount !== recipientAccount
      || this.pendingInvitation.epoch !== epoch || this.pendingInvitation.deviceId !== deviceId) {
      this.pendingInvitation = { role, recipientAccount, epoch, deviceId, idempotencyKey: `app-share-${Date.now()}-${this.randomSuffix()}` };
    }
    try {
      const invitation = await this.sharing.createInvitation(
        deviceId,
        role,
        this.pendingInvitation.idempotencyKey,
        undefined,
        recipientAccount,
      );
      if (!this.current(epoch, deviceId)) return;
      this.pendingInvitation = undefined;
      await this.refresh();
      if (!this.current(epoch, deviceId)) return;
      if (recipientAccount) await this.notices.showToast('邀请已创建，对方可在“分享给我的”查看。系统通知尚未接通，请自行提醒对方。');
      else await this.showInvitationLink(shareInvitationLink(invitation.invitationCode!), epoch);
    } catch (error) {
      if (this.current(epoch, deviceId)) {
        const code = error?.error?.errorCode;
        const messages: Record<string, string> = {
          DEVICE_V2_SHARE_RECIPIENT_NOT_FOUND: '未找到可接收邀请的账号，请确认对方的注册邮箱',
          DEVICE_V2_SHARE_DIRECTORY_UNAVAILABLE: '邮箱邀请服务暂不可用，请稍后重试；也可另行创建分享链接',
          DEVICE_V2_SHARE_DIRECTORY_RATE_LIMITED: '邀请查询过于频繁，请稍后重试',
          DEVICE_V2_SHARE_ALREADY_PENDING: '对方已有该设备的待领取邀请，请勿重复创建',
          DEVICE_V2_SHARE_IDEMPOTENCY_CONFLICT: '本次操作对应的账号或权限已变化，请先核对已有邀请',
          DEVICE_V2_SHARE_OWNER_CANNOT_ACCEPT: '不能邀请设备所有者本人',
        };
        await this.notices.showToast(messages[code] ?? '创建共享邀请失败，请稍后重试');
      }
    } finally {
      this.busyId = '';
    }
  }

  private async showInvitationLink(link: string, epoch: number): Promise<void> {
    const alert = await this.alerts.create({
      header: '设备分享链接',
      message: '请通过可信渠道发送；对方可在 App“分享给我的”粘贴此链接，核对后领取。',
      inputs: [{
        name: 'invitationLink',
        type: 'text',
        value: link,
        attributes: { readonly: true },
      }],
      buttons: [
        {
          text: '复制',
          handler: () => {
            if (this.current(epoch)) void this.copyLink(link);
            return false;
          },
        },
        { text: '完成', role: 'confirm' },
      ],
    });
    if (this.current(epoch)) await alert.present();
  }

  private async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      await this.notices.showToast('分享链接已复制');
    } catch {
      await this.notices.showToast('复制失败，请长按分享链接手动复制');
    }
  }

  private async refresh(): Promise<void> {
    if (!this.id || this.device?.config?.isShared) return;
    const epoch = this.dataService.sessionEpoch, deviceId = this.id;
    try {
      const access = await this.sharing.listDevice(deviceId);
      if (!this.current(epoch, deviceId)) return;
      this.dataService.share = {
        ...this.dataService.share,
        byDevice: { ...this.dataService.share.byDevice, [this.id]: access },
      };
    } catch (error) {
      console.error('Failed to load Device V2 shares', error);
    }
  }

  private current(epoch: number, deviceId = this.id): boolean {
    return !this.destroyed && this.dataService.sessionEpoch === epoch && this.id === deviceId;
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
