import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { DataService } from '../../../core/services/data.service';
import { UpdateService } from '../../../core/services/update.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  MenuListComponent,
  MenuListItem,
} from '../menu-list/menu-list';

@Component({
  selector: 'app-tab-profile',
  templateUrl: 'tab-profile.html',
  styleUrls: ['tab-profile.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule,
    MenuListComponent,
  ],
})
export class TabProfileComponent {
  get primaryMenuItems(): MenuListItem[] {
    return [
      {
        id: 'family',
        title: '家庭管理',
        icon: 'fa-house',
        value: `${this.roomNum} 个家庭`,
        route: '/room-manager',
      },
      {
        id: 'automation',
        title: '自动化',
        icon: 'fa-bullseye-pointer',
        value: `${this.sceneNum} 个场景`,
        route: '/scene-manager',
      },
      {
        id: 'sharing',
        title: '设备共享',
        icon: 'fa-user-group',
        value: `已共享 ${this.sharedDeviceNum} 台设备`,
      },
      {
        id: 'voice-assistant',
        title: '语音助手',
        icon: 'fa-microphone',
        value: '小度、天猫精灵',
      },
    ];
  }

  readonly secondaryMenuItems: MenuListItem[] = [
    {
      id: 'settings',
      title: '设置',
      icon: 'fa-gear',
      route: '/settings',
    },
    {
      id: 'help',
      title: '帮助与反馈',
      icon: 'fa-circle-question',
    },
    {
      id: 'logout',
      title: '退出登录',
      icon: 'fa-arrow-right-from-bracket',
      danger: true,
      showChevron: false,
    },
  ];

  get user() {
    return this.dataService.user;
  }

  get userName() {
    return this.user?.username || '张小北';
  }

  get avatar() {
    return this.user?.avatar || '';
  }

  get deviceNum() {
    if (this.dataService.device?.list) {
      return this.dataService.device.list.length;
    }
    return 0;
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
