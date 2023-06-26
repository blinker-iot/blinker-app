import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceService } from 'src/app/core/services/device.service';
// import { PusherService } from 'src/app/core/services/pusher.service';
import { ViewService } from 'src/app/core/services/view.service';

@Component({
  selector: 'blinker-card',
  templateUrl: './card.page.html',
  styleUrls: ['./card.page.scss'],
})
export class CardPage implements OnInit {
  refresherEnabled = true;
  slides;
  loaded;
  slideOpts = {
    zoom: {
      toggle: false
    },
    pagination: {
      el: '.swiper-pagination',
      dynamicBullets: true,
    },
  };

  cardList = []

  @Input() roomName;

  get deviceDataList() {
    if (typeof this.roomName == 'undefined')
      return this.dataService.device.list;
    return this.dataService.room.dict[this.roomName]
  }

  constructor(
    public deviceService: DeviceService,
    private router: Router,
    // public pusherService: PusherService,
    private plt: Platform,
    public viewService: ViewService,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.dataService.initCompleted.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded;
        // setTimeout(() => {
        //   this.slides = document.querySelector('ion-slides');
        // }, 100);
      }
    })
  }
  // 弹出视图模式菜单
  changeView() {
    this.viewService.changeView();
  }

  goToSlide(index) {
    if (typeof this.slides != 'undefined')
      this.slides.slideTo(index);
  }

  async slideChanged(e) {
    let currentIndex = await this.slides.getActiveIndex();
    let length = await this.slides.length();
    // if (currentIndex < length)
    //   this.roomidChange.emit(currentIndex - 1);
  }

  isScrollTop(event) {
    if (event.srcElement.scrollTop == 0) {
      this.refresherEnabled = true;
    } else {
      this.refresherEnabled = false;
    }
  }
}
