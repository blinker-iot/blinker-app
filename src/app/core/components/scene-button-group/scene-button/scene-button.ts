import { Component, Input } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { DataService } from '../../../services/data.service';

@Component({
  selector: 'scene-button',
  templateUrl: 'scene-button.html',
  styleUrls: ['scene-button.scss']
})
export class SceneButtonComponent {

  @Input() sceneName: string;

  get scene() {
    return this.dataService.scene.dict[this.sceneName]
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }
  state = "waiting" // waiting/doing/done
  // waiting = false;
  // done = false;
  // progress;

  constructor(
    public deviceService: DeviceService,
    private dataService: DataService
  ) {
  }

  async sendData() {
    this.state = 'doing';
    for (let act of this.scene.acts) {
      if (typeof act.delay != 'undefined') {
        await this.delayTask(act.delay);
        continue;
      }
      let device = this.deviceDataDict[act.deviceId]
      if (typeof device != 'undefined')
        if (this.deviceDataDict[act.deviceId].config.mode == "mqtt") {
          this.deviceService.sendData(device, act.data);
        } else {
          await this.send2LocalDevice(device, act.data);
        }
    }
    this.state = 'done';
    setTimeout(() => {
      this.state = 'waiting';
    }, 1000);
  }

  send2LocalDevice(device, action): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      console.log("连接：" + device.id);
      if (await this.deviceService.connectDevice(device, "hide")) {
        window.setTimeout(() => {
          this.deviceService.sendData(device, action.data);
        }, 300);
        window.setTimeout(() => {
          this.deviceService.disconnectDevice(device);
          return resolve(true);
        }, 1500);
      } else {
        return resolve(false);
      }
    })
  }

  delayTask(time): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        resolve(true)
      }, time * 1000);
    })
  }


}

