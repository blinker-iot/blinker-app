import { Component, Input, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from '../../../../core/services/device.service';
import { DataService } from 'src/app/core/services/data.service';
import PullToRefresh from 'pulltorefreshjs';

import SwiperCore, { Swiper, Virtual } from 'swiper';

SwiperCore.use([Virtual]);

@Component({
  selector: 'deviceblock-zone',
  templateUrl: 'deviceblock-zone.html',
  styleUrls: ['deviceblock-zone.scss']
})
export class DeviceblockZone {
  refresherEnabled = true;

  swiper: Swiper;

  loaded;

  _roomid = -1;
  currentIndex = -1

  @Input()
  set roomid(roomid) {
    this.goToSlide(roomid + 1)
    this._roomid = roomid
  };

  get roomid() {
    return this._roomid
  }

  get roomDataList() {
    return this.dataService.room.list
  }

  @Output() roomidChange: EventEmitter<number> = new EventEmitter();

  @ViewChild('refreshZone', { read: ElementRef, static: false }) refreshZone: ElementRef;
  @ViewChild('deviceZone', { read: ElementRef, static: false }) deviceZone: ElementRef;

  constructor(
    private deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService
  ) {
  }

  ngOnInit() {
    this.dataService.initCompleted.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded;
      }
    })
  }

  ngAfterViewInit() {
    this.initRefresh();
  }

  onSwiper(swiper) {
    this.swiper = swiper
  }

  slideChanged() {
    this.currentIndex = this.swiper.activeIndex
    if (this.currentIndex < this.swiper.slides.length)
      this.roomidChange.emit(this.currentIndex - 1);
  }

  goToSlide(index) {
    if (typeof this.swiper != 'undefined')
      this.swiper.slideTo(index);
  }

  initRefresh() {
    PullToRefresh.init({
      mainElement: this.refreshZone.nativeElement,
      triggerElement: this.deviceZone.nativeElement,
      instructionsPullToRefresh: " ",
      instructionsReleaseToRefresh: "释放刷新",
      instructionsRefreshing: "加载中",
      distIgnore: 150,
      refreshTimeout: 1000,
      onRefresh: () => {
        this.refresh()
      },
      shouldPullToRefresh: () => {
        return this.refresherEnabled
      }
    });
    this.refresherEnabled = true
  }

  async refresh() {
    await this.userService.getAllInfo();
    this.deviceService.searchLocalDevice();
  }

  destroyRefresh() {
    PullToRefresh.destroyAll();
  }

  swipeEnabledChanged(e) {
    this.refresherEnabled = e;
    if (e) {
      this.initRefresh()
      this.swiper.enable()
    }
    else {
      this.destroyRefresh()
      this.swiper.disable()
    }
  }

  refresherEnabledChanged(e) {
    this.refresherEnabled = e;
  }

  abs(index) {
    return Math.abs(this.currentIndex - 1 - index) < 2
  }

}
