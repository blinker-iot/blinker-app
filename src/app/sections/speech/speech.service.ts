import { Injectable, NgZone } from '@angular/core';
import { Platform } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { DataService } from 'src/app/core/services/data.service';
import { Subject } from 'rxjs';
import { BlinkerDevice } from 'src/app/core/model/device.model';
// import { SpeechRecognition } from "@capacitor-community/speech-recognition";
// declare var cordova;

@Injectable()
export class SpeechService {

  playAudio = new Subject;

  content: Subject<String> = new Subject;
  action: Subject<String> = new Subject;

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
    private deviceConfigService: DeviceConfigService,
    private ngzone: NgZone
  ) {
  }

  async init() {
    // console.log("SpeechService init");
    // let state = await SpeechRecognition.available()
    // console.log(state);
    // if (state) {
    //   // SpeechRecognition.hasPermission();
    //   // SpeechRecognition.requestPermission();
    //   SpeechRecognition.start({
    //     language: "en-US",
    //     maxResults: 2,
    //     prompt: "Say something",
    //     partialResults: true,
    //     popup: true,
    //   });
    //   SpeechRecognition.addListener("partialResults", (data: any) => {
    //     console.log("partialResults was fired", data.matches);
    //   });
    // }
  }

  recognize() {
    // cordova.plugins.bdasr.addEventListener((res) => {
    //   this.ngzone.run(() => {
    //     if (!res) {
    //       return;
    //     }
    //     switch (res.type) {
    //       case "asrReady": {
    //         // console.log("等待语音输入")
    //         break;
    //       }
    //       case "asrBegin": {
    //         // console.log("开始语音输入")
    //         break;
    //       }
    //       case "asrEnd": {
    //         console.log("等待识别结果")
    //         break;
    //       }
    //       case "asrText": {
    //         console.log(res.message);
    //         if (this.plt.is('android')) {
    //           this.result = JSON.parse(res.message).best_result;
    //         }
    //         else {
    //           if (typeof (res.message.origin_result.result.word[0]) != "undefined")
    //             this.result = res.message.origin_result.result.word[0].toString();
    //           else if (typeof (res.message.results_recognition) != "undefined")
    //             this.result = res.message.results_recognition.toString();
    //           else this.result = "";
    //         }
    //         console.log("识别结果：" + this.result);
    //         this.content.next(this.result);
    //         break;
    //       }
    //       case "asrFinish": {
    //         console.log("识别结果：" + this.result);
    //         this.process(this.result.replace('。', ''));
    //         break;
    //       }
    //       case "asrCancel": {
    //         // 语音识别取消
    //         console.log("语音识别取消");
    //         break;
    //       }
    //       default:
    //         break;
    //     }
    //   })

    // }, (err) => {
    //   this.ngzone.run(() => {
    //     this.action.next('Error')
    //   })
    // });
  }

  start() {
    // if (this.plt.is('cordova')) {
    //   this.ngzone.run(() => {
    //     cordova.plugins.bdasr.startSpeechRecognize();
    //     this.recognize();
    //   })

    // }
  }

  end() {
    // if (this.plt.is('cordova')) {
    //   this.ngzone.run(() => {
    //     cordova.plugins.bdasr.cancelSpeechRecognize();
    //     this.recognize();
    //   })
    // }
  }

  // 分发数据
  async process(str) {
    if (typeof this.speechCmdList[str] == 'undefined') {
      this.action.next('NotFound')
      return false;
    }
    if (this.speechCmdList[str].device.config.mode == 'mqtt') {
      this.deviceService.pubMessage(this.speechCmdList[str].device, this.speechCmdList[str].act);
      this.action.next('Sent')
      return true;
    }
    else {
      this.action.next('Wait')
      let result: any = await this.deviceService.connectDevice(this.speechCmdList[str].device, "hide");
      if (result) {
        window.setTimeout(() => {
          this.deviceService.sendData(this.speechCmdList[str].device, this.speechCmdList[str].act);
        }, 500);
        this.action.next('Done')
        window.setTimeout(() => {
          this.deviceService.disconnectDevice(this.speechCmdList[str].device);
        }, 1000);
        return true;
      } else {
        this.action.next('CannotControl')
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
  }

  getDiyDeviceSpeechCmd(device: BlinkerDevice) {
    let deviceConfig = JSON.parse(device.config.layouter)
    if (deviceConfig == null) return;
    if (typeof deviceConfig == 'undefined') return
    if (typeof deviceConfig.actions == 'undefined') return
    // console.log(deviceConfig);
    // console.log(deviceConfig.actions);
    let actions = deviceConfig.actions;
    actions.forEach(action => {
      let actTextList = this.processCmd(device, action.text)
      for (const text of actTextList) {
        this.speechCmdList[text.toLowerCase()] = {
          act: JSON.stringify(action.cmd),
          device: device
        }
        this.speechTextList.push(text);
      }
    })
  }

  getProDeviceSpeechCmd(device: BlinkerDevice) {
    let deviceConfig = this.deviceConfigService.getDeviceConfig(device);
    if (typeof deviceConfig == 'undefined') return
    if (typeof deviceConfig.speech == 'undefined') return
    if (typeof deviceConfig.actions == 'undefined') return
    if (deviceConfig.actions == '') return
    let actions = JSON.parse(deviceConfig.actions);
    actions.forEach(action => {
      let actTextList = this.processCmd(device, action.text)
      for (const text of actTextList) {
        this.speechCmdList[text.toLowerCase()] = {
          act: JSON.stringify(action.cmd),
          device: device
        }
        this.speechTextList.push(text);
      }
    })
  }

  processCmd(device: BlinkerDevice, actcmd) {
    let cmd = actcmd
    let cmdList = []
    cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName))
    if (cmd.search(/\?name/) > -1) {
      let rooms = this.findRooms(device);
      for (const roomname of rooms) {
        cmdList.push(cmd.replace(/(\?|？)name/g, roomname + '的' + device.config.customName))
      }
    }
    // if (cmd.search(/\?room/) > -1) {
    //   let rooms = this.findRooms(device);
    //   for (const roomname of rooms) {
    //     cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName).replace(/(\?|？)room/g, roomname))
    //   }
    // } else {
    //   cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName))
    // }
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
