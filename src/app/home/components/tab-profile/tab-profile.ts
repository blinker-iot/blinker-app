import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DataService } from '../../../core/services/data.service';
import { UpdateService } from '../../../core/services/update.service';
import { MENU_LIST } from '../../../configs/menu.config';
import { LangSelectorComponent } from '../../../core/components/lang-selector/lang-selector.component';

@Component({
  selector: 'tab-profile',
  templateUrl: 'tab-profile.html',
  styleUrls: ['tab-profile.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule,
    TranslateModule,
    LangSelectorComponent
  ]
})
export class TabProfileComponent {

  loaded = false;
  menuList = MENU_LIST;

  get user() {
    return this.dataService.user;
  }

  get deviceNum() {
    if (this.dataService.device?.list) {
      return this.dataService.device.list.length;
    }
    return 0;
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
    private router: Router
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.loaded = true;
      }
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  goto(page, disabled = false) {
    if (disabled) return;
    this.router.navigate([page]);
  }

  checkCodePush() {
    // 检查更新
  }
}
