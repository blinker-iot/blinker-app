import { Component } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { randomId } from 'src/app/core/functions/func';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'page-dashboard-addblock',
  templateUrl: 'dashboard-addblock.html',
})
export class DashboardAddblockPage {

  allBlocklist = []

  get blockList() {
    return this.dataService.block
  }

  set blockList(newblockList) {
    this.dataService.block = newblockList
  }
  // groupName;
  // groupData;
  // blockData;
  // blockList = {
  //   order: [],
  //   data: {}
  // }

  get devices() {
    return this.dataService.device.dict
  }


  constructor(
    public deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService
  ) {
    // this.groupName = navParams.data.groupName
    // this.groupData = navParams.data.groupData
    // this.blockData = navParams.data.blockData
    // this.blockList = navParams.data;
  }

  ionViewDidLoad() {
    this.getBlockList()
  }

  dismiss() {
    // this.viewCtrl.dismiss();
  }

  getBlockList() {
    // this.allBlocklist = []
    // for (let deviceName of this.userService.deviceList) {
    //   let blocks = []
    //   if (this.devices[deviceName].deviceType != 'DiyArduino' && this.devices[deviceName].deviceType != 'DiyLinux') {
    //     let newblocks = JSON.parse(JSON.stringify(DeviceConfig[this.devices[deviceName].deviceType].config.dashboard));
    //     for (let dashboardblock of newblocks) {
    //       dashboardblock['deviceName'] = deviceName;
    //     }
    //     blocks = newblocks;
    //   } else
    //     for (let componentStr of this.devices[deviceName].config.dashboard) {
    //       let component = JSON.parse(componentStr)
    //       if (component.type == "btn" || component.type == "num") {
    //         if (component.type == "btn" && component.mode != 1) continue;
    //         // console.log(component);
    //       } else {
    //         continue;
    //       }
    //       let block = {
    //         deviceName: deviceName,
    //         key: component.key,
    //         ico: component.ico,
    //         // txt: component.t0,
    //         // unit: component.unit,
    //       }
    //       if (component.type == "btn") {
    //         block['type'] = 'swi';
    //         block['txt'] = this.devices[deviceName].config.customName
    //       } else if (component.type == "num") {
    //         block['type'] = 'num1';
    //         block['txt'] = component.t0
    //         block['unit'] = component.unit
    //       }
    //       blocks.push(block);
    //     }
    //   let deviceBlockList = {
    //     deviceName: deviceName,
    //     blocks: blocks
    //   }
    //   this.allBlocklist.push(deviceBlockList)
    // }
  }

  addBlock(block) {
    let id = randomId();
    // this.blockList.order.push(id);
    // this.blockList.data[id] = block;
  }

}
