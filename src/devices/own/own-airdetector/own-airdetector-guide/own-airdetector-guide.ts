import { Component } from '@angular/core';
import { NavController, IonicPage } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-own-airdetector-guide',
  templateUrl: 'own-airdetector-guide.html'
})
export class OwnAirdetectorGuidePage {

  constructor(
    public navCtrl: NavController,
  ) { }

  gotoPlugConfig() {
    this.navCtrl.push('EsptouchPage', 'OwnAirdetector');
  }

}
