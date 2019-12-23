import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { AppVersion } from '@ionic-native/app-version/ngx';
import { Platform, MenuController } from '@ionic/angular';
import { Router } from '@angular/router';
import { UpdateService } from 'src/app/core/services/update.service';
import { MENU_LIST } from 'src/app/configs/menu.config';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'blinker-menu',
  templateUrl: './menu.html',
  styleUrls: ['./menu.scss']
})
export class Menu implements OnInit {

  loaded;

  get user() {
    return this.dataService.user
  };

  get deviceNum() {
    return this.dataService.device.list.length
  };

  menuList;

  softVersion: string = '0.0.0';
  showNewVersion = false;

  constructor(
    private appVersion: AppVersion,
    private platform: Platform,
    private router: Router,
    private updateService: UpdateService,
    private dataService: DataService,
    private menu: MenuController
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.loaded = true
      }
    })
    this.menuList = MENU_LIST;
  }

  ngAfterViewInit() {
    this.getVersionNumber()
  }

  async getVersionNumber() {
    if (!this.platform.is("cordova")) return;
    this.softVersion = await this.appVersion.getVersionNumber();
    setTimeout(async () => {
      this.showNewVersion = await this.updateService.checkForUpdate();
    });
  }

  checkCodePush() {
    this.updateService.checkCodePush();
  }

  goto(page, item = { disabled: false }) {
    if (item.disabled) return;
    if (this.platform.is("ios")) this.menu.close();
    this.router.navigate([page])
  }

}
