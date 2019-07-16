import {
  Component,
  // ChangeDetectorRef,
  Input,
  ElementRef,
  ViewChild,
  ChangeDetectorRef
} from '@angular/core';
import { NavController, Events } from 'ionic-angular';
import { DeviceProvider } from '../../providers/device/device';
import { UserProvider } from '../../providers/user/user'
import { DeviceManager } from '../../classes/device';

@Component({
  selector: 'deviceblock',
  templateUrl: 'deviceblock.html'
})
export class Deviceblock {
  @Input() public device: any;
  @Input() enable = true;
  @Input() sortId;
  @ViewChild("speechAudio", { read: ElementRef }) speechAudio: ElementRef;
  deviceManager: DeviceManager;

  constructor(
    public navCtrl: NavController,
    public deviceProvider: DeviceProvider,
    public userProvider: UserProvider,
    public events: Events,
    public elementRef: ElementRef,
    public changeDetectorRef: ChangeDetectorRef
  ) {
  }

  ngAfterViewInit() {
    console.log('加载' + this.device.deviceName);
    // if (!this.enable) return;
    // this.subscribe();
  }

  ngOnDestroy() {
    console.log('销毁' + this.device.deviceName);
    // if (!this.enable) return;
    // this.unsubscribe();
  }

  gotoDashboard() {
    if (!this.enable) return;
    if (this.device.deviceType == 'DiyArduino' || this.device.deviceType == 'DiyLinux') {
      this.navCtrl.push('Layout2Page', this.device);
    } else {
      this.navCtrl.push(this.device.deviceType + 'DashboardPage', this.device);
    }
  }

  tapSwitch() {
    if (!this.enable) return;
    if (this.device.config.mode != "mqtt") return;
    let message;
    // console.log(this.device.data);
    if (this.device.data.switch == "off") {
      message = `{"switch":"on"}`;
    } else if (this.device.data.switch == "on") {
      message = `{"switch":"off"}`;
    } else {
      return;
    }
    this.deviceProvider.pubMessage(this.device, message);
    this.waiting();
  }

  tapQuery() {
    if (!this.enable) return;
    if (this.device.config.mode != "mqtt") return;
    if (typeof this.device.data.switch == "undefined") {
    } else if (this.device.data.switch == "") {
    } else {
      return;
    }
    this.deviceProvider.queryDevice(this.device);
    this.waiting()
  }

  waiting() {
    //显示等待反馈动画
    let oldSwitch = this.device.data.switch
    this.device.data.switch = "waiting";
    let timer;
    let timer2;
    timer = window.setInterval(() => {
      if (this.device.data.switch != "waiting") {
        window.clearInterval(timer);
        window.clearTimeout(timer2);
        // 状态改变后，播放声音并震动
        if (this.device.data.switch != oldSwitch) {
          this.speechAudio.nativeElement.src = `assets/aac/Click.aac`;
          navigator.vibrate(10);
        }
      }
    }, 100);
    timer2 = window.setTimeout(() => {
      window.clearInterval(timer);
      this.device.data.switch = oldSwitch;
    }, 3000);
  }

  // subscribe() {
  //   this.deviceManager = new DeviceManager(this)
  //   this.deviceManager.subscribe();
  //   // this.events.subscribe(this.device.deviceName+':deviceblock', (mess) => {
  //   //   // console.log("deviceblock state:" + this.device.data.state)
  //   //   this.changeDetectorRef.detectChanges();
  //   // })
  // }

  // unsubscribe() {
  //   this.deviceManager.unsubscribe();
  // }



  // subscribe() {
  //   // console.log('订阅device:' + this.device.deviceName);
  //   this.events.subscribe('device:' + this.device.deviceName, data => {
  //     // console.log("分发数据");
  //     // console.log(data);
  //     //如果不是json对象，就判定为unknownData
  //     if (typeof (data) == 'string' || typeof (data) == "number") {
  //       this.events.publish(this.device.deviceName + ':unknownData', data.toString() + "\n");
  //     } else {
  //       for (let key in data) {
  //         // console.log(key);
  //         // 保留关键字不允许用户改写
  //         if (key == "config" || key == "deviceName" || key == "deviceType")
  //           break;
  //         // 本地通知功能
  //         if (key == "notice" && this.userProvider.localStorage.app.allowNotice) {
  //           this.events.publish("provider:push", data[key]);
  //           break;
  //         }
  //         //实际通信数据存储
  //         //device.data为临时数据存储位置
  //         this.device.data[key] = data[key];
  //         this.events.publish(this.device.deviceName + ':' + key, 'loaded');

  //         // 设备获取手机状态数据
  //         if (key == "ahrs")
  //           this.events.publish('native:ahrs', this.device);
  //         if (JSON.stringify(data) == `{"get":"gps"}`)
  //           this.events.publish('native:gps', this.device);
  //         if (key == "vibrate")
  //           this.events.publish('native:vibrate', this.device);
  //       }
  //       // 显示到degbug窗口
  //       this.events.publish(this.device.deviceName + ':unknownData', JSON.stringify(data) + "\n");
  //     }
  //     //通知相关页面,关闭读取状态
  //     this.events.publish('page:device', 'loaded')
  //     // this.changeDetectorRef.markForCheck();
  //   });
  // }

  // unsubscribe() {
  //   this.events.unsubscribe('device:' + this.device.deviceName);
  // }
}

