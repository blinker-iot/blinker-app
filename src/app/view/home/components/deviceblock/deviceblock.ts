import {
  Component,
  Input
} from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { AudioService } from 'src/app/core/services/audio.service';

@Component({
  selector: 'deviceblock',
  templateUrl: 'deviceblock.html',
  styleUrls: ['deviceblock.scss']
})
export class Deviceblock {

  @Input() public device: BlinkerDevice;

  get switch() {
    if (typeof this.device == 'undefined')
      return null
    if (this.device.data.switch == 'on')
      return true
    else
      return false
  }

  get enable() {
    if (this.device.config.mode == 'mqtt')
      return this.device.data.enable
    if (this.device.config.mode == 'ble' && this.deviceService.islocalDevice(this.device))
      return true
  }

  constructor(
    public router: Router,
    public deviceService: DeviceService,
    public userService: UserService,
    private audio: AudioService
  ) { }

  gotoDashboard() {
    this.router.navigate(['device/' + this.device.id])
  }

  tapSwitch(e) {
    e.stopPropagation();
    if (this.device.config.mode != "mqtt") return;
    let message;
    if (this.device.data.switch == "off") {
      message = `{"switch":"on"}`;
    } else if (this.device.data.switch == "on") {
      message = `{"switch":"off"}`;
    } else {
      return;
    }
    this.deviceService.pubMessage(this.device, message);
    this.waiting();
  }

  waiting() {
    //显示等待反馈动画
    let oldSwitch = this.device.data.switch
    this.device.data.switch = "waiting";
    let timer;
    let timer2;
    timer = window.setInterval(() => {
      if (this.device.data.switch != "waiting") {
        window.clearInterval(timer);
        window.clearTimeout(timer2);
        this.audio.switch(this.device.data.switch)
      }
    }, 20);
    timer2 = window.setTimeout(() => {
      window.clearInterval(timer);
      this.device.data.switch = oldSwitch;
    }, 3000);
  }
}

