import {
  Component,
  EventEmitter,
  Output,
  Input,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'room-list',
  templateUrl: 'room-list.html',
  styleUrls: ['room-list.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
})
export class RoomListComponent {
  _roomid = -1;
  @Input()
  set roomid(roomid) {
    this._roomid = roomid;
  }
  get roomid() {
    return this._roomid;
  }

  get roomDataList() {
    return this.dataService.room?.list || [];
  }

  @Output() roomidChange: EventEmitter<number> = new EventEmitter<number>();
  // @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter<boolean>();

  @ViewChild('roombox', { read: ElementRef, static: true }) roombox: ElementRef;

  constructor(private dataService: DataService) {}

  selectRoom(index) {
    this.roomid = index;
    this.roomidChange.emit(index);
  }
}
