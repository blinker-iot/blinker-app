import { Component } from '@angular/core';
import { NavController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';
import { Subscription } from 'rxjs';


@Component({
  selector: 'page-device-update',
  templateUrl: 'device-update.html',
  styleUrls: ['device-update.scss']
})
export class DeviceUpdatePage {
  id;
  device;

  get deviceEnable() {
    return this.device.data['enable']
  }

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

  subscription: Subscription;
  loaded = false;
  ngOnInit(): void {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id]
        if (typeof this.device.data.upgrade == 'undefined' || typeof this.device.data.upgradeData == 'undefined') {
          this.device.data['upgrade'] = false;
          this.device.data['upgradeData'] = {
            step: 0
          }
        }
        this.deviceService.checkDeviceUpdate(this.device).then(result => {
          console.log('OTA State', result);
          this.updateState = result
          if (this.updateState == 1 || this.updateState == 99)
            this.getUpdateState()
        });
        this.deviceService.queryDevice(this.device)
        this.loaded = loaded
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    clearInterval(this.timer);
  }

  updateDevice() {
    this.deviceService.sendData(this.device, '{"set":{"upgrade":true}}');
    this.updateState = 1;
    this.getUpdateState()
  }

  timer;
  tryTimes;
  getUpdateState() {
    this.tryTimes = 0;
    this.timer = setInterval(async () => {
      let state = await this.deviceService.checkDeviceUpdate(this.device);
      // 因为发送更新指令后，设备可能还没进入下载固件状态，因此前两次状态检测跳过
      if (state == 0 || state == -1 || state == -2) {
        this.tryTimes++;
        if (this.tryTimes < 3) {
          return
        }
      }
      if (state == 100) {
        this.updateState = state
        this.hasNewVersion = false;
        clearInterval(this.timer);
      } else if (state < 0) {
        this.updateState = state
        clearInterval(this.timer);
      } else if (state > 0) {
        this.updateState = state
      }
    }, 9000)
  }

  popDevicePage() {
    this.hasNewVersion = false;
    this.navCtrl.pop();
  }
}
