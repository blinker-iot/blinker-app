import { Component, Input, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from '../../../core/services/device.service';
import PullToRefresh from 'pulltorefreshjs';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'deviceblock-homelist',
  templateUrl: 'deviceblock-homelist.html',
  styleUrls: ['deviceblock-homelist.scss']
})
export class DeviceblockHomelistComponent {
  refresherEnabled = true;
  slides;

  loaded;

  slideOpts = {
    zoom: {
      toggle: false
    }
  };

  _roomid = -1;
  @Input()
  set roomid(roomid) {
    this.goToSlide(roomid + 1)
    this._roomid = roomid
  };

  get roomDataList() {
    return this.dataService.room.list
  }

  // @Input() sortableMode = false;

  @Output() roomidChange: EventEmitter<number> = new EventEmitter();

  // @ViewChildren("devicebox") devicebox: QueryList<ElementRef>;

  @ViewChild('refreshZone', { read: ElementRef, static: true }) refreshZone: ElementRef;
  @ViewChild('deviceZone', { read: ElementRef, static: true }) deviceZone: ElementRef;

  constructor(
    private deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService
  ) {
  }

  ngAfterViewInit() {
    this.initRefresh();
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        setTimeout(() => {
          this.loaded = loaded;
        })
        setTimeout(() => {
          this.slides = document.querySelector('ion-slides');
        }, 500);
      }
    })
  }

  async slideChanged(e) {
    let currentIndex = await this.slides.getActiveIndex();
    let length = await this.slides.length();
    if (currentIndex < length)
      this.roomidChange.emit(currentIndex - 1);
    // let currentIndex = this.mySwiper.activeIndex;
    // if (currentIndex < this.mySwiper.slides.length) {
    //   this.roomidChange.emit(currentIndex - 1)
    // }
  }

  goToSlide(index) {
    if (typeof this.slides != 'undefined')
      this.slides.slideTo(index);
  }

  isScrollTop(event) {
    if (event.srcElement.scrollTop == 0) {
      this.refresherEnabled = true;
    } else {
      this.refresherEnabled = false;
    }
  }

  swipeEnabledChanged(e) {
    console.log('swipeEnabledChanged:' + e);
    this.slides.lockSwipes(!e);
    this.refresherEnabled = e;
    if (e)
      this.initRefresh()
    else
      this.destroyRefresh()
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
  }

  async refresh() {
    await this.userService.getAllInfo();
    this.deviceService.searchLocalDevice();
    // this.deviceService.queryDevices();
  }

  destroyRefresh() {
    PullToRefresh.destroyAll();
  }

}
