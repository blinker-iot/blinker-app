export const DEVICE_UI_CHANNEL = 'blinker-device-ui-v1';
export const DEVICE_UI_PROTOCOL_VERSION = 1 as const;
export const DEVICE_TEMPLATE_VERSION = '0.1.0';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface DeviceSnapshot {
  id: string;
  deviceName: string;
  name: string;
  type: string;
  mode: string;
  isPreview: boolean;
  showSwitch: boolean;
  data: JsonObject;
}

export interface DeviceViewport {
  headerHeight: number;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface DeviceHostContext {
  protocolVersion: typeof DEVICE_UI_PROTOCOL_VERSION;
  device: DeviceSnapshot;
  viewport: DeviceViewport;
  capabilities: {
    commands: boolean;
    history: boolean;
  };
}

export interface DeviceUpdate {
  revision: number;
  device: DeviceSnapshot;
  event?: JsonObject;
}

export interface ChildReadyPayload {
  protocolVersion: typeof DEVICE_UI_PROTOCOL_VERSION;
  templateVersion: string;
}

export interface CommandResult {
  accepted: boolean;
  reason?: string;
}

export interface HistoryRequest {
  key: string;
  quickCode: '1h' | '1d' | '1w' | '1m';
}

export interface HistoryPoint {
  timestamp: number;
  value: JsonValue;
}

export type HistoryResult =
  | { ok: true; points: HistoryPoint[] }
  | { ok: false; error: string };
