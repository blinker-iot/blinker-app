import { Injectable } from '@angular/core';
import { Platform, Events } from 'ionic-angular';
import { Zeroconf } from '@ionic-native/zeroconf';
import CryptoJS from 'crypto-js';
// import { Base64 } from 'js-base64';
import mqtt from 'mqtt';
import { Network } from '@ionic-native/network';
import { BLE } from '@ionic-native/ble';
import { Diagnostic } from '@ionic-native/diagnostic';
import { initDevice, deviceName2Mac, transcoding, str2ab, name2mac, Uint8Array2hex, isJson, isNumber } from '../../functions/func';

declare var cordovaNetworkManager;

@Injectable()
export class DeviceProvider {
  uuid;
  bleUUID = "";
  brokers = [];

  _devices;
  set devices(devices) {
    this._devices = initDevice(devices)
  }
  get devices() {
    return this._devices
  }

  // 单设备启动时，用于暂存该设备deviceName和获取设备对象
  oneDeviceName: string;
  _device;
  get device() {
    if (typeof this.devices[this.oneDeviceName] == 'undefined')
      return 'undefined'
    else
      return this.devices[this.oneDeviceName]
  }

  _deviceList = [];
  set deviceList(deviceList) {
    this._deviceList = deviceList;
  }
  get deviceList() {
    return this._deviceList;
  }

  lanDeviceList = [];
  bleDeviceList = [];
  mqttCloseCnt = 0;

  mqttClients = {};
  // mqttClient;
  wsClient;
  timer = [];
  userUrl: string;



  constructor(
    private zeroconf: Zeroconf,
    public plt: Platform,
    public events: Events,
    private ble: BLE,
    private diagnostic: Diagnostic,
    public network: Network,
  ) { }

  init() {
    if (this.plt.is('cordova'))
      if (this.network.type === 'none') return;
    this.connectMqttBroker();
    this.searchDevice();
    this.watchNetwork();
    this.queryDevices();
  }

  //手机网络状态监测
  disconnectSubscription;
  connectSubscription;
  watchNetworkTimer;
  watchNetwork() {
    this.disconnectSubscription = this.network.onDisconnect().subscribe(() => {
      if (this.plt.is('cordova'))
        console.log('当前网络状态：' + this.network.type);
      window.clearTimeout(this.watchNetworkTimer);
      this.disconnectMqttBroker();
      this.watchNetworkTimer = window.setTimeout(() => {
        if (this.plt.is('cordova'))
          if (this.network.type === 'none') {
            // this.mqttClient.end();
            this.events.publish("provider:notice", 'noNetwork');
            this.events.publish("network", 'disconnected');
          }
      }, 3000);
    });
    this.connectSubscription = this.network.onConnect().subscribe(() => {
      if (this.plt.is('cordova'))
        console.log('当前网络状态：' + this.network.type);
      window.clearTimeout(this.watchNetworkTimer)
      this.watchNetworkTimer = window.setTimeout(() => {
        if (this.plt.is('cordova'))
          if (this.network.type != 'none') {
            this.disconnectMqttBroker();
            this.connectMqttBroker();
            this.scanMdnsDevice();
            this.events.publish("network", 'connected');
          }
      }, 3000);
    });
  }

  unWatchNetwork() {
    this.disconnectSubscription.unsubscribe();
    this.connectSubscription.unsubscribe();
  }

  connectMqttBroker() {
    for (let broker of this.brokers) {
      if (typeof this.mqttClients[broker.vender] == 'undefined')
        if (broker.vender == "aliyun") {
          this.connectAliyun(broker)
        } else if (broker.vender == "onenet") {
          this.connectOnenet(broker)
        }
    }
  }

  connectAliyun(broker) {
    let clientId = this.uuid;
    let productKey = broker.productKey;
    let deviceName = broker.deviceName;
    let timestamp = "789";
    let deviceSecret = broker.deviceSecret;
    let mqttClientId = clientId + '|securemode=2,signmethod=hmacsha1,timestamp=789|';
    let mqttusername = deviceName + '&' + productKey;
    let message = "clientId" + clientId + "deviceName" + deviceName + "productKey" + productKey + "timestamp" + timestamp;
    let mqttpassword = CryptoJS.HmacSHA1(message, deviceSecret).toString();

    let mqttHost = broker.url;
    let options = {
      keepalive: 65,
      clientId: mqttClientId,
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 30 * 1000,
      username: mqttusername,
      password: mqttpassword,
    }
    this.initMqtt(broker, mqttHost, options)
  }

