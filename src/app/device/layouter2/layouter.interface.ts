export interface Layouter2Data {
    version: string,
    header?: {
        background: string,
        color: string
    },
    background?: {
        background: string,
    },
    dashboard: WidgetData[],
    actions: ActionData[],
    triggers: TriggerData[]
}

export interface Layouter2Config {
    headerColor: string,
    headerStyle: string,
    background: any
}

export interface WidgetData {

}

export interface ActionData {
    text: any,
    cmd: any
}

export interface TriggerData {

}