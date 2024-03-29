import { Component } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { ShareService } from '../share.service';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'share-manager',
  templateUrl: 'share-manager.html',
  styleUrls: ['share-manager.scss']
})
export class ShareManagerPage {

  loaded = false

  _tab = 0;
  sharedSelected;
  shared0Selected0;
  shared0Selected1;

  sharedDeviceList = []

  set tab(tab) {
    this._tab = tab;
  }

  get tab() {
    return this._tab
  }

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  get shareData() {
    return this.dataService.share
  }

  constructor(
    public userService: UserService,
    public deviceService: DeviceService,
    private shareService: ShareService,
    private dataService: DataService
  ) {
  }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.shareService.getShareList().then(result => {
          if (result) {
            if (this.shareData.shared0.length > 0) this.changeTab(1);
            this.shareData.shared.forEach(sharedDevice => {
              this.sharedDeviceList.push(sharedDevice.deviceName)
            });
            this.loaded = loaded
          }
        });
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  changeTab(num) {
    this.tab = num;
  }

  isSharedDevice(deviceId) {
    if (this.sharedDeviceList.indexOf(deviceId) > -1) return true;
    return false
  }

  // gotoEdit(deviceId) {
  //   // this.navCtrl.push('ShareEditPage', this.devices[deviceName])
  // }

  accept(taskId, index = 99) {
    this.shared0Selected0 = index;
    setTimeout(() => {
      this.shareService.acceptSharedDevice(taskId).then(() => {
        this.shared0Selected0 = 99;
        this.userService.getAllInfo();
      });
    }, 500);
  }

  refuse(taskId, index = 99) {
    this.shared0Selected1 = index;
    setTimeout(() => {
      this.shareService.refuseSharedDevice(taskId).then(() => {
        this.shared0Selected1 = 99;
      });
    }, 500);
  }

  cancel(deviceName, index = 99) {
    this.sharedSelected = index;
    setTimeout(() => {
      this.shareService.deleteSharedDevice(deviceName).then(() => {
        this.sharedSelected = 99;
      });
    }, 500);
  }

}
