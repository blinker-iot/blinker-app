import {
  Component,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import { PusherService } from 'src/app/core/services/pusher.service';
import { Platform, Events } from '@ionic/angular';
import { ViewService } from '../view.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'view-home',
  templateUrl: 'view-home.page.html',
  styleUrls: ['view-home.page.scss'],
})

export class ViewHomePage {

  roomid = -1;

  get deviceNum() {
    return this.dataService.device.list.length
  };

  loaded = false;
  showSceneButtonGroup = false;
  showSpinner = false;
  bgPosition;
  // refresher;
  @ViewChild('contentbox', { read: ElementRef, static: true }) contentbox: ElementRef;
  // @ViewChild('content') content: ElementRef;

  isIos = false;
  isIphonex = false;
  isCordova = false;

  sortableMode = false;

  userDataLoader;

  constructor(
    public deviceService: DeviceService,
    private router: Router,
    private events: Events,
    public pusherService: PusherService,
    private plt: Platform,
    public viewService: ViewService,
    private dataService: DataService
  ) { }

  ngOnInit() {
    // 判断是否真机运行
    if (this.plt.is('cordova')) {
      this.isCordova = true;
    }
    // 判断是否为ios、iphonex，以便做适配
    if (this.plt.is('ios')) {
      this.isIos = true;
      if ((window.screen.width == 375) && (window.screen.height == 812)) {
        this.isIphonex = true;
      }
      setTimeout(() => {
        this.pusherService.setApplicationIconBadgeNumber(0);
      });
    }

    this.dataService.initCompleted.subscribe(state => {
      if (state) {
        this.loaded = true;
      }
    });

    this.userDataLoader = this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.deviceService.queryDevices();
      }
    })
  }

  ngOnDestroy() {
    this.userDataLoader.unsubscribe()
  }

  ngAfterViewInit() {
    this.viewService.setLightStatusBar();
    this.events.publish('menuSwipeEnable', false)
    // this.getBgPosition();
  }

  getBgPosition() {
    setTimeout(() => {
      let rect = this.contentbox.nativeElement.getBoundingClientRect();
      // console.log(rect);
      this.bgPosition = `${rect.top + 65}px`;
    }, 1000);
  }

  showSpeech = false;
  showSpeechModal() {
    this.viewService.showSpeechModal = true;
  }

  goto(page) {
    this.router.navigate([page])
  }

  // 弹出视图模式菜单
  changeView() {
    this.events.publish('changeView', '')
  }

}
