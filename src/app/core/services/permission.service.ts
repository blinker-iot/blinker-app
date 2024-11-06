import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
// import { Diagnostic } from '@awesome-cordova-plugins/diagnostic/ngx';
// import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/ngx'
import { NoticeService } from './notice.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionService {

  constructor(
    // private diagnostic: Diagnostic,
    // private androidPermissions: AndroidPermissions,
    private platform: Platform,
    private noticeService: NoticeService
  ) {

  }

  checkCoarseLocation() {
    // return this.checkPermission(this.androidPermissions.PERMISSION.ACCESS_COARSE_LOCATION)
  }

  checkFineLocation() {
    // return this.checkPermission(this.androidPermissions.PERMISSION.ACCESS_FINE_LOCATION)
  }

  checkPermission(permission) {
    // return new Promise<boolean>(async (resolve, reject) => {
    //   if (!this.platform.is('android')) resolve(false);
    //   let result = await this.androidPermissions.checkPermission(permission)
    //   if (result.hasPermission) {
    //     resolve(true);
    //   } else {
    //     this.androidPermissions.requestPermission(permission)
    //   }
    //   let t1, t2;
    //   t1 = window.setInterval(async () => {
    //     let result = await this.androidPermissions.checkPermission(permission)
    //     if (result.hasPermission) {
    //       window.clearInterval(t1);
    //       window.clearTimeout(t2);
    //       resolve(true);
    //     }
    //   }, 1900)
    //   t2 = window.setTimeout(() => {
    //     window.clearInterval(t1);
    //     window.clearTimeout(t2);
    //     resolve(false);
    //   }, 19000);
    // })
  }


  async CheckWifiAvailability(options = { showNotice: true }) {
    // if (await this.diagnostic.isWifiAvailable()) {
    //   return true;
    // } else {
    //   if (options.showNotice)
    //     this.noticeService.showAlert('openWifi')
    //   return false;
    // }
  }

  async CheckBleAvailability(options = { showNotice: true }) {
    // if (await this.diagnostic.getBluetoothState() == this.diagnostic.bluetoothState.POWERED_ON) {
    //   await this.androidPermissions.checkPermission(this.androidPermissions.PERMISSION.ACCESS_COARSE_LOCATION);
    //   return true;
    // } else {
    //   if (options.showNotice)
    //     this.noticeService.showAlert('openBluetooth')
    //   return false;
    // }
  }



}
