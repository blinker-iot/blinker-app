export class Device {
  deviceType: string;
  image: string;
  mqttBroker: string;
  productKey: string;
  deviceName: string;
  customName: string;

  setProductKey(productKey: string) {
    this.productKey = productKey;
  }

  setDeviceName(deviceName: string) {
    this.deviceName = deviceName;
  }

  setDeviceType(deviceType: string) {
    this.deviceType = deviceType;
  }

  setMqttBroker(mqttBroker: string) {
    this.mqttBroker = mqttBroker;
  }

  setImage(image: string) {
    this.image = image;
  }

  setCustomName(customName: string) {
    this.customName = customName;
  }
}

export class Broker {
  vender: string;
  url: string;
  port: number;
  productKey: string;
  deviceName: string;
  deviceSecret: string;
  certificate: string;
}

export class DeviceManager {

  loader;
  get events() {
    return this.loader.events
  };
  get device() {
    return this.loader.device
  };

  constructor(loader) {
    this.loader = loader;
  }

  public subscribe() {
    this.events.subscribe('device:' + this.device.deviceName, data => {
      // console.log("分发数据");
      // console.log(data);
      //如果不是json对象，就判定为unknownData
      if (typeof (data) == 'string' || typeof (data) == "number") {
        this.events.publish(this.device.deviceName + ':unknownData', data.toString() + "\n");
      } else {
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
          this.device.data[key] = data[key];
          this.events.publish(this.device.deviceName + ':' + key, 'loaded');

          // 设备获取手机状态数据
          if (key == "ahrs")
            this.events.publish('native:ahrs', this.device);
          if (JSON.stringify(data) == `{"get":"gps"}`)
            this.events.publish('native:gps', this.device);
          if (key == "vibrate")
            this.events.publish('native:vibrate', this.device);
        }
        // 显示到degbug窗口
        this.events.publish(this.device.deviceName + ':unknownData', JSON.stringify(data) + "\n");
      }
      //通知相关页面,关闭读取状态
      this.events.publish(this.device.deviceName + ':deviceblock', 'loaded')
      this.events.publish(this.device.deviceName + ':dashboard', 'loaded')
    });
  }

  public unsubscribe() {
    this.events.unsubscribe('device:' + this.device.deviceName);
  }

}