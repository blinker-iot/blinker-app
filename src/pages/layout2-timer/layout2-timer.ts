import { Component, ChangeDetectorRef } from '@angular/core';
import { IonicPage, NavController, NavParams, ModalController, Events } from 'ionic-angular';
// import { timeToMinute, minuteToTime } from '../../functions/func'

@IonicPage()
@Component({
  selector: 'page-layout2-timer',
  templateUrl: 'layout2-timer.html',
})
export class Layout2TimerPage {
  tab = 0;
  device;
  // timeInfo = '00:00';

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public modalCtrl: ModalController,
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef,
    // private pickerCtrl: PickerController,
  ) {
    this.device = navParams.data;
    if (typeof this.device.data.timing == 'undefined') {
      this.device.data['timing'] = []
    }
    if (typeof this.device.data.countdown == 'undefined') {
      this.device.data['countdown'] = false
    }
    if (typeof this.device.data.loop == 'undefined') {
      this.device.data['loop'] = false
    }
  }

  ionViewDidLoad() {
    //检查设备是否在线
    if (this.device.data.state == 'offline' || this.device.data.state == 'disconnected') {
      this.events.publish("provider:notice", "timingOffline");
      return;
    }
    this.loadTask();
    this.subscribe();
  }

  ngOnDestroy() {
    this.unsubscribe();
  }


  subscribe() {
    window.setTimeout(() => {
      this.events.subscribe(this.device.deviceName + ':timing', message => {
        if (message == "loaded") {
          // console.log('强制刷新');
          this.changeDetectorRef.detectChanges();
        }
      });
    }, 100);
  }

  unsubscribe() {
    this.events.unsubscribe(this.device.deviceName + ':timing');
  }

  // trackByFn(index, task) {
  //   return JSON.stringify(task); // or item.id
  // }

  changeTab(tab) {
    this.tab = tab;
    if (tab == 0) {
      this.loadTask('timing');
      return;
    }
    if (tab == 1) {
      this.loadTask('countdown');
      return;
    }
    if (tab == 2) {
      this.loadTask('loop');
    }
  }

  loadTaskTimer;
  loadTask(task = 'timing') {
    //弹出提示：正在同步定时数据
    this.events.publish("loading:show", "loadingTiming");
    window.setTimeout(() => {
      this.events.publish("loading:hide", "loadingTiming");
    }, 1000);
    this.events.publish("layout:send", `{"get":"${task}"}`);
  }

  // addTimingTask() {
  //   let task = {
  //     "task": this.device.data.timing.length,
  //     "ena": 1,
  //     "tim": 0,
  //     "act": [],
  //     "day": "0000000"
  //   }
  //   let modal = this.modalCtrl.create('Layout2TimerEdittimingPage', { device: this.device, task: task });
  //   modal.present();
  // }

  // editTimingTask(task) {
  //   // console.log(task);
  //   let editTask = JSON.parse(JSON.stringify(task));
  //   let actList = [];
  //   for (let btnAct of editTask.act) {
  //     actList.push(JSON.stringify(btnAct))
  //   }
  //   editTask.act = actList;
  //   let modal = this.modalCtrl.create('Layout2TimerEdittimingPage', { device: this.device, task: editTask });
  //   modal.present();
  // }

  // delTimingTask(task) {
  //   console.log('delTimingTask')
  // }

  // getEna(task) {
  //   return (task.ena == "1" ? true : false)
  // }

  // changeEna(task) {
  //   // console.log('enaChange:' + task.ena)
  //   task.ena = (task.ena == "1" ? 0 : 1)
  //   this.updateTask(task)
  // }

  // updateTask(task) {
  //   let uploadDate = JSON.parse(JSON.stringify(task));
  //   let data = {
  //     set: {
  //       timing: []
  //     }
  //   }
  //   data.set.timing.push(uploadDate);
  //   // console.log(JSON.stringify(data));
  //   this.events.publish("layout:send", JSON.stringify(data));
  // }

  // duration持续时长
  // run运行状态，0暂停，1运行
  // countdown = {
  //   "run": 1,
  //   "ttim": 0,
  //   "rtim": 0,
  //   "act": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
  // }

  // loop = {
  //   "tim": 99,
  //   "run": 1,
  //   "dur1": 1000,
  //   "act1": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
  //   "dur2": 3333,
  //   "act2": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
  // }


}