  connectOnenet(broker) {
    let mqttHost = broker.url;
    let options = {}
  }

  closeCounter = 0;
  initMqtt(broker, host, options) {
    let mqttClient = mqtt.connect(host, options)
    this.mqttClients[broker.vender] = mqttClient;
    mqttClient.on('connect', () => {
      console.log('mqtt connect');
    });
    mqttClient.on('message', (topic, message: any, packet) => {
      console.log('mqtt receive:\n' + message);
      let data = JSON.parse(message);
      this.processMessage(data);
    });
    mqttClient.on('reconnect', () => {
      console.log('mqtt reconnect ');
    });
    mqttClient.on('error', err => {
      console.log('mqtt error');
      console.log(err);
    });
    mqttClient.on('close', () => {
      console.log('mqtt close');
      this.closeCounter++;
      if (this.closeCounter > 3) {
        this.closeCounter = 0;
        this.events.publish('page:home', 'token test');
      }
    });
    mqttClient.on('offline', () => {
      console.log('mqtt offline');
    });
    //订阅topic
    let appTopic = '/' + broker.productKey + '/' + broker.deviceName + '/r';
    mqttClient.subscribe(appTopic, { qos: 0 })
  }

  disconnectMqttBroker() {
    for (var broker in this.mqttClients)
      if (typeof this.mqttClients[broker] != "undefined"){
        this.mqttClients[broker].end();
        delete this.mqttClients[broker];
      }
  }

  pubMessage(device, message: string) {
    // 检查设备是否在局域网中
    if (this.islocalDevice(device)) {
      this.pubMessage2Local(device, message);
      return;
    }
    let mqttJson = `{"fromDevice":"` + this.brokers[0].deviceName + `","toDevice":"` + device.deviceName + `","deviceType":"` + device.deviceType + `","data":` + message.replace(/\s+/g, "") + `}`;
    let appTopic = '/' + this.brokers[0].productKey + '/' + this.brokers[0].deviceName + '/s';
    console.log(`mqtt send:\n${mqttJson}`);
    this.mqttClients[device.config.broker].publish(appTopic, mqttJson, { qos: 0 })
  }

  islocalDevice(device) {
    if (this.plt.is('cordova'))
      if (this.network.type == 'wifi') {
        if (typeof this.lanDeviceList[device.deviceName] != 'undefined') {
          return true
        }
      }
    return false;
  }

  async pubMessage2Local(device, message: string) {
    if (this.lanDeviceList[device.deviceName].state == 'disconnected')
      await this.connectLocalMqttDevice(device);
    this.lanDeviceList[device.deviceName].client.send(message);
  }

  connectLocalMqttDevice(device) {
    return new Promise<boolean>((resolve, reject) => {
      this.lanDeviceList[device.deviceName].client = new WebSocket("ws://" + this.lanDeviceList[device.deviceName].ip + ":81");
      this.lanDeviceList[device.deviceName].client.onmessage = (event) => {
        console.log(`mqtt device ${device.deviceName} ws receive:\n${event.data}`);
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
        console.log(`mqtt device ${device.deviceName} ws open`);
        return resolve(true);
      };
      this.lanDeviceList[device.deviceName].client.onerror = (event) => {
        console.log(`mqtt device ${device.deviceName} ws error`);
      }
      this.lanDeviceList[device.deviceName].client.onclose = (event) => {
        console.log(`mqtt device ${device.deviceName} ws close`);
        this.lanDeviceList[device.deviceName].state = 'disconnected';
      }
    })
  }

