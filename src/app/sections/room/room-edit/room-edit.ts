import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController, IonicModule } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { RoomService } from '../room.service';


@Component({
  selector: 'page-room-edit',
  standalone: true,
  templateUrl: 'room-edit.html',
  styleUrls: ['room-edit.scss'],
  imports: [
    CommonModule,
    IonicModule,
    BDeviceImgComponent,
  ],
})
export class RoomEditPage implements OnInit, OnDestroy {
  roomName = '';
  tempRoomName = 'unknown';
  alert;
  loaded = false;
  private originalRoomData = '';
  private subscription;

  get roomDataDict() {
    return this.dataService.room?.dict ?? {};
  }

  get roomDataList() {
    return this.dataService.room?.list ?? [];
  }

  get deviceDataDict() {
    return this.dataService.device?.dict ?? {};
  }

  get deviceDataList() {
    return this.dataService.device?.list ?? [];
  }

  get availableDeviceDataList(): string[] {
    return this.deviceDataList.filter(deviceId => !this.isExist(deviceId));
  }

  get currentRoomData() {
    return this.roomDataDict[this.roomName] ?? [];
  }

  set currentRoomData(data: string[]) {
    if (this.dataService.room?.dict) {
      this.dataService.room.dict[this.roomName] = data;
    }
  }

  constructor(
    private dataService: DataService,
    private roomService: RoomService,
    private alertCtrl: AlertController,
    private noticeService: NoticeService,
    private activatedRoute: ActivatedRoute
  ) {
  }

  ngOnInit(): void {
    this.subscription = this.dataService.userDataLoader.subscribe(() => {
      this.bindRoom();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.alert?.dismiss();

    if (!this.loaded || this.originalRoomData === JSON.stringify(this.dataService.room)) {
      return;
    }
    void this.roomService.saveData(this.dataService.room);
  }

  private bindRoom(): void {
    const roomName = this.activatedRoute.snapshot.params['room'];
    const room = this.dataService.room;
    if (!room?.dict || !Array.isArray(room.dict[roomName]) || !this.dataService.device) {
      return;
    }

    this.roomName = roomName;
    this.tempRoomName = roomName;
    this.originalRoomData = JSON.stringify(room);
    this.removeInvalidDevice();
    this.loaded = true;
  }

  // 移除已解绑设备
  removeInvalidDevice() {
    const newRoomData: string[] = [];
    for (const deviceId of this.currentRoomData) {
      if (typeof this.deviceDataDict[deviceId] !== 'undefined') {
        newRoomData.push(deviceId);
      }
    }
    this.currentRoomData = newRoomData;
  }

  async changeRoomName() {
    this.alert = await this.alertCtrl.create({
      header: '修改房间名称',
      inputs: [{ name: 'newRoomName', value: this.tempRoomName, placeholder: this.tempRoomName }],
      buttons: [
        {
          text: '取消',
          role: 'cancel',
        },
        {
          text: '确认修改', handler: data => {
            const newRoomName = data.newRoomName?.trim();
            if (!newRoomName || newRoomName === this.roomName) return;
            if (newRoomName.length > 10) {
              this.noticeService.showToast('tooLongRoomName');
              return;
            }
            if (this.roomIsExist(newRoomName)) {
              this.noticeService.showToast('sameRoomName');
              return;
            }
            this.renameRoom(newRoomName);
          }
        }
      ]
    });
    await this.alert.present();
  }

  renameRoom(newRoomName: string): void {
    const oldRoomName = this.roomName;
    // 使用新名字新建room
    const index = this.roomDataList.indexOf(oldRoomName);
    if (index < 0) return;

    this.roomDataList.splice(index, 1, newRoomName);
    this.roomDataDict[newRoomName] = this.roomDataDict[oldRoomName];
    this.roomName = newRoomName;
    this.tempRoomName = newRoomName;
    // 删除原本的room
    delete this.roomDataDict[oldRoomName];
  }

  isExist(deviceName: string): boolean {
    return this.currentRoomData.includes(deviceName);
  }

  roomIsExist(roomName: string): boolean {
    return this.roomDataList.includes(roomName);
  }

  delDevice(deviceName: string): void {
    const index = this.currentRoomData.indexOf(deviceName);
    if (index > -1) {
      this.currentRoomData.splice(index, 1);
    }
  }

  addDevice(deviceName: string): void {
    if (!this.isExist(deviceName)) {
      this.currentRoomData.push(deviceName);
    }
  }

}
