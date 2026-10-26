import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from '@angular/core';

import { IonicModule, NavController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../../core/services/data.service';
import { UpdateService } from '../../../core/services/update.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { MessageService } from '../../../sections/message/message.service';
import {
  MenuListComponent,
  MenuListItem,
} from '../../../core/components/menu-list/menu-list';
import { createProfileMenuGroups } from './profile-menu.config';
import { environment } from 'src/environments/environment';
import { profileEntitlements } from './profile-entitlements';

@Component({
  selector: 'app-tab-profile',
  templateUrl: 'tab-profile.html',
  styleUrls: ['tab-profile.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonicModule,
    TranslatePipe,
    MenuListComponent,
  ],
})
export class TabProfileComponent implements OnInit {
  readonly messagesAvailable = environment.deployment.messages;
  refreshingAccount = false;
  private failedAccountEpoch: number | null = null;
  get menuGroups() {
    return createProfileMenuGroups(
      {
        roomNum: this.roomNum,
        sharedDeviceNum: this.sharedDeviceNum,
      },
      (key, params) => this.translate.instant(key, params)
    );
  }

  get user() {
    return this.dataService.user;
  }

  get userName() {
    return (
      this.user?.username ||
      this.translate.instant('PROFILE.DEFAULT_USER_NAME')
    );
  }

  get avatar() {
    return this.user?.avatar || '';
  }

  get accountEntitlements() {
    return profileEntitlements(this.user, this.dataService.ownedDeviceCount);
  }

  get deviceQuotaLabel(): string {
    const { limit, used } = this.accountEntitlements;
    const key = limit === -1
      ? used === null ? 'DEVICE_QUOTA_UNLIMITED' : 'DEVICE_QUOTA_UNLIMITED_COUNT'
      : limit === null
        ? used === null ? 'DEVICE_QUOTA_UNKNOWN' : 'DEVICE_QUOTA_USAGE'
        : used === null ? 'DEVICE_QUOTA_LIMIT' : 'DEVICE_QUOTA_COUNT';
    return this.translate.instant(`PROFILE.${key}`, { used, limit });
  }

  get showAccountRefreshFailure(): boolean {
    return this.failedAccountEpoch === this.dataService.sessionEpoch
      || (!!this.user?.id && (!!this.dataService.userLoadError.value
        || !!this.dataService.deviceLoadError.value));
  }

  get roomNum() {
    return this.dataService.room?.list?.length ?? 0;
  }

  get sharedDeviceNum() {
    return this.dataService.share?.received?.length ?? 0;
  }

  get showNewVersion() {
    return this.updateService.hasNewVersion;
  }

  get currentVersion() {
    return this.updateService.currentVersion || '—';
  }

  get unreadMessageCount(): number {
    return this.messageService.unreadTotal;
  }

  get unreadMessageBadge(): string {
    return this.unreadMessageCount > 99
      ? '99+'
      : String(this.unreadMessageCount);
  }

  get showUnreadMessageBadge(): boolean {
    return this.unreadMessageCount > 0;
  }

  get messageButtonLabel(): string {
    return this.unreadMessageCount > 0
      ? `消息中心，${this.unreadMessageCount}条未读`
      : '消息中心，暂无未读消息';
  }

  constructor(
    private dataService: DataService,
    private updateService: UpdateService,
    private authService: AuthService,
    private translate: TranslateService,
    private navController: NavController,
    private messageService: MessageService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    void this.messageService.init().catch(() => undefined);
  }

  async refreshAccount(): Promise<void> {
    if (this.refreshingAccount || !this.dataService.auth) return;
    this.refreshingAccount = true;
    this.failedAccountEpoch = null;
    const epoch = this.dataService.sessionEpoch;
    try {
      const loaded = await this.userService.getAllInfo();
      if (epoch === this.dataService.sessionEpoch && !loaded) this.failedAccountEpoch = epoch;
    } catch {
      if (epoch === this.dataService.sessionEpoch) this.failedAccountEpoch = epoch;
    } finally {
      this.refreshingAccount = false;
    }
  }

  goto(page?: string) {
    if (!page) return;
    void this.navController.navigateForward(page);
  }

  logout() {
    this.authService.logout();
  }

  selectMenuItem(item: MenuListItem): void {
    if (item.id === 'logout') {
      this.logout();
      return;
    }

    this.goto(item.route);
  }

}
