import {
  Component,
  EventEmitter,
  Output,
  Input,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  AfterViewInit,
  OnDestroy,
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
export class RoomListComponent implements AfterViewInit, OnDestroy {
  private _roomid = -1;
  private scrollFrame?: number;

  @Input()
  set roomid(roomid: number) {
    this._roomid = roomid;
    this.scheduleSelectedRoomScroll();
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

  ngAfterViewInit() {
    this.scheduleSelectedRoomScroll();
  }

  ngOnDestroy() {
    if (typeof this.scrollFrame !== 'undefined') {
      window.cancelAnimationFrame(this.scrollFrame);
    }
  }

  selectRoom(index: number) {
    this.roomid = index;
    this.roomidChange.emit(index);
  }

  private scheduleSelectedRoomScroll() {
    if (typeof window === 'undefined') return;
    if (typeof this.scrollFrame !== 'undefined') {
      window.cancelAnimationFrame(this.scrollFrame);
    }
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      const container = this.roombox?.nativeElement as HTMLElement | undefined;
      const chip = container?.querySelector<HTMLElement>(
        `[data-room-id="${this.roomid}"]`
      );
      if (!container || !chip) return;

      const left = chip.offsetLeft - (container.clientWidth - chip.offsetWidth) / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    });
  }
}
