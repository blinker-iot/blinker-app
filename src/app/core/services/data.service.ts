// 数据服务
// 用于服务和组件间共享数据、数据加载与初始化
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';
import { BehaviorSubject, Subject } from 'rxjs';
import CryptoJS from 'crypto-js';
import { getDeviceId, randomId } from '../functions/func';
import { BlinkerBroker } from '../model/broker.model';
import { API } from 'src/app/configs/app.config';

interface AuthData {
    uuid: string,
    token: string
}

interface UserData {
    username: string,
    avatar: string,
    phone: string,
}

interface OrderData {
    dict: any;
    list: string[];
}

interface ShareDate {
    share: any,
    share0: any,
    shared: any[],
    shared0: any[]
}

@Injectable({
    providedIn: 'root'
})
export class DataService {

    authDataLoader = new BehaviorSubject(false);
    userDataLoader = new BehaviorSubject(false);
    deviceDataLoader = new BehaviorSubject(false);
    initCompleted = new BehaviorSubject(false);
    authCheck = new Subject;
    authDataExpire = new Subject;

    firstBoot = true;

    _auth: AuthData;
    set auth(auth: AuthData) {
        this._auth = auth
        this.saveAuthData()
        this.authDataLoader.next(true)
    }

    get auth() {
        return this._auth
    }

    user: UserData;

    device: OrderData;
    scene: OrderData;
    room: OrderData;
    auto: OrderData;
    block: OrderData;
    share: ShareDate;

    brokers: OrderData;
    tempImgFile: any;

    constructor(
        private storage: Storage,
    ) { }

    async init() {
        await this.loadAuthData()
    }

    async loadAuthData() {
        let auth = await this.storage.get('auth')
        if (auth != null) {
            this.auth = auth
        }
    }

    saveAuthData() {
        this.storage.set('auth', this.auth);
    }

    removeAuthData() {
        this.storage.remove('auth');
        this.initCompleted.next(false);
        this.firstBoot = true;
    }

    load(data) {
        this.user = {
            avatar: API.USER.AVATAR + `/${data.profiles.avatar}.jpg?date = ${(new Date()).getTime()}`,
            username: data.profiles.username,
            phone: data.profiles.phone
        }
        //获取brokers
        this.brokers = {
            dict: this.initBrokers(data.brokers),
            list: ['aliyun']
        }
        // 获取devices
        this.device = {
            dict: this.initDevices(data.devices),
            list: data.profiles.userConf.deviceList
        };
        console.log(data.profiles.userConf.deviceList);

        console.log(this.device);

        if (typeof (data.profiles.userConf.sceneList) != 'undefined') {
            this.scene = {
                dict: typeof data.profiles.userConf.sceneList.data == "undefined" ? {} : data.profiles.userConf.sceneList.data,
                list: typeof data.profiles.userConf.sceneList.order == "undefined" ? [] : data.profiles.userConf.sceneList.order
            };
        }
        // 读取room
        if (typeof (data.profiles.userConf.roomList) != 'undefined') {
            this.room = {
                dict: typeof data.profiles.userConf.roomList.data == "undefined" ? {} : data.profiles.userConf.roomList.data,
                list: typeof data.profiles.userConf.roomList.order == "undefined" ? [] : data.profiles.userConf.roomList.order
            }
        }
        // 读取block
        if (typeof (data.profiles.userConf.blockList) != 'undefined') {

            this.block = {
                dict: data.profiles.userConf.blockList.data,
                list: data.profiles.userConf.blockList.order,
            }
        }
        // 读取share
        if (typeof (data.profiles.userConf.shareList) != 'undefined') {
            this.share = data.profiles.userConf.shareList;
        }
        // 数据修复
        this.fixData()
        // 添加设备必要属性
        this.addAttribute()


        this.userDataLoader.next(true);
        if (this.firstBoot) {
            // console.log('data service init completed');
            this.initCompleted.next(true);
            this.firstBoot = false;
        }
    }

    fixData() {
        this.device.list = this.checkInvalidDevice(this.device.list);
        if (typeof this.room.list != 'undefined')
            this.room.list.forEach(roomName => {
                this.room.dict[roomName] = this.checkInvalidDevice(this.room.dict[roomName])
            });
        if (typeof this.scene.list != 'undefined') {
            this.room.list.forEach(roomName => {
                this.room.dict[roomName] = this.checkInvalidDevice(this.room.dict[roomName])
            });
        }

    }

    addAttribute() {
        // 添加isShared
        if (typeof this.share != 'undefined')
            this.share.shared.forEach(sharedDevice => {
                this.device.dict[sharedDevice.deviceName].config['isShared'] = true
            });
        // 添加isDiy
        this.device.list.forEach(deviceId => {
            if (this.device.dict[deviceId].deviceType.indexOf('Diy') > -1)
                this.device.dict[deviceId].config['isDiy'] = true
        })
    }

    initDevices(devices) {
        let deviceDict = {};
        for (const device of devices) {
            let id = getDeviceId(device);
            let newDevice = device;
            newDevice['id'] = id;
            // if (typeof this.device != 'undefined') {
            if (typeof this.device != 'undefined' && typeof this.device.dict[id] != "undefined") {
                if (typeof this.device.dict[id].data != "undefined")
                    newDevice['data'] = this.device.dict[id].data
                if (typeof this.device.dict[id].storage == "undefined")
                    device['storage'] = this.device.dict[id].storage
            } else {
                newDevice['data'] = {
                    switch: '',
                    state: ''
                }
                newDevice['storage'] = {}
            }
            deviceDict[id] = newDevice;
        }
        return deviceDict;
    }

    initBrokers(brokers) {
        let newBrokers = {}
        for (const broker of brokers) {
            if (typeof this.brokers != 'undefined' && typeof this.brokers.dict[broker.vender] != 'undefined') {
                newBrokers[broker.vender] = this.brokers.dict[broker.vender]
            } else if (broker.vender == "blinker") {
                newBrokers['blinker'] = this.initBlinkerBroker(broker)
            } else if (broker.vender == "aliyun") {
                newBrokers['aliyun'] = this.initAliyunBroker(broker)
            } else if (broker.vender == "onenet") {
                newBrokers['onenet'] = this.initOnenetBroker(broker)
            }
        }
        return newBrokers
    }


    initBlinkerBroker(broker) {
        return {}
    }

    initAliyunBroker(broker): BlinkerBroker {
        let clientId = randomId();
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
        let dataTemplate = {
            fromDevice: broker.deviceName,
            toDevice: '',
            deviceType: '',
            data: ''
        }
        let topic = {
            receive: '/' + broker.productKey + '/' + broker.deviceName + '/r',
            send: '/' + broker.productKey + '/' + broker.deviceName + '/s',
        }
        return {
            vender: "aliyun",
            host: mqttHost,
            options: options,
            topic: topic,
            dataTemplate: dataTemplate,
            connected: new BehaviorSubject(false)
        }
    }

    initOnenetBroker(broker) {
        return {}
    }

    getDevice(id) {
        return this.device.dict[id]
    }

    checkInvalidDevice(deviceList) {
        // console.log(deviceList);
        let newDeviceList = [];
        deviceList.forEach(deviceId => {
            if (typeof this.device.dict[deviceId] != 'undefined') {
                newDeviceList.push(deviceId)
            }
        });
        if (newDeviceList.length == 0) {
            for (const deviceId in this.device.dict) {
                newDeviceList.push(deviceId)
            }
        }
        return newDeviceList
    }

}
