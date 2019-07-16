import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ViewController, Events } from 'ionic-angular';

/**
 * Generated class for the RoommenuPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-roommenu',
  templateUrl: 'roommenu.html',
})
export class RoommenuPage {

  constructor(
    public navCtrl: NavController, 
    public navParams: NavParams,
    public viewCtrl: ViewController,
    public events: Events
    ) {
  }

  gotoPage(page) {
    let message = {
      goto: page
    }
    this.events.publish('page:home', message);
    this.viewCtrl.dismiss();
  }

}
