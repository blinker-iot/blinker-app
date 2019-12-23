import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { NavController, ModalController, Platform, Events } from '@ionic/angular';
import { Brightness } from '@ionic-native/brightness/ngx';
import { PlatformLocation } from '@angular/common';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { AdddeviceService } from '../../adddevice.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { NetworkService } from 'src/app/core/services/network.service';
import { UserService } from 'src/app/core/services/user.service';

declare var WifiWizard2;

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
    "连接配置",
    "设备注册",
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

  ws;

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
    private deviceService: DeviceService,
    private adddeviceService: AdddeviceService,
    private networkService: NetworkService,
    private userService: UserService
  ) {
  }

  ngOnInit() {
    if (this.location.pathname == '/devcenter/tool/apconfig') {
      this.isDevtool = true;
      this.stepArray = ["发现设备"]
      this.deviceType = "Diy";
    } else {
      this.deviceType = this.location.pathname.split('/')[2];
    }
  }

  ngAfterViewInit() {
    this.brightness.setKeepScreenOn(true);
    this.configStart();
  }

  ngOnDestroy() {
    if (this.deviceSsid != "") WifiWizard2.disconnect(this.deviceSsid);
    this.brightness.setKeepScreenOn(false);
    if (!this.isDevtool) {
      clearInterval(this.checktimer1);
      clearTimeout(this.checktimer2);
    }
    if (typeof this.ws != "undefined") this.ws.close();
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
      this.stepTo(1);
      if (this.platform.is('android'))
        this.searchSsid();
      else {

      }
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

  //DIY设备直接弹出成功对话框
  mac;
  ip;
  async configComplete4diy(res) {
    console.log(res);
    this.date2 = new Date();
    this.time = this.date2.getTime() - this.date1.getTime();
    console.log("配置成功,耗时：" + this.time + "ms");
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
    if (!await this.adddeviceService.checkDeviceType(res.ip, this.deviceType)) return;
    //连接服务器注册设备
    this.stepTo(3);
    console.log('注册设备' + res.bssid);
    // 判断是否为开发者正在开发的设备
    if (this.isDev) {
      console.log('is Dev Device');
      this.device.setDevMode();
      this.device.setCustomName(this.deviceListService.devDeviceConfig[this.deviceType].name);
      this.device.setImage(this.deviceListService.devDeviceConfig[this.deviceType].image);
    }
    if (!await this.adddeviceService.addDevice(this.device)) {
      console.log("设备注册失败");
      this.stepTo(99);
      return
    }
    this.t1 = window.setTimeout(() => {
      console.log("设备注册失败");
      this.stepTo(99);
    }, 51000);
    this.deviceMac = res.bssid;
    this.waitComplete();
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

  // 仅android可用  
  searchSsid() {
    WifiWizard2.scan().then(result => {
      console.log(result);
      let notFoundDevice = true;
      result.forEach(async (apInfo: ApInfo) => {
        if (apInfo.SSID.indexOf(this.deviceType) > -1) {
          notFoundDevice = false;
          await this.connectAp(apInfo);
        }
      });
      //配置失败,没有发现设备
      if (notFoundDevice) this.stepTo(98);
    })
  }

  // 仅android可用  
  deviceSsid = "";
  deviceBssid = "";
  deviceName = "";
  connectAp(apInfo: ApInfo): Promise<any> {
    console.log("连接设备：" + apInfo.SSID);
    return WifiWizard2.connect(apInfo.SSID, true)
      .then(
        result => {
          console.log(result);
          this.deviceSsid = apInfo.SSID;
          this.deviceBssid = apInfo.SSID.split('_')[1];
          this.deviceName = apInfo.SSID;
          console.log('已连接到设备，正在发送配网数据');
          this.ws = new WebSocket('ws://192.168.4.1:81');
          this.ws.onopen = () => {
            this.ws.send(`{"ssid":"${this.ssid}","pswd":"${this.password}"}`);
            setTimeout(() => {
              this.ws.close();
              WifiWizard2.disconnect(this.deviceSsid);
              this.deviceSsid = "";
              console.log('断开设备连接');
              let waiter = this.networkService.stateWatcher.subscribe(state => {
                if (state == "wifi")
                  WifiWizard2.getConnectedSSID().then(ssid => {
                    if (ssid == this.ssid) {
                      waiter.unsubscribe();
                      this.waitDeviceMdns();
                    }
                  })
              })
            }, 1000);
          };
        }
      ).catch(error => {
        console.log(error);
      });
  }

  checktimer1;
  checktimer2;
  checktimer0;
  waitDeviceMdns() {
    console.log("等待mdns扫描");
    this.deviceService.scanMdnsDevice();
    this.checktimer1 = setInterval(() => {
      if (typeof this.deviceService.lanDeviceList[this.deviceName] != 'undefined') {
        console.log("设备已连接到局域网");
        if (this.isDevtool) {
          this.configComplete4diy({
            ip: this.deviceService.lanDeviceList[this.deviceName].ip,
            bssid: this.deviceBssid,
          });
        } else {
          this.configComplete({
            ip: this.deviceService.lanDeviceList[this.deviceName].ip,
            bssid: this.deviceBssid,
          })
        }
        clearInterval(this.checktimer1);
        clearTimeout(this.checktimer2)
      } else {
        console.log(this.deviceService.lanDeviceList);
        console.log('没有在本地找到该设备');
      }
    }, 5000);
    this.checktimer2 = setTimeout(() => {
      clearInterval(this.checktimer1)
    }, 35000);
  }

}

interface ApInfo {
  BSSID: string,
  capabilities: string,
  centerFreq0: number,
  centerFreq1: number,
  channelWidth: number,
  frequency: number,
  level: number,
  SSID: string,
  timestamp: number
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
