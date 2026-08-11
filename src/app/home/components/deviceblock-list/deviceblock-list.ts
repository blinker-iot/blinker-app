import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChildren,
  QueryList,
  ElementRef,
  ViewChild,
  Renderer2,
  ChangeDetectionStrategy,
} from '@angular/core';

import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import Sortable from 'sortablejs';
import { DataService } from 'src/app/core/services/data.service';
import { Deviceblock } from '../deviceblock/deviceblock';

@Component({
  selector: 'deviceblock-list',
  templateUrl: 'deviceblock-list.html',
  styleUrls: ['deviceblock-list.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Deviceblock],
})
export class DeviceblockListComponent {
  @Output() swipeEnabled: EventEmitter<boolean> = new EventEmitter();
  @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter();

  @Input() roomName;

  get deviceDataList() {
    if (typeof this.roomName == 'undefined')
      return this.dataService.device.list;
    return this.dataService.room.dict[this.roomName];
  }

  set deviceDataList(list) {
    if (typeof this.roomName == 'undefined')
      this.dataService.device.list = list;
    else this.dataService.room.dict[this.roomName] = list;
  }

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  @ViewChild('sortbox') sortbox: ElementRef;

  // @ViewChild("deviceblock", { read: ElementRef, static: true }) deviceblock: ElementRef;

  options = {
    delay: 200,
    touchStartThreshold: 0,
    ghostClass: 'sghost',
    chosenClass: 'schosen',
    dragClass: 'sdrag',
    draggable: '.deviceblock',
    dataIdAttr: 'id',
    onChoose: (event: any) => {
      console.log('onChoose', event);
      // this.swipeEnabled.emit(false);
      this.waitSaveDeviceList();
    },
    onStart: (event: any) => {
      console.log('onStart', event);
      // this.swipeEnabled.emit(false);
      // this.waitSaveDeviceList();
    },
    onEnd: (event: any) => {
      console.log('onEnd');
      console.log('onEnd', event);
      this.swipeEnabled.emit(true);
      this.saveDeviceList();
    },
  };

  constructor(
    private userService: UserService,
    private router: Router,
    private dataService: DataService // public render: Renderer2
  ) {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.initSortable();
    }, 2000);
  }

  ngOnDestroy() {
    window.clearTimeout(this.saveDeviceListTimer);
  }

  sortable;
  initSortable() {
    this.sortable = new Sortable(this.sortbox.nativeElement, this.options);
    // console.log("sortable", this.sortbox.nativeElement, this.sortable);
  }

  destroySortable() {
    if (typeof this.sortable == 'undefined') return;
    this.sortable.destroy();
  }

  saveDeviceListTimer;
  waitSaveDeviceList() {
    window.clearTimeout(this.saveDeviceListTimer);
  }

  saveDeviceList() {
    this.deviceDataList = this.sortable.toArray();
    let userConfig;
    if (typeof this.roomName == 'undefined') {
      userConfig = {
        deviceList: this.deviceDataList,
      };
    } else {
      userConfig = {
        roomList: this.dataService.room,
      };
    }
    this.saveDeviceListTimer = window.setTimeout(() => {
      this.userService.saveUserConfig(userConfig);
    }, 3000);
  }

  isScrollTop(event) {
    if (event.srcElement.scrollTop == 0) {
      this.refresherEnabled.emit(true);
    } else {
      this.refresherEnabled.emit(false);
    }
  }

  gotoDashboard(deviceId) {
    this.router.navigate(['device/' + deviceId]);
  }

  press() {
    console.log('press');
  }

  // isSorting = false;
  // longPressTimer: any;
  // LONG_PRESS_DELAY = 500;

  // press(event) {
  //   // event.stopPropagation();
  //   console.log(event);

  //   if (this.isSorting) return;
  //   this.longPressTimer = setTimeout(() => {
  //     this.enterSortingMode();
  //   }, this.LONG_PRESS_DELAY);
  // }

  // pressup(event) {
  //   console.log('pressup');

  //   clearTimeout(this.longPressTimer);
  //   this.exitSortingMode();
  // }

  // enterSortingMode() {
  //   this.isSorting = true;
  //   this.swipeEnabled.emit(false); // 禁用父组件滑动
  //   setTimeout(() => {
  //     console.log('进入排序模式');
  //     this.initSortable();
  //   }, 0);
  // }

  // exitSortingMode() {
  //   this.isSorting = false;
  //   this.swipeEnabled.emit(true); // 恢复父组件滑动
  //   this.destroySortable();
  // }

  // mouseupEvent;
  // touchendEvent;
  // listenGesture() {
  //   // 修复手指移动后无法触发pressup的问题
  //   this.mouseupEvent = this.render.listen(this.sortbox.nativeElement, 'mouseup', e => this.pressup(e));
  //   this.touchendEvent = this.render.listen(this.sortbox.nativeElement, 'touchend', e => this.pressup(e));
  // }

  // unlistenGesture() {
  //   this.mouseupEvent();
  //   this.touchendEvent();
  // }
}
