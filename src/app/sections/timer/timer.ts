import { Component } from '@angular/core';
import { Events } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { TimerService } from './timer.service';
import { UserService } from 'src/app/core/services/user.service';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { DataService } from 'src/app/core/services/data.service';
// import { timeToMinute, minuteToTime } from 'src/app/core/functions/func'


@Component({
  selector: 'blinker-timer',
  templateUrl: 'timer.html',
  styleUrls: ['timer.scss']
})
export class TimerPage {
  tab = 0;
  id;

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get isDebug() {
    // return isDevMode()
    return false
  }

  get deviceConfig() {
    return this.device.config.isDev ? this.devicelistService.devDeviceConfig : this.devicelistService.deviceConfig;
  }

  get isDiy() {
    // if (this.deviceConfig[this.device.deviceType].component == "Layouter2")
    if (this.device.deviceType.indexOf('Diy') > -1)
      return true
    else
      return false
  }

  get device() {
    return this.timerService.currentDevice
  }

  constructor(
    private events: Events,
    private deviceService: DeviceService,
    private dataService: DataService,
    private userService: UserService,
    private activatedRoute: ActivatedRoute,
    private timerService: TimerService,
    private devicelistService: DevicelistService
  ) {

  }

  ngOnInit(): void {
    this.activatedRoute.params.subscribe(params => {
      this.id = params['id'];
      this.dataService.userDataLoader.subscribe(loaded => {
        if (loaded) {
          this.timerService.currentDevice = this.deviceDataDict[this.id];
          if (typeof this.device.data.timing == 'undefined') {
            this.device.data['timing'] = []
          }
          if (typeof this.device.data.countdown == 'undefined') {
            this.device.data['countdown'] = false
          }
          if (typeof this.device.data.loop == 'undefined') {
            this.device.data['loop'] = false
          }
          if (this.device.data.state == 'offline' || this.device.data.state == 'disconnected') {
            console.log('offline');
            this.events.publish("provider:notice", "timingOffline");
            return;
          }
          if (!this.isDiy) {
            this.timerService.getProDeviceCmd(this.device)
          }
        }
      })
    })
  }

}
