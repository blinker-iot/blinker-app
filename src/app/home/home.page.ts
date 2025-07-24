import {
  Component,
  Input,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { RoomListComponent } from './components/room-list/room-list';
import { DeviceblockZone } from './components/deviceblock-zone/deviceblock-zone';
import { ViewService } from '../core/services/view.service';
import { DataService } from '../core/services/data.service';
import { DeviceService } from '../core/services/device.service';
import { ComponentsModule } from '../core/components/components.module';

@Component({
    selector: 'blinker-home',
    templateUrl: 'home.page.html',
    styleUrls: ['home.page.scss'],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        RouterModule,
        TranslateModule,
        ComponentsModule,
        RoomListComponent,
        DeviceblockZone
    ]
})

export class HomePage {

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
      return 0
    else
      return this.dataService.device.list.length
  };

  get user() {
    return this.dataService.user
  };

  loaded = false;

  get sceneDataList() {
    if (typeof this.dataService.scene != 'undefined')
      return this.dataService.scene.list
    return []
  }


  isIos = false;
  isIphonex = false;
  isCordova = false;

  sortableMode = false;

  userDataLoader;

  connected = false;

  constructor(
    private deviceService: DeviceService,
    private router: Router,
    private viewService: ViewService,
    private dataService: DataService,
    private cd: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.userDataLoader = this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.loaded = true;
        this.deviceService.queryDevices();
        console.log(this.deviceService.brokerDataDict['blinker']);
        this.deviceService.brokerDataDict['blinker'].connected.subscribe(connected => {
          this.connected = connected
        })
      }
    })
  }

  ngOnDestroy() {
    this.userDataLoader.unsubscribe()
  }

  ngAfterViewInit() {
    this.viewService.disableMenuSwipe();
    if ('webkitSpeechRecognition' in window) {
      // this.speech()
    } else {
      alert("语音识别API不可用");
    }
  }

  goto(page) {
    this.router.navigate([page])
  }

  // 弹出视图模式菜单
  changeView() {
    this.viewService.changeView();
  }
}
