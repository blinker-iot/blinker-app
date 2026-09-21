import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AlertController, IonicModule, NavController } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import {
  TabSelectorComponent,
  TabSelectorOption,
} from 'src/app/core/components/tab-selector/tab-selector.component';
import { ShareDate } from 'src/app/core/model/data.model';
import { DeviceV2PendingInvitation } from 'src/app/core/model/response.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { DeviceV2ShareInvitationService } from 'src/app/core/services/device-v2-share-invitation.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-share-manager',
  standalone: true,
  templateUrl: './share-manager.page.html',
  styleUrls: ['./share-manager.page.scss'],
  imports: [
    IonicModule,
    RouterModule,
    TranslatePipe,
    BDeviceImgComponent,
    HeroCardComponent,
    TabSelectorComponent,
  ],
})
export class ShareManagerPage implements OnInit, OnDestroy {
  loaded = false;
  tab: 'sharing' | 'received' = 'sharing';
  busyDeviceId = '';
  loadError = '';
  private loadGeneration = 0;
  pendingInvitations: DeviceV2PendingInvitation[] = [];
  invitationCursor: string | null = null;
  invitationsLoading = false;
  invitationError = '';
  private inboxGeneration = 0;
  private inboxEpoch = -1;

  private deviceSubscription?: Subscription;
  private authSubscription?: Subscription;

  get deviceDataDict() {
    return this.dataService.device?.dict ?? {};
  }

  get shareData(): ShareDate {
    return this.dataService.share;
  }

  get shareableDeviceList(): string[] {
    return (this.dataService.device?.list ?? []).filter(
      (deviceId) => !this.deviceDataDict[deviceId]?.config?.isShared,
    );
  }

  get receivedDevices() {
    return this.shareData.received;
  }

  get sharedByMeCount(): number {
    return Object.values(this.shareData.byDevice).reduce(
      (total, access) => total + access.shares.filter(
        (share) => share.state === 'active',
      ).length,
      0,
    );
  }

  get shareTabs(): readonly TabSelectorOption[] {
    return [
      { value: 'sharing', label: '我分享的', icon: 'fa-light fa-share-nodes' },
      {
        value: 'received',
        label: '分享给我的',
        icon: 'fa-light fa-inbox-in',
        badge: this.receivedDevices.length || null,
      },
    ];
  }

  constructor(
    private readonly sharing: DeviceV2SharingService,
    private readonly dataService: DataService,
    private readonly userService: UserService,
    private readonly alerts: AlertController,
    private readonly notices: NoticeService,
    private readonly invitation: DeviceV2ShareInvitationService,
    private readonly nav: NavController,
  ) {}

  ngOnInit(): void {
    this.authSubscription = this.dataService.authDataChanged.subscribe(() => {
      this.clearInbox();
      this.loadGeneration++;
      if (this.dataService.auth?.uuid) void this.loadShares();
    });
    this.deviceSubscription = this.dataService.deviceDataLoader.subscribe((loaded) => {
      if (loaded) void this.loadShares();
    });
  }

  ngOnDestroy(): void {
    this.loadGeneration++;
    this.clearInbox();
    this.deviceSubscription?.unsubscribe();
    this.authSubscription?.unsubscribe();
  }

  changeTab(tab: string): void {
    if (tab === 'sharing' || tab === 'received') this.tab = tab;
  }

  ionViewWillEnter(): void { void this.loadShares(); }

  openPendingInvitation(invitationId: string): void {
    if (this.invitation.stageDirected(invitationId)) void this.nav.navigateForward('/share-invitation');
  }

  private clearInbox(): void {
    this.inboxGeneration++;
    this.inboxEpoch = this.dataService.sessionEpoch;
    this.pendingInvitations = [];
    this.invitationCursor = null;
    this.invitationError = '';
    this.invitationsLoading = false;
  }

