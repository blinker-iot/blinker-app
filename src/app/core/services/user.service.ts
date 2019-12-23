import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Events } from '@ionic/angular';
import { sha256 } from '../functions/func';
import { NoticeService } from './notice.service';
import { BehaviorSubject } from 'rxjs';
import { BlinkerResponse } from '../model/response.model';
import { API } from 'src/app/configs/app.config';
import { DataService } from './data.service';


@Injectable({
  providedIn: 'root'
})
export class UserService {

  loaded = new BehaviorSubject(false);

  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  constructor(
    private http: HttpClient,
    private events: Events,
    private dataService: DataService,
    private noticeService: NoticeService,
  ) { }

  // 用于其他手机登录检测
  initCheckToken() {
    this.events.unsubscribe('UserService:checkToken');
    this.events.subscribe('UserService:checkToken', () => {
      this.getUserInfo();
    })
  }

  async getAllInfo(): Promise<boolean> {
    // console.log("uuid: " + this.uuid);
    // console.log("token:" + this.token);
    this.initCheckToken();
    // 不知为何loading会卡住不出来 2019.9.9
    // await this.noticeService.showLoading('load');

    return this.http.get<BlinkerResponse>(API.USER.ALL, {
      params: {
        uuid: this.uuid,
        token: this.token
      }
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.dataService.load(resp.detail)
          this.noticeService.hideLoading();
          this.loaded.next(true);
          return true;
        }
        else {
          this.events.publish("loading:hide", "hide");
          this.noticeService.hideLoading();
          return false;
        }
      })
      .catch(this.handleError);
  }

  getUserInfo(): Promise<boolean> {
    return this.http
      .get(API.USER.INFO, {
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
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  getDeviceInfo(): Promise<boolean> {
    return this.http.get(API.USER.DEVICE, {
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
          // this.deviceService.devices = data.detail.devices;
          // this.deviceList = data.detail.deviceList;
          // this.events.publish('deviceList', 'update')
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  saveUserConfig(userConfig): Promise<boolean> {
    return this.http.post(API.USER.SAVE_CONFIG,
      {
        uuid: this.uuid,
        token: this.token,
        userConf: JSON.stringify(userConfig)
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

  delDevice(device) {
    return this.http.get(API.USER.DEL_DEVICE, {
      params: {
        uuid: this.uuid,
        token: this.token,
        deviceName: device.deviceName
      }
    })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  unbindDevice(device) {
    this.delDevice(device)
  }

  bindDevice(device) {
    return new Promise<boolean>(
      async (resolve, reject) => {
        this.getDeviceInfo();
      }
    )
  }

  changePassword(oldPassword, newPassword): Promise<boolean> {
    return this.http
      .get(API.USER.CHANGE_PASSWORD, {
        params: {
          uuid: this.uuid,
          token: this.token,
          oldPassword: sha256(oldPassword),
          newPassword: sha256(newPassword)
        }
      }
      )
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  changeProfile(Newusername): Promise<any> {
    return this.http
      .get(API.USER.CHANGE_PROFILE,
        {
          params: {
            uuid: this.uuid,
            token: this.token,
            username: Newusername
          }
        }
      )
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  uploadAvatar(newAvatar): Promise<boolean> {
    const formData = new FormData();
    formData.append('file', newAvatar);
    formData.append('uuid', this.uuid);
    formData.append('token', this.token);
    return this.http.post(API.USER.UPLOAD_AVATAR, formData)
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          console.log("头像上传成功");
          return true;
        } else {
          console.log("头像上传失败");
          return false;
        }
      })
      .catch(this.handleError);
  }

  handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }

}
