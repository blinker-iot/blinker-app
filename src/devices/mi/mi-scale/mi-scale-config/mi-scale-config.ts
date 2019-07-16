import { Device } from './../../../../classes/device';

import { UserProvider } from '../../../../providers/user/user';
import { Component } from '@angular/core';
import {
  IonicPage,
  NavController,
  NavParams,
  Events,
  AlertController,
} from 'ionic-angular';
import { BLE } from '@ionic-native/ble';

@IonicPage()
@Component({
  selector: 'page-mi-scale-config',
  templateUrl: 'mi-scale-config.html',
  providers: [BLE]
})
export class MiScaleConfigPage {
  device;
  animateClass: any;
  name = '小米体重秤';
  found = false;
  items = [];

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private ble: BLE,
    public userProvider: UserProvider,
    public alertCtrl: AlertController,
    public events: Events
  ) {
    this.animateClass = { 'fade-in-left-item': true };
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MiScaleConfigPage');
    this.scan();
  }

  scan() {
    console.log("scan");
    this.ble.scan([], 29).subscribe(data => {
      // {"name":"MI_SCALE","id":"88:0F:10:A1:22:AC","advertising":{},"rssi":-53}
      var djson = JSON.parse(JSON.stringify(data));
      if ('name' in djson)
        if (djson.name == 'MI_SCALE') {
          this.found = true;
          this.ble.connect(djson.id).subscribe(data => {
            // console.log(data);
            // console.log(JSON.stringify(data));
            this.ble.startNotification(djson.id, '181d', '2a9d').subscribe(buffer => {
              var d = new Uint8Array(buffer);
              console.log(d);
              this.ble.stopNotification(djson.id, '181d', '2a9d');
              this.ble.disconnect(djson.id);
              this.addDevice(djson.id);
            });
          },
            error => {
              //todo：添加断开重连代码
              console.log(error);
            }
          );
        }
    }, error => {
      console.log(error);
    });
  }

  timeout() {
    setTimeout(() => {

    }, 30000);
  }

  addDevice(deviceName: string) {
    deviceName = deviceName.replace(new RegExp(':', 'g'), '');
    let device = new Device;
    device.setDeviceName(deviceName);
    device.setDeviceType('MiScale');
    console.log('添加设备：' + device.deviceName);
    this.userProvider.addDevice(this.device).then(result => {
      if (result) {
        this.gotoHome();

      } else {
        //弹出设备注册失败信息

      }
    });
  }

  gotoHome() {
    let alert = this.alertCtrl.create({
      title: '设备添加成功',
      message: '现在，你已经可以控制该设备',
      buttons: ['开始使用']
    });
    alert.present()
    this.events.publish('page:home', 'refresh');
    this.navCtrl.popToRoot();
  }

}


