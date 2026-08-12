import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { RoomListComponent } from '../room-list/room-list';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';

@Component({
  selector: 'tab-device',
  templateUrl: 'tab-device.html',
  styleUrls: ['tab-device.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    RoomListComponent,
    DeviceblockZone,
  ],
})
export class TabDeviceComponent implements OnInit {
  private _roomid = -1;
  private addMenuLayoutFrame?: number;

  @ViewChild('deviceAddMenuTrigger', { read: ElementRef })
  private deviceAddMenuTrigger?: ElementRef<HTMLElement>;

  @ViewChild('deviceContent', { read: ElementRef })
  private deviceContent?: ElementRef<HTMLElement>;

  @ViewChild('deviceAddMenu', { read: ElementRef })
  private deviceAddMenu?: ElementRef<HTMLElement>;

  @Input()
  set roomid(roomid: number) {
    this._roomid = roomid;
  }

  get roomid() {
    return this._roomid;
  }

  @Output() roomidChange = new EventEmitter<number>();

  get deviceNum() {
    return this.dataService.device?.list?.length || 0;
  }

  constructor(
    private dataService: DataService,
    private deviceService: DeviceService,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef,
  ) {
    this.destroyRef.onDestroy(() => {
      if (typeof this.addMenuLayoutFrame !== 'undefined') {
        window.cancelAnimationFrame(this.addMenuLayoutFrame);
      }
    });
  }

  ngOnInit() {
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state) this.deviceService.queryDevices();
        this.cd.markForCheck();
      });
  }

  onRoomidChange(value: number) {
    this._roomid = value;
    this.roomidChange.emit(value);
    this.cd.markForCheck();
  }

  scheduleAddMenuPosition() {
    if (typeof window === 'undefined') return;
    if (typeof this.addMenuLayoutFrame !== 'undefined') {
      window.cancelAnimationFrame(this.addMenuLayoutFrame);
    }

    this.addMenuLayoutFrame = window.requestAnimationFrame(() => {
      this.addMenuLayoutFrame = undefined;
      this.constrainAddMenuToContent();
    });
  }

  private constrainAddMenuToContent() {
    const popover = this.deviceAddMenu?.nativeElement;
    const trigger = this.deviceAddMenuTrigger?.nativeElement;
    const contentBoundary = this.deviceContent?.nativeElement;
    const popoverRoot = popover?.shadowRoot;
    const menu = popoverRoot?.querySelector<HTMLElement>('.popover-content');
    const arrow = popoverRoot?.querySelector<HTMLElement>('.popover-arrow');
    if (!popover || !trigger || !contentBoundary || !menu) return;

    popover.style.setProperty('--offset-x', '0px');
    arrow?.style.removeProperty('translate');

    const boundaryRect = contentBoundary.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.width === 0) return;

    const edgeInset = 12;
    const minLeft = boundaryRect.left + edgeInset;
    const maxRight = boundaryRect.right - edgeInset;
    let offsetX = 0;

    if (menuRect.right > maxRight) {
      offsetX = maxRight - menuRect.right;
    }
    if (menuRect.left + offsetX < minLeft) {
      offsetX += minLeft - (menuRect.left + offsetX);
    }

    popover.style.setProperty('--offset-x', `${offsetX}px`);

    if (arrow) {
      const triggerRect = trigger.getBoundingClientRect();
      const arrowRect = arrow.getBoundingClientRect();
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const shiftedArrowCenter = arrowRect.left + arrowRect.width / 2;
      arrow.style.translate = `${triggerCenter - shiftedArrowCenter}px 0`;
    }
  }

}
