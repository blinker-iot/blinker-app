import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';

import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';
import PullToRefresh from 'pulltorefreshjs';
import { DeviceblockListComponent } from '../deviceblock-list/deviceblock-list';
import { DeviceService } from 'src/app/core/services/device.service';

@Component({
  selector: 'deviceblock-zone',
  templateUrl: 'deviceblock-zone.html',
  styleUrls: ['deviceblock-zone.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [DeviceblockListComponent],
})
export class DeviceblockZone implements AfterViewInit, OnDestroy {
  refresherEnabled = true;
  private scrollElement?: HTMLElement;

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

  get selectedRoomName() {
    if (this.roomid < 0) return undefined;
    return this.roomDataList[this.roomid];
  }

  @Output() roomidChange: EventEmitter<number> = new EventEmitter();

  @ViewChild('refreshZone', { read: ElementRef, static: false })
  refreshZone: ElementRef;
  @ViewChild('deviceZone', { read: ElementRef, static: false })
  deviceZone: ElementRef;

  constructor(
    private deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService
  ) {}

  async ngAfterViewInit() {
    const ionContent = this.deviceZone.nativeElement.closest('ion-content') as
      | (HTMLElement & { getScrollElement?: () => Promise<HTMLElement> })
      | null;
    this.scrollElement = await ionContent?.getScrollElement?.();
    this.initRefresh();
  }

  initRefresh() {
    PullToRefresh.init({
      mainElement: this.refreshZone.nativeElement,
      triggerElement: this.deviceZone.nativeElement,
      instructionsPullToRefresh: ' ',
      instructionsReleaseToRefresh: '释放刷新',
      instructionsRefreshing: '加载中',
      distIgnore: 150,
      refreshTimeout: 1000,
      onRefresh: () => {
        this.refresh();
      },
      shouldPullToRefresh: () => {
        return (
          this.refresherEnabled &&
          !!this.scrollElement &&
          this.scrollElement.scrollTop <= 0
        );
      },
    });
    this.refresherEnabled = true;
  }

  async refresh() {
    if (!this.dataService.auth) return;
    await this.userService.getAllInfo();
    this.deviceService.searchLocalDevice();
  }

  destroyRefresh() {
    PullToRefresh.destroyAll();
  }

  ngOnDestroy() {
    this.destroyRefresh();
  }

  swipeEnabledChanged(e) {
    this.refresherEnabled = e;
  }

  refresherEnabledChanged(e) {
    this.refresherEnabled = e;
  }
}
