import { Component, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../../core/services/data.service';
import { UpdateService } from '../../../core/services/update.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  MenuListComponent,
  MenuListItem,
} from '../../../core/components/menu-list/menu-list';
import { createProfileMenuGroups } from './profile-menu.config';

@Component({
  selector: 'app-tab-profile',
  templateUrl: 'tab-profile.html',
  styleUrls: ['tab-profile.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    IonicModule,
    RouterModule,
    TranslatePipe,
    MenuListComponent,
  ],
})
export class TabProfileComponent {
  get menuGroups() {
    return createProfileMenuGroups(
      {
        roomNum: this.roomNum,
        sceneNum: this.sceneNum,
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

  get planSummary(): string {
    const plan = this.user?.subscriptionPlan;
    const planName = plan?.display_name?.trim() || plan?.name?.trim() || '';
    if (!planName) return '';

    const endDate = plan?.end_date?.trim();
    if (!endDate) return planName;

    const dateOnly = endDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || endDate;
    return `${planName} · ${dateOnly}`;
  }

  get roomNum() {
    return this.dataService.room?.list?.length || 2;
  }

  get sceneNum() {
    return this.dataService.scene?.list?.length || 10;
  }

  get sharedDeviceNum() {
    return this.dataService.share?.shared?.length || 3;
  }

  get showNewVersion() {
    return this.updateService.hasNewVersion;
  }

  get currentVersion() {
    return this.updateService.currentVersion;
  }

  constructor(
    private dataService: DataService,
    private updateService: UpdateService,
    private authService: AuthService,
    private translate: TranslateService,
    private router: Router
  ) {}

  goto(page?: string) {
    if (!page) return;
    this.router.navigate([page]);
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

  checkCodePush() {
    // 检查更新
  }
}
