import { Component, OnInit } from '@angular/core';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { Events } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'view-list',
  templateUrl: './view-list.page.html',
  styleUrls: ['./view-list.page.scss'],
})
export class ViewListPage {

  get deviceDataList() {
    return this.dataService.device.list
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(
    private events: Events,
    private userService: UserService,
    private deviceService: DeviceService,
    private dataService: DataService
  ) { }

  gotoDashboard() {

  }

  switchSearchbar() {

  }

  changeView() {
    this.events.publish('changeView', '')
  }
}
