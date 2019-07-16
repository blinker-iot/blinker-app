//这是一个试验结构，暂时没有采用该结构
import { Platform, Events } from 'ionic-angular';
import { UserProvider } from '../providers/user/user'
import mqtt, { MqttClient } from 'mqtt';
import CryptoJS from 'crypto-js';
import { BLE } from '@ionic-native/ble';
import { deviceName2Mac, transcoding, str2ab, name2mac, Uint8Array2hex, isJson, mac2name } from '../functions/func';

class DeviceManager {
    type: String;
    name: String;
    config: Config;
    data: any;
    storage: any;

    constructor(
        public events: Events,
        public userProvider: UserProvider,
        public platform: Platform,
        deviceData: DeviceData
    ) {
        this.type = deviceData.deviceType;
        this.name = deviceData.deviceName;
        this.config = deviceData.config;
        this.data = {
            switch: '',
            state: ''
        }
        // this.storage={}
    }

    init() {
        this.query()
    }

    connect() { }
    disconnect() { }
    query() { }
    send(message) { }
    subscribe() {
        // console.log('订阅device:' + this.device.deviceName);
        this.events.subscribe('device:' + this.name, data => {
            // console.log("分发数据");
            // console.log(data);
            //如果不是json对象，就判定为unknownData
            if (typeof (data) == 'string' || typeof (data) == "number") {
                this.events.publish(this.name + ':unknownData', data.toString() + "\n");
            } else {
                for (let key in data) {
                    //保留关键字不允许用户改写
                    if (key == "config" || key == "deviceName" || key == "deviceType")
                        break;
                    //设备获取手机状态数据/本地通知功能
                    if (key == "get") {
                        this.events.publish(this.name + ':get', data[key]);

                        break;
                    }
                    if (key == "notice" && this.userProvider.localStorage.app.allowNotice) {
                        this.events.publish("provider:push", data[key]);
                        break;
                    }
                    //实际通信数据存储
                    //device.data为临时数据存储位置
                    this.data[key] = data[key];
                    this.events.publish(this.name + ':' + key, 'loaded');
                }
                // 显示到degbug窗口
                this.events.publish(this.name + ':unknownData', JSON.stringify(data) + "\n");
            }
            //通知相关页面,关闭读取状态
            this.events.publish('page:device', 'loaded')
            // this.changeDetectorRef.markForCheck();
        });
    }

    unsubscribe() {
        this.events.unsubscribe('device:' + this.name);
    }

    processMessage(message) {
        // console.log('将消息分发到组件:' + message.fromDevice)
        // 如果该fromDevice，不在现有设备列表中，则可能是刚添加的新设备
        // if (this.deviceList.indexOf(message.fromDevice) > -1) {
        //   this.events.publish('device:' + message.fromDevice, message.data);
        // }
        // if (JSON.stringify(message.data) == '{"message":"Registration successful"}') {
        //   this.events.publish('device:new', message);
        // }
    }

}

class BleDeviceManager extends DeviceManager {
    uuid;
    lastbuf;
    lastbufcnt;

    constructor(
        public events: Events,
        public userProvider: UserProvider,
        public platform: Platform,
        public ble: BLE,
        deviceData: DeviceData,
    ) {
        super(events, userProvider, platform, deviceData);
    }

    connect(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            //this.events.publish("loading:show", 'connect');
            // console.log("ble disconnect");log
            this.ble.disconnect(this.uuid);
            console.log("scanBle");
            this.ble.startScan([]).subscribe(result => {
                console.log(result);
                if (this.platform.is('android') || (typeof (result.advertising.kCBAdvDataManufacturerData) != 'undefined')) {
                    if (deviceName2Mac(this.name) == mac2name(result)) {
                        console.log('连接蓝牙设备：' + result.id)
                        // window.clearTimeout(this.connectDeviceTimer);
                        this.ble.connect(result.id).subscribe(
                            data => {
                                this.ble.stopScan();
                                this.uuid = result.id;
                                console.log(data);
                                this.events.publish("loading:hide", 'hide');
                                // this.events.publish("device:" + device.deviceName, JSON.parse(`{"state":"connected"}`));
                                this.data.state = 'connected';
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
                                        message["fromDevice"] = this.name;
                                        if (fullMessage.indexOf('{') > -1) {
                                            try {
                                                message["data"] = JSON.parse(fullMessage);
                                            }
                                            catch (e) {
                                                message["data"] = fullMessage;
                                            }
                                        }
                                        else message["data"] = fullMessage;
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
                                this.uuid = "";
                                if (this.data.state != "disconnected") this.data.state = "disconnected";
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
}

class NetDeviceManager extends DeviceManager {
    wsClient: WebSocket;
}

class MqttDeviceManager extends DeviceManager {
    mqttClient: MqttClient;
    wsClient: WebSocket;
    closeCounter = 0;
    broker;

    query() {
        this.data.state = 'waiting';
        this.send(`{"get":"state"}`);
        window.setTimeout(() => {
            if (this.data.state != "online") this.data.state = "offline";
        }, 3000);
    }
}



interface DeviceData {
    deviceType: String;
    deviceName: String;
    config: Config;
    data: any;
    storage: any;
}

interface Config {
    mode;
    broker;
    image;
    customName;
    switch;
}