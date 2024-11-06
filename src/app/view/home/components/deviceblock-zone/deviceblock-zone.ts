import { Component, Input, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from '../../../../core/services/device.service';
import { DataService } from 'src/app/core/services/data.service';
import PullToRefresh from 'pulltorefreshjs';
import Splide from '@splidejs/splide';

@Component({
  selector: 'deviceblock-zone',
  templateUrl: 'deviceblock-zone.html',
  styleUrls: ['deviceblock-zone.scss']
})
export class DeviceblockZone {
  refresherEnabled = true;

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
    this.initSplide();
  }

  splide;
  initSplide() {
    this.splide = new Splide('.splide', {
      arrows: false,
      pagination: false
    }).mount();
    this.splide.on('active', (e) => {
      this.currentIndex = this.splide.index
      this.roomidChange.emit(this.currentIndex - 1);
    });
  }

  goToSlide(index) {
    if (this.splide)
      this.splide.go(index);
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
    // if (e) {
    //   this.initRefresh()
    //   this.swiper.enable()
    // }
    // else {
    //   this.destroyRefresh()
    //   this.swiper.disable()
    // }
  }

  refresherEnabledChanged(e) {
    this.refresherEnabled = e;
  }

}
