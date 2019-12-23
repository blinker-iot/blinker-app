import { Component, Input } from '@angular/core';
import { Events } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from '../../services/data.service';

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

  waiting = false;
  done = false;
  progress;

  constructor(
    public deviceService: DeviceService,
    // public userService: UserService,
    private dataService: DataService,
    public events: Events
  ) {
  }

  async sendData() {
    for (let act of this.scene.acts) {
      let device = this.deviceDataDict[act.deviceName]
      if (typeof device != 'undefined')
        if (this.deviceDataDict[act.deviceName].config.mode == "mqtt") {
          this.deviceService.sendData(device, act.data);
        } else {
          await this.send2LocalDevice(device, act.data);
        }
    }
    this.done = true;
    setTimeout(() => {
      this.done = false;
    }, 1000);
  }

  send2LocalDevice(device, action): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      console.log("连接：" + device.deviceName);
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


}

