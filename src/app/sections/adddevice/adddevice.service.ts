import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Zeroconf } from '@awesome-cordova-plugins/zeroconf/ngx';
import { BLE } from '@awesome-cordova-plugins/ble/ngx';
import { Network } from '@ionic-native/network/ngx';
import { DataService } from 'src/app/core/services/data.service';
import { Uint8Array2hex, name2mac, mac2name } from 'src/app/core/functions/func';
import { Diagnostic } from '@awesome-cordova-plugins/diagnostic/ngx';
import { API } from 'src/app/configs/api.config';
import { HttpClient } from '@angular/common/http';
import { BlinkerResponse } from 'src/app/core/model/response.model';
import { NoticeService } from 'src/app/core/services/notice.service';

@Injectable({
  providedIn: 'root'
})
export class AdddeviceService {

  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  isDev = false;
  deviceType;
  mode;
  deviceTypeList = [];

  constructor(
    private http: HttpClient,
    private zeroconf: Zeroconf,
    public plt: Platform,
    private ble: BLE,
    private diagnostic: Diagnostic,
    public network: Network,
    private dataService: DataService,
    private noticeService: NoticeService
  ) { }

  isRegisted(deviceName) {
    if (typeof this.deviceDataDict[deviceName] == 'undefined') {
      return false;
    } else {
      return true;
    }
  }

  async isBluetoothAvailable() {
    if (await this.diagnostic.getBluetoothState() == this.diagnostic.bluetoothState.POWERED_ON) {
      return true;
    } else {
      this.noticeService.showAlert('openBluetooth')
      return false;
    }
  }

  // 搜索局域网中的mdns设备
  async scanMdnsDeviceType(deviceType) {
    // if (!this.isWifiAvailable()) return;
    // if (!(await this.wifiIsConnected())) return;
    this.deviceTypeList = [];
    if (this.plt.is('android')) {
      this.zeroconf.watchAddressFamily = 'ipv4';
      await this.zeroconf.reInit();
    }
    this.zeroconf.watch('_' + deviceType + '._tcp.', 'local.').subscribe(result => {
      // console.log(result);
      if (result.action == "resolved") {
        console.log(result.service);
        let item = {
          "mac": name2mac(result.service.name),
          "deviceName": result.service.name,
          "name": result.service.type,
          "mode": "net",
          "registed": this.isRegisted(result.service.name)
        }
        for (let i = 0; i < this.deviceTypeList.length; i++) {
          if (item.mac == this.deviceTypeList[i].mac) return;//修正mac下mdns设备出现两次的问题
        }
        this.deviceTypeList.push(item);
      }
    });
  }

  // 搜索蓝牙设备
  async scanBleDeviceType(bleType) {
    if (!this.isBluetoothAvailable()) return;
    // 待添加ACCESS_COARSE_LOCATION权限检查，待测试
    let BluetoothIsOpen = (await this.diagnostic.getBluetoothState() == this.diagnostic.bluetoothState.POWERED_ON)
    if (BluetoothIsOpen) {
      console.log("scanBle");
      this.deviceTypeList = [];
      this.ble.scan([], 5).subscribe(result => {
        console.log(result);
        if (this.plt.is('android')) {
          let UUID = Uint8Array2hex(result.advertising).toUpperCase();
          //console.log(UUID);
          //在这里添加其他的蓝牙服务ID来过滤 by 王翔
          if ((UUID.indexOf("02E0FF") != -1) || (UUID.indexOf("02F0FF") != -1) || (UUID.indexOf("03E0FF") != -1) || (UUID.indexOf("03F0FF") != -1)) {
            let name = "";
            if (typeof (result.name) != "undefined") name = result.name;
            else name = "未知设备";
            let item = {
              "mac": result.id,
              "deviceName": mac2name(result),
              "name": name,
              "mode": "ble",
              "rssi": result.rssi,
              "registed": this.isRegisted(mac2name(result))
            }
            this.deviceTypeList.push(item);
          }
        }
        else if (typeof (result.advertising.kCBAdvDataServiceUUIDs) != 'undefined') {
          for (let i = 0; i < this.deviceTypeList.length; i++) {
            if (result.id == this.deviceTypeList[i].mac) return;//修正mac下蓝牙设备出现两次的问题
          }
          let UUIDs = result.advertising.kCBAdvDataServiceUUIDs;
          for (let i = 0; i < UUIDs.length; i++) {
            if ((UUIDs[i].indexOf("FFE0") != -1) || ((UUIDs[i].indexOf("FFF0") != -1))) {
              console.log(UUIDs[i]);
              if (typeof (result.advertising.kCBAdvDataManufacturerData) != 'undefined') {
                let data = new Uint8Array(result.advertising.kCBAdvDataManufacturerData);
                if (data.length <= 12) {
                  let name = "";
                  if (typeof (result.advertising.kCBAdvDataLocalName) != 'undefined') name = result.advertising.kCBAdvDataLocalName;
                  else if (typeof (result.name) != "undefined") name = result.name;
                  else name = "未知设备";
                  let item = {
                    "mac": result.id,
                    "deviceName": mac2name(result),
                    "name": name,
                    "mode": "ble",
                    "rssi": result.rssi,
                    "registed": this.isRegisted(mac2name(result))
                  }
                  this.deviceTypeList.push(item);
                  break;
                }
              }
            }
          }
        }
      });
    }
  }



