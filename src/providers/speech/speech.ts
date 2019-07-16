import { Injectable } from '@angular/core';
import { Platform, Events } from 'ionic-angular';
import { DeviceProvider } from '../device/device'

declare var cordova;

@Injectable()
export class SpeechProvider {
  public result;
  public speechCmdList;
  public speechTextList;

  constructor(
    public deviceProvider: DeviceProvider,
    public plt: Platform,
    public events: Events
  ) {
  }

  recognize() {
    cordova.plugins.bdasr.addEventListener((res) => {
      if (!res) {
        return;
      }
      switch (res.type) {
        case "asrReady": {
          console.log("开始采集数据")
          break;
        }
        case "asrBegin": {
          console.log("检测到用户开始说话")
          break;
        }
        case "asrEnd": {
          console.log("数据采集完成，等待识别结果")
          break;
        }
        case "asrText": {
          // console.log(res.message);
          this.result = JSON.parse(res.message).best_result;
          this.events.publish('speech:content', this.result);
          break;
        }
        case "asrFinish": {
          console.log("语音识别完成");
          console.log("识别结果：" + this.result);
          this.process(this.result);
          break;
        }
        case "asrCancel": {
          // 语音识别取消
          console.log("语音识别取消");
          break;
        }
        default:
          break;
      }
      // this.events.publish('speech', res.type);
    }, (err) => {
      this.events.publish('speech', 'Error');
      console.log(err);
    });
  }

  start() {
    if (this.plt.is('cordova')) {
      cordova.plugins.bdasr.startSpeechRecognize();
      this.recognize();
    }
  }

  end() {
    if (this.plt.is('cordova')) {
      cordova.plugins.bdasr.cancelSpeechRecognize();
    }
  }

  // 分发数据
  async process(str) {
    if (typeof this.speechCmdList[str] == 'undefined') {
      this.events.publish('speech', 'NotFound');
      return false;
    }
    if (this.speechCmdList[str].device.config.mode == 'mqtt') {
      this.deviceProvider.pubMessage(this.speechCmdList[str].device, this.speechCmdList[str].cmd);
      this.events.publish('speech', 'Sent');
      return true;
    } 
    else {
      this.events.publish('speech', 'Wait');
      let result = await this.deviceProvider.connectDevice(this.speechCmdList[str].device, "hide");
      if (result) {
        window.setTimeout(() => {
          this.deviceProvider.sendData(this.speechCmdList[str].device, this.speechCmdList[str].cmd);
        }, 500);
        this.events.publish('speech', 'Done');
        window.setTimeout(() => {
          this.deviceProvider.disconnectDevice(this.speechCmdList[str].device);
        }, 1000);
        return true;
      } else {
        this.events.publish('speech', 'CannotControl');
        this.deviceProvider.disconnectDevice(this.speechCmdList[str].device);
        return false;
      }
    }
  }

  getSpeechCmd() {
    this.speechCmdList = {};
    this.speechTextList = [];
    for (let deviceName in this.deviceProvider.devices) {
      if (typeof (this.deviceProvider.devices[deviceName].config.dashboard) == "undefined") continue;
      for (let component of this.deviceProvider.devices[deviceName].config.dashboard) {
        let ccomponent = JSON.parse(component)
        // console.log(component);
        if (typeof ccomponent.speech == 'undefined') continue;
        for (let speechCmd of ccomponent.speech) {
          if (speechCmd.cmd == '') continue;
          this.speechCmdList[speechCmd.cmd] = {
            cmd: `{"${ccomponent.key}":"${speechCmd.act}"}\n`,
            device: this.deviceProvider.devices[deviceName]
          }
          this.speechTextList.push(speechCmd.cmd);
        }
      }
    }
    console.log(this.speechCmdList);
  }


}
