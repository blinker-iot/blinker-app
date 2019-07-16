import { NoticeProvider } from './../notice/notice';
// import { toPromise } from 'rxjs/operator/toPromise';
import CryptoJS from 'crypto-js';
// import { Device, Broker } from '../../classes/device';
import { FileTransfer } from '@ionic-native/file-transfer';
import { DeviceProvider } from '../device/device';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Events } from 'ionic-angular';
import { Storage } from '@ionic/storage';
import { randomString, deviceName2Mac } from '../../functions/func'

import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { AutoProvider } from '../auto/auto';

@Injectable()
export class UserProvider {
  // serverUrl = "http://192.168.1.250:8888/";
  // username: string;
  // phone: string;
  // avatar: string;
  // token: string;
  // uuid: string;

  // localUser = {
  //   "uuid": "uuid",
  //   "token": "token",
  //   "username": "username",
  //   "avatar": "url",
  //   "phone": "phone"
  // };
  // localConfig = {
  //   // "deviceList": [],
  //   "autoStart": false,
  //   "allowNotice": true,
  // }

  public localStorage = {
    "uuid": "uuid",
    "token": "token",
    "user": {
      "username": "username",
      "avatar": "",
      "phone": "phone",
    },
    "app": {
      "autoStart": false,
      "allowNotice": true,
      "displayMode": "grid",
    },
    "data": {
      "deviceList": [],
      "roomList": {
        "order": [
          // "房间1",
          // "房间2",
          // "房间3",
          // "房间4",
          // "房间5",
          // "房间6",
          // "房间7",
          // "房间8"
        ],
        "data": {
          // "房间1": ["DEFAC18A1DDW"],
          // "房间2": ["3CA5090A2FCA", "31D28E9CD64B", "68C63AD6CCBC"],
          // "房间3": ["3F4DD79ANN37", "D43639DF7173", "D43639DF71A3", "3A55687ASM2Y"]
          // "房间1": [],
          // "房间2": [],
          // "房间3": [],
          // "房间4": [],
          // "房间5": [],
          // "房间6": [],
          // "房间7": [],
          // "房间8": []
        }
      },
      "sceneList": {
        // "order": [
        //   "房间1",
        //   "房间2",
        //   "房间3"
        // ],
        // "data": {
        //   "房间1": ["DEFAC18A1DDW"],
        //   "房间2": ["3CA5090A2FCA", "31D28E9CD64B", "68C63AD6CCBC"],
        //   "房间3": ["3F4DD79ANN37", "D43639DF7173", "D43639DF71A3", "3A55687ASM2Y"]
        // }
      }
    }
  };

  set deviceList(deviceList) {
    this.localStorage.data.deviceList = deviceList;
  }

  get avatar() {
    return this.localStorage.user.avatar
  }

  get username() {
    return this.localStorage.user.username
  }

  get phone() {
    return this.localStorage.user.phone
  }

  get deviceList() {
    return this.localStorage.data.deviceList
  }

  get roomList() {
    return this.localStorage.data.roomList
  }

  get sceneList() {
    return this.localStorage.data.sceneList
  }

  get appConf() {
    return this.localStorage.app
  }

  get uuid() {
    return this.localStorage.uuid
  }

  get token() {
    return this.localStorage.token
  }

  get userInfo() {
    return this.localStorage.user
  }

  constructor(
    public http: HttpClient,
    private storage: Storage,
    private transfer: FileTransfer,
    public events: Events,
    private deviceProvider: DeviceProvider,
    private noticeProvider: NoticeProvider,
    private autoProvider: AutoProvider
  ) {
    this.noticeProvider.init();
  }

  isLogin(): Promise<boolean> {
    // this.deleteLocalStorage()
    return this.loadLocalStorage();
  }

  // loadLocalUser(): Promise<boolean> {
  //   return this.storage.get('localUser').then(localUserStorage => {
  //     if (localUserStorage == null) return false;
  //     this.localStorage = localUserStorage;
  //     return true
  //   });
  // }

