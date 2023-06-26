import { Component, OnInit } from '@angular/core';
import { DevcenterService } from './devcenter.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'app-devcenter',
  templateUrl: './devcenter.page.html',
  styleUrls: ['./devcenter.page.scss'],
})
export class DevcenterPage implements OnInit {

  selectedTab = 2;

  get isDev() {
    // return isDevMode()
    return false
  }

  get developerInfo(){
    return this.devcenterService.developerInfo
  }

  constructor(
    private devcenterService: DevcenterService,
    private dataService: DataService,
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.devcenterService.getUserLevel();
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loaded;
  ngAfterViewInit() {

  }

  selectTab(tab) {
    this.selectedTab = tab
  }

}
