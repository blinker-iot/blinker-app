export interface DeviceComponent {
    device: any;
}

export class Device {
    deviceName: string;
    deviceType: string;
    config: {
        broker?: string;
        customName?: string;
        disabled?: boolean;
        image?: string;
        layouter: string;
        mode: string;
        position?: {
            address: string;
            location: number[];
        }
        public?: number;
        showSwitch?: null;
    };
    data?: any;
}