import { Component, OnInit } from '@angular/core';
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

  get showNewVersion() {
    return this.updateService.hasNewVersion
  }

  get currentVersion() {
    return this.updateService.currentVersion
  }

  constructor(
    private platform: Platform,
    private router: Router,
    private updateService: UpdateService,
    private dataService: DataService,
    private menu: MenuController
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.loaded = true
      }
    })
    this.menuList = MENU_LIST;
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  goto(page, item = { disabled: false }) {
    if (item.disabled) return;
    // if (this.platform.is("ios")) this.menu.close();
    this.router.navigate([page])
  }

  checkCodePush(){
    
  }

}
