import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
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
      return this.devicelistService.devDeviceConfig[this.deviceType]["guide"]
    return this.devicelistService.deviceConfig[this.deviceType]["guide"]
  }

  get descriptionText() {
    if (this.isDev)
      return this.devicelistService.devDeviceConfig[this.deviceType]["description"]
    return this.devicelistService.deviceConfig[this.deviceType]["description"]
  }

  get tools() {
    if (this.isDev)
      return this.devicelistService.devDeviceConfig[this.deviceType]["configurator"]
    return this.devicelistService.deviceConfig[this.deviceType]["configurator"]
  }

  get image() {
    if (this.isDev)
      return this.devicelistService.devDeviceConfig[this.deviceType]["image"]
    return this.devicelistService.deviceConfig[this.deviceType]["image"]
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private devicelistService: DevicelistService,
    private addservice: AdddeviceService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
  }

}
