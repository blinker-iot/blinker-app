import { Component, OnInit } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { AlertController } from '@ionic/angular';
import { arrayRemove } from 'src/app/core/functions/func';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'devcenter-datakey',
  templateUrl: './datakey.component.html',
  styleUrls: ['./datakey.component.scss']
})
export class DatakeyComponent implements OnInit {

  loaded = false;

  get datakeyList() {
    return this.devcenterService.datakeyList
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(
    private devcenterService: DevcenterService,
    private dataService: DataService,
    private alertCtrl: AlertController
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded;
        this.devcenterService.getDataKeys();
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  async delDataKey(deviceId, key, index) {
    let alert = await this.alertCtrl.create({
      header: '数据删除确认',
      message: '数据Key删除后，对应历史数据将被清除，且<b>无法找回</b>，是否确认删除？',
      buttons: [
        {
          text: '取消',
          handler: () => {
          }
        }, {
          text: '确认删除',
          handler: () => {
            this.devcenterService.delDataKey(deviceId, key).then(result => {
              if (result) this.delLocalkey(deviceId, index)
            });
          }
        }
      ]
    });
    alert.present();
  }

  delLocalkey(deviceId, index) {
    for (let item of this.datakeyList) {
      if (item.deviceId == deviceId) {
        arrayRemove(item.keys, index);
      }
    }
  }

  trackByFn(index, device) {
    return device.deviceId
  }

}
