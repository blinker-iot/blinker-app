import { Injectable } from '@angular/core';
import { Network, Connection } from '@ionic-native/network/ngx';
import { Events, Platform } from '@ionic/angular';
import { DeviceService } from './device.service';
import { BehaviorSubject } from 'rxjs';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  // wifi/none/4g
  stateWatcher = new BehaviorSubject("unknow");

  disconnectSubscription;
  connectSubscription;
  watchNetworkTimer;

  constructor(
    private network: Network,
    private events: Events,
    private platform: Platform,
    private deviceService: DeviceService,
    private dataService: DataService
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
    // this.disconnectSubscription = this.network.onDisconnect().subscribe(() => {
    //   console.log('当前网络状态：' + this.network.type);
    //   window.clearTimeout(this.watchNetworkTimer);
    //   this.deviceService.disconnectMqttBrokers();
    //   this.watchNetworkTimer = window.setTimeout(() => {
    //     if (this.network.type == 'none') {
    //       this.events.publish("provider:notice", 'noNetwork');
    //       this.events.publish("network", 'disconnected');
    //     }
    //   }, 2900);
    // });
    this.connectSubscription = this.network.onConnect().subscribe(() => {
      console.log('当前网络状态：' + this.network.type);
      window.clearTimeout(this.watchNetworkTimer)
      this.watchNetworkTimer = window.setTimeout(() => {
        if (this.network.type != 'none') {
          this.deviceService.disconnectMqttBrokers();
          this.deviceService.connectMqttBrokers();
          this.deviceService.scanMdnsDevice();
          this.events.publish("network", 'connected');
          this.stateWatcher.next(this.network.type);
        }
      }, 2900);
    });
  }

  unWatch() {
    this.disconnectSubscription.unsubscribe();
    this.connectSubscription.unsubscribe();
  }


}
