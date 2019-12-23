import { Component } from '@angular/core';
import { Events } from '@ionic/angular';

@Component({
  selector: 'room-menu',
  templateUrl: 'room-menu.html',
  styleUrls: ['room-menu.scss']
})
export class RoomMenuComponent {

  constructor(
    // public viewCtrl: ,
    public events: Events
  ) {
  }

  gotoPage(page) {
    let message = {
      goto: page
    }
    this.events.publish('page:home', message);
    // this.viewCtrl.dismiss();
  }

}
