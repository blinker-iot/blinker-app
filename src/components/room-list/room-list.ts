import { Component, EventEmitter, Output, Input, ViewChildren, ViewChild, ElementRef } from '@angular/core';
import { PopoverController } from 'ionic-angular';
// import { DeviceProvider } from '../../providers/device/device';
import { UserProvider } from '../../providers/user/user';


@Component({
  selector: 'room-list',
  templateUrl: 'room-list.html'
})
export class RoomListComponent {

  _roomid = -1;
  @Input()
  set roomid(roomid) {
    this._roomid = roomid
  };
  get roomid() {
    return this._roomid;
  }

  @Output() roomidChange: EventEmitter<number> = new EventEmitter<number>();
  @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter<boolean>();

  @ViewChild('roombox') roombox: ElementRef;

  constructor(
    private popoverCtrl: PopoverController,
    private userProvider: UserProvider,
  ) {
    // this.roomList = deviceProvider.roomList;
  }

  presentRoommenu(myEvent) {
    let popover = this.popoverCtrl.create('RoommenuPage');
    popover.present({
      ev: myEvent
    });
  }

  selectRoom(index) {
    this.roomid = index;
    this.roomidChange.emit(index);
    console.log(this.roombox.nativeElement.children[index + 1].offsetLeft);
  }

  scrollTimer;
  public test(event) {
    this.refresherEnabled.emit(false);
    window.clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => {
      this.refresherEnabled.emit(true);
    }, 500)
  }


}
