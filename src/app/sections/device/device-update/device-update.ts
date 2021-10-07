import { Component } from '@angular/core';
import { NavController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'page-device-update',
  templateUrl: 'device-update.html',
  styleUrls: ['device-update.scss']
})
export class DeviceUpdatePage {
  id;
  device;
  
  isUpdating = false;

  get updateState() {
    return this.device.data['upgradeData']['step']
  }

  set updateState(updateState) {
    this.device.data['upgradeData']['step'] = updateState
  }

  get hasNewVersion() {
    return this.device.data['hasNewVersion']
  }

  set hasNewVersion(hasNewVersion) {
    this.device.data['hasNewVersion'] = hasNewVersion
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    public deviceService: DeviceService,
    private dataService: DataService,
    public userService: UserService,
    private navCtrl: NavController
  ) { }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id]
    if (typeof this.device.data.upgrade == 'undefined' || typeof this.device.data.upgradeData == 'undefined') {
      this.device.data['upgrade'] = false;
      this.device.data['upgradeData'] = {
        step: 0
      }
    }
    this.deviceService.checkDeviceUpdate(this.device).then(result => {
      this.updateState = result
      if (this.updateState == 1 || this.updateState == 99)
        this.getUpdateState()
    });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  updateDevice() {
    this.deviceService.sendData(this.device, '{"set":{"upgrade":true}}');
    this.updateState = 1;
    this.isUpdating = true;
    this.getUpdateState()
  }

  timer;
  getUpdateState() {
    this.timer = window.setInterval(async () => {
      this.updateState = await this.deviceService.checkDeviceUpdate(this.device);
      if (this.updateState == 100) {
        this.device.data.hasNewVersion = false;
        clearInterval(this.timer);
      } else if (this.updateState == -1 || this.updateState == -2) {
        clearInterval(this.timer);
      }
    }, 11000)
  }

  popDevicePage() {
    this.device.data.hasNewVersion = false;
    this.navCtrl.pop();
  }

}
