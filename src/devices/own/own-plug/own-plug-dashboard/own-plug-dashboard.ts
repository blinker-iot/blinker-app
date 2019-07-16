import { Component, ChangeDetectorRef, ViewChildren, ElementRef, QueryList } from '@angular/core';
import { NavController, NavParams, IonicPage, Events, ModalController } from 'ionic-angular';
import { DeviceProvider } from '../../../../providers/device/device';
import echarts from 'echarts';

@IonicPage()
@Component({
  selector: 'page-own-plug-dashboard',
  templateUrl: 'own-plug-dashboard.html'
})

export class OwnPlugDashboardPage {
  private powerTimer;
  private timer;
  device;
  tab = 0;
  power = 0;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private deviceProvider: DeviceProvider,
    public changeDetectorRef: ChangeDetectorRef,
    public events: Events,
    public modalCtrl: ModalController,
  ) {
    this.device = navParams.data;
    // 测试数据
    if (typeof this.device.data == 'undefined') {
      this.device["data"] = {}
      this.device.data['timing'] = this.timing;
      this.device.data['countdown'] = this.countdown;
      this.device.data['loop'] = this.loop;
    }
    if (typeof this.device.data.switch == 'undefined') {
      this.device.data['switch'] = 'on'
    }
    if (typeof this.device.data.power == 'undefined') {
      this.device.data['power'] = 0
    }
    if (typeof this.device.data.timing == 'undefined') {
      this.device.data['timing'] = []
    }
    if (typeof this.device.data.countdown == 'undefined') {
      this.device.data['countdown'] = {}
    }
    if (typeof this.device.data.loop == 'undefined') {
      this.device.data['loop'] = {}
    }
  }

  ionViewDidEnter() {
    this.timer = setInterval(() => {
      this.changeDetectorRef.markForCheck();
    }, 1000);
    console.log('创建定时器，29秒更新一次功率信息');
    this.deviceProvider.pubMessage(this.device, `{ "get":"state"}`);
    this.powerTimer = setInterval(() => {
      this.deviceProvider.pubMessage(this.device, `{ "get":"state"}`);
    }, 29000);
  }

  ionViewDidLeave() {
    // console.log('销毁定时器');
    clearInterval(this.powerTimer);
    // console.log('销毁状态检查定时器');
    clearInterval(this.timer);
  }

  switch = "on";
  turnSwitch() {
    // if (this.switch == "on") {
    //   this.switch = "off"
    // } else {
    //   this.switch = "on"
    // }
    let message;
    if (this.device.data.switch == "off") {
      message = `{"switch":"on"}`
    } else {
      message = `{"switch":"off"}`
    }
    this.deviceProvider.pubMessage(this.device, message);
    navigator.vibrate(20);
  }

  changeTab(tab) {
    this.tab = tab;
    if (tab == 1) {
      this.loadTimingTask();
    } else if (tab == 2) {
      this.loadCountdownTask();
    } else if (tab == 3) {
      this.loadLoopTask();
    } else if (tab == 4) {
      window.setTimeout(() => {
        this.initChart()
      }, 100)
    }
  }

  loadTimingTask() {
    this.events.publish("layout:send", `{"get":"timing"}`);
  }

  loadCountdownTask() {
    this.events.publish("layout:send", `{"get":"countdown"}`);
  }

  loadLoopTask() {
    this.events.publish("layout:send", `{"get":"loop"}`);
  }

  addTimingTask() {
    let task = {
      "task": this.device.data.timing.length,
      "ena": 1,
      "tim": 0,
      "act": [],
      "day": "0000000"
    }
    let modal = this.modalCtrl.create('OwnPlugAddTimingPage', { device: this.device, task: task });
    modal.present();
  }

  editTimingTask(task) {
    // console.log(task);
    let editTask = JSON.parse(JSON.stringify(task));
    let actList = [];
    for (let btnAct of editTask.act) {
      actList.push(JSON.stringify(btnAct))
    }
    editTask.act = actList;
    let modal = this.modalCtrl.create('OwnPlugAddTimingPage', { device: this.device, task: editTask });
    modal.present();
  }

  delTimingTask(task) {
    console.log('delTimingTask')
  }

  getEna(task) {
    return (task.ena == "1" ? true : false)
  }

  changeEna(task) {
    // console.log('enaChange:' + task.ena)
    task.ena = (task.ena == "1" ? 0 : 1)
    this.updateTask(task)
  }

  updateTask(task) {
    let uploadDate = JSON.parse(JSON.stringify(task));
    let data = {
      set: {
        timing: []
      }
    }
    data.set.timing.push(uploadDate);
    // console.log(JSON.stringify(data));
    this.events.publish("layout:send", JSON.stringify(data));
  }

  //倒计时
  countdownBtn = "暂停";
  tapCountdownBtn() {
    // if (this.countdownBtn == "暂停") {
    //   this.countdownBtn = "继续";
    //   return;
    // }
    // if (this.countdownBtn == "继续") {
    //   this.countdownBtn = "暂停";
    //   return;
    // }
  }

  startCountdown() {

  }

  cancelCountdown() {

  }

  setLoopTime() {

  }

  

  @ViewChildren('chartCanvas', { read: ElementRef }) chartCanvasList: QueryList<ElementRef>;
  myChart;
  initChart() {
    // let shijian = new Date();
    // let times = [];

    // for (var i = 0; i < 24; i++) {
    //   shijian = new Date(shijian.valueOf() + 3600000);
    //   times.push([shijian, this.RandomNumBoth(0, 300)]);
    // }
    // console.log(times);

    this.myChart = echarts.init(this.chartCanvasList.first.nativeElement
      // , null, { renderer: 'svg' }
    );
    let option = {
      // dataZoom: [
      //   {
      //     type: 'inside',
      //     filterMode: 'none',
      //     minValueSpan: 6,
      //     startValue: times[0][0],
      //     endValue: times[6][0]
      //   }
      // ],
      tooltip: {
        trigger: 'axis'
      },
      xAxis: {
        axisLine: {
          lineStyle: {
            color: ['#E6E6E6']
          }
        },
        axisLabel: {
          interval: 0
        },
        nameTextStyle: {
          fontSize: 9
        },
        type: 'category',
        data: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
      },
      yAxis: {
        axisLine: {
          lineStyle: {
            color: ['#E6E6E6']
          }
        },
        type: 'value'
      },
      series: [
        {
          itemStyle: {
            normal: { color: '#FBA613' }
          },
          barWidth: 10,
          data: [120, 200, 150, 80, 70, 110, 130, 120, 200, 150, 80, 70],
          type: 'bar'
        },
      ],
    };

    this.myChart.setOption(option);
    // this.myChart.resize();
  }

  timing = [
    { "task": 0, "act": [{ "switch": "off" }], "ena": 1, "tim": 1018, "day": "1111111" },
    { "task": 1, "act": [{ "switch": "on" }], "ena": 0, "tim": 1390, "day": "0000000" }
  ]

  loop = {
    "tim": 99,
    "run": 1,
    "dur1": 1000,
    "act1": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
    "dur2": 3333,
    "act2": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
  }

  countdown = {
    "run": 1,
    "ttim": 1000,
    "rtim": 200,
    "act": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
  }

  gotoSettings() {
    this.navCtrl.push('OwnPlugSettingsPage', this.device)
  }

  gotoHelp() {
    // this.navCtrl.push()
  }
}
