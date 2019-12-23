import { BehaviorSubject } from "rxjs";

export interface BlinkerBroker {
    vender: string,
    host: string,
    options: any,
    topic: any,
    dataTemplate: any,
    client?: any,
    connected?: BehaviorSubject<boolean>
}