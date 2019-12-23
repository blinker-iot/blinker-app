import { Component, OnInit, Input, EventEmitter, Output } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { DevicelistService } from 'src/app/core/services/devicelist.service';

@Component({
  selector: 'dev-prodevice-info',
  templateUrl: './prodevice-info.component.html',
  styleUrls: ['./prodevice-info.component.scss'],
})
export class ProdeviceInfoComponent implements OnInit {

  deviceType = '';
  get prodevice() {
    return this.devcenterService.currentProDevice
  }

  @Output() confirm = new EventEmitter();

  constructor(
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    // private devicelistService: DevicelistService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
  }

  changeComponent(proComponent) {
    this.prodevice['component'] = proComponent
  }

  changeConfigurator(configurator) {
    if (this.hasConfigurator(configurator))
      this.prodevice.configurator.splice(this.prodevice.configurator.indexOf(configurator), 1)
    else
      this.prodevice.configurator.push(configurator)
  }

  hasConfigurator(configurator) {
    return this.prodevice.configurator.indexOf(configurator) > -1;
  }

  upload() {
    let config = {
      component: this.prodevice.component,
      configurator: this.prodevice.configurator,
      description: this.prodevice.description,
      guide: this.prodevice.guide
    }

    this.devcenterService.setProDeviceConfig(this.deviceType, config)
      .then(result => {
        if (result) {
          this.confirm.emit(true)
          // this.devicelistService.getDevDeviceConfig();
        }

      })
  }

}
