import { Component, OnInit } from '@angular/core';
import { DevcenterService } from './devcenter.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'app-devcenter',
  templateUrl: './devcenter.page.html',
  styleUrls: ['./devcenter.page.scss'],
})
export class DevcenterPage implements OnInit {

  selectedTab = 0;

  get isDev() {
    // return isDevMode()
    return false
  }

  get userLevel() {
    return this.devcenterService.userLevel
  }

  get proDeviceNum() {
    return this.devcenterService.proDeviceNum
  }

  get dataKeyNum() {
    return this.devcenterService.dataKeyNum
  }

  get proDeviceMaxNum() {
    return this.devcenterService.proDeviceMaxNum
  }

  get dataKeyMaxNum() {
    return this.devcenterService.dataKeyMaxNum
  }

  constructor(
    private devcenterService: DevcenterService,
    private dataService: DataService,
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.devcenterService.getUserLevel();
      }
    })
  }

  loaded;
  ngAfterViewInit() {

  }

  selectTab(tab) {
    this.selectedTab = tab
  }

}
