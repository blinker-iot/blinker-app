import { Component } from '@angular/core';
import { NavController, NavParams, IonicPage, AlertController, Events } from 'ionic-angular';
import { UserProvider } from '../../../../providers/user/user'
import { DeviceProvider } from '../../../../providers/device/device';

@IonicPage()
@Component({
  selector: 'page-own-airdetector-settings',
  templateUrl: 'own-airdetector-settings.html'
})
export class OwnAirdetectorSettingsPage {
  device;
  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private userProvider: UserProvider,
    public alertCtrl: AlertController,
    private deviceProvider: DeviceProvider,
    private events: Events
  ) {
    this.device = navParams.data;
  }

  ionViewWillEnter() {
    console.log('获取version');
    this.deviceProvider.pubMessage(this.device, `{"get":"version"}`);
  }

  switchLight(){
    if (this.device.light=='on'){
      this.deviceProvider.pubMessage(this.device, `{"set":{"light":"off"}`);
    }else{
      this.deviceProvider.pubMessage(this.device, `{"set":{"light":"on"}`);
    }
  }

  unbind() {
    this.showConfirm();
  }

  delDevice() {
    console.log('删除设备 ' + this.device.deviceName);
    this.userProvider.delDevice(this.device).then(result => {
      if (result) {
        console.log('删除设备成功');
        this.events.publish('page:home', 'refresh');
        this.navCtrl.popToRoot();
      } else {
        console.log('删除设备失败');
      }
    });
  }

  showConfirm() {
    let confirm = this.alertCtrl.create({
      title: '确认解除绑定',
      message: '解除绑定后，你将无法控制这个设备，如需控制，可以再次添加这个设备。',
      buttons: [
        {
          text: '取消',
          handler: () => {
          }
        },
        {
          text: '确认解除',
          handler: () => {
            this.delDevice();
          }
        }
      ]
    });
    confirm.present();
  }

}