  // saveLocalUser() {
  //   this.storage.set('localUser', this.localStorage);
  // }

  deleteLocalStorage() {
    this.storage.remove('localStorage');
  }

  loadLocalStorage(): Promise<boolean> {
    return this.storage
      .get('localStorage')
      .then(localStorage => {
        if (localStorage == null) {
          return false
        } else {
          this.localStorage = localStorage;
          return true
        }
      });
  }

  saveLocalStorage() {
    this.storage.set('localStorage', this.localStorage);
  }

  login(username, password): Promise<boolean> {
    this.events.publish("loading:show", "login");
    return this.http
      .get(this.serverUrl + '/user/login?username=' + username + '&password=' + this.sha256(password))
      .toPromise()
      .then(response => {
        let data = JSON.parse(JSON.stringify(response));
        console.log(data);
        if (data.message == 1000) {
          this.storage.set('localUser', data.detail);
          this.localStorage.uuid = data.detail.uuid;
          this.localStorage.token = data.detail.token;
          this.deviceProvider.uuid = data.detail.uuid;
          this.events.publish("loading:hide", "login");
          console.log("uuid:" + this.localStorage.uuid);
          console.log("token:" + this.localStorage.token);
          return true
        } else {
          return false
        }
      })
      .catch(this.handleError);
  }

  logout() {
    this.deleteLocalStorage();
  }

