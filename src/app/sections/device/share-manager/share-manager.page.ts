import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import {
  TabSelectorComponent,
  TabSelectorOption,
} from 'src/app/core/components/tab-selector/tab-selector.component';
import { ShareDate } from 'src/app/core/model/data.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2SharingService } from 'src/app/core/services/device-v2-sharing.service';
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

  private deviceSubscription?: Subscription;

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
      { value: 'sharing', label: '我的共享', icon: 'fa-light fa-share-nodes' },
      {
        value: 'received',
        label: '接收的设备',
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
  ) {}

  ngOnInit(): void {
    this.deviceSubscription = this.dataService.deviceDataLoader.subscribe((loaded) => {
      if (loaded) void this.loadShares();
    });
  }

  ngOnDestroy(): void {
    this.deviceSubscription?.unsubscribe();
  }

  changeTab(tab: string): void {
    if (tab === 'sharing' || tab === 'received') this.tab = tab;
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
      header: '领取共享设备',
      message: '输入设备所有者发给你的 43 位单次邀请码。',
      inputs: [{ name: 'code', type: 'text', placeholder: '共享邀请码' }],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '领取',
          handler: (data: { code?: string }) => {
            void this.acceptInvitation(data.code ?? '');
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
      await this.sharing.leaveShare(logicalDeviceId);
      await this.userService.getAllInfo();
    } catch (error) {
      console.error('Failed to leave Device V2 share', error);
      await this.notices.showToast('退出设备共享失败，请稍后重试');
    } finally {
      this.busyDeviceId = '';
    }
  }

  private async acceptInvitation(code: string): Promise<void> {
    try {
      await this.sharing.acceptInvitation(code.trim());
      await this.userService.getAllInfo();
      this.tab = 'received';
      await this.notices.showToast('共享设备已添加');
    } catch (error) {
      console.error('Failed to accept Device V2 invitation', error);
      await this.notices.showToast('邀请码无效、已过期或已被领取');
    }
  }

  private async loadShares(): Promise<void> {
    try {
      const [received, ...ownerShares] = await Promise.all([
        this.sharing.listReceived(),
        ...this.shareableDeviceList.map((deviceId) => this.sharing.listDevice(deviceId)),
      ]);
      this.dataService.share = {
        received,
        byDevice: Object.fromEntries(
          ownerShares.map((access) => [access.logicalDeviceId, access]),
        ),
      };
    } catch (error) {
      console.error('Failed to load Device V2 share inventory', error);
    } finally {
      this.loaded = true;
    }
  }
}
