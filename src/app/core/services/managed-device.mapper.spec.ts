import {
  applyManagedDeviceConfig,
  applyManagedDeviceSnapshot,
  applyManagedDeviceStatus,
  ManagedDeviceDto,
  mapManagedDevice,
} from './managed-device.mapper';

function deviceDto(
  deviceId: string,
  overrides: Partial<ManagedDeviceDto> = {},
): ManagedDeviceDto {
  return {
    deviceId,
    tenantId: 'tenant-1',
    name: '客厅传感器',
    deviceType: 'diy',
    status: 'active',
    createdAt: 1786600000000,
    updatedAt: 1786600001000,
    ...overrides,
  };
}

describe('managed device mapper', () => {
  it('keeps the complete device id when 12-character prefixes collide', () => {
    const firstId = 'device_same-prefix-a';
    const secondId = 'device_same-prefix-b';
    expect(firstId.slice(0, 12)).toBe(secondId.slice(0, 12));

    const first = mapManagedDevice(deviceDto(firstId));
    const second = mapManagedDevice(deviceDto(secondId));

    expect(first.id).toBe(firstId);
    expect(first.deviceName).toBe(firstId);
    expect(second.id).toBe(secondId);
    expect(second.deviceName).toBe(secondId);
    expect(first.id).not.toBe(second.id);
    expect(first.config.mode).toBe('managed-http');
    expect(first.isManaged).toBe(true);
  });

  it('updates an existing device without replacing observable objects', () => {
    const device = mapManagedDevice(deviceDto('device-full-id'));
    const config = device.config;
    const data = device.data;
    const storage = device.storage;
    const subject = device.subject;

    const updated = mapManagedDevice(
      deviceDto('device-full-id', {
        name: '新名称',
        deviceType: 'sensor',
        updatedAt: 1786600002000,
      }),
      device,
    );

    expect(updated).toBe(device);
    expect(updated.config).toBe(config);
    expect(updated.data).toBe(data);
    expect(updated.storage).toBe(storage);
    expect(updated.subject).toBe(subject);
    expect(updated.config.customName).toBe('新名称');
    expect(updated.deviceType).toBe('sensor');
  });

  it('keeps server config separate from App runtime config', () => {
    const device = mapManagedDevice(deviceDto('device-full-id'));
    const configIdentity = device.config;

    applyManagedDeviceConfig(device, {
      config: {
        mode: 'mqtt',
        broker: 'untrusted-broker',
        customName: 'untrusted-name',
        displayName: '卧室传感器',
        nested: { sampleIntervalSec: 60 },
      },
    });

    expect(device.config).toBe(configIdentity);
    expect(device.config.mode).toBe('managed-http');
    expect(device.config.broker).toBe('');
    expect(device.config.customName).toBe('卧室传感器');
    expect(device.config.rawConfig).toEqual({
      mode: 'mqtt',
      broker: 'untrusted-broker',
      customName: 'untrusted-name',
      displayName: '卧室传感器',
      nested: { sampleIntervalSec: 60 },
    });
  });

  it('uses status.mqttOnline rather than lifecycle or summary status', () => {
    const device = mapManagedDevice(deviceDto('device-full-id'));
    const dataIdentity = device.data;

    applyManagedDeviceStatus(device, {
      device: { deviceId: 'device-full-id', status: 'disabled' },
      status: {
        status: 0,
        mqttOnline: true,
        lastActiveAt: 1786600003000,
      },
      brokerStatus: 'inactive',
    });

    expect(device.data).toBe(dataIdentity);
    expect(device.data.enable).toBe(true);
    expect(device.data.state).toBe('online');
    expect(device.managed.mqttOnline).toBe(true);
    expect(device.managed.lifecycleStatus).toBe('disabled');

    applyManagedDeviceStatus(device, {
      device: { deviceId: 'device-full-id', status: 'active' },
      status: { status: 1, mqttOnline: false },
    });
    expect(device.data.enable).toBe(false);
    expect(device.data.state).toBe('offline');
  });

  it('projects only safe JSON snapshot fields and filters reserved keys', () => {
    const device = mapManagedDevice(deviceDto('device-full-id'));
    const dataIdentity = device.data;

    applyManagedDeviceSnapshot(device, {
      device: { deviceId: 'device-full-id' },
      data: {
        protocol: 'json',
        receivedAt: 1786600004000,
        sourceClientId: 'device-full-id',
        data: {
          temperature: 23.5,
          enable: true,
          state: 'online',
          switch: 'on',
          receivedAt: 'spoofed',
          nested: { humidity: 48, constructor: 'blocked' },
          invalidNumber: Number.POSITIVE_INFINITY,
          invalidObject: new Date(),
        },
      },
    });

    expect(device.data).toBe(dataIdentity);
    expect(device.data.enable).toBe(false);
    expect(device.data.state).toBe('offline');
    expect(device.data.switch).toBeUndefined();
    expect(device.data.receivedAt).toBeUndefined();
    expect(device.data.temperature).toBe(23.5);
    expect(device.data.nested).toEqual({ humidity: 48 });
    expect(device.data.invalidNumber).toBeUndefined();
    expect(device.data.invalidObject).toBeUndefined();
    expect(device.managed.latestSnapshot).toEqual({
      protocol: 'json',
      receivedAt: 1786600004000,
      sourceClientId: 'device-full-id',
    });
  });

  it('clears prior JSON projections and does not project TLV snapshots', () => {
    const device = mapManagedDevice(deviceDto('device-full-id'));
    applyManagedDeviceSnapshot(device, {
      device: { deviceId: 'device-full-id' },
      data: {
        protocol: 'json',
        receivedAt: 1786600004000,
        sourceClientId: 'device-full-id',
        data: { temperature: 23.5 },
      },
    });

    applyManagedDeviceSnapshot(device, {
      device: { deviceId: 'device-full-id' },
      data: {
        protocol: 'tlv',
        receivedAt: 1786600005000,
        sourceClientId: 'device-full-id',
        data: { temperature: 99 },
      },
    });

    expect(device.data.temperature).toBeUndefined();
    expect(device.managed.latestSnapshot).toBeUndefined();
    expect(device.managed.projectedSnapshotKeys).toEqual([]);
  });
});
