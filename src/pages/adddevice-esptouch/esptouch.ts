import { Component } from '@angular/core';
import {
  NavController,
  NavParams,
  Platform,
  Events,
  IonicPage
} from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { DeviceProvider } from '../../providers/device/device';
import { Device } from '../../classes/device';
import { OpenNativeSettings } from '@ionic-native/open-native-settings';

// declare var WifiWizard2;
declare var esptouch;
declare var cordovaNetworkManager;

@IonicPage()
@Component({
  selector: 'page-esptouch',
  templateUrl: 'esptouch.html',
})
export class EsptouchPage {
  myssid: string;
  mypasswd: string;
  is5G: boolean;
  myip: string;
  device = new Device;
  deviceType;
  loading;
  alert;
  date1;
  date2;
  time;
  t1;
  platformResume;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public plt: Platform,
    private userProvider: UserProvider,
    private deviceProvider: DeviceProvider,
    public events: Events,
    private openNativeSettings: OpenNativeSettings
  ) {
    this.deviceType = navParams.data;
  }

  ionViewDidLoad() {
    this.getSsid();
    // this.sysSetting = new OpenNativeSettings();
    this.platformResume = this.plt.resume.subscribe(() => {
      console.log("resume getwifissid")
      this.getSsid();
    });
  }

  ionViewDidLeave() {
    console.log("PlugConfigPage ionViewWillLeave");
    this.platformResume.unsubscribe();
    this.events.unsubscribe('device:new');
    this.events.publish("loading:hide", "");
    esptouch.stop(res => { console.log(res) }, err => { console.log(err) });
    window.clearTimeout(this.t1);
  }

  getSsid() {
    cordovaNetworkManager.getCurrentSSID(ssid => { this.ssidHandler(ssid) }, err => { this.ssidFail(err) })
  }

  ssidHandler(ssid) {
    //这里android会多返回两个冒号""
    if (this.plt.is('android'))
      ssid = ssid.slice(1, ssid.length - 1);
    console.log("当前WiFi：" + ssid);
    //WiFi打开，但未连接到任何网络
    if (ssid == "unknown ssid") {
      this.events.publish("provider:notice", "openWifi");
    } else {
      this.myssid = ssid;
      this.is5G = false;
      if (this.myssid.toLowerCase().indexOf('5g') > -1)
        this.is5G = true;
    }
  };
  ssidFail(err) {
    console.log(err);
    this.events.publish("provider:notice", "openWifi");
  };

  configStart() {
    this.events.publish("loading:show", "addDevice");
    this.date1 = new Date();
    console.log("开始配置");
    esptouch.start(this.myssid, "00:00:00:00", this.mypasswd, "NO", 1,
      res => { this.configComplete(res) },
      err => { this.configError(err) });
  }

  //配置失败,没有发现设备
  configError(err) {
    console.log(err)
    this.events.publish("provider:notice", "addDeviceNoFound");
  }

  //配置成功
  async configComplete(res) {
    console.log(res);
    this.date2 = new Date();
    this.time = this.date2.getTime() - this.date1.getTime();
    console.log("SmartConfig成功,耗时：" + this.time + "ms");
    esptouch.stop(res => { console.log(res) }, err => { console.log(err) });
    //连接服务器注册设备
    let deviceName = res.split(',')[1].split('=')[1].toUpperCase();
    this.device.setDeviceName(deviceName);
    this.device.setDeviceType(this.deviceType);
    let deviceIP = res.split(',')[2].split('=')[1];
    deviceIP = deviceIP.substring(0, deviceIP.length - 1);
    let result = await this.userProvider.addDevice(this.device);
    if (result) {
      let result2 = await this.deviceProvider.addDevice3(deviceIP, this.deviceType);
      console.log(result2);
      if (result2) {
        this.t1 = window.setTimeout(() => {
          //先重新拉取设备表确定没有添加成功
          console.log("设备注册失败");
          this.events.publish("provider:notice", "addDeviceTimeout")
          this.navCtrl.pop();
        }, 51000);
        this.events.subscribe('device:new', message => {
          console.log("deviceName:" + deviceName)
          console.log("new device:" + message.fromDevice.substr(0, 12))
          if (message.fromDevice.substr(0, 12) == deviceName) {
            console.log("设备注册成功");
            window.clearTimeout(this.t1);
            // this.events.unsubscribe('device:' + this.device.deviceName);
            this.events.unsubscribe('device:new');
            this.events.publish("provider:notice", "addDeviceSuccess");
            this.events.publish('page:home', 'refresh');
            this.navCtrl.popToRoot();
          }
        });
      }
      // else {
      //   console.log()
      //   //确定addDevice2可能的返回：
      //   //请求超时
      //   this.events.unsubscribe('device:new');
      // }
    }
    // else {
    //确定addDevice1所有的可能返回：
    //1508\1505
    // this.events.unsubscribe('device:new');
    // }
  }

  openWifiSetting() {
    this.openNativeSettings.open("wifi");
  }
}