  //将消息分发到组件上
  processMessage(message) {
    // window.clearTimeout(this.timer[message.fromDevice]);
    // console.log('将消息分发到组件:' + message.fromDevice)
    // 如果该fromDevice，不在现有设备列表中，则可能是刚添加的新设备
    // if (this.deviceList.indexOf(message.fromDevice) > -1) {

    //判断添加新设备
    if (JSON.stringify(message.data) == '{"message":"Registration successful"}') {
      this.events.publish('device:new', message);
      return
    }
    this.message2Device(this.devices[deviceName2Mac(message.fromDevice)], message.data);
    // this.events.publish('device:' + message.fromDevice, message.data);
  }

  message2Device(device, data) {
    // 处理未知数据，将其显示到debug组件中
    if (typeof (data) == 'string' || typeof (data) == "number") {
      this.events.publish(device.deviceName + ':unknownData', data.toString() + "\n");
      return
    }
    // 处理收到的json数据
    for (let key in data) {
      // console.log('当前key:' + key);
      // 保留关键字不允许用户改写
      if (key == "config" || key == "deviceName" || key == "deviceType")
        break;
      // 本地通知功能
      if (key == "notice") {
        this.events.publish("provider:push", data[key]);
        break;
      }
      //实际通信数据存储
      //device.data为临时数据存储位置
      device.data[key] = data[key];
      this.events.publish(device.deviceName + ':' + key, 'loaded');
      // console.log(device.deviceName + ':' + key + '---loaded');
      // 设备获取手机状态数据
      if (key == "ahrs")
        this.events.publish('native:ahrs', device);
      if (JSON.stringify(data) == `{"get":"gps"}`)
        this.events.publish('native:gps', device);
      if (key == "vibrate")
        this.events.publish('native:vibrate', device);
    }
    // 显示到degbug窗口
    this.events.publish(device.deviceName + ':unknownData', JSON.stringify(data) + "\n");

    //通知相关页面,关闭读取状态
    this.events.publish(device.deviceName + ':deviceblock', 'loaded')
    this.events.publish(device.deviceName + ':dashboard', 'loaded')
  }


  wifiIsConnected(): Promise<boolean> {
    if (this.plt.is('cordova')) {
      return new Promise<boolean>((resolve, reject) => {
        cordovaNetworkManager.getCurrentSSID(ssid => {
          //这里android会多返回两个冒号""
          if (this.plt.is('android'))
            ssid = ssid.slice(1, ssid.length - 1);
          if (ssid === "unknown ssid") {
            resolve(false);
          } else {
            resolve(true);
          }
        }, err => {
          resolve(false);
        });
      });
    }
  }

  //搜索本地设备（局域网mdns）
  searchDevice() {
    if (!this.plt.is('cordova')) return;
    this.scanMdnsDevice();
    // this.scanBleDevice();
  }

  protocol = '_blinker._tcp.';
  // protocol = '_DiyLinuxMQTT._tcp.';
  async scanMdnsDevice() {
    this.lanDeviceList = [];
    // if (!(await this.wifiIsConnected())) return;
    if (this.plt.is('android')) {
      this.zeroconf.watchAddressFamily = 'ipv4';
    }
    await this.zeroconf.reInit();
    this.zeroconf.watch(this.protocol, 'local.').subscribe(result => {
      // console.log(result);
      if ((!(result.service.name in this.lanDeviceList)) && (result.service.ipv4Addresses.length > 0))
        this.lanDeviceList[result.service.name] = {
          client: new Object,
          state: 'disconnected',
          ip: result.service.ipv4Addresses[0],
        }
    });
    window.setTimeout(() => {
      console.log("local devices:");
      console.log(this.lanDeviceList);
      this.zeroconf.close();
    }, 2000);
  }

  isRegisted(deviceName) {
    if (typeof this.devices[deviceName] == 'undefined') {
      return false;
    } else {
      return true;
    }
  }

  //设备添加-设备config页，通过设备类型搜索设备
  deviceTypeList;
  async scanMdnsDeviceType(deviceType) {
    if (!this.isWifiAvailable()) return;
    // if (!(await this.wifiIsConnected())) return;
    this.deviceTypeList = [];
    if (this.plt.is('android')) {
      this.zeroconf.watchAddressFamily = 'ipv4';
    }
    await this.zeroconf.reInit();
    this.zeroconf.watch('_' + deviceType + '._tcp.', 'local.').subscribe(result => {
      console.log(result);
      if (result.action == "resolved") {
        console.log(result.service);
        let item = {
          "mac": name2mac(result.service.name),
          "deviceName": result.service.name,
          "name": result.service.type,
          "mode": "net",
          "registed": this.isRegisted(result.service.name)
        }
        this.deviceTypeList.push(item);
      }
    });
  }

