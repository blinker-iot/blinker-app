import {
  Component,
  ViewChildren,
  QueryList,
  ElementRef,
} from '@angular/core';
import {
  AlertController,
  Events,
} from '@ionic/angular';
import { Router } from '@angular/router';
import Sortable from 'sortablejs';
import { DataService } from 'src/app/core/services/data.service';
import { RoomService } from '../room.service';


@Component({
  selector: 'room-manager',
  templateUrl: 'room-manager.html',
  styleUrls: ['room-manager.scss']
})
export class RoomManagerPage {

  @ViewChildren("sortbox") sortbox: QueryList<ElementRef>;

  loaded = false;
  alert;
  editMode = false;
  oldRoomData;

  get roomData() {
    return this.dataService.room
  }

  get roomDataDict() {
    return this.dataService.room.dict
  }

  get roomDataList() {
    return this.dataService.room.list
  }

  set roomDataList(list) {
    this.dataService.room.list = list
  }

  constructor(
    private router: Router,
    private roomService: RoomService,
    private alertCtrl: AlertController,
    private events: Events,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.fixRoomData()
        this.oldRoomData = JSON.stringify(this.roomData)
        this.loaded = loaded;
      }
    })
  }

  // 修复早起版本造成的数据错误
  fixRoomData() {
    Object.keys(this.roomDataDict).forEach(key => {
      if (key == 'undefined')
        delete this.roomDataDict['undefined']
    })
  }

  // 退出页面时保存数据
  ngOnDestroy() {
    if (this.oldRoomData == JSON.stringify(this.roomData)) return;
    this.saveConfig();
  }

  switchMode() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      setTimeout(() => {
        this.initSortable()
      }, 100);
    } else {
      this.destroySortable()
    }
  }

  async addRoom() {
    // if (typeof this.userService.roomList.order != 'undefined')
    if (this.roomDataList.length > 98) {
      this.events.publish('provider:notice', 'tooManyRooms')
      return;
    }
    this.alert = await this.alertCtrl.create({
      header: '新建房间',
      subHeader: '请设置新房间名称',
      inputs: [{ name: 'newRoomName', value: '新的房间', placeholder: '新的房间' }],
      buttons: [
        {
          text: '取消', handler: data => {
            console.log('Cancel clicked')
          }
        },
        {
          text: '确认', handler: data => {
            if (data.newRoomName.length == 0) return;
            if (data.newRoomName.length > 10) {
              this.events.publish('provider:notice', 'tooLongRoomName')
              return;
            }
            if (this.roomIsExist(data.newRoomName)) {
              this.events.publish('provider:notice', 'sameRoomName')
              return;
            }
            this.newRoom(data.newRoomName);
            this.editRoom(data.newRoomName);
          }
        }
      ]
    });
    this.alert.present();
  }

  editRoom(roomName) {
    this.router.navigate(['room-manager', roomName])
  }

  roomIsExist(roomName) {
    // if (typeof this.userService.roomList.order != 'undefined')
    if (this.roomDataList.indexOf(roomName) > -1) return true;
    return false
  }

  newRoom(roomName) {
    this.roomDataList.push(roomName);
    this.roomDataDict[roomName] = []
  }

  async delRoomAlert(roomName) {
    this.alert = await this.alertCtrl.create({
      header: '确定要删除该房间？',
      subHeader: '房间内的设备不会被删除',
      buttons: [
        {
          text: '取消', handler: data => {
            console.log('Cancel clicked')
          }
        },
        {
          text: '确认', handler: data => {
            this.delRoom(roomName)
          }
        }
      ]
    });
    this.alert.present();
  }

  delRoom(roomName) {
    let index = this.roomDataList.indexOf(roomName);
    if (index > -1) {
      this.roomDataList.splice(index, 1);
    }
    delete this.roomDataDict[roomName]
  }

  sortable;
  initSortable() {
    let box = this.sortbox.first;
    // let box = this.content.getNativeElement()
    if (typeof box == 'undefined') return;
    console.log("init Sortablejs");
    this.sortable = new Sortable(box.nativeElement, {
      handle: ".handle",
      animation: 150,
      chosenClass: "schosen",
      dragClass: "sdrag",
      dataIdAttr: "id",
      scroll: false,
    });
  }

  destroySortable() {
    this.roomDataList = this.sortable.toArray();
    this.sortable.destroy();
  }

  saveConfig() {
    this.roomService.saveData(this.roomData);
  }

}
