export interface BlinkerDeviceConfig {
    component?: string,
    configurator?: string[],
    description: string,
    deviceType: string,
    guide: string,
    headerStyle: string,
    image: string,
    layouter?: string,
    mode: string,
    name: string,
    speech?: any[], // 2.3.0已移除
    timer?: any[],  // 2.3.0已移除
    actions?: string,
    triggers?: string,
    vender: string
}


export interface TriggerConfig {
    source: string,
    source_zh: string,
    state?: string[],
    range?: number[],
    enableDuration?: boolean,
    state_zh?: string[],
    unit?: string,
    unit_zh?: string,
    speech?: string,
}

export interface ActionConfig {
    cmd: any,
    text: string
}