import { ConsoleLink, DeviceConsoleService, cloudConsole, consoleLink } from '../../../core/services/device-console.service';
import { DEVICE_CONSOLE_HOST, DeviceConsoleHost } from '../../../core/device-v2/console-host';
import type { DeviceV2ShareGrant, DeviceV2ShareInvitation } from '../../../core/model/response.model';
import { ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import {
  AlertController,
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { DatePipe } from '@angular/common';
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
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonModal,
    IonSpinner,
    IonTitle,
    IonToolbar,
    DatePipe,
  ],
})

export class DeviceSharePage implements OnInit, OnDestroy {
  id = '';
  device;
  busyId = '';

  viewLink: ConsoleLink | null = null;
  linkLoading = true;
  publicAccessEnabled = false;
  linkError = '';
  linkSettingsOpen = false;
  linkDays: number | null = 7;
  publicFields: string[] = [];
  invitationDetails: DeviceV2ShareInvitation | null = null;
  permissionsOpen = false;
  permissionRole: DeviceV2ShareRole = 'viewer';
  permissionEdit = false;
  private permissionRecipient?: string;
  private permissionMember?: DeviceV2ShareGrant;
  private linkRequest?: { key: string; body: string };

  get supportsConsoleLink(): boolean { return cloudConsole(this.device); }
  get linkActive(): boolean { return this.viewLink?.state === 'active' && (this.viewLink.expiresAt === null || this.viewLink.expiresAt > Date.now()); }

  get publicLink(): string {
    return this.linkActive && this.viewLink ? consoleLink(this.viewLink.token) : '';
  }

  get publicBrowserLink(): string {
    return this.publicLink && this.viewLink && this.host.consoleWebBaseUrl
      ? new URL(`s/${this.viewLink.token}`, this.host.consoleWebBaseUrl.replace(/\/?$/, '/')).href
      : '';
  }

  get linkExpiryLabel(): string {
    if (!this.linkActive) return this.viewLink ? '链接已失效' : '尚未生成链接';

    return this.viewLink?.expiresAt ? new Date(this.viewLink.expiresAt).toLocaleDateString('zh-CN') + ' 到期' : '长期有效';
  }

  get invitationLink(): string {
    return this.invitationDetails?.invitationCode ? shareInvitationLink(this.invitationDetails.invitationCode) : '';
  }

  get permissionTitle(): string {
    return this.permissionMember ? '成员权限' : this.permissionRecipient ? '邮箱邀请权限' : '邀请权限';
  }

  private loadSubscription?: Subscription;
  private sessionSubscription?: Subscription;
  private linkDeviceKey = '';
  private destroyed = false;
  private pageEpoch = 0;
  private pendingInvitation?: { canEditConsole: boolean; recipientAccount?: string;
    role: DeviceV2ShareRole; idempotencyKey: string; epoch: number; deviceId: string };

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
    private readonly consoles: DeviceConsoleService,
    @Inject(DEVICE_CONSOLE_HOST) private readonly host: DeviceConsoleHost,
    private readonly cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.bindDevice();

    let session = this.host.sessionVersion;

    this.sessionSubscription = this.host.sessionChanges.subscribe(() => {
      if (session === this.host.sessionVersion) return;

      session = this.host.sessionVersion;
      this.linkDeviceKey = '';
      this.viewLink = null;
      this.publicAccessEnabled = false;
      this.permissionsOpen = false;
      this.linkSettingsOpen = false;
      this.linkRequest = undefined;
      this.pendingInvitation = undefined;
      this.permissionRecipient = undefined;
      this.invitationDetails = null;

      this.cd.markForCheck();
    });

    this.loadSubscription = this.dataService.deviceDataLoader.subscribe((loaded) => {
      if (loaded) this.bindDevice();
    });

    void this.refresh();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.pendingInvitation = undefined;

