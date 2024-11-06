import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { AdddeviceService } from '../adddevice.service';

@Component({
  selector: 'adddevice-guide',
  templateUrl: 'guide.html',
  styleUrls: ['guide.scss']
})
export class GuidePage {
  deviceType;

  get isDev() {
    return this.addservice.isDev
  }

  get guideText() {
    if (this.isDev)
      return this.deviceConfigService.devDeviceConfig[this.deviceType]["guide"]    
    return this.deviceConfigService.deviceConfigs[this.deviceType]["guide"]
  }

  get descriptionText() {
    if (this.isDev)
      return this.deviceConfigService.devDeviceConfig[this.deviceType]["description"]
    return this.deviceConfigService.deviceConfigs[this.deviceType]["description"]
  }

  get tools() {
    if (this.isDev)
      return this.deviceConfigService.devDeviceConfig[this.deviceType]["configurator"]
    return this.deviceConfigService.deviceConfigs[this.deviceType]["configurator"]
  }

  get image() {
    if (this.isDev)
      return this.deviceConfigService.devDeviceConfig[this.deviceType]["image"]
    return this.deviceConfigService.deviceConfigs[this.deviceType]["image"]
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private deviceConfigService: DeviceConfigService,
    private addservice: AdddeviceService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    // console.log(this.deviceConfigService.deviceConfigs);
    
  }

}
