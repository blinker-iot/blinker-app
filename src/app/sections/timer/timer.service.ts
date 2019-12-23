import { Injectable } from '@angular/core';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { Events } from '@ionic/angular';

@Injectable()
export class TimerService {

  currentDevice;

  currentCmdList;
  currentCmdByText;
  currentCmdByAct;

  constructor(
    private devicelistService: DevicelistService,
    private deviceService: DeviceService,
    private events: Events,
  ) { }

  loadTask(task = 'timing') {
    //弹出提示：正在同步定时数据
    this.events.publish("loading:show", "loadingTiming");
    window.setTimeout(() => {
      this.events.publish("loading:hide", "loadingTiming");
    }, 1000);
    this.deviceService.sendData(this.currentDevice, `{"get":"${task}"}`)
  }

  getProDeviceCmd(device: BlinkerDevice) {
    this.currentCmdList = []
    let cmdByAct = {}
    let deviceConfig = this.devicelistService.getDeviceConfig(device);
    console.log(deviceConfig);
    
    if (typeof deviceConfig.timer == 'undefined') return
    for (const timerCmd of deviceConfig.timer) {
      let cmdList = this.processCmd(device, timerCmd.cmd)
      for (const cmdtext of cmdList) {
        cmdByAct[timerCmd.act] = cmdtext
        this.currentCmdList.push({ cmd: cmdtext, act: timerCmd.act })
      }
    }
    // this.currentCmdByText = cmdByText
    this.currentCmdByAct = cmdByAct
    console.log(this.currentCmdList);

  }

  processCmd(device: BlinkerDevice, cmd) {
    let cmdList = []
    // if (cmd.search(/\?room/) > -1) {
    //   let rooms = this.findRooms(device);
    //   for (const roomname of rooms) {
    //     cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName).replace(/(\?|？)room/g, roomname))
    //   }
    // } else {
    cmdList.push(cmd.replace(/(\?|？)name/g, device.config.customName))
    // }
    return cmdList
  }

  // findRooms(device: BlinkerDevice) {
  //   let rooms = []
  //   for (const roomname of this.roomList.order) {
  //     if (this.roomList.data[roomname].indexOf(device.id) > -1)
  //       rooms.push(roomname)
  //   }
  //   return rooms
  // }

}
