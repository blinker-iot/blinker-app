import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DebugService {

  state = new Subject();
  enable = false;
  modal;
  dataList = {};

  constructor(
  ) { }

  init() {
    this.enable = true
  }

  end() {
    this.enable = false
  }

  update(message) {
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
    this.state.next('update');
  }

  clean(device) {
    this.dataList[device.deviceName] = ''
  }

  processMessage(message) {
    if (typeof message == 'string')
      return message.replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/ /g, `&nbsp;`).replace(/\r\n/g, ``).replace(/\n/g, ``);
    if (typeof message == 'object') {
      return JSON.stringify(message)
    }
  }

}
