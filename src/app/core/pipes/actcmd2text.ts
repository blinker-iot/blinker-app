import { Pipe, PipeTransform } from '@angular/core';
import { DataService } from '../services/data.service';
import { DeviceConfigService } from '../services/device-config.service';

@Pipe({
  name: 'actcmd2text',
})
export class Act2TextPipe implements PipeTransform {

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(
    private dataService: DataService,
    private deviceConfigService: DeviceConfigService
  ) { }

  transform(cmd, deviceId) {
    let cmdString: string;
    if (typeof cmd != 'string') {
      cmdString = JSON.stringify(cmd)
    } else {
      cmdString = cmd
    }
    let actions = [];
    if (this.deviceDataDict[deviceId].deviceType.indexOf('Diy') > -1) {
      let deviceConfig = JSON.parse(this.deviceDataDict[deviceId].config.layouter)
      if (deviceConfig == null) return;
      if (typeof deviceConfig == 'undefined') return
      if (typeof deviceConfig.actions == 'undefined') return
      actions = deviceConfig.actions;
    } else {
      let deviceConfig = this.deviceConfigService.getDeviceConfig(deviceId)
      if (typeof deviceConfig.actions == 'undefined' || deviceConfig.actions == "")
        deviceConfig.actions = '[]'
      actions = JSON.parse(deviceConfig.actions);
    }
    let text;
    actions.forEach(action => {
      if (JSON.stringify(action.cmd) == cmdString) {
        text = this.processText(action.text, deviceId);
        return false
      }
    });
    return text
  }

  processText(actText: string, deviceId) {
    return actText.replace(/(\?|？)name/g, this.deviceDataDict[deviceId].config.customName)
  }

}
