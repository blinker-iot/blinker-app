interface BlinkerDevice {
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
    },
    data: any,
    storage: any
}