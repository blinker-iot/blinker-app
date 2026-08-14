import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  managedDeviceConnectionLabel,
  managedDeviceDataLabel,
  managedDeviceSupportsControl,
} from './managed-device.readonly';

describe('managed-device read-only policy', () => {
  const device = {
    deviceName: 'device_1',
    config: { broker: '', customName: 'One', mode: 'managed-http' },
    data: { switch: 'on' },
    storage: {},
    subject: new Subject(),
  };

  it('never enables command controls from snapshot data', () => {
    expect(managedDeviceSupportsControl(device)).toBe(false);
  });

  it('labels the transport and snapshot accurately', () => {
    expect(managedDeviceConnectionLabel(device)).toBe('HTTP 状态');
    expect(managedDeviceDataLabel(device)).toBe('最近数据');
  });
});
