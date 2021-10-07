import { Pipe, PipeTransform } from '@angular/core';
import { DataService } from 'src/app/core/services/data.service';
import { Trigger } from './auto.model';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { BlinkerDeviceConfig } from 'src/app/core/model/device-config.model';

@Pipe({
  name: 'trigger2text'
})
export class Trigger2textPipe implements PipeTransform {


  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(
    private dataService: DataService,
    private deviceConfigService: DeviceConfigService
  ) { }

  transform(trigger: Trigger, ...args: any[]): any {
    let device: BlinkerDevice = this.deviceDataDict[trigger.deviceId]
    let deviceTriggerConfig;
    if (device.deviceType.indexOf('Diy') > -1) {
      deviceTriggerConfig = this.getDiyDeviceTriggerConfig(device)
    } else {
      deviceTriggerConfig = this.processProDeviceTriggerConfig(device)
    }

    let triggerConfigDict = {}
    deviceTriggerConfig.forEach(triggerItem => {
      triggerConfigDict[triggerItem.source] = triggerItem
    });

    return `${triggerConfigDict[trigger.source].source_zh} ${this.getOperator(trigger)} ${this.getState(trigger, triggerConfigDict)} ${this.getDuration(trigger)}`
  }

  getDiyDeviceTriggerConfig(device: BlinkerDevice) {
    let layouterData = JSON.parse(device.config.layouter)
    if (typeof layouterData.triggers != 'undefined') {
      return layouterData.triggers
    }
    return []
  }

  processProDeviceTriggerConfig(device: BlinkerDevice) {
    let deviceConfig: BlinkerDeviceConfig = this.deviceConfigService.getDeviceConfig(device);
    if (typeof deviceConfig.triggers == "undefined") deviceConfig.triggers = "[]";
    if (deviceConfig.triggers == "") deviceConfig.triggers = "[]";
    return JSON.parse(deviceConfig.triggers);
  }

  getOperator(trigger) {
    if (trigger.operator == '=')
      return '为'
    if (trigger.operator == '>')
      return '大于'
    if (trigger.operator == '<')
      return '小于'
  }

  getState(trigger, triggerConfigDict) {
    if (typeof trigger.value == 'number') {
      return `${trigger.value}${triggerConfigDict[trigger.source].unit}`
    }
    let index = triggerConfigDict[trigger.source].state.indexOf(trigger.value)
    return triggerConfigDict[trigger.source].state_zh[index]
  }

  getDuration(trigger) {
    return trigger.duration > 0 ? `且持续 ${trigger.duration}秒` : ''
  }

}
