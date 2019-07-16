import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
// declare var cordovaNetworkManager;

/*
ap配网功能分三步：
1.搜索当前设备ap热点 
AP:OwnAirdetector_
2.选择要配置的设备，并输入ssid、password
3.等待设备注册
 */

@IonicPage()
@Component({
  selector: 'page-adddevice-apconfig',
  templateUrl: 'adddevice-apconfig.html',
})
export class AdddeviceApconfigPage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {

  }


  // search() {
  //   cordovaNetworkManager.startScan(() => {
  //     cordovaNetworkManager.getScanResults({},
  //       () => {

  //       },
  //       () => { 

  //       })
  //   }, () => {

  //   })
  // }

}
