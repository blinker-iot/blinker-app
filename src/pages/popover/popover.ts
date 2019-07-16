import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ViewController, Events } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-popover',
  templateUrl: 'popover.html',
})
export class PopoverPage {

  constructor(
    // public navCtrl: NavController,
    // public navParams: NavParams,
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