  getAllInfo(opts = { showLoading: false, onlyGetDevices: false }): Promise<boolean> {
    if (opts.showLoading)
      this.events.publish("loading:show", "load");
    // console.log(this.serverUrl + '/user/overview?uuid=' + this.localStorage.uuid + '&token=' + this.localStorage.token);
    return this.http
      .get(this.serverUrl + '/user/overview?uuid=' + this.localStorage.uuid + '&token=' + this.localStorage.token)
      .toPromise()
      .then(response => {
        let data = JSON.parse(JSON.stringify(response));
        // console.log("用户数据:");
        // console.log(data);
        if (data.message == 1000) {
          if (!opts.onlyGetDevices) {
            this.localStorage.user.avatar = this.serverUrl + "/user/avatar/" + this.localStorage.uuid + ".jpg?" + this.localStorage.token;
            this.localStorage.user.username = data.detail.profiles.username;
            this.localStorage.user.phone = data.detail.profiles.phone;
          }
          //获取brokers和devices
          this.deviceProvider.brokers = data.detail.brokers;
          this.deviceProvider.devices = data.detail.devices;
          //获取deviceList\sceneButtonList
          if (data.detail.profiles.userConf != null) {
            if (typeof (data.detail.profiles.userConf.deviceList) != 'undefined') {
              // console.log("测试");
              // console.log(data.detail.profiles.userConf.deviceList);
              this.deviceList = data.detail.profiles.userConf.deviceList;
            }
            if (typeof (data.detail.profiles.userConf.sceneButtonList) != 'undefined') {
              this.autoProvider.sceneButtonList = data.detail.profiles.userConf.sceneButtonList;
            }
          }
          // 检查deviceList是否合法,这里是为了更新老版本的deviceList
          let isRight = true;
          console.log(this.deviceList);
          for (let device of data.detail.devices) {
            if (this.deviceList.indexOf(deviceName2Mac(device.deviceName)) == -1) {
              console.log("deviceList不合法:" + device.deviceName);
              isRight = false;
              break;
            }
          }
          for (let deviceName of this.deviceList) {
            if (deviceName.length > 12) {
              console.log("deviceList不合法:" + deviceName);
              isRight = false;
              break;
            }
          }
          if (!isRight) {
            this.deviceList = [];
            for (let device of data.detail.devices)
              this.deviceList.push(deviceName2Mac(device.deviceName));
            let userConfig = {
              "deviceList": this.deviceList
            }
            this.saveUserConfig(userConfig);
          }

          // console.log(this.deviceProvider.deviceList)
          // console.log(this.deviceProvider.devices)
          // this.deviceProvider.devices = reorder(this.deviceProvider.devices, this.deviceProvider.deviceList)

          // console.log(this.deviceProvider.brokers);
          //读出devices和deviceList,并按deviceList排序devices
          //deviceList存储devices的显示顺序

          // if ((this.deviceProvider.devices.length > 0 && this.deviceProvider.deviceList.length == 0) || (this.deviceProvider.devices.length != this.deviceProvider.deviceList.length)) {
          //   this.deviceProvider.deviceList = [];
          //   for (let device of data.detail.devices)
          //     this.deviceProvider.deviceList.push(device.deviceName);
          // } else if (this.deviceProvider.deviceList.length == data.detail.devices.length && this.deviceProvider.deviceList.indexOf(data.detail.devices[0].deviceName) > -1) {
          //   this.deviceProvider.devices = initDevice(reorder(data.detail.devices, this.deviceProvider.deviceList));
          // } else {
          //   this.deviceProvider.devices = initDevice(data.detail.devices);
          //   //这句是为了修复之前的bug
          //   if (this.deviceProvider.deviceList.length != this.deviceProvider.devices.length || this.deviceProvider.deviceList.indexOf(data.detail.devices[0].deviceName) < 0)
          //     this.deviceProvider.deviceList = [];
          //   for (let device of data.detail.devices)
          //     this.deviceProvider.deviceList.push(device.deviceName);
          //   console.log('初始化排序');
          //   console.log(this.deviceProvider.deviceList);
          // }
          // console.log(this.deviceProvider.devices);
          // this.saveLocalUser();
          this.saveLocalStorage();

          if (opts.showLoading)
            this.events.publish("loading:hide", "hide");
          return true;
        }
        else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  // getDeviceInfo(showLoading: boolean = true): Promise<boolean> {
  //   if (showLoading)
  //     this.events.publish("loading:show", "load");
  //   return this.http
  //     .get(this.serverUrl + '/user/device/get?uuid=' + this.localStorage.uuid + '&token=' + this.localStorage.token)
  //     .toPromise()
  //     .then(response => {
  //       let data = JSON.parse(JSON.stringify(response));
  //       // console.log(data.devices);
  //       if (data.message == 1000) {
  //         this.deviceProvider.brokers = data.detail.brokers;
  //         // console.log(this.deviceProvider.brokers);
  //         //读出devices和deviceList,并按deviceList排序devices
  //         if (this.deviceProvider.deviceList.length != 0 && this.deviceProvider.deviceList.length == data.detail.devices.length) {
  //           // console.log('设备排序');
  //           this.deviceProvider.devices = initDevice(reorder(data.detail.devices, this.deviceProvider.deviceList));
  //         } else {
  //           this.deviceProvider.devices = initDevice(data.detail.devices);
  //           for (let device of data.detail.devices)
  //             this.deviceProvider.deviceList.push(device.deviceName);
  //           // console.log('初始化排序');
  //           // console.log(this.deviceProvider.deviceList);
  //         }
  //         // console.log(this.deviceProvider.devices);
  //         if (showLoading)
  //           this.events.publish("loading:hide", "hide");
  //         return true;
  //       }
  //       else {
  //         return false;
  //       }
  //     })
  //     .catch(this.handleError);
  // }

  getUserInfo(): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "/user/profile/get?uuid=" + this.localStorage.uuid + '&token=' + this.localStorage.token)
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.localStorage.user.avatar = this.serverUrl + "/user/avatar/" + this.localStorage.uuid + ".jpg?" + this.localStorage.token;
          this.localStorage.user.username = data.detail.username;
          this.localStorage.user.phone = data.detail.phone;
          //获取deviceList\sceneButtonList
          if (data.detail.userConf != null) {
            if (typeof (data.detail.userConf.deviceList) != undefined) {
              this.deviceProvider.deviceList = data.detail.userConf.deviceList;
            }
            if (typeof (data.detail.userConf.sceneButtonList) != undefined) {
              this.autoProvider.sceneButtonList = data.detail.userConf.sceneButtonList;
            }
          }
          // this.saveLocalUser();
          // this.loadLocalStorage();
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  saveUserConfig(userConfig): Promise<boolean> {
    return this.http
      .post(this.serverUrl + "/user/config/save",
        {
          "uuid": this.localStorage.uuid,
          'token': this.localStorage.token,
          "userConf": JSON.stringify(userConfig)
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

  addDevice(device): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "/user/device/add" +
        "?uuid=" + this.localStorage.uuid +
        '&token=' + this.localStorage.token +
        "&deviceName=" + device.deviceName +
        "&deviceType=" + device.deviceType +
        this.withDeviceConfig(device)
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

  getMqttKey(device): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "/user/device/diy/add" +
        "?uuid=" + this.localStorage.uuid +
        '&token=' + this.localStorage.token +
        "&deviceType=" + device.deviceType +
        this.withDeviceConfig(device)
      )
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.events.publish("adddevice:mqttkey", data.detail.authKey);
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  withDeviceConfig(device): string {
    if (device.hasOwnProperty("config"))
      return "&deviceConfig=" + JSON.stringify(device.config);
    return "";
  }

  addDevice2(deviceIP): Promise<boolean> {
    return this.http
      .get("http://" + deviceIP + "/date=" + ((new Date).getTime()))
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 'success') {
          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  delDevice(device) {
    return this.http
      .get(this.serverUrl + "/user/device/remove?uuid=" + this.localStorage.uuid + '&token=' + this.localStorage.token + "&deviceName=" + device.deviceName)
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

  getSmscode(phone, action): Promise<any> {
    return this.http
      .get(this.serverUrl + "/user/smscode?" +
        "phone=" + phone +
        "&sendType=" + action
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

  register(phone, smscode, password): Promise<boolean> {
    this.events.publish("loading:show", "register");
    return this.http
      .get(this.serverUrl + "/user/register?username=" + phone + "&phone=" + phone + '&smsCode=' + smscode + "&password=" + this.sha256(password))
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.storage.set('user', data.detail);
          this.localStorage.token = data.detail.token;
          this.localStorage.uuid = data.detail.uuid;
          console.log("uuid:" + this.localStorage.uuid);
          console.log("token:" + this.localStorage.token);
          this.events.publish("loading:hide", "");
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  retrieve(phone, smscode, password): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "/user/password/reset?phone=" + phone + '&smsCode=' + smscode + "&password=" + this.sha256(password))
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

  changePassword(oldPassword, newPassword): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "/user/password/change?" +
        "uuid=" + this.localStorage.uuid +
        '&token=' + this.localStorage.token +
        "&oldPassword=" + this.sha256(oldPassword) +
        "&newPassword=" + this.sha256(newPassword))
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
      .get(this.serverUrl + "/user/profile/modify?uuid=" + this.localStorage.uuid + '&token=' + this.localStorage.token + "&username=" + Newusername)
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

  //saveDeviceConfig后需要调用loadConifg更新本地的config
  saveDeviceConfig(device, deviceConfig) {
    return this.http
      .post(this.serverUrl + "/user/device/config/save",
        {
          "uuid": this.localStorage.uuid,
          'token': this.localStorage.token,
          "deviceName": device.deviceName,
          "deviceConfig": JSON.stringify(deviceConfig)
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

  loadConfig(device) {
    return this.http
      .get(this.serverUrl + "/user/device/config/load?" +
        "uuid=" + this.localStorage.uuid +
        '&token=' + this.localStorage.token +
        "&deviceName=" + device.deviceName)
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          device.config = data.detail;
          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  //获取设备历史数据
  getHistoricalData(device, date) {
    return this.http
      .get(this.serverUrl + "/user/device/historicaldata?" +
        "uuid=" + this.localStorage.uuid +
        "&token=" + this.localStorage.token +
        "&deviceName=" + device.deviceName +
        "&date=" + date)
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          //处理数据



          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  // verifyUsersNewTel(NewTelNumber, NewTelsmscode): Promise<any> {//8
  //   console.log(NewTelNumber);
  //   return this.http
  //     .get(this.serverUrl + "/user/tel/change?uuid=" + this.localStorage.uuid + '&token=' + this.localStorage.token + "&newtel=" + NewTelNumber + "&smscode=" + NewTelsmscode)
  //     .toPromise()
  //     .then(response => {
  //       console.log(response);
  //       let data = JSON.parse(JSON.stringify(response));
  //       //return data;
  //       //alert(data.message);
  //       if (data.message == 1000) {
  //         return true;
  //       } else
  //         return false;
  //     })
  //     .catch(this.handleError);
  // }

  // TODO 数据获取的筛选取消year,month,day等参数，直接以startDate,与endDate替代，前端需要在请求获取时组织开始时间与结束时间的格式为"%Y-%m-%d-%H"的格式，当然可为空
  // TODO 具体操作待完成

  // getDeviceData(deviceName: string, year: number, month = 0, day = 0): Promise<any> {

  //   //this.storage.set('user', data.detail);
  //   //this.localStorage.token = data.detail.token;
  //   //this.localStorage.uuid = data.detail.uuid;
  //   //if(){}
  //   // TODO 筛选日期构建
  //   var startDate = "";
  //   var endDate = "";
  //   var GetEnergyDataUrl = this.serverUrl + "/user/device/data/load?uuid=" + this.localStorage.uuid + '&token=' + this.localStorage.token + '&deviceName=' + deviceName + '&startDate' + startDate + '&endDate' + endDate;
  //   // if (month == 1000) GetEnergyDataUrl += "&year=" + year;
  //   // else if (day == 1000) GetEnergyDataUrl += "&year=" + year + "&month=" + month;
  //   // else GetEnergyDataUrl += "&year=" + year + "&month=" + month + "&day=" + day;

  //   console.log(GetEnergyDataUrl);
  //   return this.http.get(GetEnergyDataUrl).toPromise().then(response => {
  //     console.log(response);
  //     let data = JSON.parse(JSON.stringify(response));
  //     this.storage.set(deviceName, data);
  //     if ("2017-10-24" in data)
  //       if (data.message == 1000) {
  //         return true;
  //       } else
  //         return false;
  //   })
  //     .catch(this.handleError);
  // }

  // async getLocalDeviceData(deviceName: string): Promise<any> {
  //   var tmp = await this.storage.get(deviceName);
  //   if ((tmp == null) || (tmp.__zone_symbol__value == null)) {
  //     var timemax = new Date();
  //     timemax.setDate(timemax.getDate() - 1);//当天没数据，前一天数据可能上传可能没上传
  //     await this.getServerDeviceData(deviceName);
  //     tmp = await this.storage.get(deviceName);
  //   }
  //   return tmp;
  // }

  // async getServerDeviceData(deviceName: string, s_year: number = 0, s_month: number = 0, s_day: number = 0, hour: number = 0) {//获得某天或某月
  //   var timebf = new Date();
  //   var timemax = new Date();
  //   timemax.setDate(timemax.getDate() - 1);//当天没数据，前一天数据可能上传可能没上传
  //   var getbfdate = await this.storage.get("Update_time_" + deviceName);
  //   if (getbfdate == null) timebf = new Date(2016, 10);//new Date(2017, 10);
  //   else timebf.setTime(getbfdate);

  //   if ((timemax.getTime() - timebf.getTime()) < 60000) return 0;
  //   //await this.GetEnergyDataFromServer(deviceName, 2016, 1, 1, 2018, 1, 1);
  //   //await this.GetEnergyDataFromServer(deviceName, timebf.getFullYear(), timebf.getMonth() + 1, timebf.getDate(), timemax.getFullYear(), timemax.getMonth() + 1, timemax.getDate());//获取上次更新的前一天到昨天的值
  //   await this.GetEnergyDataFromServer(deviceName, 2017, 1, 1, timemax.getFullYear(), timemax.getMonth() + 1, timemax.getDate());//获取上次更新的前一天到昨天的值
  //   console.log(timemax.getTime() - timebf.getTime());
  //   this.storage.set("Update_time_" + deviceName, timemax.getTime());//成功保存这次更新时间的前一天
  //   return 1;
  // }

  // async GetEnergyDataFromServer(deviceName: string, s_year: number, s_month: number = 0, s_day: number = 0, e_year: number = 0, e_month: number = 0, e_day: number = 0) {//获得某天或某月
  //   var data_tmp = [];
  //   if (s_month == 1000) {
  //     e_year = s_year; s_month = 1; e_month = 12; s_day = 1; e_day = 31;
  //   }
  //   else if (s_day == 1000) {
  //     e_year = s_year; e_month = s_month; s_day = 1;
  //     var d = new Date(s_year, s_month - 1, 0);
  //     e_day = d.getDate();
  //   }
  //   else if (e_year == 1000) {
  //     e_year = s_year; e_month = s_month; e_day = s_day;
  //   }
  //   var GetEnergyDataUrl = this.serverUrl + "/user/device/data/get?uuid=" + this.localStorage.uuid + '&token=' + this.localStorage.token + '&deviceName=' + deviceName;
  //   GetEnergyDataUrl += "&s_year=" + s_year + "&s_month=" + s_month + "&s_day=" + s_day + "&e_year=" + e_year + "&e_month=" + e_month + "&e_day=" + e_day;
  //   return this.http.get(GetEnergyDataUrl).toPromise().then(response => {
  //     let data = JSON.parse(JSON.stringify(response));
  //     if (data.message == 1000) {
  //       this.storage.set(deviceName, data.detail);
  //       return true;
  //     } else
  //       return false;
  //   })
  //     .catch(this.handleError);
  // }

  uploadAvatar(newAvatar): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const fileTransfer = this.transfer.create();
      let options = {
        fileKey: 'file',
        fileName: 'name.jpg',
        chunkedMode: false,
        headers: {}
      };
      fileTransfer.upload(newAvatar, this.serverUrl + '/user/avatar/upload?uuid=' + this.localStorage.uuid + '&token=' + this.localStorage.token, options)
        .then(result => {
          this.localStorage.user.avatar = newAvatar;
          this.saveLocalStorage();
          console.log("头像上传成功");
          resolve(true);
        }, err => {
          console.log("头像上传失败");
          resolve(false);
        });
    })
  }

  sha256(password) {
    return CryptoJS.SHA256(password);
  }

  private handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }

  // checkTel(Telnumber: string) {//判断一个号码是不是手机号
  //   if ((Telnumber.length == 11) && (parseInt(Telnumber) >= 10000000000)) {//中国号码11位，且1开头
  //     return true;
  //   }
  //   return false;
  // }

  checkVerificationCode(verificationCode: string) {//判断验证码是否合法
    if (verificationCode.length == 6) {
      var myreg = /^[0-9]{6}$/;///^((13[0-9])|(14[5|7])|(15([0-3]|[5-9]))|(18[0,2,3,5-9]))\\d{8}$/;  
      if (myreg.test(verificationCode))
        return true;
    }
    return false;
  }

  public weather;
  getWeather() {
    return this.http
      .get(this.serverUrl + "/weather/now?" +
        "uuid=" + this.localStorage.uuid +
        "&token=" + this.localStorage.token)
      .toPromise()
      .then(response => {
        // console.log('天气数据:');
        // console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.weather = data.detail;
          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  public air;
  getAir() {
    return this.http
      .get(this.serverUrl + "/weather/aqi?" +
        "uuid=" + this.localStorage.uuid +
        "&token=" + this.localStorage.token)
      .toPromise()
      .then(response => {
        // console.log('空气数据:');
        // console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          this.air = data.detail;
          return true;
        } else {
          return false;
        }
      })
      .catch(this.handleError);
  }

  checkUpdate(): Promise<any> {
    return this.http
      .get("https://blinker.app/update.json?" + randomString())
      .toPromise()
      .then(response => {
        // console.log('空气数据:');
        // console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        // console.log(data);
        return data;
      })
      .catch(this.handleError);
  }

}
