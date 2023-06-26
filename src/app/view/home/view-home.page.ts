import {
  Component,
  Input,
  ChangeDetectorRef,
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

  _roomid = -1;
  @Input()
  set roomid(roomid) {
    this._roomid = roomid
    this.cd.detectChanges()
  };
  get roomid() {
    return this._roomid;
  }

  get deviceNum() {
    if (typeof this.dataService.device == 'undefined')
      return
    return this.dataService.device.list.length
  };

  loaded = false;
  showSceneButtonGroup = false;
  showSpinner = false;

  showBg = false;

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
    private dataService: DataService,
    private cd: ChangeDetectorRef
  ) { }

  ngOnInit() {
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
