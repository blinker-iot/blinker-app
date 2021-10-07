import {
  Component,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { ViewService } from '../../core/services/view.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'view-home',
  templateUrl: 'view-home.page.html',
  styleUrls: ['view-home.page.scss'],
})

export class ViewHomePage {

  roomid = -1;

  get deviceNum() {
    if (typeof this.dataService.device == 'undefined')
      return
    return this.dataService.device.list.length
  };

  loaded = false;
  showSceneButtonGroup = false;
  showSpinner = false;

  showBg = false;

  // @ViewChild('sceneZone', { read: ElementRef, static: false }) sceneZone: ElementRef;
  // @ViewChild('headerZone', { read: ElementRef, static: false }) headerZone: ElementRef;

  // get bgPosition() {
  //   if (typeof this.sceneZone == 'undefined') return `0px`
  //   if (this.sceneZone.nativeElement.getBoundingClientRect().bottom == 0) return `0px`
  //   this.bgPosition0 = `${this.sceneZone.nativeElement.getBoundingClientRect().bottom + 10}px`
  //   return this.bgPosition0
  // }
  // bgPosition0 = null;
  bgPosition = `114px`


  get sceneDataList() {
    if (typeof this.dataService.scene != 'undefined')
      return this.dataService.scene.list
    return
  }


  isIos = false;
  isIphonex = false;
  isCordova = false;

  sortableMode = false;

  userDataLoader;

  constructor(
    private deviceService: DeviceService,
    private router: Router,
    private platform: Platform,
    private viewService: ViewService,
    private dataService: DataService
  ) { }

  ngOnInit() {
    // 判断是否为ios、iphonex，以便做适配
    if (this.platform.is('ios')) {
      this.isIos = true;
      if ((window.screen.width == 375) && (window.screen.height == 812)) {
        this.isIphonex = true;
      }
    }

    this.userDataLoader = this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.loaded = true;
        this.deviceService.queryDevices();
      }
    })
  }

  ngOnDestroy() {
    this.userDataLoader.unsubscribe()
  }

  ngAfterViewInit() {
    this.viewService.disableMenuSwipe();
  }

  goto(page) {
    this.router.navigate([page])
  }

  // 弹出视图模式菜单
  changeView() {
    this.viewService.changeView();
  }

}
