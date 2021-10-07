export interface AutoTask {
    id: string,
    enable: boolean,
    text: string,
    mode: string, //and,or,other
    time: Time,
    triggers: Trigger[],
    actions: Action[]
}

export interface Time {
    day: string,
    range: number[]
}

export interface Trigger {
    deviceId: string,
    source: string,
    operator: string,
    value: string | number,
    duration: number
}

export interface Action {
    deviceId: string,
    act: any
}