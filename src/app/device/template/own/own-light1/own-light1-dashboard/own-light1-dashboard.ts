import { Component, Input } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { NativeService } from 'src/app/core/services/native.service';


@Component({
  selector: 'own-light1-dashboard',
  templateUrl: 'own-light1-dashboard.html',
  styleUrls: ['own-light1-dashboard.scss']
})
export class OwnLight1Dashboard {

  @Input() device;

  sendMode = 0;
  sendColortemp = 0;
  sendBrightness = 0;

  set mode(mode) {
    this.device.data['mode'] = mode;
  }

  get mode() {
    if (typeof this.device.data['mode'] == 'undefined') return 0
    return this.device.data['mode']
  }

  get brightness() {
    if (typeof this.device.data['brt'] == 'undefined') return 0;
    return this.device.data['brt']
  }

  get colortemp() {
    if (typeof this.device.data['crt'] == 'undefined') return 0;
    return this.device.data['crt']
  }

  get switch() {
    if (this.device.data.switch == 'on')
      return true
    return false
  }

  get state() {
    if (typeof this.device.data['state'] == 'undefined') return 'offline'
    return this.device.data['state']
  }

  constructor(
    private deviceService: DeviceService,
    private nativeService: NativeService
  ) { }


  ngOnInit() {
    this.sendMode = this.mode;
    setTimeout(() => {
      this.sendColortemp = this.colortemp;
      this.sendBrightness = this.brightness;
    }, 500);

    console.log(this.device);

  }

  changeMode(mode) {
    this.sendMode = mode;
    this.sendColortemp = this.colortemp;
    this.sendBrightness = this.brightness;
    this.sendData();
  }

  turnSwitch() {
    let message;
    if (this.switch) {
      message = `{"switch":"off"}`
    } else {
      message = `{"switch":"on"}`
    }
    this.deviceService.sendData(this.device, message);
    // this.nativeService.vibrate();
  }

  colortempChange(e) {
    this.sendColortemp = e;
    this.sendBrightness = this.brightness;
    this.sendMode=3
  }

  brightnessChange(e) {
    this.sendBrightness = e;
    this.sendColortemp = this.colortemp;
    this.sendMode=3
  }

  sendData() {
    let message;
    if (this.sendMode == 0) {
      message = `{"set":{"mode":"${this.sendMode}"}}`;
    } else if (this.sendMode == 1) {
      message = `{"set":{"mode":"${this.sendMode}"}}`;
    } else if (this.sendMode == 2) {
      message = `{"set":{"mode":"${this.sendMode}"}}`;
    } else {
      message = `{"set":{"mode":"${this.sendMode}","crt":${this.sendColortemp},"brt":${this.sendBrightness}}}`;
    }
    this.deviceService.sendData(this.device, message)
  }

}
