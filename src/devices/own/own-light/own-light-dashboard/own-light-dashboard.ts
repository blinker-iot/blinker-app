import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-own-light-dashboard',
  templateUrl: 'own-light-dashboard.html',
})
export class OwnLightDashboardPage {
  tab;
  constructor(
    public navCtrl: NavController,
    public navParams: NavParams
  ) {
  }

  ionViewDidLoad() {

  }

  changeTab(tab) {
    this.tab = tab;
    if (tab == 1) {
      // this.loadTimingTask();
    } else if (tab == 2) {
      // this.loadCountdownTask();
    } else if (tab == 3) {
      // this.loadLoopTask();
    } else if (tab == 4) {

    }
  }

}
