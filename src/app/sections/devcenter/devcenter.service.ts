import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserService } from 'src/app/core/services/user.service';
import CryptoJS from 'crypto-js';
import { NoticeService } from 'src/app/core/services/notice.service';
import { API } from 'src/app/configs/app.config';
import { DataService } from 'src/app/core/services/data.service';

@Injectable({
  providedIn: 'root'
})
export class DevcenterService {

  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  datakeyList = [];
  proDeviceList = [];
  userLevel;
  dataKeyNum;
  dataKeyMaxNum;
  proDeviceNum;
  proDeviceMaxNum;

  // 暂存正在编辑的专属设备数据
  currentProDevice;

  constructor(
    private http: HttpClient,
    private userService: UserService,
    private noticeService: NoticeService,
    private dataService: DataService
  ) { }

  async getUserLevel(): Promise<boolean> {
    return this.http
      .get(API.DEV_CENTER.USER_LEVEL, {
        params: {
          uuid: this.uuid,
          token: this.token
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.dataKeyNum = data.detail.dataKeyNum;
          this.dataKeyMaxNum = data.detail.dataKeyMaxNum;
          this.proDeviceNum = data.detail.proDeviceNum;
          this.proDeviceMaxNum = data.detail.proDeviceMaxNum;
          this.userLevel = data.detail.userLevel;
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  async getDataKeys(): Promise<boolean> {
    return this.http
      .get(API.DEV_CENTER.DATAKEYS, {
        params: {
          uuid: this.uuid,
          token: this.token
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.datakeyList = [];
          // this.datakeyNum = 0;
          let datakeys = data.detail;
          for (let deviceId in datakeys) {
            let item = { deviceId: deviceId, keys: datakeys[deviceId] }
            // this.datakeyNum = this.datakeyNum + item.keys.length;
            this.datakeyList.push(item);
          }
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  delDataKey(deviceId, key): Promise<boolean> {
    return this.http
      .delete(API.DEV_CENTER.DATAKEYS, {
        params: {
          uuid: this.uuid,
          token: this.token,
          deviceName: deviceId,
          dataKeys: JSON.stringify([key])
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.dataKeyNum = this.dataKeyNum - 1;
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  addProDevice(config): Promise<boolean> {
    return this.http
      .post(API.DEV_CENTER.PRODEVICE,
        {
          "uuid": this.uuid,
          'token': this.token,
          "conf": JSON.stringify(config)
        })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  delProDevice(deviceType, password) {
    return this.http
      .delete(API.DEV_CENTER.PRODEVICE, {
        params: {
          uuid: this.uuid,
          token: this.token,
          deviceType: deviceType,
          password: CryptoJS.SHA256(password)
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.getProDevices();
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  getProDevices() {
    return this.http
      .get(API.DEV_CENTER.PRODEVICE, {
        params: {
          uuid: this.uuid,
          token: this.token,
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.proDeviceList = data.detail;
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  getProDeviceAuthKey(deviceType): Promise<string> {
    return this.http
      .get(API.DEV_CENTER.PRODEVICE_KEY, {
        params: {
          uuid: this.uuid,
          token: this.token,
          deviceType: deviceType
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return data.detail.typeKey
        }
        return 'error';
      })
      .catch(this.handleError);
  }

  getProDeviceConfig(deviceType): Promise<any> {
    this.currentProDevice = null;
    return this.http
      .get(API.DEV_CENTER.PRODEVICE_CONFIG, {
        params: {
          uuid: this.uuid,
          token: this.token,
          deviceType: deviceType
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.currentProDevice = data.detail;
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  getProDeviceLayouter(deviceType): Promise<any> {
    return this.http
      .get(API.DEV_CENTER.PRODEVICE_LAYOUTER, {
        params: {
          uuid: this.uuid,
          token: this.token,
          deviceType: deviceType
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return data.detail
        }
        return false;
      })
      .catch(this.handleError);
  }

  setProDeviceConfig(deviceType, config): Promise<any> {
    console.log(deviceType);
    console.log(config);
    return this.http
      .post(API.DEV_CENTER.PRODEVICE_CONFIG,
        {
          uuid: this.uuid,
          token: this.token,
          deviceType: deviceType,
          conf: JSON.stringify(config)
        })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  isAuthenticated(): Promise<boolean> {
    return this.http
      .get(API.DEV_CENTER.USER_AUTH, {
        params: {
          uuid: this.uuid,
          token: this.token
        }
      })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return (data.detail.verified == 1 ? true : false)
        }
      })
      .catch(this.handleError);
  }

  async uploadAuthInfo(authInfo): Promise<boolean> {
    await this.noticeService.showLoading('upload');
    let formData = new FormData();
    formData.append('uuid', this.userService.uuid);
    formData.append('token', this.userService.token);
    formData.append('vender', authInfo.vender);
    formData.append('idCard', authInfo.idCard);
    if (authInfo.type == 'enterprise')
      formData.append('charter', authInfo.charter);
    return this.http
      .post(API.DEV_CENTER.USER_AUTH, formData)
      .toPromise()
      .then(response => {
        console.log(response);
        this.noticeService.hideLoading();
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          console.log("上传成功");
          return true;
        } else {
          console.log("上传失败");
          return false;
        }
      })
      .catch(this.handleError);
  }

  async publicProDevice(deviceType): Promise<boolean> {
    await this.noticeService.showLoading('upload');
    let formData = new FormData();
    formData.append('uuid', this.userService.uuid);
    formData.append('token', this.userService.token);
    formData.append('deviceType', deviceType);
    return this.http
      .post(API.DEV_CENTER.PUBLIC_PRODEVICE, formData)
      .toPromise()
      .then(response => {
        console.log(response);
        this.noticeService.hideLoading();
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          console.log("发布成功");
          return true;
        } else {
          console.log("发布失败");
          return false;
        }
      })
      .catch(this.handleError);
  }

  private handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }

}
