import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-mi-scale-guide',
  templateUrl: 'mi-scale-guide.html',
})
export class MiScaleGuidePage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MiScaleGuidePage');
  }

  gotoPlugConfig(){
    this.navCtrl.push("MiScaleConfigPage");
  }

}