  async scanBleDeviceType(bleType) {
    if (!this.isBluetoothAvailable()) return;
    // 待添加ACCESS_COARSE_LOCATION权限检查，待测试
    this.deviceTypeList = [];
    let BluetoothIsOpen = (await this.diagnostic.getBluetoothState() == this.diagnostic.bluetoothState.POWERED_ON)
    if (BluetoothIsOpen) {
      console.log("scanBle");
      this.ble.scan([], 5).subscribe(result => {
        console.log(result);
        if (this.plt.is('android')) {
          let UUID = Uint8Array2hex(result.advertising).toUpperCase();
          //console.log(UUID);
          if ((UUID.indexOf("02E0FF") != -1) || (UUID.indexOf("02F0FF") != -1) || (UUID.indexOf("03E0FF") != -1) || (UUID.indexOf("03F0FF") != -1)) {//在这里添加其他的蓝牙服务ID来过滤
            let name = "";
            if (typeof (result.name) == "undefined") name = this.mac2name(result);
            else name = result.name;
            let item = {
              "mac": result.id,
              "deviceName": this.mac2name(result),
              "name": name,
              "mode": "ble",
              "rssi": result.rssi,
              "registed": this.isRegisted(this.mac2name(result))
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
                  if (typeof (result.name) == "undefined") name = this.mac2name(result);
                  else name = result.name;
                  let item = {
                    "mac": result.id,
                    "deviceName": this.mac2name(result),
                    "name": name,
                    "mode": "ble"
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

  stopScanDevice(deviceType, mode) {
    if (!this.plt.is('cordova')) return;
    if (mode == 'ble') {
      this.ble.stopScan();
    } else if (mode == 'net') {
      this.zeroconf.close();
    }
  }

  startScanDevice(deviceType, mode) {
    if (!this.plt.is('cordova')) return;
    if (mode == 'ble') {
      this.scanBleDeviceType(deviceType);
    } else if (mode == 'net') {
      this.scanMdnsDeviceType(deviceType);
    }
  }

  //查询mqtt设备是否在线
  queryDevice(device) {
    //MQTT设备
    if (device.config.mode == "mqtt") {
      device.data.state = 'waiting';
      this.pubMessage(device, `{"get":"state"}`);
      window.setTimeout(() => {
        if (device.data.state != "online") device.data.state = "offline";
      }, 3000);
      return
    }
    //BLE\WIFI设备
    if (device.data.state == "connected") {
      device.data.state = 'waiting';
      this.sendData(device, `{"get":"state"}`);
      window.setTimeout(() => {
        // console.log('设备状态：' + device.data.state)
        if (device.data.state != "connected") device.data.state = "disconnected";
      }, 3000);
    }
  }

  queryDevices() {
    console.log(this.devices);
    for (let deviceName in this.devices) {
      this.queryDevice(this.devices[deviceName]);
    }
  }

  mac2name(result) {
    let deviceName = "";
    //android
    if (this.plt.is('android')) {
      deviceName = result.id.replace(new RegExp(':', 'g'), '');
    }
    //ios
    else {
      let macBytes = new Uint8Array(result.advertising.kCBAdvDataManufacturerData);
      for (let i = macBytes.length - 6; i < macBytes.length; i++) {
        if (macBytes[i] <= 16) deviceName += '0';
        deviceName += macBytes[i].toString(16);
      }
    }
    return deviceName.toUpperCase();
  }

  connectDeviceTimer;
  connectDevice(device: any, mode: string = "show"): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      if (!this.plt.is('cordova')) return resolve(false);
      //连接超时6秒。移除连接定时器情况：1.连接成功；2.退出页面
      this.connectDeviceTimer = window.setTimeout(() => {
        if (mode == "show") this.events.publish("provider:notice", 'timeoutConnect');
        this.disconnectDevice(device);
        return resolve(false);
      }, 6000);
      if (device.data.state != "disconnected") device.data.state = "disconnected";
      // this.events.publish("device:" + device.deviceName, JSON.parse(`{"state":"disconnected"}`));
      if (device.config.mode == "ble") {
        if (!this.isBluetoothAvailable()) return resolve(false);
        if (mode == "show") this.events.publish("loading:show", 'connect');
        let result = await this.connectBleDevice(device)
        return resolve(result);
      } else if (device.config.mode == "net") {
        if (!this.isWifiAvailable()) return resolve(false);
        // if (!(await this.wifiIsConnected())) return resolve(false);
        if (mode == "show") this.events.publish("loading:show", 'connect');
        return resolve(await this.connectNetDevice(device));
      }
    })
  }

  disconnectDevice(device) {
    if (!this.plt.is('cordova')) return;
    //清除连接定时器
    window.clearTimeout(this.connectDeviceTimer);
    if (device.config.mode == "ble") {
      this.disconnectBleDevice(device);
    } else if (device.config.mode == "net") {
      this.disconnectNetDevice(device);
    }
  }

  sendTimerList = {};
  fullMqttDateList = {};
  sendData(device, data) {
    // MQTT发送，带合并数据功能，如果不需要合并数据，直接使用pubMessage
    if (device.config.mode == "mqtt") {
      if (isJson(data)) {
        // console.log("json数据")
        // 如果队列中有这个数据，进行合并
        if (typeof this.fullMqttDateList[device.deviceName] == 'undefined') this.fullMqttDateList[device.deviceName] = '';
        // if (typeof this.sendTimerList[device.deviceName] != 'undefined') {
        let ob = this.fullMqttDateList[device.deviceName] == '' ? {} : JSON.parse(this.fullMqttDateList[device.deviceName]);
        let ob2 = JSON.parse(data)
        this.fullMqttDateList[device.deviceName] = JSON.stringify(Object.assign(ob, ob2))
        // } else {
        //   this.fullMqttDateList[device.deviceName] = JSON.parse(data);
        // }
        if (typeof this.sendTimerList[device.deviceName] != 'undefined') window.clearTimeout(this.sendTimerList[device.deviceName]);
        //检查设备是否是本地设备,是否已连接
        let deviceInLocal = false;
        if (this.islocalDevice(device)) {
          if (this.lanDeviceList[device.deviceName].state == 'connected')
            deviceInLocal = true
        }
        this.sendTimerList[device.deviceName] = window.setTimeout(() => {
          this.pubMessage(device, this.fullMqttDateList[device.deviceName]);
          this.fullMqttDateList[device.deviceName] = '';
          delete this.sendTimerList[device.deviceName];
        }, deviceInLocal ? 100 : 300)
      } else {
        if (!isNumber(data)) data = `"${data}"`

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
      } else if (device.config.mode == "net") {
        if (typeof this.wsClient != 'undefined')
          this.send2net(device, data);
      }
    }
  }

  //搜索并连接到指定ble设备
  lastbuf = new Uint8Array(10240);
  lastbufcnt = 0;
  connectBleDevice(device): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      //this.events.publish("loading:show", 'connect');
      // console.log("ble disconnect");log
      this.ble.disconnect(this.bleUUID);
      console.log("scanBle");
      this.ble.startScan([]).subscribe(result => {
        console.log(result);
        if (this.plt.is('android') || (typeof (result.advertising.kCBAdvDataManufacturerData) != 'undefined')) {
          if (deviceName2Mac(device.deviceName) == this.mac2name(result)) {
            console.log('connect ble device:' + result.id)
            window.clearTimeout(this.connectDeviceTimer);
            this.ble.connect(result.id).subscribe(
              data => {
                this.ble.stopScan();
                this.bleUUID = result.id;
                console.log(data);
                this.events.publish("loading:hide", 'hide');
                if (device.data.state != "connected") device.data.state = "connected";
                this.lastbuf.fill(0);
                this.lastbufcnt = 0;
                this.ble.startNotification(result.id, 'ffe0', 'ffe1').subscribe(buffer => {
                  let buftmp = new Uint8Array(buffer);
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
                this.bleUUID = "";
                if (device.data.state != "disconnected") device.data.state = "disconnected";
                // this.events.publish("device:" + device.deviceName, JSON.parse(`{"state":"disconnected"}`));
                console.log(error);
                return resolve(false);
              }
            );
          }
        }
      });
    })
  }

  async disconnectBleDevice(device) {
    this.ble.stopScan();
    this.ble.stopStateNotifications();
    console.log("ble disconnect");
    this.ble.disconnect(this.bleUUID);
    if (device.data.state != "disconnected") device.data.state = "disconnected";
    this.bleUUID = "";
    //清空缓存
    this.lastbuf.fill(0);
  }

  //发送ble数据
  lastSendTime = 0;
  send2ble(device, message: string) {
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
  }

  //搜索并连接到指定net设备
  //zeroconf.close的情况:1.连接成功；2.连接超时；3.还未连接即退出layout页面
  // keepalivedInterval;
  async connectNetDevice(device): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      // this.events.publish("device:" + device.deviceName, JSON.parse(`{"state":"disconnected"}`));
      if (this.plt.is('android')) {
        this.zeroconf.watchAddressFamily = 'ipv4';
      }

      this.zeroconf.watch('_' + device.deviceType + '._tcp.', 'local.').subscribe(result => {
        if (result.action == "resolved") {
          if (result.service.name == deviceName2Mac(device.deviceName) && result.service.ipv4Addresses.length > 0) {
            window.clearTimeout(this.connectDeviceTimer);
            this.zeroconf.close();
            this.events.publish("loading:hide", 'hide');
            this.disconnectNetDevice(device);
            this.wsClient = new WebSocket("ws://" + result.service.ipv4Addresses[0] + ":81");
            this.wsClient.onmessage = (event) => {
              // this.lastGetTime = new Date().getTime();
              let message = {};
              message["fromDevice"] = device.deviceName;
              try {
                message["data"] = JSON.parse(event.data);
              }
              catch (e) {
                message["data"] = event.data;
              }
              this.processMessage(message);
            }
            this.wsClient.onopen = (event) => {
              console.log("ws open");
              console.log(event);
              if (device.data.state != "connected") device.data.state = "connected";
              return resolve(true);
            };
            this.wsClient.onerror = (event) => {
              console.log("ws error");
              console.log(event);
            }
            this.wsClient.onclose = (event) => {
              console.log("ws close");
              console.log(event);
              if (device.data.state != "disconnected") device.data.state = "disconnected";
            }
            // return resolve(true);
          }
        }
      });
    })
  }

  //添加mqtt设备，手机和设备局域网通信用
  addDevice3(deviceIp, deviceType): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.wsClient = new WebSocket("ws://" + deviceIp + ":81");
      this.wsClient.addEventListener('open', event => {
        console.log(event);
        this.wsClient.send(`{"register":"${deviceType}"}`);
      });
      this.wsClient.addEventListener('message', event => {
        // 此处标准还需修改;
        console.log(event.data);
        if (event.data.indexOf(`{"state":"connected"}`) > -1) {
          console.log("不作处理");
          // 不作处理
        } else if (event.data.indexOf(`{"message":"success"}`) > -1) {
          console.log("连接成功");
          // this.wsClient.close();
          return resolve(true);
        } else {
          console.log("连接失败");
          // this.wsClient.close();
          return resolve(false);
        }
      });
    })
  }

  disconnectNetDevice(device) {
    // console.log('guanguangguan');
    if (typeof (this.wsClient) != "undefined")
      this.wsClient.close();
    // this.wsClient.
    //处理还未连接上，便退出layout的情况  
    this.zeroconf.close();
  }

  //发送net数据
  send2net(device, message: string) {
    // if (this.wsClient.readyState == "OPEN") 
    // console.log("发送getstate");
    this.wsClient.send(message);
  }

  async isBluetoothAvailable() {
    if (await this.diagnostic.getBluetoothState() == this.diagnostic.bluetoothState.POWERED_ON) {
      return true;
    } else {
      this.events.publish("provider:notice", "openBluetooth");
      return false;
    }
  }

  async isWifiAvailable() {
    if (await this.diagnostic.isWifiAvailable()) {
      return true;
    } else {
      this.events.publish("provider:notice", "openWifi");
      return false;
    }
  }

}

