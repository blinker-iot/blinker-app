// 备用

import { Subject } from "rxjs";

export interface DeviceConfig {
    "authKey": string,
    "broker": string,
    "customName": string,
    "image": string,
    "mode": string | 'mqtt' | 'ble',
    "position": {
        "address": string | null,
        "location": any[]
    },
    "layouter"?: string,
}


export interface BlinkerDevice {
    id: string,
    type: string,
    config: DeviceConfig,
    // 设备加载后使用
    data: any,
    storage: any,
    subject: Subject<any>
}
