﻿import { Component, ChangeDetectorRef, ViewChildren, ElementRef, QueryList, Input } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { NativeService } from 'src/app/core/services/native.service';
// import Swiper from 'swiper';
// import Swiper from 'swiper/dist/js/swiper.js'
// import { Swiper, Pagination } from 'swiper/dist/js/swiper.esm.js';

@Component({
  selector: 'own-sensor-dashboard',
  templateUrl: 'own-sensor-dashboard.html',
  styleUrls: ['own-sensor-dashboard.scss']
})

export class OwnSensorDashboard {

  @Input() device;

  // private powerTimer;
  // private timer;
  tab = 0;

  get switch() {
    if (this.device.data.switch == 'on')
      return true
    return false
  }

  get state() {
    if (this.device.data.state == 'online')
      return true
    return false
  }

  get power() {
    return this.device.data.power
  }


  slidesOpts = {
    direction: 'vertical'
  }

  constructor(
    private navCtrl: NavController,
    private changeDetectorRef: ChangeDetectorRef,
    private modalCtrl: ModalController,
    private deviceService: DeviceService,
    private nativeService: NativeService
  ) {
    // this.device = navParams.data;
    // 测试数据
    // if (typeof this.device.data == 'undefined') {
    //   this.device["data"] = {}
    //   this.device.data['timing'] = this.timing;
    //   this.device.data['countdown'] = this.countdown;
    //   this.device.data['loop'] = this.loop;
    // }
    // if (typeof this.device.data.switch == 'undefined') {
    //   this.device.data['switch'] = 'on'
    // }
    // if (typeof this.device.data.power == 'undefined') {
    //   this.device.data['power'] = 0
    // }
    // if (typeof this.device.data.timing == 'undefined') {
    //   this.device.data['timing'] = []
    // }
    // if (typeof this.device.data.countdown == 'undefined') {
    //   this.device.data['countdown'] = {}
    // }
    // if (typeof this.device.data.loop == 'undefined') {
    //   this.device.data['loop'] = {}
    // }
  }

  ngAfterViewInit(): void {
    // var mySwiper = new Swiper ('.swiper-container', {
    //   // Optional parameters
    //   direction: 'vertical',
    //   // loop: true
    // })
  }

  // ionViewDidEnter() {
  //   this.timer = setInterval(() => {
  //     this.changeDetectorRef.markForCheck();
  //   }, 1000);
  //   console.log('创建定时器，29秒更新一次功率信息');
  //   // this.deviceProvider.pubMessage(this.device, `{ "get":"state"}`);
  //   // this.powerTimer = setInterval(() => {
  //   //   this.deviceProvider.pubMessage(this.device, `{ "get":"state"}`);
  //   // }, 29000);
  // }

  // ionViewDidLeave() {
  //   // console.log('销毁定时器');
  //   clearInterval(this.powerTimer);
  //   // console.log('销毁状态检查定时器');
  //   clearInterval(this.timer);
  // }

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

  changeTab(tab) {
    this.tab = tab;
    if (tab == 1) {
      // this.loadTimingTask();
    } else if (tab == 2) {
      // this.loadCountdownTask();
    } else if (tab == 3) {
      // this.loadLoopTask();
    } else if (tab == 4) {
      window.setTimeout(() => {

      }, 100)
    }
  }


}
