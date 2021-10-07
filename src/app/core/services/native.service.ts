import { Injectable } from '@angular/core';
import { DeviceService } from './device.service';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { Vibration } from '@ionic-native/vibration/ngx';
import { NoticeService } from './notice.service';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class NativeService {

  constructor(
    // private deviceService: DeviceService,
    private geolocation: Geolocation,
    private vibration: Vibration,
    private noticeService: NoticeService,
    private platform: Platform
  ) {
  }

  init() {

  }

  //震动
  vibrate(time = 100) {
    if (this.platform.is('cordova'))
      this.vibration.vibrate(time);
  }

  //AHRS
  ahrsStop() {
    window.removeEventListener("deviceorientation", this.updateAhrs)
  }
  lastSendTime = 0;
  ahrsStart(device) {
    if (device.config.mode == "mqtt") return;
    window.addEventListener("deviceorientation", this.updateAhrs.bind(this, device))
  }

  updateAhrs = (e) => {
    if (new Date().getTime() > this.lastSendTime) {
      this.lastSendTime = new Date().getTime() + 200;
      let ahrsData = `{"ahrs":[${e.alpha.toFixed(0)},${e.beta.toFixed(0)},${e.gamma.toFixed(0)}]}\n`;
      // this.deviceService.sendData(device, ahrsData);
    }
  }

  // 经纬度
  getLocation(device): Promise<void> {
    return this.geolocation.getCurrentPosition({ enableHighAccuracy: true }).then(resp => {
      // console.log(resp);
      let latitude = resp.coords.latitude.toString();
      let longitude = resp.coords.longitude.toString();
      let gps = `{"gps":[${longitude},${latitude}]}\n`;
      // console.log(gps);
      // this.deviceService.sendData(device, gps);
    }).catch((error) => {
      this.noticeService.showAlert('openLocation');
      console.log('Error getting location2', error);
    });
  }

  // 停止震动和AHRS输出
  allStop(device) {
    if (typeof (this.ahrsStop) === 'function') {
      this.ahrsStop();
      device.ahrs = 'stop';
    }
    this.vibrate(0);
  }
}
