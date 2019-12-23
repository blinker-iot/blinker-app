import { Injectable } from '@angular/core';
import { Events } from '@ionic/angular';
// import { DebugComponent } from './debug.component';
// import { DeviceService } from '../core/services/device.service';

@Injectable({
  providedIn: 'root'
})
export class DebugService {

  modal;
  dataList = {};

  constructor(
    // private modalCtrl: ModalController,
    private events: Events,
    // private deviceService: DeviceService
  ) { }

  init() {
    this.events.unsubscribe('debugService');
    this.events.subscribe('debugService', message => {
      let newData;
      if (message.type == "unknown" || message.type == "receive") {
        newData = this.processMessage(message.data) + '<br />';
        // console.log(newData);
      } else if (message.type == "send") {
        newData = `<div class="senddata" style="color: #389BEE">` + this.processMessage(message.data) + '</div>';
      }
      if (typeof this.dataList[message.deviceName] == 'undefined') this.dataList[message.deviceName] = '';
      this.dataList[message.deviceName] = this.dataList[message.deviceName] + newData;
      if (this.dataList[message.deviceName].length > 2048) {
        this.dataList[message.deviceName] = this.dataList[message.deviceName].substr(100);
      }
      this.events.publish('debugComponent', 'update');
      this.events.publish('debugWidget', 'update');
    });
  }

  end(){
    this.events.unsubscribe('debugService');
  }

  clean(device) {
    this.dataList[device.deviceName] = ''
  }

  processMessage(message) {
    return message.replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/ /g, `&nbsp;`).replace(/\r\n/g, ``).replace(/\n/g, ``);
  }

}
