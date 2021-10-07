import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TimerService } from './timer.service';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'blinker-timer',
  templateUrl: 'timer.html',
  styleUrls: ['timer.scss']
})
export class TimerPage {
  selectedIndex = 0;
  deviceId;

  device;

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get deviceConfig() {
    return this.device.config.isDev ? this.deviceConfigService.devDeviceConfig : this.deviceConfigService.deviceConfigs;
  }

  get isDiy() {
    // if (this.deviceConfig[this.device.deviceType].component == "Layouter2")
    if (this.device.deviceType.indexOf('Diy') > -1)
      return true
    else
      return false
  }

  constructor(
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
    private deviceConfigService: DeviceConfigService,
    private timerService: TimerService,
    private noticeService: NoticeService,
    private router: Router
  ) {

  }

  ngOnInit(): void {
    this.activatedRoute.params.subscribe(params => {
      this.deviceId = params['deviceId'];
      // console.log(this.deviceId);
      this.dataService.userDataLoader.subscribe(loaded => {
        if (loaded) {
          this.device = this.deviceDataDict[this.deviceId];
          this.timerService.currentDevice = this.device;
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
            this.noticeService.showAlert('timingOffline')
            return;
          }
        }
      })
    })
  }

  tabBarTabOnPress(pressParam: any) {
    this.selectedIndex = pressParam.index;
    switch (this.selectedIndex) {
      case 0:
        this.router.navigate(['timer', this.deviceId, 'timing'])
        break;
      case 1:
        this.router.navigate(['timer', this.deviceId, 'countdown'])
        break;
      default:
        break;
    }
  }

}
