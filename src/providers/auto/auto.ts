import { Injectable } from '@angular/core';
import { DeviceProvider } from '../device/device';
import { Events } from 'ionic-angular';

@Injectable()
export class AutoProvider {

  sceneButtonList = [
    // {
    //   name: "回家模式",
    //   icon: "home",
    //   actions: [
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRC", content: "开灯", data: `{ "tog-abc": "on" }` },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRB", content: "开灯", data: { "tog-abc": "on" } },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRA", content: "开灯", data: { "tog-abc": "on" } },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRD", content: "开灯", data: { "tog-abc": "on" } },
    //   ]
    // },
    // {
    //   name: "离家模式",
    //   icon: "walk",
    //   actions: [
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRC", content: "关灯", data: { "btn-abc": "tap" } },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRB", content: "关灯", data: { "btn-abc": "tap" } },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRA", content: "关灯", data: { "btn-abc": "tap" } },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRD", content: "关灯", data: { "btn-abc": "tap" } },
    //   ]
    // },
    // {
    //   name: "起床",
    //   icon: "sunny",
    //   actions: [
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRC", content: "关灯", key: "btn-abc", value: "tap" },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRB", content: "关灯", key: "btn-abc", value: "tap" },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRA", content: "关灯", key: "btn-abc", value: "tap" },
    //     { devicename: "30AEA4244BF4ORZ88QHTJRRD", content: "关灯", key: "btn-abc", value: "tap" },
    //   ]
    // },
    // { name: "睡觉", icon: "moon" },
    // { name: "关闭所有灯", icon: "glasses" },
    // { name: "播放音乐", icon: "headset" },
  ]

  constructor(
    private deviceProvider: DeviceProvider,
    public events: Events
  ) {

  }

  // 分发数据
  async process(scene) {
    // console.log('AutoProvider process:'+JSON.stringify(scene));
    console.log(scene.actions)
    for (let action of scene.actions) {
      if (this.deviceProvider.devices[action.deviceName].config.mode == "mqtt") {
        this.deviceProvider.sendData(this.deviceProvider.devices[action.deviceName], action.data);
      } else {
        await this.send2LocalDevice(this.deviceProvider.devices[action.deviceName], action);
      }
    }
    this.events.publish(JSON.stringify(scene.actions), 'done');
  }

  send2LocalDevice(device, action): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      console.log("连接：" + device.deviceName);
      if (await this.deviceProvider.connectDevice(device, "hide")) {
        window.setTimeout(() => {
          this.deviceProvider.sendData(device, action.data);
        }, 300);
        window.setTimeout(() => {
          this.deviceProvider.disconnectDevice(device);
          return resolve(true);
        }, 1500);
      } else {
        return resolve(false);
      }
    })
  }
}