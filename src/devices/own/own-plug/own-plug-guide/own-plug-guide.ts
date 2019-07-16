import { Component } from '@angular/core';
import { NavController, IonicPage } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-own-plug-guide',
  templateUrl: 'own-plug-guide.html'
})
export class OwnPlugGuidePage {

  constructor(
    public navCtrl: NavController,
  ) { }

  gotoPlugConfig() {
    this.navCtrl.push('EsptouchPage', 'OwnPlug');
  }

}
