import { Component, Input } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'dashboard-block',
  templateUrl: 'dashboard-block.html'
})
export class DashboardBlockComponent {

  @Input() blockId;

  @Input() editMode = false;

  refresh = false;
  get block() {
    // return this.userService.blockList.data[this.blockId]
    return
  }

  isUnbind() {
    // if (typeof this.deviceService.devices[this.block.deviceName] == 'undefined') return true;
    return false
  }

  get val() {
    if (this.isUnbind()) return;
    // if (typeof this.deviceService.devices[this.block.deviceName].data[this.block.key] == 'undefined') return;
    // // DIY设备数据
    // if (typeof this.deviceService.devices[this.block.deviceName].data[this.block.key]['val'] != 'undefined')
    //   return this.deviceService.devices[this.block.deviceName].data[this.block.key]['val'];
    // // 专属设备数据
    // return this.deviceService.devices[this.block.deviceName].data[this.block.key]
  }

  get switch() {
    if (this.isUnbind()) return;
    // return this.deviceService.devices[this.block.deviceName].data[this.block.key]
  }

  get device() {
    if (this.isUnbind()) return;
    // return this.deviceService.devices[this.block.deviceName]
  }

  constructor(
    public deviceService: DeviceService,
    public userService: UserService,
    public alertCtrl: AlertController,
  ) {

  }

  alert;
  editTxt() {
    // this.alert = this.alertCtrl.create({
    //   title: '修改名称',
    //   inputs: [{ name: 'newTxt', value: this.block.txt, placeholder: this.block.txt }],
    //   buttons: [
    //     {
    //       text: '取消', handler: data => {
    //         console.log('Cancel clicked')
    //       }
    //     },
    //     {
    //       text: '确认', handler: data => {
    //         this.block.txt = data.newTxt
    //       }
    //     }
    //   ]
    // });
    // this.alert.present();
  }

  tap() {
    // if (this.editMode) {
    //   this.editTxt()
    //   return;
    // }
    // if (typeof this.device == 'undefined') return;
    // this.refresh = true;
    // setTimeout(() => {
    //   this.refresh = false;
    // }, 1000);
    // if (this.block.type == 'swi') {
    //   let message;
    //   if (this.val == 'off') {
    //     message = `{"switch":"on"}`;
    //   } else {
    //     message = `{"switch":"off"}`;
    //   }
    //   console.log(this.block.deviceName);
    //   this.deviceService.pubMessage(this.device, message);
    // } else if (this.block.type.indexOf('num') > -1) {
    //   this.deviceService.queryDevice(this.device);
    // }

  }



}
