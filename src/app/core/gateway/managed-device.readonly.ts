import { BlinkerDevice } from '../model/device.model';

function isManagedDevice(device: BlinkerDevice): boolean {
  return device?.config?.mode === 'managed-http';
}

export function managedDeviceSupportsControl(device: BlinkerDevice): boolean {
  return !isManagedDevice(device);
}

export function managedDeviceConnectionLabel(device: BlinkerDevice): string {
  if (isManagedDevice(device)) return 'HTTP 状态';
  return device.config.mode === 'ble' ? 'Bluetooth LE' : 'MQTT';
}

export function managedDeviceDataLabel(device: BlinkerDevice): string {
  return isManagedDevice(device) ? '最近数据' : '实时数据';
}
