import { Subject } from "rxjs";

export interface DeviceCardMetricConfig {
    key: string;
    label?: string;
    unit?: string;
}

export interface DeviceCardActionConfig {
    key: string;
    label: string;
    icon?: string;
    command?: Record<string, unknown>;
}

export interface DeviceCardConfig {
    layout?: 'standard' | 'wide';
    metrics?: DeviceCardMetricConfig[];
    actions?: DeviceCardActionConfig[];
}

export interface BlinkerDevice {
    deviceName: string,
    id?: string,
    cloudEnabled?: boolean,
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
        isShared?: boolean,
        isPreview?: boolean,
        previewNearby?: boolean,
        position?: any,
        public?: any,
        showSwitch?: boolean
        card?: DeviceCardConfig,
        authKey?: string,
        component?: string,
        headerStyle?: 'dark' | 'light'
    },
    data: any,
    storage: any,
    subject: Subject<any>
}

export interface DeviceComponent {
    device: any;
}
