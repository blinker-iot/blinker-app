import { Component, OnInit } from '@angular/core';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { DataService } from 'src/app/core/services/data.service';
import { ViewService } from 'src/app/core/services/view.service';

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
    private dataService: DataService,
    private viewService: ViewService
  ) { }

  gotoDashboard() {

  }

  switchSearchbar() {

  }

  changeView() {
    this.viewService.changeView();
  }
}