  stopScanDevice() {
    if (!this.plt.is('cordova')) return;
    if (this.mode == 'ble') {
      this.ble.stopScan();
    } else if (this.mode == 'net') {
      this.zeroconf.close();
    }
  }

  startScanDevice(deviceType, mode) {
    this.deviceType = deviceType;
    this.mode = mode;
    if (!this.plt.is('cordova')) return;
    if (mode == 'ble') {
      this.scanBleDeviceType(deviceType);
    } else if (mode == 'net') {
      this.scanMdnsDeviceType(deviceType);
    }
  }

  addDevice(device): Promise<boolean> {
    let params = {
      uuid: this.uuid,
      token: this.token,
      deviceType: device.deviceType,
      deviceName: device.deviceName
    }
    let config = this.getDeviceConfig(device)
    if (config != "") {
      params['deviceConfig'] = config
    }
    console.log(params);
    return this.http.get(API.ADDDEVICE.ADDDEVICE, { params: params })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else {
          this.noticeService.showToast(data.detail)
          return false;
        }
      })
      .catch(this.handleError);
  }

  addDeviceByScan(registerKey): Promise<boolean> {
    let params = {
      uuid: this.uuid,
      token: this.token,
      // deviceType: deviceType,
      registerKey: registerKey
    }
    console.log(params);
    return this.http.post<BlinkerResponse>(API.ADDDEVICE.ADDDEVICE_SCAN, params)
      .toPromise()
      .then(response => {
        console.log(response);
        if (response.message == 1000) {
          return true;
        } else {
          this.noticeService.showToast(response.detail);
          return false;
        }
      })
      .catch(this.handleError);
  }

  //添加mqtt设备，手机和设备局域网通信用
  checkDeviceType(deviceIp, deviceType): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let wsClient = new WebSocket("ws://" + deviceIp + ":81");
      wsClient.addEventListener('open', event => {
        console.log(event);
        wsClient.send(`{"register":"${deviceType}"}`);
      });
      wsClient.addEventListener('message', event => {
        // 此处标准还需修改;
        console.log(event.data);
        if (event.data.indexOf(`{"state":"connected"}`) > -1) {
          console.log("不作处理");
          // 不作处理
        } else if (event.data.indexOf(`{"message":"success"}`) > -1) {
          console.log("连接成功");
          wsClient.close();
          return resolve(true);
        } else {
          console.log("连接失败");
          // this.wsClient.close();
          return resolve(false);
        }
      });
    })
  }

  /*
  
  */
  checkAddDevice(deviceType, deviceMac) {
    let params = {
      uuid: this.uuid,
      token: this.token,
      deviceType: deviceType,
      deviceMac: deviceMac
    }
    return this.http.get(API.ADDDEVICE.CHECK, { params: params })
      .toPromise()
      .then((resp: BlinkerResponse) => {
        console.log(resp);
        if (resp.message == 1000) {
          if (resp.detail.deviceName != '')
            return true;
          else
            return false;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  getMqttKey(device): Promise<any> {
    let params = {
      uuid: this.uuid,
      token: this.token,
      deviceType: device.deviceType
    }
    let config = this.getDeviceConfig(device)
    if (config != "") {
      params['deviceConfig'] = config
    }
    // console.log(params);
    return this.http.get(API.ADDDEVICE.GET_MQTTKEY, { params: params })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return data.detail;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  addDevice2(deviceIP): Promise<boolean> {
    return this.http.get<BlinkerResponse>("http://" + deviceIP + "/date=" + ((new Date).getTime()))
      .toPromise()
      .then(resp => {
        if (resp.message == 1000) {
          return true;
        } else {
          this.noticeService.showToast(resp.detail)
          return false;
        }
      })
      .catch(this.handleError);
  }

  getDeviceConfig(device): string {
    if (device.hasOwnProperty("config"))
      return JSON.stringify(device.config);
    return "";
  }

  handleError(error: any): boolean {
    console.error('An error occurred', error);
    this.noticeService.showToast(error)
    return false;
  }


}