    this.loadSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
  }

  ionViewWillEnter(): void {
    void this.refresh();
  }

  ionViewWillLeave(): void {
    this.pageEpoch += 1;
    this.invitationDetails = null;
  }

  async inviteAccount(): Promise<void> {
    if (this.busyId || this.destroyed) return;
    const epoch = this.dataService.sessionEpoch, deviceId = this.id, pageEpoch = this.pageEpoch;
    const alert = await this.alerts.create({
      header: '通过邮箱邀请',
      message: '填写对方注册使用的邮箱。只有该账号可以在“分享给我的”接受或拒绝；不会自动获得设备权限。',
      inputs: [{ name: 'email', type: 'email', placeholder: '对方的注册邮箱', attributes: { maxlength: 254 } }],
      buttons: [{ text: '取消', role: 'cancel' }, {
        text: '选择权限', handler: (value: { email?: string }) => {
          if (!this.current(epoch, deviceId, pageEpoch)) return;
          try { void this.addShare(this.sharing.recipientEmail(value?.email ?? '')); }
          catch { void this.notices.showToast('请输入对方注册使用的邮箱'); return false; }
        },
      }],
    });
    if (this.current(epoch, deviceId, pageEpoch)) await alert.present();
  }

  async addShare(recipientAccount?: string): Promise<void> {
    if (this.busyId || this.destroyed) return;

    this.permissionMember = undefined;
    this.permissionRecipient = recipientAccount;
    this.permissionRole = 'viewer';
    this.permissionEdit = false;
    this.permissionsOpen = true;

    this.cd.markForCheck();
  }

  editPermissions(member: DeviceV2ShareGrant): void {
    this.permissionMember = member;
    this.permissionRecipient = undefined;
    this.permissionRole = member.role;
    this.permissionEdit = member.canEditConsole === true;
    this.permissionsOpen = true;
  }

  async savePermissions(): Promise<void> {
    const member = this.permissionMember;

    if (member) {
      await this.run(member.shareId, async () => {
        const result = await this.sharing.updateShare(this.id, member.shareId, this.permissionRole,
          this.permissionRole === 'operator' ? member.commandEndpointKeys ?? undefined : undefined, this.permissionEdit);

        await this.refresh();

        this.permissionsOpen = false;

        await this.notices.showToast(result.realtimeRefreshPending ? '权限已保存，通信权限同步中' : '成员权限已更新');
      });
    } else {
      this.permissionsOpen = false;

      await this.createInvitation(this.permissionRole, this.permissionRecipient, this.permissionEdit);
    }
  }

  async refreshLink(): Promise<void> {
    if (!this.id || !this.supportsConsoleLink || this.device?.config.isShared) { this.linkLoading = false; return; }

    const epoch = this.dataService.sessionEpoch;

    this.linkLoading = true;
    this.linkError = '';

    this.cd.markForCheck();

    try {
      const settings = await this.consoles.getLink(this.id);

      if (this.current(epoch)) {
        this.viewLink = settings.link;
        this.publicAccessEnabled = settings.publicAccessEnabled;
      }
    } catch { if (this.current(epoch)) this.linkError = '链接状态暂不可用'; }

    finally {
      if (this.current(epoch)) {
        this.linkLoading = false;

        this.cd.markForCheck();
      }
    }
  }

  async setPublicAccess(enabled: boolean): Promise<void> {
    if (this.busyId || this.linkLoading || this.destroyed) return;

    const epoch = this.dataService.sessionEpoch;
    const previous = this.publicAccessEnabled;

    this.publicAccessEnabled = enabled;
    this.busyId = 'public-access';
    this.linkError = '';

    try {
      const settings = await this.consoles.setPublicAccess(this.id, enabled);

      if (!this.current(epoch)) return;

      this.publicAccessEnabled = settings.publicAccessEnabled;
      this.linkRequest = undefined;
      this.linkSettingsOpen = false;

      await this.refreshLink();
    } catch {
      if (this.current(epoch)) {
        this.publicAccessEnabled = previous;
        this.linkError = '未能更新公开访问，请重试';
      }
    } finally {
      this.busyId = '';

      this.cd.markForCheck();
    }
  }

  openLinkSettings(): void {
    if (!this.publicAccessEnabled || this.busyId || this.linkLoading) return;

    this.publicFields = [...this.viewLink?.publicFields || []];
    this.linkDays = this.viewLink?.expiresAt === null ? null : 7;
    this.linkSettingsOpen = true;
  }

  async saveViewLink(rotate = false): Promise<void> {
    if (this.busyId || this.destroyed || !this.publicAccessEnabled || this.linkLoading) return;

    const epoch = this.dataService.sessionEpoch;
    const body = { ...(this.viewLink ? { expectedVersion: this.viewLink.version } : {}),
      expiresInDays: this.linkDays, rotate,
      ...(this.viewLink ? { publicFields: this.publicFields } : {}) };

    const serialized = JSON.stringify(body);

    if (this.linkRequest?.body !== serialized) this.linkRequest = { key: crypto.randomUUID(), body: serialized };

    this.busyId = 'console-link';

    try {
      const link = await this.consoles.saveLink(this.id, body, this.linkRequest.key);

      if (!this.current(epoch)) return;

      this.viewLink = link;
      this.linkRequest = undefined;
      this.linkSettingsOpen = false;
    } catch {
      if (this.current(epoch)) this.linkError = '保存失败，请重新读取链接状态后重试';
    } finally {
      this.busyId = '';

      this.cd.markForCheck();
    }
  }

  async copyViewLink(kind: 'app' | 'browser'): Promise<void> {
    if (!this.publicAccessEnabled || this.busyId || this.linkLoading) return;

    const link = kind === 'app' ? this.publicLink : this.publicBrowserLink;

    if (link) await this.copyLink(link, kind === 'app' ? 'App 链接已复制' : '浏览器链接已复制');
  }

  async revokeViewLink(): Promise<void> {
    const alert = await this.alerts.create({ header: '停用控制台链接？',
      message: '通过此链接的查看将停止，已授权成员不受影响。',
      buttons: [{ text: '保留', role: 'cancel' }, { text: '停用', role: 'destructive', handler: () => {
        void this.run('console-link', async () => {
          await this.consoles.revokeLink(this.id);

          this.linkSettingsOpen = false;

          await this.refreshLink();
        });
      } }] });

    await alert.present();
  }

  async cancelInvitation(invitationId: string): Promise<void> {
    await this.run(invitationId, async () => {
      const invitation = await this.sharing.revokeInvitation(this.id, invitationId);

      await this.refresh();

      await this.notices.showToast(invitation.state === 'accepted'
        ? '邀请已被领取，请在共享成员中解除分享' : '邀请已取消');
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

    this.cd.markForCheck();

    const key = this.supportsConsoleLink && !this.device?.config.isShared ? `${this.host.sessionVersion}:${this.id}` : '';

    if (key === this.linkDeviceKey) return;

    this.linkDeviceKey = key;
    this.viewLink = null;

    if (key) void this.refreshLink();
  }

  private async createInvitation(role: DeviceV2ShareRole, recipientAccount?: string, canEditConsole = false): Promise<void> {
    if (this.busyId || this.destroyed) return;

    const epoch = this.dataService.sessionEpoch, deviceId = this.id, pageEpoch = this.pageEpoch;

    this.busyId = 'create-invitation';

    if (this.pendingInvitation?.canEditConsole !== canEditConsole || this.pendingInvitation?.role !== role
      || this.pendingInvitation.recipientAccount !== recipientAccount
      || this.pendingInvitation.epoch !== epoch || this.pendingInvitation.deviceId !== deviceId) {
      this.pendingInvitation = { role, recipientAccount, canEditConsole, epoch, deviceId,
        idempotencyKey: `app-share-${Date.now()}-${this.randomSuffix()}` };
    }

    try {
      const invitation = await this.sharing.createInvitation(
        deviceId,
        role,
        this.pendingInvitation.idempotencyKey,
        undefined,
        recipientAccount,
        canEditConsole,
      );

      if (!this.current(epoch, deviceId, pageEpoch)) return;

      this.pendingInvitation = undefined;

      await this.refresh();

      if (!this.current(epoch, deviceId, pageEpoch)) return;

      if (recipientAccount) {
        await this.notices.showToast('邀请已创建，对方可在“分享给我的”查看。系统通知尚未接通，请自行提醒对方。');
      } else this.invitationDetails = invitation;
    } catch (error) {
      if (this.current(epoch, deviceId, pageEpoch)) {
        const code = error?.code || error?.error?.errorCode;

        const messages: Record<string, string> = {
          DEVICE_V2_SHARE_INVITATION_NOT_CONFIGURED: '邀请服务暂不可用，请稍后重试',
          DEVICE_V2_SHARE_LIMIT_REACHED: '待领取邀请过多，请先取消不再使用的链接',
          DEVICE_V2_SHARE_IDEMPOTENCY_CONFLICT: '本次邀请权限已变化，请重新生成链接',
          DEVICE_V2_ROUTE_NOT_READY: '设备通信服务准备中，请稍后重试',
          DEVICE_V2_SHARE_RECIPIENT_NOT_FOUND: '未找到可接收邀请的账号，请确认对方的注册邮箱',
          DEVICE_V2_SHARE_DIRECTORY_UNAVAILABLE: '邮箱邀请服务暂不可用，请稍后重试；也可另行创建分享链接',
          DEVICE_V2_SHARE_DIRECTORY_RATE_LIMITED: '邀请查询过于频繁，请稍后重试',
          DEVICE_V2_SHARE_ALREADY_PENDING: '对方已有该设备的待领取邀请，请勿重复创建',
          DEVICE_V2_SHARE_OWNER_CANNOT_ACCEPT: '不能邀请设备所有者本人',
        };

        await this.notices.showToast(messages[code] ?? '创建共享邀请失败，请稍后重试');
      }
    } finally {
      this.busyId = '';

      this.cd.markForCheck();
    }
  }

  async openInvitation(item: DeviceV2ShareInvitation): Promise<void> {
    if (this.busyId || this.destroyed || item.targeted) return;

    const epoch = this.dataService.sessionEpoch, deviceId = this.id, pageEpoch = this.pageEpoch;

    this.busyId = item.invitationId;

    try {
      const invitation = await this.sharing.getInvitation(deviceId, item.invitationId);

      if (this.current(epoch, deviceId, pageEpoch)) this.invitationDetails = invitation;
    } catch {
      if (this.current(epoch, deviceId, pageEpoch)) {
        await this.notices.showToast('邀请链接暂不可用，请刷新后重试');
        await this.refresh();
      }
    } finally {
      this.busyId = '';

      this.cd.markForCheck();
    }
  }

  async updateInvitationPermission(permission: 'control' | 'edit', enabled: boolean): Promise<void> {
    const item = this.invitationDetails;

    if (!item || this.busyId || this.destroyed) return;

    const epoch = this.dataService.sessionEpoch, deviceId = this.id, pageEpoch = this.pageEpoch;

    const change: { role?: DeviceV2ShareRole; canEditConsole?: boolean } = permission === 'control'
      ? { role: enabled ? 'operator' : 'viewer' } : { canEditConsole: enabled };

    const pending = { ...item, ...change };

    this.invitationDetails = pending;
    this.busyId = 'invitation-permissions';

    try {
      const updated = await this.sharing.updateInvitation(deviceId, item.invitationId, change);

      if (!this.current(epoch, deviceId, pageEpoch)) return;
      if (this.invitationDetails === pending) this.invitationDetails = updated;

      await this.refresh();
    } catch {
      if (!this.current(epoch, deviceId, pageEpoch)) return;

      const latest = await this.sharing.getInvitation(deviceId, item.invitationId).catch(() => null);

      if (!this.current(epoch, deviceId, pageEpoch)) return;
      if (this.invitationDetails === pending) this.invitationDetails = latest;

      await this.notices.showToast(latest ? '未能确认修改，已重新读取权限' : '邀请暂不可修改，请重新打开');
      await this.refresh();
    } finally {
      this.busyId = '';

      this.cd.markForCheck();
    }
  }

  async copyInvitation(): Promise<void> {
    if (this.invitationLink) await this.copyLink(this.invitationLink, '邀请链接已复制');
  }

  private async copyLink(link: string, message = '分享链接已复制'): Promise<void> {
    try {
      await this.host.copyText(link);
      await this.notices.showToast(message);
    } catch {
      const alert = await this.alerts.create({ header: '分享链接', message: '可以长按下方链接复制。',
        inputs: [{ type: 'text', value: link, attributes: { readonly: true } }],
        buttons: [{ text: '完成', role: 'confirm' }] });

      await alert.present();
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
    } finally {
      if (this.current(epoch, deviceId)) this.cd.markForCheck();
    }
  }

  private current(epoch: number, deviceId = this.id, pageEpoch = this.pageEpoch): boolean {
    return !this.destroyed && this.dataService.sessionEpoch === epoch && this.id === deviceId && this.pageEpoch === pageEpoch;
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

      this.cd.markForCheck();
    }
  }

  private randomSuffix(): string {
    return globalThis.crypto?.randomUUID?.().slice(0, 12)
      ?? Math.random().toString(36).slice(2, 14);
  }
}
