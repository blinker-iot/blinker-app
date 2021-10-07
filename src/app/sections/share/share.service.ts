import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerResponse } from 'src/app/core/model/response.model';
// import { LoaderService } from 'src/app/core/services/loader.service';

@Injectable({
  providedIn: 'root'
})
export class ShareService {

  get uuid() {
    return this.dataService.auth.uuid;
  }

  get token() {
    return this.dataService.auth.token
  }

  get shareData() {
    return this.dataService.share
  }

  set shareData(data) {
    this.dataService.share = data
  }

  // _shareList;
  // set shareList(shareList) {
  //   if (typeof shareList.share == 'undefined' || typeof shareList.shared == 'undefined' || typeof shareList.share0 == 'undefined' || typeof shareList.shared0 == 'undefined')
  //     shareList = {
  //       share: {},
  //       shared: [],
  //       share0: {},
  //       shared0: [],
  //     }
  //   this._shareList = shareList
  // }

  // get shareList() {
  //   return this._shareList
  // }

  get sharedDeviceList() {
    let list = [];
    for (let deviceItem of this.shareData.shared) {
      list.push(deviceItem.deviceName)
    }
    return list;
  }

  loaded = new BehaviorSubject(false);

  constructor(
    private http: HttpClient,
    private userService: UserService,
    private dataService: DataService
    // private loader: LoaderService
  ) {
    // this.loader.loadModule(this.constructor.name, this)
  }

  init() {

  }

  // 主用户分享
  shareDevice2User(device, phone): Promise<boolean> {
    let sharedata = {}
    sharedata[device.deviceName] = [phone]
    return this.http.post<BlinkerResponse>(API.SHARE.SHARE_DEVIE,
      {
        uuid: this.uuid,
        token: this.token,
        devices: [sharedata]
      })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.shareData = resp.detail;
          return true;
        }
        return false;
      })
      .catch(this.handleError);
  }

  // 主用户取消分享
  deleteShareDevice2User(deviceName, uuid): Promise<boolean> {
    let sharedata = {}
    sharedata[deviceName] = [uuid]
    return this.http.post<BlinkerResponse>(API.SHARE.DEL_SHARE, {
      uuid: this.uuid,
      token: this.token,
      devices: JSON.stringify([sharedata])
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.shareData = resp.detail;
          return true;
        }
        return false;
      })
      .catch(this.handleError);
  }


  // 拉取shareList
  getShareList(): Promise<boolean> {
    return this.http.get<BlinkerResponse>(API.SHARE.SHARE_LIST, {
      params: {
        uuid: this.uuid,
        token: this.token
      }
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.shareData = resp.detail;
          return true
        }
        return false;
      })
      .catch(this.handleError);
  }

  // 子用户同意分享
  acceptSharedDevice(taskId): Promise<boolean> {
    return this.http.post<BlinkerResponse>(API.SHARE.ACCEPT_SHARED, {
      uuid: this.uuid,
      token: this.token,
      tasks: JSON.stringify([taskId])
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.shareData = resp.detail
          return true;
        }
        return false;
      })
      .catch(this.handleError);
  }

  // 子用户拒绝分享
  refuseSharedDevice(taskId): Promise<boolean> {
    return this.http.post<BlinkerResponse>(API.SHARE.REFUSE_SHARED, {
      uuid: this.uuid,
      token: this.token,
      tasks: JSON.stringify([taskId])
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.shareData = resp.detail
          return true;
        }
        return false;
      })
      .catch(this.handleError);
  }

  // 子用户删除分享 
  deleteSharedDevice(deviceName): Promise<boolean> {
    return this.http.post<BlinkerResponse>(API.SHARE.DEL_SHARED, {
      uuid: this.uuid,
      token: this.token,
      devices: JSON.stringify([deviceName])
    })
      .toPromise()
      .then(resp => {
        console.log(resp);
        if (resp.message == 1000) {
          this.shareData = resp.detail
          // this.getDeviceInfo();
          return true;
        }
        return false;
      })
      .catch(this.handleError);
  }

  private handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }

}
