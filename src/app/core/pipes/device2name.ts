import { Pipe, PipeTransform } from '@angular/core';
import { DataService } from '../services/data.service';
import { DeviceConfigService } from '../services/device-config.service';

@Pipe({
    name: 'device2name',
})
export class Device2NamePipe implements PipeTransform {

    constructor(
        private deviceConfigService: DeviceConfigService
    ) { }

    transform(device) {
        try {
            let deviceConfig = this.deviceConfigService.getDeviceConfig(device)
            if (deviceConfig.name == 'Arduino' || deviceConfig.name == 'Linux设备')
                return deviceConfig.vender
            return deviceConfig.vender + '·' + deviceConfig.name
        } catch (error) {
            return 'Unknown'
        }
    }

}
