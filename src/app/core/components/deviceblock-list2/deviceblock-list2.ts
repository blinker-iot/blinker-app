import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { BDeviceImgComponent } from '../b-device-img/b-device-img.component';

@Component({
    standalone: true,
    imports: [CommonModule, BDeviceImgComponent],
    selector: 'deviceblock-list2',
    templateUrl: 'deviceblock-list2.html',
    styleUrls: ['deviceblock-list2.scss']
})
export class DeviceblockList2Component {
  selectedDeviceIndex;
  selectedDevice;
  @Input() max = 2;
  @Output() update = new EventEmitter();


  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  constructor(
    private dataService: DataService,
  ) { }

  selectDevice(id, device) {
    this.selectedDeviceIndex = id;
    this.update.emit(device);
  }

}
