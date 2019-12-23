import CryptoJS from 'crypto-js';
import { DeviceService } from '../../core/services/device.service';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Events } from '@ionic/angular';
import { Storage } from '@ionic/storage';
import { NoticeService } from '../../core/services/notice.service';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class UserService {

  loaded = new BehaviorSubject(false);

  constructor(
    private http: HttpClient,
    private storage: Storage,
    private events: Events,
    private deviceService: DeviceService,
    private noticeService: NoticeService,
    private sanitizer: DomSanitizer,
  ) { }

  // async login(username, password): Promise<boolean> {
  //   // this.events.publish("loading:show", "login");
  //   await this.noticeService.showLoading('login');
  //   return this.http
  //     .get(this.serverUrl + '/user/login?username=' + username + '&password=' + this.sha256(password))
  //     .toPromise()
  //     .then(response => {
  //       let data = JSON.parse(JSON.stringify(response));
  //       // console.log(data);
  //       if (data.message == 1000) {
  //         this.storage.set('localUser', data.detail);
  //         this.localStorage.uuid = data.detail.uuid;
  //         this.localStorage.token = data.detail.token;
  //         // console.log("uuid:" + this.localStorage.uuid);
  //         // console.log("token:" + this.localStorage.token);
  //         return true
  //       } else {
  //         return false
  //       }
  //     })
  //     .catch(this.handleError);
  // }

  // logout() {
  //   this.deleteLocalStorage();
  //   this.deviceService.disconnectMqttBroker();
  // }

  // initCheckToken() {
  //   this.events.unsubscribe('UserService:checkToken');
  //   this.events.subscribe('UserService:checkToken', () => {
  //     this.getUserInfo();
  //   })
  // }

  // getSmscode(phone, action): Promise<any> {
  //   return this.http
  //     .get(this.serverUrl + "/user/smscode?" +
  //       "phone=" + phone +
  //       "&sendType=" + action
  //     )
  //     .toPromise()
  //     .then(response => {
  //       console.log(response);
  //       let data = JSON.parse(JSON.stringify(response));
  //       if (data.message == 1000) {
  //         return true;
  //       } else
  //         return false;
  //     })
  //     .catch(this.handleError);
  // }

  // register(phone, smscode, password): Promise<boolean> {
  //   // this.events.publish("loading:show", "register");
  //   return this.http
  //     .get(this.serverUrl + "/user/register?username=" + phone + "&phone=" + phone + '&smsCode=' + smscode + "&password=" + this.sha256(password))
  //     .toPromise()
  //     .then(response => {
  //       console.log(response);
  //       let data = JSON.parse(JSON.stringify(response));
  //       if (data.message == 1000) {
  //         this.storage.set('user', data.detail);
  //         this.localStorage.token = data.detail.token;
  //         this.localStorage.uuid = data.detail.uuid;
  //         console.log("uuid:" + this.localStorage.uuid);
  //         console.log("token:" + this.localStorage.token);
  //         // this.events.publish("loading:hide", "");
  //         return true;
  //       } else
  //         return false;
  //     })
  //     .catch(this.handleError);
  // }

  // retrieve(phone, smscode, password): Promise<boolean> {
  //   return this.http
  //     .get(this.serverUrl + "/user/password/reset?phone=" + phone + '&smsCode=' + smscode + "&password=" + this.sha256(password))
  //     .toPromise()
  //     .then(response => {
  //       console.log(response);
  //       let data = JSON.parse(JSON.stringify(response));
  //       if (data.message == 1000) {
  //         return true;
  //       } else
  //         return false;
  //     })
  //     .catch(this.handleError);
  // }
}
