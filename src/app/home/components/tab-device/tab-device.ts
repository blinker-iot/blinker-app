import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, MenuController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { RoomListComponent } from '../room-list/room-list';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { ComponentsModule } from '../../../core/components/components.module';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';

@Component({
  selector: 'tab-device',
  templateUrl: 'tab-device.html',
  styleUrls: ['tab-device.scss'],
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
export class TabDeviceComponent {

  _roomid = -1;
  @Input()
  set roomid(roomid) {
    this._roomid = roomid;
    this.cd.detectChanges();
  }
  get roomid() {
    return this._roomid;
  }

  @Output() roomidChange = new EventEmitter<number>();

  get deviceNum() {
    if (typeof this.dataService.device == 'undefined')
      return 0;
    else
      return this.dataService.device.list.length;
  }

  get loaded() {
    return this.dataService.userDataLoader.value;
  }

  get sceneDataList() {
    if (typeof this.dataService.scene != 'undefined')
      return this.dataService.scene.list;
    return [];
  }

  constructor(
    private dataService: DataService,
    private deviceService: DeviceService,
    private cd: ChangeDetectorRef,
    private menuCtrl: MenuController
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(state => {
      if (state) {
        this.deviceService.queryDevices();
      }
    });
  }

  openMenu() {
    this.menuCtrl.open();
  }

  onRoomidChange(value: number) {
    this._roomid = value;
    this.roomidChange.emit(value);
    this.cd.detectChanges();
  }
}
