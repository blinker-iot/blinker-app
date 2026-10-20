import { parseConsoleLink } from '../../../core/services/device-console.service';
import { ServiceRegion } from '../../../configs/service-region.config';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';

import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonRouterLinkWithHref,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { ShareDate } from 'src/app/core/model/data.model';
import { DeviceV2PendingInvitation } from 'src/app/core/model/response.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
import { DeviceV2ShareInvitationService } from 'src/app/core/services/device-v2-share-invitation.service';
import { PublicConsoleBookmarksService } from 'src/app/core/services/public-console-bookmarks.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-share-manager',
  standalone: true,
  templateUrl: './share-manager.page.html',
  styleUrls: ['./share-manager.page.scss'],
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonRouterLinkWithHref,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterModule,
    TranslatePipe,
    BDeviceImgComponent,
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

  get authenticated(): boolean { return !!this.dataService.auth?.accessToken; }

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

  constructor(
    private readonly sharing: DeviceV2SharingService,
    private readonly dataService: DataService,
    private readonly userService: UserService,
    private readonly alerts: AlertController,
    private readonly notices: NoticeService,
    private readonly invitation: DeviceV2ShareInvitationService,
    private readonly nav: NavController,
    readonly bookmarks: PublicConsoleBookmarksService,
    private readonly cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.authenticated) this.tab = 'received';

    this.authSubscription = this.dataService.authDataChanged.subscribe(() => {
      this.clearInbox();
      this.loadGeneration++;

      if (!this.authenticated) this.tab = 'received';

      void this.loadShares();
      this.cd.markForCheck();
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

  ionViewWillEnter(): void {
    if (!this.authenticated) this.tab = 'received';

    void this.bookmarks.load();
    void this.loadShares();
  }

  login(): void {
    void this.nav.navigateForward('/login', { queryParams: { returnSharing: '1' } });
  }

  async removePublicDevice(deviceId: string, region: ServiceRegion): Promise<void> {
    try {
      await this.bookmarks.remove(deviceId, region);
    } catch {
      await this.notices.showToast('未能移除本机设备，请重试');
    }
  }

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
      if (epoch === this.dataService.sessionEpoch && generation === this.inboxGeneration) {
        this.invitationsLoading = false;

        this.cd.markForCheck();
      }
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
      message: '控制台链接可直接查看；成员邀请需核对权限后接受。',
      inputs: [{ name: 'code', type: 'text', placeholder: '分享链接或邀请码' }],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '打开',
          handler: (data: { code?: string }) => {
            const consoleToken = parseConsoleLink(data.code);

            if (consoleToken) { void this.nav.navigateForward('/s/' + consoleToken); return true; }

            if (!this.invitation.stage(data.code ?? '')) {
              void this.notices.showToast('分享链接或邀请码格式无效');

              return false;
            }

            void this.nav.navigateForward(['/share-invitation', this.invitation.code]);

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

      this.cd.markForCheck();
    }
  }

  async loadShares(): Promise<void> {
    const generation = ++this.loadGeneration, epoch = this.dataService.sessionEpoch;

    if (!this.authenticated) {
      this.loaded = true;
      this.loadError = '';

      this.cd.markForCheck();

      return;
    }

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
      if (generation === this.loadGeneration && epoch === this.dataService.sessionEpoch) {
        this.loaded = true;

        this.cd.markForCheck();
      }
    }
  }
}
