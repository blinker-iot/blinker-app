import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-user-devtool',
  templateUrl: 'user-devtool.html',
})
export class UserDevtoolPage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  gotoDevtoolEsptouchPage(){
    this.navCtrl.push('UserDevtoolEsptouchPage');
  }

  gotoDevtoolApConfigPage(){
    // this.navCtrl.push('AdddeviceApconfigPage');
  }

}