  async loadPendingInvitations(more = false): Promise<void> {
    if (this.inboxEpoch !== this.dataService.sessionEpoch) this.clearInbox();
    if (!this.dataService.auth?.uuid || (more && (!this.invitationCursor || this.invitationsLoading))) return;
    const epoch = this.dataService.sessionEpoch, generation = ++this.inboxGeneration;
    const cursor = more ? this.invitationCursor! : undefined;
    this.invitationsLoading = true; this.invitationError = '';
    try {
      const page = await this.sharing.listPendingInvitations(cursor);
      if (epoch !== this.dataService.sessionEpoch || generation !== this.inboxGeneration) return;
      this.pendingInvitations = more
        ? [...new Map([...this.pendingInvitations, ...page.items].map(item => [item.invitationId, item])).values()]
        : page.items;
      this.invitationCursor = page.nextCursor;
    } catch {
      if (epoch === this.dataService.sessionEpoch && generation === this.inboxGeneration) {
        this.invitationError = '待处理邀请暂未刷新，请重试';
      }
    } finally {
      if (epoch === this.dataService.sessionEpoch && generation === this.inboxGeneration) this.invitationsLoading = false;
    }
  }

  activeShareCount(deviceId: string): number {
    return this.shareData.byDevice[deviceId]?.shares.filter(
      (share) => share.state === 'active',
    ).length ?? 0;
  }

  roleLabel(role: 'viewer' | 'operator'): string {
    return role === 'operator' ? '可控制' : '仅查看';
  }

  async showAcceptInvitation(): Promise<void> {
    const alert = await this.alerts.create({
      header: '粘贴分享链接',
      message: '粘贴完整分享链接或邀请码，先查看设备及权限，再决定是否接受。',
      inputs: [{ name: 'code', type: 'text', placeholder: '分享链接或邀请码' }],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '查看邀请',
          handler: (data: { code?: string }) => {
            if (!this.invitation.stage(data.code ?? '')) {
              void this.notices.showToast('分享链接或邀请码格式无效');
              return false;
            }
            void this.nav.navigateForward('/share-invitation');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async leaveShare(logicalDeviceId: string): Promise<void> {
    if (this.busyDeviceId) return;
    this.busyDeviceId = logicalDeviceId;
    try {
      const result = await this.sharing.leaveShare(logicalDeviceId);
      await this.userService.getAllInfo();
      await this.notices.showToast(result.realtimeRefreshPending
        ? '已退出分享，通信权限同步中' : '已退出分享');
    } catch (error) {
      console.error('Failed to leave Device V2 share', error);
      await this.notices.showToast('退出设备共享失败，请稍后重试');
    } finally {
      this.busyDeviceId = '';
    }
  }

  async loadShares(): Promise<void> {
    const generation = ++this.loadGeneration, epoch = this.dataService.sessionEpoch;
    if (!this.dataService.auth?.uuid) { this.loaded = true; return; }
    void this.loadPendingInvitations();
    this.loadError = '';
    try {
      const [received, ...ownerShares] = await Promise.allSettled([
        this.sharing.listReceived(),
        ...this.shareableDeviceList.map((deviceId) => this.sharing.listDevice(deviceId)),
      ]);
      if (generation !== this.loadGeneration || epoch !== this.dataService.sessionEpoch) return;
      this.dataService.share = {
        received: received.status === 'fulfilled' ? received.value : this.shareData.received,
        byDevice: { ...this.shareData.byDevice, ...Object.fromEntries(ownerShares.flatMap(result =>
          result.status === 'fulfilled' ? [[result.value.logicalDeviceId, result.value]] : [])) },
      };
      if ([received, ...ownerShares].some(result => result.status === 'rejected')) {
        this.loadError = '部分分享信息暂未刷新，请重试';
      }
    } finally {
      if (generation === this.loadGeneration && epoch === this.dataService.sessionEpoch) this.loaded = true;
    }
  }
}
