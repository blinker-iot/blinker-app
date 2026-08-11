import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { DataService } from '../../../core/services/data.service';
import { UpdateService } from '../../../core/services/update.service';
import { AuthService } from '../../../core/services/auth.service';

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
  ],
})
export class TabProfileComponent {
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

  checkCodePush() {
    // 检查更新
  }
}
