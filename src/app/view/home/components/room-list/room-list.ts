import { Component, EventEmitter, Output, Input, ViewChild, ElementRef } from '@angular/core';
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
    this._roomid = roomid
  };
  get roomid() {
    return this._roomid;
  }

  get roomDataList() {
    return this.dataService.room.list
  }

  loaded = false;

  @Output() roomidChange: EventEmitter<number> = new EventEmitter<number>();
  // @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter<boolean>();

  @ViewChild('roombox',{ read: ElementRef, static: true }) roombox: ElementRef;

  constructor(
    private dataService: DataService
  ) {
  }

  ngOnInit(): void {
    this.dataService.initCompleted.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
      }
    })
  }

  selectRoom(index) {
    this.roomid = index;
    this.roomidChange.emit(index);
  }

}
