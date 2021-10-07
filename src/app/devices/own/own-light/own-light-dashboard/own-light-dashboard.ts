import { Component, Input } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { OwnLightSelectcolorPage } from '../own-light-selectcolor/own-light-selectcolor';
import { NativeService } from 'src/app/core/services/native.service';

@Component({
  selector: 'own-light-dashboard',
  templateUrl: 'own-light-dashboard.html',
  styleUrls: ['own-light-dashboard.scss']
})
export class OwnLightDashboard {

  @Input() device;

  tab = 0;
  sendMode = "sun";
  sendColortemp = 0;
  sendBrightness = 0;
  sendSpeed = 0;
  sendColor = [0, 0, 0];
  sendColorList=[];
  
  // _sendColorList;
  // get sendColorList() {
  //   if (typeof this._sendColorList == 'undefined')
  //     return this.colorList
  //   return this._sendColorList;
  // }

  // set sendColorList(colorList) {
  //   this._sendColorList = colorList;
  // }

  get switch() {
    if (this.device.data.switch == 'on')
      return true
    return false
  }

  set mode(mode) {
    this.device.data['mode'] = mode;
  }

  get mode() {
    if (typeof this.device.data['mode'] == 'undefined') return 'sun'
    return this.device.data['mode']
  }

  get bgcolor() {
    if (typeof this.device.data['clr'] == 'undefined') return 'rgb(0,118,217)'
    if (this.device.data['clr'].toString() == '0,0,0') return '#000342'
    return `rgb(${this.device.data['clr'].toString()})`
  }

  get color() {
    if (typeof this.device.data['clr'] == 'undefined') return [0, 0, 0];
    return this.device.data['clr']
  }

  get brightness() {
    if (typeof this.device.data['brt'] == 'undefined') return 0;
    return this.device.data['brt']
  }

  get speed() {
    if (typeof this.device.data['spd'] == 'undefined') return 0;
    return this.device.data['spd']
  }

  get colortemp() {
    if (typeof this.device.data['crt'] == 'undefined') return 0;
    return this.device.data['crt']
  }

  get colorList() {
    if (typeof this.device.data['crl'] == 'undefined') return [];
    return this.device.data['crl']
  }

  get state() {
    if (typeof this.device.data['state'] == 'undefined') return 'offline'
    return this.device.data['state']
  }

  constructor(
    private modalCtrl: ModalController,
    private deviceService: DeviceService,
    private nativeService: NativeService
  ) { }


  ngOnInit() {
    if (this.mode == 'std') {
      this.tab = 1
    } else if (this.mode == 'bre') {
      this.tab = 2
    } else if (this.mode == 'stb') {
      this.tab = 3
    } else if (this.mode == 'rc') {
      this.tab = 4
    } else if (this.mode == 'grd') {
      this.tab = 5
    }
    this.sendMode = this.mode;
    console.log('创建定时器，29秒更新一次信息');
    this.mode = 'sun';
    setTimeout(() => {
      this.sendColortemp = this.colortemp;
      this.sendBrightness = this.brightness;
      this.sendSpeed = this.speed;
      this.sendColor = this.color;
    }, 500);
  }

  changeTab(tab) {
    this.tab = tab;
    if (tab == 0) {
      this.sendMode = 'sun'
    } else if (tab == 1) {
      this.sendMode = 'std'
    } else if (tab == 2) {
      this.sendMode = 'bre'
    } else if (tab == 3) {
      this.sendMode = 'stb'
    } else if (tab == 4) {
      this.sendMode = 'rc'
    } else if (tab == 5) {
      this.sendMode = 'grd'
      let timer1, timer2;
      timer1 = window.setInterval(() => {
        if (typeof this.colorList != 'undefined') {
          this.sendColorList = JSON.parse(JSON.stringify(this.colorList));
          window.clearInterval(timer1);
          window.clearTimeout(timer2);
        }
      }, 1000);
      timer2 = setTimeout(() => {
        window.clearInterval(timer1)
      }, 3100);
    }
    this.sendData();
  }

  turnSwitch() {
    let message;
    if (this.switch) {
      message = `{"switch":"off"}`
    } else {
      message = `{"switch":"on"}`
    }
    this.deviceService.sendData(this.device, message);
    // this.nativeService.vibrate();
  }

  colortempChange(e) {
    this.sendColortemp = e;
    this.sendBrightness = this.brightness;
    this.sendColor = this.color;
    this.sendSpeed = this.speed;
  }

  brightnessChange(e) {
    this.sendBrightness = e;
    this.sendColortemp = this.colortemp;
    this.sendColor = this.color;
    this.sendSpeed = this.speed;

    this.sendColorList = this.colorList
  }

  speedChange(e) {
    this.sendSpeed = e;
    this.sendBrightness = this.brightness;
    this.sendColortemp = this.colortemp;
    this.sendColor = this.color;

    this.sendColorList = this.colorList
  }

  colorChange(e) {
    this.sendColor = e;
    this.sendBrightness = this.brightness;
    this.sendColortemp = this.colortemp;
    this.sendSpeed = this.speed;
  }

  sendData() {
    let message;
    if (this.sendMode == 'sun') {
      message = `{"set":{"mode":"${this.sendMode}","temp":${this.sendColortemp},"brt":${this.sendBrightness}}}`;
    } else if (this.sendMode == 'std') {
      message = `{"set":{"mode":"${this.sendMode}","clr":[${this.sendColor}],"brt":${this.sendBrightness}}}`;
    } else if (this.sendMode == 'bre' || this.sendMode == 'stb') {
      message = `{"set":{"mode":"${this.sendMode}","clr":[${this.sendColor}],"brt":${this.sendBrightness},"spd":${this.sendSpeed}}}`;
    } else if (this.sendMode == 'rc') {
      message = `{"set":{"mode":"${this.sendMode}","brt":${this.sendBrightness},"spd":${this.sendSpeed}}}`;
    } else if (this.sendMode == 'grd') {
      if (typeof this.sendColorList == 'undefined' || this.sendColorList.length == 0) {
        message = `{"set":{"mode":"${this.sendMode}","brt":${this.sendBrightness},"spd":${this.sendSpeed}}}`;
      } else {
        message = `{"set":{"mode":"${this.sendMode}","brt":${this.sendBrightness},"spd":${this.sendSpeed},"grdc":${JSON.stringify(this.sendColorList)}}}`;
      }
    }
    this.deviceService.sendData(this.device, message)
  }

  selectColorId = 99;
  async showColorDisk(id) {
    this.selectColorId = id;
    let modal = await this.modalCtrl.create({
      component: OwnLightSelectcolorPage,
      componentProps: {
        colorList: this.sendColorList,
        id: this.selectColorId
      }
    });
    await modal.present();
    await modal.onWillDismiss();
    this.selectColorId = 99;
    if (this.sendColorList.length > 1)
      this.sendData();
  }

  getColor(i) {
    return `rgb(${this.sendColorList[i].toString()})`;
  }

  addColor() {
    let newColor = []
    this.sendColorList.push(newColor);
    this.showColorDisk(this.sendColorList.length - 1);
  }


}
