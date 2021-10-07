// 用于选择支持trigger的设备
import { Component, Output, EventEmitter } from '@angular/core';
import { DataService } from '../../services/data.service';
import { DeviceConfigService } from '../../services/device-config.service';

@Component({
  selector: 'b-device-list',
  templateUrl: './b-device-list.component.html',
  styleUrls: ['./b-device-list.component.scss'],
})
export class BDeviceListComponent {

  selectedDevice;

  itemList = [];

  @Output() updateDeviceId = new EventEmitter();

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  constructor(
    private dataService: DataService,
    private deviceConfigService: DeviceConfigService
  ) { }

  ngOnInit() {
    this.getAvailableDevices()
  }

  getAvailableDevices() {
    this.deviceDataList.forEach(deviceId => {
      if (this.deviceDataDict[deviceId].deviceType.indexOf('Diy') > -1) {
        this.processDiyDevice(deviceId)
      } else {
        this.processProDevice(deviceId)
      }
    });
  }

  processDiyDevice(deviceId) {
    let layouterData = JSON.parse(this.deviceDataDict[deviceId].config.layouter)
    // console.log(layouterData);
    if (layouterData != null)
      if (typeof layouterData.triggers != 'undefined') {
        if (layouterData.triggers.length > 0)
          this.itemList.push(deviceId);
      }
  }

  processProDevice(deviceId) {
    let deviceConfig = this.deviceConfigService.getDeviceConfig(this.deviceDataDict[deviceId]);
    if (typeof deviceConfig != 'undefined')
      if (typeof deviceConfig.triggers != 'undefined') {
        if (deviceConfig.triggers.length > 10)
          this.itemList.push(deviceId);
      }
  }

  selectDeviceId(deviceId) {
    this.updateDeviceId.emit(deviceId);
  }

}

