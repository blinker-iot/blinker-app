import { Component, Input, ViewChild, Output, EventEmitter, QueryList, ViewChildren, ElementRef, Renderer2 } from '@angular/core';
import { DeviceProvider } from '../../providers/device/device';
import { Content, Slides } from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import Sortable from 'sortablejs';
// import Swiper from 'swiper';

@Component({
  selector: 'deviceblock-homelist',
  templateUrl: 'deviceblock-homelist.html'
})
export class DeviceblockHomelistComponent {
  loaded = false;
  _roomid = -1;
  @Input()
  set roomid(roomid) {
    if (this.loaded)
      this.goToSlide(roomid + 1)
    this._roomid = roomid
  };

  @Output() roomidChange: EventEmitter<number> = new EventEmitter<number>();
  @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter<boolean>();

  @ViewChild(Slides) slides: Slides;
  @ViewChildren("devicebox") devicebox: QueryList<ElementRef>;
  // @ViewChildren("slides") slides: QueryList<ElementRef>;

  deviceBlock = 'deviceBlock';
  slide;

  constructor(
    private deviceProvider: DeviceProvider,
    public userProvider: UserProvider,
    private renderer: Renderer2,
    public content: Content,
  ) {
  }

  ngAfterViewInit() {
    this.loaded = true;
    this.initSortable();
    // this.initSwiper();
  }

  ngOnDestroy() {
    window.clearTimeout(this.saveDeviceListTimer);
  }

  slideChanged() {
    let currentIndex = this.slides.getActiveIndex();
    if (currentIndex < this.slides.length())
      this.roomidChange.emit(currentIndex - 1)
    console.log('Current index is', currentIndex - 1);
  }

  goToSlide(index) {
    this.slides.slideTo(index, 500, false);
  }

  device(deviceName) {
    console.log(deviceName)
    return this.deviceProvider.devices[deviceName];
  }

  sortable;
  // box: ElementRef;
  initSortable() {
    let box = this.devicebox.first;
    if (typeof box == 'undefined') return;
    console.log("init Sortablejs");
    this.sortable = new Sortable(box.nativeElement, {
      delay: 500,
      touchStartThreshold: 5,
      animation: 100,
      chosenClass: "schosen",
      // ghostClass:"ghost",
      dragClass: "sdrag",
      draggable: ".deviceblock",
      filter: ".device-space",
      dataIdAttr: "ng-reflect-sort-id",
      // forceFallback: true,
      onStart: (event: any) => {
        console.log("drag start");
        this.slides.lockSwipes(true);
        // this.mySwiper.detachEvents();
        this.refresherEnabled.emit(false);
        this.fixSortable();
        this.waitSaveDeviceList();
      },
      onEnd: (event: any) => {
        console.log("drag end");
        this.slides.lockSwipes(false);
        // this.mySwiper.attachEvents();
        this.refresherEnabled.emit(true);
        this.unfixSortable();
        this.saveDeviceList();
      },
    });
  }

  // mySwiper;
  // initSwiper() {
  //   this.mySwiper = new Swiper('.swiper-container', {
  //   });
  // }

  // disableSortable() {
  //   this.sortable.option("disabled", true);
  // }
  // enableSortable() {
  //   this.sortable.option("disabled", false);
  // }

  saveDeviceListTimer;
  waitSaveDeviceList() {
    window.clearTimeout(this.saveDeviceListTimer);
  }

  saveDeviceList() {
    let deviceList = this.sortable.toArray();
    // console.log(deviceList)
    let userConfig = {
      "deviceList": deviceList
    }
    this.saveDeviceListTimer = window.setTimeout(() => {
      this.userProvider.saveUserConfig(userConfig);
    }, 3000)
  }

  public test(event) {
    if (event.srcElement.scrollTop == 0) {
      this.refresherEnabled.emit(true);
    } else {
      this.refresherEnabled.emit(false);
    }
  }

  fixSortable() {
    this.renderer.addClass(this.slides.getNativeElement().querySelector('ion-slide'), 'fixSortable');
    this.renderer.addClass(this.slides.getNativeElement().querySelector('.swiper-wrapper'), 'fixSortable');
    // this.renderer.addClass(this.content.getNativeElement().querySelector('.swiper-wrapper'), 'fixSortable');
    // this.renderer.addClass(this.content.getNativeElement().querySelector('.swiper-slide'), 'fixSortable');
    this.renderer.addClass(this.content.getNativeElement().querySelector('.scroll-content'), 'fixSortable');
  }

  unfixSortable() {
    this.renderer.removeClass(this.slides.getNativeElement().querySelector('ion-slide'), 'fixSortable');
    this.renderer.removeClass(this.slides.getNativeElement().querySelector('.swiper-wrapper'), 'fixSortable');
    // this.renderer.removeClass(this.content.getNativeElement().querySelector('.swiper-wrapper'), 'fixSortable');
    // this.renderer.removeClass(this.content.getNativeElement().querySelector('.swiper-slide'), 'fixSortable');
    this.renderer.removeClass(this.content.getNativeElement().querySelector('.scroll-content'), 'fixSortable');
  }
}
