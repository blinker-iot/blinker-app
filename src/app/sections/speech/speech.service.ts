import { Injectable } from '@angular/core';
import { Platform, Events } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { DataService } from 'src/app/core/services/data.service';
import { Subject } from 'rxjs';

declare var cordova;

@Injectable()
export class SpeechService {
  
  playAudio=new Subject;

  audio = {
    "Begin": ["Begin"],
    "End": ["End"],
    "CannotControl": ["CannotControl"],
    "ChoseDevice": ["ChoseDevice"],
    "Unsupport": ["Unsupport"],
    "Help": ["Help"],
    "DevMode": ["DevMode"],
    "Boot": ["Boot"],
    "NetError": ["NetError"],
    "Wait": ["Wait1", "Wait2", "Doing"],
    "Opening": ["Opening1", "Opening2"],
    "Opened": ["Opened1", "Opened2"],
    "Opened2": ["Opened2"],
    "Closing": ["Closing1", "Closing2"],
    "Closed": ["Closed1", "Closed2"],
    "Closed2": ["Closed2"],
    "DeviceOpened": ["DeviceOpened"],
    "DeviceClosed": ["DeviceClosed"],
    "Doing": ["Doing"],
    "Done": ["Done"],
    "Error": ["Error1", "Error2", "Error3"],
    "NotFound": ["NotFound1", "NotFound2"],
    "Get": ["Get1", "Get2", "Get3", "Get4"]
  }


  public result;
  public speechCmdList = {};
  public speechTextList = [];

  get deviceDataList() {
    return this.dataService.device.list
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get roomDataList() {
    return this.dataService.room.list
  }

  get roomDataDict() {
    return this.dataService.room.dict
  }

  constructor(
    public deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService,
    public plt: Platform,
    public events: Events,
    private devicelistService: DevicelistService
  ) {
  }

  recognize() {
    cordova.plugins.bdasr.addEventListener((res) => {
      if (!res) {
        return;
      }
      switch (res.type) {
        case "asrReady": {
          console.log("等待语音输入")
          break;
        }
        case "asrBegin": {
          console.log("开始语音输入")
          break;
        }
        case "asrEnd": {
          console.log("等待识别结果")
          break;
        }
        case "asrText": {
          // console.log(res.message);
          if (this.plt.is('android')) {
            this.result = JSON.parse(res.message).best_result;
          }
          else {
            if (typeof (res.message.origin_result.result.word[0]) != "undefined")
              this.result = res.message.origin_result.result.word[0].toString();
            else if (typeof (res.message.results_recognition) != "undefined")
              this.result = res.message.results_recognition.toString();
            else this.result = "";
          }
          console.log("识别结果：" + this.result);
          //this.result = JSON.parse(res.message);//res.message.results_recognition;//JSON.parse(res.message.origin_result).
          this.events.publish('speech:content', this.result);
          break;
        }
        case "asrFinish": {
          // console.log("识别结果：" + this.result);
          this.process(this.result);
          break;
        }
        case "asrCancel": {
          // 语音识别取消
          // console.log("语音识别取消");
          break;
        }
        default:
          break;
      }
      // this.events.publish('speech', res.type);
    }, (err) => {
      this.events.publish('speech', 'Error');
      // console.log(err);
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
      this.deviceService.pubMessage(this.speechCmdList[str].device, this.speechCmdList[str].act);
      this.events.publish('speech', 'Sent');
      return true;
    }
    else {
      this.events.publish('speech', 'Wait');
      let result = await this.deviceService.connectDevice(this.speechCmdList[str].device, "hide");
      if (result) {
        window.setTimeout(() => {
          this.deviceService.sendData(this.speechCmdList[str].device, this.speechCmdList[str].act);
        }, 500);
        this.events.publish('speech', 'Done');
        window.setTimeout(() => {
          this.deviceService.disconnectDevice(this.speechCmdList[str].device);
        }, 1000);
        return true;
      } else {
        this.events.publish('speech', 'CannotControl');
        this.deviceService.disconnectDevice(this.speechCmdList[str].device);
        return false;
      }
    }
  }

  getSpeechCmd() {
    this.speechCmdList = {};
    this.speechTextList = [];
    for (const deviceId of this.deviceDataList) {
      if (this.deviceDataDict[deviceId].deviceType == "DiyArduino" || this.deviceDataDict[deviceId].deviceType == "DiyLinux")
        this.getDiyDeviceSpeechCmd(this.deviceDataDict[deviceId]);
      else
        this.getProDeviceSpeechCmd(this.deviceDataDict[deviceId]);
    }
    // console.log(this.speechCmdList);
  }

  getDiyDeviceSpeechCmd(device: BlinkerDevice) {
    let layouter = JSON.parse(device.config.layouter)
    if (layouter == null || typeof layouter.dashboard == 'undefined' || layouter.dashboard == null) return;
    for (let component of layouter.dashboard) {
      if (typeof component.speech == 'undefined') continue;
      for (let speechCmd of component.speech) {
        if (speechCmd.cmd == '') continue;
        let cmdList = this.processCmd(device, speechCmd.cmd)
        for (const cmd of cmdList) {
          this.speechCmdList[cmd] = {
            act: `{"${component.key}":"${speechCmd.act}"}\n`,
            device: device
          }
          this.speechTextList.push(cmd);
        }
      }
    }
  }

  getProDeviceSpeechCmd(device: BlinkerDevice) {
    let deviceConfig = this.devicelistService.getDeviceConfig(device);
    console.log(deviceConfig);
    // console.log(deviceConfig);
    // deviceConfig['speech'] = [
    //   { "cmd": "打开?room的?name", "act": "{\"btn-acb\"}:\"on\"" },
    //   { "cmd": "关闭?room的?name", "act": "{\"btn-acb\"}:\"off\"" }
    // ]
    if (typeof deviceConfig == 'undefined') return
    if (typeof deviceConfig.speech == 'undefined') return
    for (const speechCmd of deviceConfig.speech) {
      let cmdList = this.processCmd(device, speechCmd.cmd)
      for (const cmd of cmdList) {
        this.speechCmdList[cmd] = {
          act: speechCmd.act,
          device: device
        }
        this.speechTextList.push(cmd);
      }
    }
  }

  processCmd(device: BlinkerDevice, cmd) {
    let cmdList = []
    if (cmd.search(/\?room/) > -1) {
      let rooms = this.findRooms(device);
      for (const roomname of rooms) {
        cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName).replace(/(\?|？)room/g, roomname))
      }
    } else {
      cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName))
    }
    return cmdList
  }

  findRooms(device: BlinkerDevice) {
    let rooms = []
    for (const roomname of this.roomDataList) {
      if (this.roomDataDict[roomname].indexOf(device.id) > -1)
        rooms.push(roomname)
    }
    return rooms
  }

}
