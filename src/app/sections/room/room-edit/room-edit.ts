import { Component } from '@angular/core';
import { AlertController, Events } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'page-room-edit',
  templateUrl: 'room-edit.html',
  styleUrls: ['room-edit.scss']
})
export class RoomEditPage {
  roomName;
  tempRoomName = "unknown";
  alert;
  // currentRoomData;

  get roomDataDict() {
    return this.dataService.room.dict
  }

  get roomDataList() {
    return this.dataService.room.list
  }

  get deviceDataDict(){
    return this.dataService.device.dict
  }

  get deviceDataList(){
    return this.dataService.device.list
  }

  get currentRoomData() {
    return this.dataService.room.dict[this.roomName]
  }

  set currentRoomData(data) {
    this.dataService.room.dict[this.roomName] = data
  }

  constructor(
    private dataService: DataService,
    private alertCtrl: AlertController,
    private events: Events,
    private activatedRoute: ActivatedRoute
  ) {
  }

  ngOnInit() {
    this.roomName = this.activatedRoute.snapshot.params['room'];
    // this.currentRoomData = this.dataService.room.dict[this.roomName];
    this.tempRoomName = this.roomName;
    this.removeInvalidDevice();
  }

  // 移除已解绑设备
  removeInvalidDevice() {
    let newRoomData = []
    for (let deviceId of this.currentRoomData) {
      if (typeof this.deviceDataDict[deviceId] != 'undefined') {
        newRoomData.push(deviceId);
      }
    }
    this.currentRoomData = newRoomData;
  }

  async changeRoomName() {
    this.alert = await this.alertCtrl.create({
      header: '修改房间名',
      inputs: [{ name: 'newRoomName', value: this.tempRoomName, placeholder: this.tempRoomName }],
      buttons: [
        {
          text: '取消', handler: data => {
            console.log('Cancel clicked')
          }
        },
        {
          text: '确认修改', handler: data => {
            // console.log(data.newRoomName.length);
            if (data.newRoomName.length == 0) return;
            if (data.newRoomName.length > 10) {
              this.events.publish('provider:notice', 'tooLongroomName')
              return;
            }
            if (this.roomIsExist(data.newRoomName)) {
              this.events.publish('provider:notice', 'sameroomName')
              return;
            }
            this.tempRoomName = data.newRoomName;
            this.renameRoom(this.tempRoomName)
          }
        }
      ]
    });
    this.alert.present();
  }

  renameRoom(newRoomName) {
    let oldRoomnam = this.roomName;
    // 使用新名字新建room
    let index = this.roomDataList.indexOf(oldRoomnam);
    this.roomDataList.splice(index + 1, 0, newRoomName);
    this.roomDataDict[newRoomName] = this.roomDataDict[oldRoomnam];
    this.roomName = newRoomName;
    // 删除原本的room
    this.roomDataList.splice(index, 1);
    delete this.roomDataDict[oldRoomnam];
  }

  isExist(deviceName) {
    if (this.currentRoomData.indexOf(deviceName) > -1)
      return true;
    return false;
  }

  roomIsExist(roomName) {
    if (this.roomDataList.indexOf(roomName) > -1) return true;
    return false
  }

  delDevice(deviceName) {
    let index = this.currentRoomData.indexOf(deviceName);
    if (index > -1) {
      this.currentRoomData.splice(index, 1);
    }
  }

  addDevice(deviceName) {
    this.currentRoomData.push(deviceName);
  }

}
