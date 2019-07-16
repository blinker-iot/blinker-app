import { Injectable, Renderer2 } from '@angular/core';
import { Events } from 'ionic-angular';
import { DeviceProvider } from '../device/device';
import { Geolocation } from '@ionic-native/geolocation';

@Injectable()
export class NativeProvider {

  constructor(
    public events: Events,
    public render: Renderer2,
    public deviceProvider: DeviceProvider,
    private geolocation: Geolocation,
  ) {
  }

  init() {
    // 震动功能
    this.events.subscribe('native:vibrate', device => {
      if (device.data.hasOwnProperty('vibrate')) {
        if (device.data.vibrate > 0) {
          // console.log("震动");
          // console.log(this.device.vibrate);
          this.vibrate(device.data.vibrate);
          device.data.vibrate = 0;
        }
      }

    });

    //AHRS功能
    this.events.subscribe('native:ahrs', device => {
      // MQTT禁用AHRS输出
      if (device.config.mode == 'mqtt') return;
      if (device.data.hasOwnProperty('ahrs')) {
        if (device.data.ahrs == 'on') {
          // console.log("开启ahrs")
          if (typeof (this.ahrsStop) === 'function')
            this.ahrsStop();
          this.ahrsStart(device);
          device.data.ahrs = 'run';
        } else if (device.data.ahrs == 'off') {
          // console.log("关闭ahrs")
          if (typeof (this.ahrsStop) === 'function') {
            this.ahrsStop();
            device.data.ahrs = 'stop';
          }
        }
      }
    });

    this.events.subscribe('native:gps', device => {
      //输出经纬度功能
      this.getLocation(device);
    });
  }

  //震动
  vibrate(time) {
    navigator.vibrate(time);
    // this.vibration.vibrate(time);
  }

  //AHRS
  ahrsStop: Function;
  lastSendTime = 0;
  ahrsStart(device) {
    if (device.config.mode == "mqtt") return;
    this.ahrsStop = this.render.listen("window", "deviceorientation", (e) => {
      if (new Date().getTime() > this.lastSendTime) {
        this.lastSendTime = new Date().getTime() + 200;
        let ahrsData = `{"ahrs":[${e.alpha.toFixed(0)},${e.beta.toFixed(0)},${e.gamma.toFixed(0)}]}\n`;
        this.deviceProvider.sendData(device, ahrsData);
      }
    });
  }
  // 经纬度
  getLocation(device): Promise<void> {
    return this.geolocation.getCurrentPosition({ enableHighAccuracy: true }).then(resp => {
      // console.log(resp);
      let latitude = resp.coords.latitude.toString();
      let longitude = resp.coords.longitude.toString();
      let gps = `{"gps":[${longitude},${latitude}]}\n`;
      // console.log(gps);
      this.deviceProvider.sendData(device, gps);
    }).catch((error) => {
      console.log('Error getting location', error);
    });
  }

  // 停止震动和AHRS输出
  allStop(device) {
    this.events.unsubscribe('native:vibrate');
    this.events.unsubscribe('native:ahrs');
    this.events.unsubscribe('native:gps');
    if (typeof (this.ahrsStop) === 'function') {
      // console.log('停止ahrs');
      this.ahrsStop();
      device.ahrs = 'stop';
    }
    navigator.vibrate(0);
  }

}
