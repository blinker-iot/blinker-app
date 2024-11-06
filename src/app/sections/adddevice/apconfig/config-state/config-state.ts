import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { NavController, ModalController, Platform } from '@ionic/angular';
// import { Brightness } from '@awesome-cordova-plugins/brightness/ngx';
import { PlatformLocation } from '@angular/common';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { AdddeviceService } from '../../adddevice.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { NetworkService } from 'src/app/core/services/network.service';
import { UserService } from 'src/app/core/services/user.service';
import { Device } from 'src/app/core/model/device.model';

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
    // private brightness: Brightness,
    private modalCtrl: ModalController,
    private changeDetectorRef: ChangeDetectorRef,
    private deviceListService: DeviceConfigService,
    private deviceService: DeviceService,
    private adddeviceService: AdddeviceService,
    private networkService: NetworkService,
    private userService: UserService
  ) {
  }

  ngOnInit() {
    if (this.location.pathname == '/devcenter/tool/apConfig') {
      this.isDevtool = true;
      this.stepArray = ["发现设备"]
      this.deviceType = "Diy";
    } else {
      this.deviceType = this.location.pathname.split('/')[2];
    }
    // console.log(this.location.pathname);
    // console.log(this.deviceType);
    
  }

  ngAfterViewInit() {
    // this.brightness.setKeepScreenOn(true);
    this.deviceService.disconnectMqttBrokers();
    if (this.platform.is('ios'))
      this.listenResumeAndGetSsid()
    else
      this.configStart();
  }

  ngOnDestroy() {
    if (this.deviceSsid != "") {
      WifiWizard2.disconnect(this.deviceSsid)
      WifiWizard2.connect(this.ssid, true, this.password, 'WPA')
    }
    // this.brightness.setKeepScreenOn(false);
    if (!this.isDevtool) {
      clearTimeout(this.checktimer2);
      clearInterval(this.checktimer1);
    }
    if (typeof this.ws != "undefined") this.ws.close();
    this.deviceService.connectMqttBrokers();
  }

  // IOS使用
  platformResume;
  listenResumeAndGetSsid() {
    this.platformResume = this.platform.resume.subscribe(() => {
      console.log("Resume And Get Ssid")
      WifiWizard2.getConnectedSSID().then(ssid => {
        if (ssid.indexOf(this.deviceType) > -1) {
          this.platformResume.unsubscribe();
          this.deviceService.closeScanMdnsDevice();
          this.deviceSsid = ssid;
          this.changeDetectorRef.detectChanges();
          this.configStart()
        }
      },
        error => {
          console.log(error);
        }
      )
    });
  }

  cancel() {
    if (this.platform.is('cordova')) {
      WifiWizard2.getConnectedSSID().then(ssid => {
        if (this.ssid != ssid) {
          if (this.platform.is('android'))
            WifiWizard2.disconnect(ssid)
          else
            WifiWizard2.iOSDisconnectNetwork(ssid)
        }
      })
    }
    this.modalCtrl.dismiss();
  }

  gotoHome() {
    this.navCtrl.navigateRoot('/');
    this.userService.getAllInfo();
    this.deviceService.queryDevices();
    this.modalCtrl.dismiss();
  }

  configStart() {
    if (this.platform.is('cordova')) {
      this.date1 = new Date();
      this.stepTo(1);
      if (this.platform.is('android'))
        this.searchAndConnectAp()
      else
        this.sendInfoForIos()
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
    console.log(res);
    this.date2 = new Date();
    this.time = this.date2.getTime() - this.date1.getTime();
    console.log("ApConfig成功,耗时：" + this.time + "ms");
    this.device.setDeviceName(res.bssid);
    this.device.setDeviceType(this.deviceType);
    // 检查设备类型是否正确
    // if (!await this.adddeviceService.checkDeviceType(res.ip, this.deviceType)) return;
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
    setTimeout(async () => {
      if (!await this.adddeviceService.addDevice(this.device)) {
        console.log("设备注册失败，服务器响应错误");
        this.stepTo(99);
        return
      }
      this.t1 = window.setTimeout(() => {
        console.log("设备注册失败，配网超时");
        this.stepTo(99);
      }, 51000);
      this.deviceMac = res.bssid;
      this.waitComplete();
    }, 3000);

  }

  checkTimer;
  newDeviceSubject;
  waitComplete() {
    this.newDeviceSubject = this.deviceService.newDeviceSubject.subscribe(deviceId => {
      this.checkAddDevice()
    })
    this.checkTimer = setInterval(() => {
      this.checkAddDevice()
    }, 12000)
  }

  checkAddDevice() {
    this.adddeviceService.checkAddDevice(this.deviceType, this.deviceMac).then(result => {
      if (result) {
        console.log(`注册成功!bssid:${this.deviceMac}`);
        clearTimeout(this.t1);
        clearInterval(this.checkTimer);
        this.newDeviceSubject.unsubscribe();
        setTimeout(() => {
          this.stepTo(4);
        }, 3000);
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
  searchAndConnectAp() {
    WifiWizard2.scan().then(result => {
      console.log(result);
      let notFoundDevice = true;
      result.forEach(async (apInfo: ApInfo) => {
        if (apInfo.SSID.indexOf(this.deviceType) > -1) {
          notFoundDevice = false;
          this.deviceService.closeScanMdnsDevice();
          await this.connectDeviceAp(apInfo);
          this.connectTargetAP();
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
  connectDeviceAp(apInfo: ApInfo) {
    return new Promise<boolean>((resolve, reject) => {
      console.log("连接设备：" + apInfo.SSID);
      return WifiWizard2.connect(apInfo.SSID, true)
        .then(result => {
          // console.log(result);
          this.deviceSsid = apInfo.SSID;
          this.deviceBssid = apInfo.SSID.split('_')[1];
          this.deviceName = apInfo.SSID;
          console.log('已连接到设备，正在发送配网数据');
          this.stepTo(2);
          setTimeout(() => {
            this.ws = new WebSocket('ws://192.168.4.1:81/');
            this.ws.onopen = () => {
              console.log('WebSocket onopen!');
              this.ws.send(`{"ssid":"${this.ssid}","pswd":"${this.password}"}`);
              setTimeout(() => {
                this.ws.close();
                console.log('onopen>断开设备连接');
                resolve(true);
              }, 3000);
            };
            this.ws.onerror = (e) => {
              console.log('websocket error: ', e);
              setTimeout(() => {
                this.ws.send(`{"ssid":"${this.ssid}","pswd":"${this.password}"}`);
              }, 3000);
              setTimeout(() => {
                this.ws.close();
                console.log('onerror>断开设备连接');
                resolve(true);
              }, 6000);
            }
          }, 2000);

        }
        ).catch(error => {
          console.log(error);
        });
    })
  }

  // 连接到原WiFi并注册设备  
  connectTargetAP() {
    WifiWizard2.connect(this.ssid, true, this.password, 'WPA').then(() => {
      let waiter = this.networkService.stateWatcher.subscribe(state => {
        if (state == "wifi")
          WifiWizard2.getConnectedSSID().then(ssid => {
            console.log("当前ssid:" + ssid);
            waiter.unsubscribe();
            if (this.isDevtool) {
              this.waitDeviceMdns();
            } else {
              this.configComplete({
                bssid: this.deviceBssid,
              })
            }
          })
      })
    })
  }

  sendInfoForIos() {
    this.deviceBssid = this.deviceSsid.split('_')[1];
    this.deviceName = this.deviceSsid;
    console.log('已连接到设备，正在发送配网数据');
    this.stepTo(2);
    this.ws = new WebSocket('ws://192.168.4.1:81');
    this.ws.onopen = () => {
      this.ws.send(`{"ssid":"${this.ssid}","pswd":"${this.password}"}`);
      setTimeout(() => {
        this.ws.close();
        WifiWizard2.iOSDisconnectNetwork(this.deviceSsid);
        this.deviceSsid = "";
      }, 1000);
      setTimeout(() => {
        let waiter = this.networkService.stateWatcher.subscribe(state => {
          if (state == "wifi")
            WifiWizard2.getConnectedSSID().then(ssid => {
              console.log("当前ssid:" + ssid);
              waiter.unsubscribe();
              if (this.isDevtool) {
                this.waitDeviceMdns();
              } else {
                this.configComplete({
                  bssid: this.deviceBssid,
                })
              }
            })
        })
      }, 2000);
    }
  }

  checktimer1;
  checktimer2;
  checktimer0;
  waitDeviceMdns() {
    console.log("等待mdns扫描");
    this.deviceService.scanMdnsDevice();
    this.checktimer1 = setInterval(() => {
      console.log('目标设备', this.deviceBssid);
      if (typeof this.deviceService.lanDeviceList[this.deviceBssid] != 'undefined') {
        console.log("设备已连接到局域网");
        if (this.isDevtool) {
          this.configComplete4diy({
            ip: this.deviceService.lanDeviceList[this.deviceBssid].ip,
            bssid: this.deviceBssid,
          });
        } else {
          this.configComplete({
            ip: this.deviceService.lanDeviceList[this.deviceBssid].ip,
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
