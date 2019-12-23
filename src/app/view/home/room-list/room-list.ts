import { Component, EventEmitter, Output, Input, ViewChild, ElementRef } from '@angular/core';
import { PopoverController } from '@ionic/angular';
// import { DeviceService } from '../../providers/device/device';
import { UserService } from 'src/app/core/services/user.service';
import { RoomMenuComponent } from '../../../core/components/room-menu/room-menu';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'room-list',
  templateUrl: 'room-list.html',
  styleUrls: ['room-list.scss']
})
export class RoomListComponent {

  _roomid = -1;
  @Input()
  set roomid(roomid) {
    // console.log('new index is', roomid);
    this._roomid = roomid
  };
  get roomid() {
    return this._roomid;
  }

  // get roomData() {
  //   return this.dataService.room
  // }

  get roomDataList() {
    return this.dataService.room.list
  }

  loaded = false;

  @Output() roomidChange: EventEmitter<number> = new EventEmitter<number>();
  // @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter<boolean>();

  @ViewChild('roombox',{ read: ElementRef, static: true }) roombox: ElementRef;

  constructor(
    private popoverCtrl: PopoverController,
    private userService: UserService,
    private dataService: DataService
  ) {
  }

  ngOnInit(): void {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
      }
    })
  }

  async presentRoommenu(myEvent) {
    let popover = await this.popoverCtrl.create({
      component: RoomMenuComponent,
      event: event
    });
    await popover.present();
    // popover.present({
    //   ev: myEvent
    // });
  }

  selectRoom(index) {
    this.roomid = index;
    this.roomidChange.emit(index);
    // console.log(this.roombox.nativeElement.children[index + 1].offsetLeft);
    // console.log(this.roombox.nativeElement);
  }

  // scrollTimer;
  // public test(event) {
  //   this.refresherEnabled.emit(false);
  //   window.clearTimeout(this.scrollTimer);
  //   this.scrollTimer = window.setTimeout(() => {
  //     this.refresherEnabled.emit(true);
  //   }, 500)
  // }


}
