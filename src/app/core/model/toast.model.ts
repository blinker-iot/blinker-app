import { BlinkerDevice } from "./device.model";

export interface toastOptions {
    deviceId?: string,
    device?: BlinkerDevice
    message: string,
    delay?: number
}