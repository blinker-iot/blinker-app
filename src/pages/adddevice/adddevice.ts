import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-adddevice',
  templateUrl: 'adddevice.html'
})
export class AddDevicePage {
  searchQuery: string = '';
  items = [];

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
  ) {
  }

  ionViewDidLoad() {
    this.initializeItems();
  }

  initializeItems() {
    this.items = [
      {
        vendername: "DIY设备",
        devices: [
          {
            vender: "Diy",
            deviceType: "DiyArduino",
            name: "Arduino",
            image: "diyarduino.png"
          }, {
            vender: "Diy",
            deviceType: "DiyLinux",
            name: "Linux设备",
            image: "diylinux.png"
          }
        ]
      },
      {
        vendername: "专属设备",
        devices: [
          {
            vender: "Own",
            deviceType: "OwnPlug",
            name: "WiFi插座",
            image: "ownplug.png"
          }, {
            //   vender: "Own",
            //   deviceType: "OwnEnvdetector",
            //   name: "环境检测器",
            //   image: "ownenvdetector.png"
            // }, {
            vender: "Own",
            deviceType: "OwnAirdetector",
            name: "空气检测器",
            image: "ownairdetector.png"
          }, {
            vender: "Own",
            deviceType: "OwnLight",
            name: "氛围灯",
            image: "ownlight.png"
          },
          // {
          //   vender: "Own",
          //   deviceType: "OwnHumidifier",
          //   name: "加湿器",
          //   image: "ownhumidifier.png"
          // }
        ]
      },
      {
        vendername: "阿里/天猫",
        devices: [
          {
            vender: "Ali",
            deviceType: "AliGenie",
            name: "天猫精灵",
            image: "aligenie.png"
          },
        ]
      }
      // {
      //   vendername: "OpenJumper",
      //   devices: [
      //     {
      //       vender: "OpenJumper",
      //       deviceType: "OpenJumperRobot",
      //       name: "智能小车",
      //       image: "ownrobot.png"
      //     },
      //   ]
      // },
      // {
      //   vendername: "小米",
      //   devices: [
      //     {
      //       vender: "Mi",
      //       deviceType: "MiScale",
      //       name: "小米体重秤",
      //       image: "miscale.png"
      //     },
      //   ]
      // }
    ];

  }

  getItems(ev: any) {
    this.initializeItems();
    let items2 = [];
    let val = ev.target.value;
    if (val && val.trim() != '') {
      this.items.filter((item) => {
        let itemVendername = item.vendername;
        let itemDevices = item.devices.filter((device) => {
          return (device.name.toLowerCase().indexOf(val.toLowerCase()) > -1);
        });
        if (itemDevices.length > 0) {
          let result = {
            vendername: itemVendername,
            devices: itemDevices
          }
          items2.push(result);
        }
      });
      // console.log(this.items2);
    }
    this.items = items2;
  }

  gotoPage(deviceType) {
    console.log(deviceType);
    this.navCtrl.push(deviceType + "GuidePage");
  }

  isShowSearchbar = false;
  switchSearchbar() {
    this.isShowSearchbar = !this.isShowSearchbar;

  }

}
