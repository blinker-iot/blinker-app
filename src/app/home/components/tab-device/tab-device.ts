import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, MenuController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RoomListComponent } from '../room-list/room-list';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { BActcmdListComponent } from '../../../core/components/b-actcmd-list/b-actcmd-list.component';
import { BBottomBtnComponent } from '../../../core/components/b-bottom-btn/b-bottom-btn.component';
import { BChartComponent } from '../../../core/components/b-chart/b-chart.component';
import { BColorpickerComponent } from '../../../core/components/b-colorpicker/b-colorpicker';
import { BColorpickerBtnsComponent } from '../../../core/components/b-colorpicker-btns/b-colorpicker-btns.component';
import { BColorpickerDiscComponent } from '../../../core/components/b-colorpicker-disc/b-colorpicker-disc.component';
import { BDeviceImgComponent } from '../../../core/components/b-device-img/b-device-img.component';
import { BDeviceListComponent } from '../../../core/components/b-device-list/b-device-list.component';
import { BItemListComponent } from '../../../core/components/b-item-list/b-item-list.component';
import { BItemComponent } from '../../../core/components/b-item-list/b-item/b-item';
import { BProgressbarComponent } from '../../../core/components/b-progressbar/b-progressbar.component';
import { BRangeComponent } from '../../../core/components/b-range/b-range';
import { BTimepickerComponent } from '../../../core/components/b-timepicker/b-timepicker.component';
import { BTipComponent } from '../../../core/components/b-tip/b-tip.component';
import { BToastComponent } from '../../../core/components/b-toast/b-toast.component';
import { BToggleComponent } from '../../../core/components/b-toggle/b-toggle.component';
import { BTopBoxComponent } from '../../../core/components/b-top-box/b-top-box.component';
import { DeviceblockList2Component } from '../../../core/components/deviceblock-list2/deviceblock-list2';
import { LangSelectorComponent } from '../../../core/components/lang-selector/lang-selector.component';
import { SceneButtonGroupComponent } from '../../../core/components/scene-button-group/scene-button-group';
import { SceneButtonComponent } from '../../../core/components/scene-button-group/scene-button/scene-button';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';

@Component({
  selector: 'tab-device',
  templateUrl: 'tab-device.html',
  styleUrls: ['tab-device.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule,
    TranslatePipe,
    BActcmdListComponent,
    BBottomBtnComponent,
    BChartComponent,
    BColorpickerComponent,
    BColorpickerBtnsComponent,
    BColorpickerDiscComponent,
    BDeviceImgComponent,
    BDeviceListComponent,
    BItemListComponent,
    BItemComponent,
    BProgressbarComponent,
    BRangeComponent,
    BTimepickerComponent,
    BTipComponent,
    BToastComponent,
    BToggleComponent,
    BTopBoxComponent,
    DeviceblockList2Component,
    LangSelectorComponent,
    SceneButtonGroupComponent,
    SceneButtonComponent,
    RoomListComponent,
    DeviceblockZone,
  ],
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
    if (typeof this.dataService.device == 'undefined') return 0;
    else return this.dataService.device.list.length;
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
  ) {}

  ngOnInit() {
    this.dataService.userDataLoader.subscribe((state) => {
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
