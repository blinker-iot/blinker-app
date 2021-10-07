import { Subject } from "rxjs";

export interface BlinkerDevice {
    deviceName: string,
    id?: string,
    deviceType?: string,
    config: {
        broker: string,
        customName: string,
        mode: string,
        disabled?: boolean
        dashboard?: []
        elements?: string,
        layouter?: string,
        image?: string,
        isDev?: boolean,
        isDiy?: boolean,
        isShared?: boolean,
        position?: any,
        public?: any,
        showSwitch?: boolean
        authKey?: string
    },
    data: any,
    storage: any,
    subject: Subject<any>
}

export interface DeviceComponent {
    device: any;
}

export class Device {
    deviceType: string;
    image: string;
    mqttBroker: string;
    productKey: string;
    deviceName: string;
    customName: string;
    config: {
        broker?: string;
        customName?: string;
        disabled?: boolean;
        image?: string;
        layouter?: string;
        mode?: string;
        position?: {
            address: string;
            location: number[];
        }
        public?: number;
        showSwitch?: null;
    };
    data?: any;

    setProductKey(productKey: string) {
        this.productKey = productKey;
    }

    setDeviceName(deviceName: string) {
        this.deviceName = deviceName;
    }

    setDeviceType(deviceType: string) {
        this.deviceType = deviceType;
    }

    setDevMode() {
        this.config = {};
        this.config['isDev'] = true;
    }

    setMqttBroker(mqttBroker: string) {
        this.mqttBroker = mqttBroker;
    }

    setImage(image: string) {
        this.config['image'] = image;
    }

    setCustomName(customName: string) {
        this.config['customName'] = customName;
    }
}
