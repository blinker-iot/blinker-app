import { Component } from '@angular/core';
import {
  NavController,
  NavParams,
  Platform,
  Events,
  IonicPage
} from 'ionic-angular';
import { OpenNativeSettings } from '@ionic-native/open-native-settings';

declare var cordovaNetworkManager;
declare var esptouch;

@IonicPage()
@Component({
  selector: 'page-user-devtool-esptouch',
  templateUrl: 'user-devtool-esptouch.html',
})
export class UserDevtoolEsptouchPage {

  myssid: string;
  mypasswd: string;
  is5G: boolean;
  myip: string;
  deviceType;
  loading;
  alert;
  date1;
  date2;
  time;
  platformResume;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public plt: Platform,
    public events: Events,
    private openNativeSettings: OpenNativeSettings
  ) {
    this.deviceType = navParams.data;
  }

  ionViewDidLoad() {
    console.log("PlugConfigPage ionViewDidLoad");
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
    // this.events.unsubscribe('device:new');
    esptouch.stop(res => { console.log(res) }, err => { console.log(err) });
    // window.clearTimeout(this.t1);
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
    let deviceMac = res.split(',')[1].split('=')[1].toUpperCase();
    let deviceIP = res.split(',')[2].split('=')[1];
    deviceIP = deviceIP.substring(0, deviceIP.length - 1);
    // this.events.publish("loading:hide", "");
    let alert = {
      title: '配置成功',
      message:
        `MAC: ${deviceMac}<br />IP: ${deviceIP}`,
      buttons: ['确认']
    }
    this.events.publish("provider:notice", alert);
  }

  openWifiSetting() {
    this.openNativeSettings.open("wifi");
  }
}
