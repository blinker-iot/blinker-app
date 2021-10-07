import { Injectable } from '@angular/core';
import { Network } from '@ionic-native/network/ngx';
import { Platform } from '@ionic/angular';
import { DeviceService } from './device.service';
import { BehaviorSubject } from 'rxjs';
import { DataService } from './data.service';
import { NoticeService } from './notice.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  // wifi/none/4g
  stateWatcher = new BehaviorSubject("unknow");

  // disconnectSubscription;
  connectSubscription;
  watchNetworkTimer;

  constructor(
    private network: Network,
    private platform: Platform,
    private deviceService: DeviceService,
    private dataService: DataService,
    private noticeService: NoticeService
  ) { }

  init() {
    if (!this.platform.is('cordova')) return
    this.dataService.initCompleted.subscribe(loaded => {
      if (loaded) {
        this.watch();
      }
    })
    this.dataService.authDataExpire.subscribe(state => {
      if (state) {
        this.unWatch()
      }
    })
  }

  watch() {
    this.connectSubscription = this.network.onConnect().subscribe(() => {
      // console.log('当前网络状态：' + this.network.type);
      window.clearTimeout(this.watchNetworkTimer)
      this.watchNetworkTimer = window.setTimeout(() => {
        if (this.network.type != 'none') {
          // this.deviceService.disconnectMqttBrokers();
          // this.deviceService.connectMqttBrokers();
          this.deviceService.scanMdnsDevice();
          // this.noticeService.showToast('connected');
          this.stateWatcher.next(this.network.type);
        }
      }, 2900);
    });
  }

  unWatch() {
    // this.disconnectSubscription.unsubscribe();
    if (typeof this.connectSubscription != 'undefined')
      this.connectSubscription.unsubscribe();
  }


}
