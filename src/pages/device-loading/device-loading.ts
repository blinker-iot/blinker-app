import { Component } from '@angular/core';
import { 
  // IonicPage, 
  NavController, NavParams, App, Events } from 'ionic-angular';
// import { Layout2Page } from '../layout2/layout2';
import { UserProvider } from '../../providers/user/user';
import { DeviceProvider } from '../../providers/device/device';
import { DeviceManager } from '../../classes/device';


// @IonicPage()
@Component({
  selector: 'page-device-loading',
  templateUrl: 'device-loading.html',
})
export class DeviceLoadingPage {
  deviceManager: DeviceManager;
  errorMessage: string;
  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private app: App,
    private userProvider: UserProvider,
    private deviceProvider: DeviceProvider,
    public events: Events
  ) {
  }

  ionViewDidLoad() {
    this.initApp()
  }

  async initApp() {
    if (!await this.userProvider.getAllInfo()) return;
    // 检查当前用户是否拥有该设备
    if (this.deviceProvider.device == 'undefined') {
      this.errorMessage = '设备不存在，或当前账户无法访问该设备'
      return;
    }
    if (this.deviceProvider.device.config.mode == 'mqtt') {
      this.deviceProvider.connectMqttBroker();
      this.deviceProvider.searchDevice();
      this.deviceProvider.watchNetwork();
    }
    // this.subscribe();
    window.setTimeout(() => {
      if (this.deviceProvider.device.deviceType == 'DiyArduino' || this.deviceProvider.device.deviceType == 'DiyLinux') {
        this.app.getRootNavs()[0].setRoot('Layout2Page', this.deviceProvider.device);
      } else {
        this.app.getRootNavs()[0].setRoot(this.deviceProvider.device.deviceType + 'DashboardPage', this.deviceProvider.device);
      }
    }, 1000);
  }

  // subscribe() {
  //   this.deviceManager = new DeviceManager({ device: this.deviceProvider.device, events: this.events })
  //   this.deviceManager.subscribe();
  // }

  // unsubscribe() {
  //   this.deviceManager.unsubscribe();
  // }

}
