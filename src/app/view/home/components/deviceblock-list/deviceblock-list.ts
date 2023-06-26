import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChildren,
  QueryList,
  ElementRef,
} from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import Sortable from 'sortablejs';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'deviceblock-list',
  templateUrl: 'deviceblock-list.html',
  styleUrls: ['deviceblock-list.scss'],
})
export class DeviceblockListComponent {

  @Input() sortableMode = false;
  @Output() swipeEnabled: EventEmitter<boolean> = new EventEmitter();
  @Output() refresherEnabled: EventEmitter<boolean> = new EventEmitter();

  @Input() roomName;

  get deviceDataList() {
    if (typeof this.roomName == 'undefined')
      return this.dataService.device.list;
    return this.dataService.room.dict[this.roomName]
  }

  set deviceDataList(list) {
    if (typeof this.roomName == 'undefined')
      this.dataService.device.list = list;
    else
      this.dataService.room.dict[this.roomName] = list;
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  @ViewChildren("sortbox") sortbox: QueryList<ElementRef>;

  options = {
    delay: 500,
    // delayOnTouchOnly: false,
    // supportPointer:false,
    animation: 200,
    touchStartThreshold: 5,
    ghostClass: "sghost",
    chosenClass: "schosen",
    dragClass: "sdrag",
    draggable: ".deviceblock",
    filter: '.device-space',
    dataIdAttr: 'id',
    onChoose: (event: any) => {
      this.swipeEnabled.emit(false);
      this.waitSaveDeviceList();
    },
    onEnd: (event: any) => {
      this.swipeEnabled.emit(true);
      this.saveDeviceList();
    },
  }

  constructor(
    private userService: UserService,
    private router: Router,
    private dataService: DataService
  ) {
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initSortable();
    }, 1000);
  }

  ngOnDestroy() {
    window.clearTimeout(this.saveDeviceListTimer);
  }

  sortable;
  initSortable() {
    let box = this.sortbox.first;
    // let box = this.content.getNativeElement()
    if (typeof box == 'undefined') return;
    // console.log("init Sortablejs");
    this.sortable = new Sortable(box.nativeElement, this.options);
  }

  destroySortable() {
    if (typeof this.sortable == 'undefined') return
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
        "deviceList": this.deviceDataList
      }
    } else {
      userConfig = {
        "roomList": this.dataService.room
      }
    }
    this.saveDeviceListTimer = window.setTimeout(() => {
      this.userService.saveUserConfig(userConfig);
    }, 3000)
  }

  gotoDeviceDashboard(deviceId) {
    if (this.sortableMode) return
    this.router.navigate(['/device', deviceId])
  }

  isScrollTop(event) {
    if (event.srcElement.scrollTop == 0) {
      this.refresherEnabled.emit(true)
    } else {
      this.refresherEnabled.emit(false)
    }
  }
}
