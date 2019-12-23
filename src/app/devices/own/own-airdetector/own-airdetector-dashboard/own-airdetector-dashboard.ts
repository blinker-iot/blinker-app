import { Component, ChangeDetectorRef, Input } from '@angular/core';
import { NavController, Events } from '@ionic/angular';
import { Router } from '@angular/router';
import { deviceName12 } from 'src/app/core/functions/func';
import { DeviceComponent } from 'src/app/core/device/device.model';


@Component({
  selector: 'page-own-airdetector-dashboard',
  templateUrl: 'own-airdetector-dashboard.html',
  styleUrls: ['own-airdetector-dashboard.scss']
})

export class OwnAirdetectorDashboard implements DeviceComponent {

  @Input() device;

  private timer;
  showus: boolean = false;
  ico = "fal fa-meh-blank";

  constructor(
    public navCtrl: NavController,
    private router: Router,
    // private deviceProvider: DeviceProvider,
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef,
  ) {
  }

  ngOnInit() {
    if (typeof this.device.data == 'undefined') {
      // this.device = {
      //   "deviceType": "SMARTPLUGv1",
      //   "deviceName": "FFFFFFFFFFFFFFFFFFFFFFFF",
      //   "config": {
      //     "customName": "空气检测器（虚拟）",
      //     "showSwitch": true
      //   },
      //   "data": {}
      // }
    }
    if (typeof this.device.data["AQICN"] == 'undefined') {
      this.device.data["AQICN"] = 0;
      this.device.data["AQIUS"] = 0;
      this.device.data["temp"] = 0;
      this.device.data["humi"] = 0;
      this.device.data["hcho"] = 0;
      this.device.data["pm1.0"] = 0;
      this.device.data["pm2.5"] = 0;
      this.device.data["pm10"] = 0;
    }
  }

  ionViewDidEnter() {
    console.log('创建定时器，29秒更新一次信息');
    this.subscribe();
    // this.deviceProvider.pubMessage(this.device, `{ "get":"state"}`);
    // this.timer = setInterval(() => {
    //   this.deviceProvider.pubMessage(this.device, `{ "get":"state"}`);
    // }, 29000);
    //图标变化测试
    // window.setInterval(() => {
    //   this.device.data.AQICN += 1;
    //   if (this.device.data.AQICN > 360) {
    //     this.device.data.AQICN = 0;
    //   }
    // }, 500);
  }

  ionViewDidLeave() {
    window.clearInterval(this.timer);
    this.unsubscribe();
  }

  subscribe() {
    this.events.subscribe(this.device.deviceName + ':state', message => {
      if (message == "loaded") {
        console.log('刷新页面');
        this.processData();
        this.changeDetectorRef.detectChanges();
      }
    });
  }

  processData() {
    if (this.device.data.AQICN <= 20) {
      this.ico = "fal fa-smile-wink";
    } else if (this.device.data.AQICN > 20 && this.device.data.AQICN <= 50) {
      this.ico = "fal fa-smile";
    } else if (this.device.data.AQICN > 50 && this.device.data.AQICN <= 100) {
      this.ico = "fal fa-meh"
    } else if (this.device.data.AQICN > 100 && this.device.data.AQICN <= 150) {
      this.ico = "fal fa-frown"
    } else if (this.device.data.AQICN > 150 && this.device.data.AQICN <= 200) {
      this.ico = "fal fa-tired"
    } else if (this.device.data.AQICN > 200 && this.device.data.AQICN <= 300) {
      this.ico = "fal fa-dizzy"
    } else if (this.device.data.AQICN > 300) {
      this.ico = "fal fa-skull"
    }
  }

  unsubscribe() {
    this.events.unsubscribe(this.device.deviceName + ':state');
  }

  gotoSettings() {
    // this.navCtrl.push('DeviceSettingsPage', this.device);
  }

  gotoHelp() {
    // this.navCtrl.push('OwnAirdetectorSettingsPage', this.device);
  }

  gotoChart() {
    this.router.navigate(['/device', deviceName12(this.device.deviceName), 'history'])
    // this.navCtrl.push("OwnAirdetectorChartPage", this.device);
  }

}
