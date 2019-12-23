import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { NavController, ModalController, Platform, Events } from '@ionic/angular';
import { Brightness } from '@ionic-native/brightness/ngx';
import { UserService } from 'src/app/core/services/user.service';
import { PlatformLocation } from '@angular/common';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { AdddeviceService } from '../../adddevice.service';

declare var esptouch;

@Component({
  selector: 'config-state',
  templateUrl: 'config-state.html',
  styleUrls: ['config-state.scss']
})
export class ConfigStatePage {

  @Input() ssid;
  @Input() password;

  step = 0;
  stepArray = [
    "发现设备",
    "注册设备",
    "等待连接",
    "完成配置"
  ]

  deviceType: string;
  deviceMac: string;
  isDevtool;
  device = new Device;
  date1;
  date2;
  time;
  t1;

  get isDev() {
    return this.adddeviceService.isDev
  }

  constructor(
    private location: PlatformLocation,
    private platform: Platform,
    private navCtrl: NavController,
    private brightness: Brightness,
    private modalCtrl: ModalController,
    private changeDetectorRef: ChangeDetectorRef,
    private events: Events,
    private deviceListService: DevicelistService,
    private adddeviceService: AdddeviceService,
    private userService: UserService
  ) {
  }

  ngOnInit() {
    if (this.location.pathname == '/devcenter/tool/esptouch') {
      this.isDevtool = true;
      this.stepArray = ["发现设备"]
    } else {
      this.deviceType = this.location.pathname.split('/')[2];
    }
  }

  ngAfterViewInit() {
    this.brightness.setKeepScreenOn(true);
    this.configStart();
  }

  ngOnDestroy() {
    esptouch.stop(res => { console.log('esptouch stop') }, err => { console.log(err) });
    this.brightness.setKeepScreenOn(false);
    if (!this.isDevtool) {
      this.events.unsubscribe('device:new');
      this.events.publish("loading:hide", "");
      clearTimeout(this.t1);
      clearInterval(this.checkTimer);
    }
  }

  cancel() {
    this.modalCtrl.dismiss();
  }

  gotoHome() {
    this.navCtrl.navigateRoot('/');
    this.userService.getAllInfo();
    this.modalCtrl.dismiss();
  }

  configStart() {
    if (this.platform.is('cordova')) {
      this.date1 = new Date();
      console.log("开始配置");
      this.stepTo(1);
      esptouch.start(this.ssid, "00:00:00:00:00:00", this.password, "9", "1",
        result => {
          this.stepTo(2);
          if (this.isDevtool)
            this.configComplete4diy(result)
          else
            this.configComplete(result)
        },
        error => { this.configError(error) });
    } else {
      this.step = 1;
      setTimeout(() => {
        this.step = 2;
      }, 3000);
      setTimeout(() => {
        this.step = 3;
      }, 4000);
      setTimeout(() => {
        this.step = 4;
      }, 5000);
      setTimeout(() => {
        this.step = 99;
      }, 10000);
    }
  }

  //配置失败,没有发现设备
  configError(err) {
    console.log(err)
    this.stepTo(98);
  }

  //DIY设备直接弹出成功对话框
  mac;
  ip;
  async configComplete4diy(res) {
    console.log(res);
    this.date2 = new Date();
    this.time = this.date2.getTime() - this.date1.getTime();
    console.log("SmartConfig成功,耗时：" + this.time + "ms");
    esptouch.stop();
    this.mac = res.bssid;
    this.ip = res.ip;
    this.stepTo(2);
  }

  //配置成功
  async configComplete(res) {
    this.stepTo(2);
    console.log(res);
    this.date2 = new Date();
    this.time = this.date2.getTime() - this.date1.getTime();
    console.log("SmartConfig成功,耗时：" + this.time + "ms");
    this.device.setDeviceName(res.bssid);
    this.device.setDeviceType(this.deviceType);
    setTimeout(async () => {
      if (!await this.adddeviceService.checkDeviceType(res.ip, this.deviceType)) return;
      //连接服务器注册设备
      this.stepTo(2);
      console.log('注册设备' + res.bssid);
      esptouch.stop();
      // 判断是否为开发者正在开发的设备
      if (this.isDev) {
        this.device.setDevMode();
        this.device.setCustomName(this.deviceListService.devDeviceConfig[this.deviceType].name);
        this.device.setImage(this.deviceListService.devDeviceConfig[this.deviceType].image);
      }
      if (!await this.adddeviceService.addDevice(this.device)) {
        console.log("设备注册失败");
        this.stepTo(99);
        return
      }
      this.stepTo(3);
      this.t1 = window.setTimeout(() => {
        console.log("设备注册失败");
        this.stepTo(99);
      }, 51000);
      this.deviceMac = res.bssid;
      this.waitComplete();
    }, 3000);
  }

  checkTimer;
  waitComplete() {
    this.events.subscribe('device:new', message => {
      this.checkAddDevice()
    });
    this.checkTimer = setInterval(() => {
      this.checkAddDevice()
    }, 12000)
  }

  checkAddDevice() {
    // console.log(this.deviceType, this.deviceMac);
    this.adddeviceService.checkAddDevice(this.deviceType, this.deviceMac).then(result => {
      if (result) {
        console.log(`注册成功!bssid:${this.deviceMac}`);
        clearTimeout(this.t1);
        clearInterval(this.checkTimer);
        this.events.unsubscribe('device:new');
        this.stepTo(4);
      }
    });
  }

  stepTo(step) {
    setTimeout(() => {
      this.step = step;
      this.changeDetectorRef.detectChanges();
    }, 100);
  }

  isDone(i) {
    return this.step > i
  }

}

class Device {
  deviceType: string;
  image: string;
  mqttBroker: string;
  productKey: string;
  deviceName: string;
  customName: string;
  config: any;

  setProductKey(productKey: string) {
    this.productKey = productKey;
  }

  setDeviceName(deviceName: string) {
    this.deviceName = deviceName;
  }

  setDeviceType(deviceType: string) {
    this.deviceType = deviceType;
  }

  setDevMode() {
    this.config = {};
    this.config['isDev'] = true;
  }

  setMqttBroker(mqttBroker: string) {
    this.mqttBroker = mqttBroker;
  }

  setImage(image: string) {
    this.config['image'] = image;
  }

  setCustomName(customName: string) {
    this.config['customName'] = customName;
  }
}
