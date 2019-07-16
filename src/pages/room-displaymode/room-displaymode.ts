import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, Events } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';


@IonicPage()
@Component({
  selector: 'page-room-displaymode',
  templateUrl: 'room-displaymode.html',
})
export class RoomDisplaymodePage {

  selected = 0;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public events: Events,
    public userProvider:UserProvider
  ) {
  }

  ionViewDidLoad() {

  }

  select(id) {
    this.selected = id;
    if (id == 0) {
      // this.events.publish("page:home", "display mode:grid")
      this.userProvider.localStorage.app.displayMode="grid"
    }
    else if (id == 1) {
      // this.events.publish("page:home", "display mode:list")
      this.userProvider.localStorage.app.displayMode="list"
    }
    this.navCtrl.pop();
  }

}
