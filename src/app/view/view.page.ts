import { Component, OnInit } from '@angular/core';
// import { NavController } from '@ionic/angular';
import { ViewService } from './view.service';
// import { DevicelistService } from '../core/services/devicelist.service';
// import { UserService } from '../core/services/user.service';
// import { AppMinimize } from '@ionic-native/app-minimize/ngx';

@Component({
  selector: 'blinker-view',
  templateUrl: './view.page.html',
  styleUrls: ['./view.page.scss'],
})
export class BlinkerView implements OnInit {

  get menuSwipeEnable() {
    return this.viewService.menuSwipeEnable;
  }

  set menuSwipeEnable(enable) {
    this.viewService.menuSwipeEnable = enable;
  }

  constructor(
    private viewService: ViewService,
    // private devicelistService: DevicelistService
  ) { }

  ngOnInit() {
    // this.devicelistService.init();
  }

  menuDidOpen() {
    this.menuSwipeEnable = true;
  }

  menuDidClose() {
    this.menuSwipeEnable = false;
  }

}
