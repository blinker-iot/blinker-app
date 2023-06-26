import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Zeroconf } from '@awesome-cordova-plugins/zeroconf/ngx';
import { BLE } from '@awesome-cordova-plugins/ble/ngx';
import {
  transcoding,
  str2ab,
  Uint8Array2hex,
  isJson,
  isNumber,
  mac2name,
  isNewerVersion,
  deviceName2id
} from '../functions/func';
import { DataService } from './data.service';
import { HttpClient } from '@angular/common/http';
import { API } from 'src/app/configs/api.config';
import { BlinkerBroker } from '../model/broker.model';
import { PermissionService } from './permission.service';
import { Subscription, Subject } from 'rxjs';
import { DebugService } from 'src/app/debug/debug.service';
import { BlinkerDevice } from '../model/device.model';
import { NativeService } from './native.service';
import { NoticeService } from './notice.service';
import { ToastService } from './toast.service';

declare var mqtt;

const DEBUG_MODE = false

@Injectable({
  providedIn: 'root'
})
export class DeviceService {

  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  get brokerDataDict() {
    return this.dataService.brokers.dict
  }

  get brokerDataList() {
    if (typeof this.dataService.brokers != 'undefined')
      return this.dataService.brokers.list
    return []
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  // 单设备启动时，用于暂存该设备deviceName和获取设备对象
  oneDeviceName: string;
  _device;
  get device() {
    if (typeof this.deviceDataDict[this.oneDeviceName] == 'undefined')
      return 'undefined'
    else
      return this.deviceDataDict[this.oneDeviceName]
  }

  lanDeviceList = {};
  bleDeviceList = {};
  mqttCloseCnt = 0;

  wsClient;
  timer = [];
  userUrl: string;

  newDeviceSubject = new Subject;

  constructor(
    private http: HttpClient,
    private zeroconf: Zeroconf,
    private plt: Platform,
    private ble: BLE,
    private dataService: DataService,
    private permissionService: PermissionService,
    private debugService: DebugService,
    private nativeService: NativeService,
    private noticeService: NoticeService,
    private toastService: ToastService,
  ) { }

  init() {
    this.dataService.initCompleted.subscribe(loaded => {
      if (loaded) {
        // console.log('启动加载');
        this.connectMqttBrokers();
        this.searchLocalDevice();
      }
    })
    this.dataService.authDataExpire.subscribe(state => {
      if (state) {
        this.disconnectMqttBrokers()
      }
    })
  }

  connectMqttBrokers() {
    for (let verder of this.brokerDataList) {
      // console.log(verder);
      // console.log(this.brokerDataDict[verder]);

      if (typeof this.brokerDataDict[verder].client == 'undefined') {
        // console.log("第一次创建");
        this.connectMqttBroker(this.brokerDataDict[verder])
      } else {
        // console.log("第二次连接");
        this.reconnectMqttBroker(this.brokerDataDict[verder])
      }
    }
  }

  closeCounter = 0;
  closeTimer;
  reconnectTimer
  connectMqttBroker(broker: BlinkerBroker) {
    try {
      console.log('connectMqttBroker:' + broker.vender);
      let mqttClient = mqtt.connect(broker.host, broker.options)
      broker.client = mqttClient;
      // console.log(broker);
      mqttClient.on('connect', () => {
        console.log('mqtt connect:' + broker.vender);
        broker.connected.next(true)
      });
      mqttClient.on('message', (topic, message: any, packet) => {
        // console.log('from:\n' + topic);
        if (DEBUG_MODE) {
          console.log('mqtt receive:\n' + message);
        }
        let data = JSON.parse(message);
        // 2019.1.2 暂时修复阿里MQTT收到两条数据的问题
        // console.log('r:', data);
        if (data.fromDevice != data.toDevice)
          this.processMessage(data);
      });
      mqttClient.on('reconnect', () => {
        console.log('mqtt reconnect:' + broker.vender);
        // if(broker.vender=='blinker'){
        // console.log(broker);
        // }
      });
      mqttClient.on('error', err => {
        console.error('mqtt error:' + err);
      });
      mqttClient.on('close', () => {
        console.log('mqtt close');
        this.closeCounter++;
        clearTimeout(this.closeTimer)
        this.closeTimer = setTimeout(() => {
          this.closeCounter = 0
        }, 3000);
        if (this.closeCounter > 5) {
          broker.connected.next(false)
          this.dataService.authCheck.next(true)
        }
      });
      mqttClient.on('offline', () => {
        console.log('mqtt offline');
      });
      //订阅topic
      mqttClient.subscribe(broker.topic.receive, { qos: 0 })

    } catch (error) {
      console.log(error);

    }
  }

  reconnectMqttBroker(broker: BlinkerBroker) {
    broker.client.reconnect();
  }

  async disconnectMqttBrokers() {
    if (typeof this.brokerDataList != 'undefined')
      for (const verder of this.brokerDataList)
        await this.disconnectMqttBroker(this.brokerDataDict[verder])
  }

  disconnectMqttBroker(broker: BlinkerBroker): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      broker.client.end(false, {}, () => {
        // broker.client = null;
        broker.connected.next(false);
        resolve(false)
      });
    })
  }

  pubMessage(device, message: string) {
    // 检查设备是否在局域网中,如果在则切换成ws发送
    if (this.islocalDevice(device)) {
      if (this.lanDeviceList[device.deviceName].state == 'disconnected') {
        this.connectLocalDevice(device)
      } else {
        if (typeof message == 'object')
          message = JSON.stringify(message)
        this.lanDeviceList[device.deviceName].client.send(message);
        this.send2debug(device, 'send', message)
        return;
      }
    }
    let broker: BlinkerBroker = this.brokerDataDict[device.config.broker]

    if (typeof broker == 'undefined') return;
    let mqttJson = JSON.parse(JSON.stringify(broker.dataTemplate));
    mqttJson.toDevice = device.deviceName;
    mqttJson.deviceType = ((device.deviceType == 'DiyArduino' || device.deviceType == 'DiyLinux') ? device.deviceType : 'ProDevice');
    try {
      mqttJson.data = JSON.parse(message);
    } catch (error) {
      mqttJson.data = message;
    }
    // 调试用
    if (JSON.stringify(mqttJson.data) != '{"get":"state"}')
      console.log(`mqtt send:\n${JSON.stringify(mqttJson)}`);

    // 

    broker.client.publish(broker.topic.send, JSON.stringify(mqttJson), { qos: 0 })
    this.send2debug(device, 'send', message);
  }

  // 判断设备是否在本地
  islocalDevice(device) {
    if (typeof this.lanDeviceList[device.deviceName] != 'undefined') {
      return true
    }
    if (typeof this.bleDeviceList[deviceName2id(device.deviceName)] != 'undefined') {
      return true
    }
    return false;
  }


  // 连接本地设备，如果设备ws已连接，则返回true，否则进行连接
  connectLocalDevice(device) {
    return new Promise<boolean>((resolve, reject) => {
      // if (this.lanDeviceList[device.deviceName].state == 'connected') resolve(true);
      try {
        this.lanDeviceList[device.deviceName].client = new WebSocket("ws://" + this.lanDeviceList[device.deviceName].ip + ":81");
      } catch (error) {
        console.log(error);
        resolve(false);
      }
      // this.lanDeviceList[device.deviceName].client = new WebSocket("ws://" + this.lanDeviceList[device.deviceName].ip + ":81");
      this.lanDeviceList[device.deviceName].client.onmessage = (event) => {
        // console.log(`mqtt device ${device.deviceName} ws receive:\n${event.data}`);
        let data = event.data;
        if (data.indexOf(`{"state":"connected"}`) > -1) {
          this.lanDeviceList[device.deviceName].state = 'connected';
          data = `{"state":"online"}`;
        }
        let message = {};
        message["fromDevice"] = device.deviceName;
        try {
          message["data"] = JSON.parse(data);
        }
        catch (e) {
          message["data"] = data;
        }
        this.processMessage(message);
      }
      this.lanDeviceList[device.deviceName].client.onopen = (event) => {
        // console.log(`mqtt device ${device.deviceName} ws open`);
        // resolve(true);
      };
      this.lanDeviceList[device.deviceName].client.onerror = (event) => {
        // console.log(`mqtt device ${device.deviceName} ws error`);
        this.removeLocalDevice(device)
        resolve(false);
      }
      this.lanDeviceList[device.deviceName].client.onclose = (event) => {
        // console.log(`mqtt device ${device.deviceName} ws close`);
        this.removeLocalDevice(device)
        resolve(false);
      }
    })
  }

  removeLocalDevice(device) {
    delete this.lanDeviceList[device.deviceName];
    this.queryDevice(device);
  }

  // 将消息分发到设备对应的本地存储上
  processMessage(message) {
    // window.clearTimeout(this.timer[message.fromDevice]);
    // console.log('将消息分发到组件:' + message.fromDevice)
    // 如果该fromDevice，不在现有设备列表中，则可能是刚添加的新设备
    // if (this.deviceList.indexOf(message.fromDevice) > -1) {

    //判断添加新设备
    if (JSON.stringify(message.data) == '{"message":"Registration successful"}') {
      this.newDeviceSubject.next(deviceName2id(message.fromDevice))
      return
    }
    this.message2Device(this.deviceDataDict[deviceName2id(message.fromDevice)], message.data);
  }

  message2Device(device: BlinkerDevice, data) {
    // 这是对没有接收到心跳包的补救方式，如果接收到数据，则将设备设置为在线或已连接
    if (device.data.state == 'disconnected' || device.data.state == 'offline') {
      if (device.config.mode == 'mqtt') {
        device.data['state'] = 'online'
      } else {
        device.data['state'] = 'connected'
      }
    }
    device.data['enable'] = true
    // 处理未知数据，将其显示到debug组件中
    if (typeof (data) == 'string' || typeof (data) == "number") {
      this.send2debug(device, 'unknown', data.toString())
      return
    }
    // 处理收到的json数据
    for (let key in data) {
      // 保留关键字不允许用户改写
      if (key == "config" || key == "deviceName" || key == "deviceType") break;
      // 本地通知功能
      if (key == "notice") {
        // this.pusherService.localNotify(data[key])
        this.toastService.show({
          device: device,
          message: data[key]
        });
      }
      //缓存数据
      device.data[key] = data[key];
      if (key == "vibrate")
        this.nativeService.vibrate(data[key])
    }

    // 显示到degbug窗口
    this.send2debug(device, 'receive', JSON.stringify(data))
    device.subject.next({ key: 'loaded' });
  }

  //搜索本地设备（局域网mdns）
  searchLocalDevice() {
    if (!this.plt.is('cordova')) return;
    this.scanMdnsDevice();
    this.scanBleDevice();
  }

  protocol = '_blinker._tcp.';
  async scanMdnsDevice() {
    for (let deviceName in this.lanDeviceList) {
      let deviceWsClient = this.lanDeviceList[deviceName].client
      try {
        if (typeof deviceWsClient.close == 'function')
          deviceWsClient.close();
      } catch (error) {
        console.log(error);
      }
    }
    this.lanDeviceList = {};

    if (this.plt.is('android')) {
      this.zeroconf.watchAddressFamily = 'ipv4';
      await this.zeroconf.reInit();
    }
    this.zeroconf.watch(this.protocol, 'local.').subscribe(result => {
      // console.log(result);
      if (typeof result.service.txtRecord.mac == 'string')
        if ((!(result.service.name in this.lanDeviceList)) && (result.service.ipv4Addresses.length > 0)) {
          let device = {
            client: new Object,
            state: 'disconnected',
            ip: result.service.ipv4Addresses[0],
          }
          this.lanDeviceList[result.service.name] = device
          this.lanDeviceList[result.service.txtRecord.mac] = device
        }
    });
    setTimeout(() => {
      console.log("mdns devices:");
      console.log(this.lanDeviceList);
      this.zeroconf.close();
    }, 30000);
  }

  closeScanMdnsDevice() {
    this.zeroconf.close();
  }

  async scanBleDevice() {
    if (!this.plt.is('cordova')) return;
    // 检查蓝牙是否打开
    if (!await this.permissionService.CheckBleAvailability({ showNotice: false })) return
    this.bleDeviceList = {};
    this.ble.scan([], 5).subscribe(result => {
      if (this.plt.is('android')) {
        let UUID = Uint8Array2hex(result.advertising).toUpperCase();
        //console.log(UUID);
        //在这里添加其他的蓝牙服务ID来过滤
        if ((UUID.indexOf("02E0FF") != -1) || (UUID.indexOf("02F0FF") != -1) || (UUID.indexOf("03E0FF") != -1) || (UUID.indexOf("03F0FF") != -1))
          this.bleDeviceList[mac2name(result)] = "ble";
      }
      else if (typeof (result.advertising.kCBAdvDataServiceUUIDs) != 'undefined') {
        let UUIDs = result.advertising.kCBAdvDataServiceUUIDs;
        for (let i = 0; i < UUIDs.length; i++) {
          if ((UUIDs[i].indexOf("FFE0") != -1) || ((UUIDs[i].indexOf("FFF0") != -1))) {
            console.log(UUIDs[i]);
            if (typeof (result.advertising.kCBAdvDataManufacturerData) != 'undefined') {
              let data = new Uint8Array(result.advertising.kCBAdvDataManufacturerData);
              if (data.length <= 12) {
                this.bleDeviceList[mac2name(result)] = "ble";
              }
            }
          }
        }
      }
    });
    setTimeout(() => {
      console.log("ble devices:");
      console.log(this.bleDeviceList);
      this.ble.stopScan().then(() => { console.log('ble scan stopped'); });
    }, 3900);
  }

  // 查询设备是否在线
  queryDevice(device: BlinkerDevice) {
    // MQTT设备,且APP已经在该broker中注册
    if (device.config.mode == "mqtt" && this.brokerDataList.indexOf(device.config.broker) > -1) {
      let connected: Subscription = this.brokerDataDict[device.config.broker].connected.subscribe(state => {
        if (state) {
          device.data['state'] = 'waiting';
          this.pubMessage(device, `{"get":"state"}`);
          // 如果之前在线，但3秒后，设备没有反馈，那么再发一次心跳，确保设备状态正确查询
          setTimeout(() => {
            if (device.data['enable'] && device.data.state != "online")
              this.pubMessage(device, `{"get":"state"}`);
          }, 3000);
          setTimeout(() => {
            if (device.data.state != "online") {
              device.data.state = "offline";
              device.data['enable'] = false
            }
          }, 6000);
          setTimeout(() => {
            connected.unsubscribe();
          }, 100);
        }
      })
    }
    //BLE\WIFI设备
    else if (device.data.state == "connected")
      this.sendData(device, `{"get":"state"}`);
  }

  // 查询实时数据
  queryRealtimeData(device) {        
    let realtimeKeys = device.data['layouterData'].rt;
    if (typeof realtimeKeys == 'undefined') return
    if (realtimeKeys.length > 0)
      this.sendData(device, JSON.stringify({ "rt": realtimeKeys }));
  }

  queryDevices() {
    try {
      for (let deviceName in this.deviceDataDict) {
        this.queryDevice(this.deviceDataDict[deviceName]);
      }
    } catch (error) {
      console.warn(error);
    }
  }

  connectDeviceTimer;
  connectDevice(device: any, mode: string = "show"): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      if (!this.plt.is('cordova')) return resolve(false);
      //连接超时6秒。移除连接定时器情况：1.连接成功；2.退出页面
      this.connectDeviceTimer = setTimeout(() => {
        if (mode == "show")
          this.noticeService.showToast('timeoutConnect')
        this.disconnectDevice(device);
        return resolve(false);
      }, 6000);
      if (device.data.state != "disconnected") device.data.state = "disconnected";
      if (device.config.mode == "ble") {
        if (! await this.permissionService.CheckBleAvailability()) return resolve(false);
        if (mode == "show")
          await this.noticeService.showLoading('connect')
        let result = await this.connectBleDevice(device)
        return resolve(result);
      }
    })
  }

  disconnectDevice(device) {
    if (!this.plt.is('cordova')) return;
    //清除连接定时器
    window.clearTimeout(this.connectDeviceTimer);
    this.noticeService.hideLoading();
    if (device.config.mode == "ble") {
      this.disconnectBleDevice(device);
    }
  }

  sendTimerList = {};
  fullMqttDateList = {};
  sendData(device, data) {
    // MQTT发送，带合并数据功能，如果不需要合并数据，直接使用pubMessage
    if (device.config.mode == "mqtt") {
      if (isJson(data)) {
        // 如果队列中有这个数据，进行合并
        if (typeof this.fullMqttDateList[device.deviceName] == 'undefined') this.fullMqttDateList[device.deviceName] = '';
        let ob = this.fullMqttDateList[device.deviceName] == '' ? {} : JSON.parse(this.fullMqttDateList[device.deviceName]);
        let ob2 = JSON.parse(data)
        this.fullMqttDateList[device.deviceName] = JSON.stringify(Object.assign(ob, ob2))
        if (typeof this.sendTimerList[device.deviceName] != 'undefined') window.clearTimeout(this.sendTimerList[device.deviceName]);
        //检查设备是否是本地设备,是否已连接
        let deviceInLocal = false;
        if (this.islocalDevice(device)) {
          if (this.lanDeviceList[device.deviceName].state == 'connected')
            deviceInLocal = true
        }
        this.sendTimerList[device.deviceName] = setTimeout(() => {
          this.pubMessage(device, this.fullMqttDateList[device.deviceName]);
          this.fullMqttDateList[device.deviceName] = '';
          delete this.sendTimerList[device.deviceName];
        }, deviceInLocal ? 100 : 300)
      } else {
        this.pubMessage(device, data);
      }
    }
    // BLE/WIFI发送
    if (!this.plt.is('cordova')) return
    if (typeof data == 'string') {
      if (data[data.length - 1] != '\n') data = data + '\n';
    }
    if (device.data.state != 'disconnected') {
      if (device.config.mode == "ble") {
        this.send2ble(device, data);
      }
    }
  }

  //搜索并连接到指定ble设备
  lastbuf = new Uint8Array(10240);
  lastbufcnt = 0;
  bleUUID = null;

  connectBleDevice(device): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      // this.noticeService.showLoading('connect');
      if (this.bleUUID != null)
        this.ble.disconnect(this.bleUUID);
      console.log("scanBle");
      this.ble.startScan([]).subscribe(result => {
        console.log(result);
        if (this.plt.is('android') || (typeof (result.advertising.kCBAdvDataManufacturerData) != 'undefined')) {
          if (deviceName2id(device.deviceName) == mac2name(result)) {
            this.ble.stopScan();
            console.log('connect ble device:' + result.id)
            window.clearTimeout(this.connectDeviceTimer);
            this.ble.connect(result.id).subscribe(async data => {
              this.bleUUID = result.id;
              console.log(data);
              await this.noticeService.hideLoading();
              if (device.data.state != "connected") device.data.state = "connected";
              this.lastbuf.fill(0);
              this.lastbufcnt = 0;
              this.ble.startNotification(result.id, 'FFE0', 'FFE1').subscribe(buffer => {
                let buftmp = new Uint8Array(buffer[0]);
                this.lastbuf.set(buftmp, this.lastbufcnt);
                this.lastbufcnt += buftmp.length;
                while (this.lastbuf.indexOf(10) > -1) {//找到/n，转字符串后测试是否能转json
                  let index = this.lastbuf.indexOf(10);
                  let fullMessage = transcoding(this.lastbuf);
                  console.log(fullMessage);
                  let message = {};
                  message["fromDevice"] = device.deviceName;
                  if (fullMessage.indexOf('{') > -1) {
                    try {
                      message["data"] = JSON.parse(fullMessage);
                    }
                    catch (e) {
                      message["data"] = fullMessage;
                    }
                  }
                  else message["data"] = fullMessage;
                  // console.log(message)
                  this.processMessage(message);
                  let slicetmp = this.lastbuf.slice(index + 1, this.lastbufcnt);
                  this.lastbuf.fill(0);
                  this.lastbuf.set(slicetmp);
                  this.lastbufcnt -= index + 1;
                }
              });
              return resolve(true);
            },
              error => {
                this.bleUUID = null;
                if (device.data.state != "disconnected") device.data.state = "disconnected";
                console.log(error);
                return resolve(false);
              }
            );
          }
        }
      },
        error => {
          console.log(error);
          // 提示开启手机定位服务
          if (error == 'Location Services are disabled') {
            this.noticeService.showAlert('bleNeedLocation');
          }
        }
      );
    })
  }

  async disconnectBleDevice(device) {
    this.ble.stopScan();
    this.ble.stopStateNotifications();
    this.ble.disconnect(this.bleUUID);
    if (device.data.state != "disconnected") device.data.state = "disconnected";
    this.bleUUID = null;
    //清空缓存
    this.lastbuf.fill(0);
  }

  //发送ble数据
  lastSendTime = 0;
  send2ble(device, message: string) {
    console.log('send2ble');
    if (this.plt.is('android')) {
      // console.log("ble message");
      console.log(message);
      let t = this.lastSendTime - new Date().getTime();
      this.lastSendTime = new Date().getTime();
      if (t < 0) t = 0;
      let i = 0;
      for (i = 0; i < message.length; i += 20) {
        let tmp = message.slice(i, i + 20);
        let delay = i + t;
        setTimeout(() => {
          this.ble.writeWithoutResponse(this.bleUUID, 'ffe0', 'ffe1', str2ab(tmp))
        }, delay);
      }
      this.lastSendTime = this.lastSendTime + i + t;
    }
    else {
      this.ble.writeWithoutResponse(this.bleUUID, 'ffe0', 'ffe1', str2ab(message))
    }
    this.send2debug(device, 'send', message)
  }

  async isWifiAvailable() {
    if (await this.permissionService.CheckWifiAvailability()) {
      return true;
    } else {
      this.noticeService.showAlert('openWifi');
      return false;
    }
  }

  // 把发送的数据显示到debug组件
  send2debug(device, type, data) {
    if (this.debugService.enable)
      this.debugService.update({ deviceName: device.deviceName, type: type, data: data });
  }

  //saveDeviceConfig后需要调用loadConifg更新本地的config
  saveDeviceConfig(device, deviceConfig) {
    return this.http
      .post(API.DEVICE.SAVE_CONFIG,
        {
          "uuid": this.uuid,
          'token': this.token,
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

  loadDeviceConfig(device) {
    return this.http.get(API.DEVICE.LOAD_CONFIG, {
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
          return data.detail;
        }
      })
      .catch(this.handleError);
  }

  //读取设备Layouter配置
  loadDeviceLayouter(device) {
    this.loadDeviceConfig(device).then(config => {
      device.config.layouter = config.layouter
    })
  }

  // 检查设备当前版本
  checkDeviceVersion(device): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (typeof device.data.version == "undefined") {
        this.pubMessage(device, `{"get":"version"}`);
        setTimeout(() => {
          if (typeof device.data.version != 'undefined') {
            this.checkDeviceNewVersion(device);
            return device.data.version
          } else {
            return '0.0.0'
          }
        }, 2500);
      } else {
        setTimeout(() => {
          this.checkDeviceNewVersion(device);
          return device.data.version
        });
      }
    })
  }

  // 查询设备最新版本号
  checkDeviceNewVersion(device): Promise<boolean> {
    if (typeof device.data.version == 'undefined') {
      console.log('no found version info');
      return new Promise((resolve, reject) => { resolve(false) })
    }
    if (device.data.version != '0.0.0' && typeof device.data.newVersion == 'undefined')
      return this.http.get(API.DEVICE.NEW_VERSION, {
        params: {
          deviceName: device.deviceName,
          uuid: this.uuid,
          token: this.token
        }
      })
        .toPromise()
        .then(response => {
          console.log(response);
          let data = JSON.parse(JSON.stringify(response));
          if (data.message == 1000) {
            device.data['newVersion'] = data.detail.version
            if (device.data.newVersion == null) return false
            device.data['newVersionDescription'] = data.detail.description
            if (isNewerVersion(device.data.version, device.data.newVersion)) {
              device.data['hasNewVersion'] = true;
              return true;
            }
            return false
          } else
            return false;
        })
        .catch(this.handleError);
  }

  // 查询设备OTA更新状态
  checkDeviceUpdate(device) {
    return this.http
      .get(API.DEVICE.OTA_STATE, {
        params: {
          deviceName: device.deviceName,
          uuid: this.uuid,
          token: this.token
        }
      })
      .toPromise()
      .then(response => {
        // console.log('checkDeviceUpdate:');
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000)
          if (typeof data.detail.upgradeData.step != 'undefined')
            return data.detail.upgradeData.step;
      })
      .catch(this.handleError);
  }

  handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }
}

