import {
  Component,
  Input,
  ElementRef,
  ViewChild
} from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import { deviceName12 } from 'src/app/core/functions/func';
import { NativeService } from '../../services/native.service';

@Component({
  selector: 'deviceblock',
  templateUrl: 'deviceblock.html',
  styleUrls: ['deviceblock.scss']
})
export class Deviceblock {

  get switch() {
    if (typeof this.device == 'undefined')
      return
    if (this.device.data.switch == 'on')
      return true
    else
      return false
  }

  get state() {
    if (typeof this.device == 'undefined')
      return
    if (this.device.config.mode == 'ble' && this.deviceService.islocalDevice(this.device))
      return true
    if (this.device.data.state == 'online')
      return true
    else
      return false
  }

  @Input() public device: any;

  @ViewChild("audio", { read: ElementRef, static: true }) audio: ElementRef;

  constructor(
    public router: Router,
    public deviceService: DeviceService,
    public userService: UserService,
    private nativeService: NativeService
  ) { }

  ngAfterViewInit() {
    this.audio.nativeElement.src = '';
  }

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
    this.nativeService.vibrate();
    //显示等待反馈动画
    let oldSwitch = this.device.data.switch
    this.device.data.switch = "waiting";
    let timer;
    let timer2;
    timer = window.setInterval(() => {
      if (this.device.data.switch != "waiting") {
        window.clearInterval(timer);
        window.clearTimeout(timer2);
        if (this.device.data.switch == 'on') {
          this.audio.nativeElement.src = `assets/aac/Switch_On.aac`;
        } else if (this.device.data.switch == 'off') {
          this.audio.nativeElement.src = `assets/aac/Switch_Off.aac`;
        }
        setTimeout(() => {
          this.audio.nativeElement.src = '';
        }, 300);
      }
    }, 20);
    timer2 = window.setTimeout(() => {
      window.clearInterval(timer);
      this.device.data.switch = oldSwitch;
    }, 3000);
  }
}

