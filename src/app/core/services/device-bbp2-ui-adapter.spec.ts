import '@angular/compiler';

import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { BlinkerDevice } from '../model/device.model';
import { DeviceService } from './device.service';

const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';
const device = {
  id: logicalDeviceId,
  deviceName: 'legacy-device-name',
  config: { mode: 'bbp2' },
} as BlinkerDevice;

function createHarness() {
  const deviceUi = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue(undefined),
    watchState: vi.fn(() => new Subject()),
    watchEvents: vi.fn(() => new Subject()),
  };
  const service = new DeviceService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    deviceUi as never,
  );

  return { deviceUi, service };
}

describe('DeviceService bbp2 DeviceUiPort adapter', () => {
  it('maps set fields to DeviceUiPort commands', async () => {
    const { deviceUi, service } = createHarness();

    service.sendData(device, JSON.stringify({
      set: { switch: 'on', brightness: 64 },
    }));

    await vi.waitFor(() => {
      expect(deviceUi.sendCommand).toHaveBeenCalledTimes(2);
    });
    expect(deviceUi.sendCommand).toHaveBeenNthCalledWith(
      1,
      logicalDeviceId,
      'switch',
      'on',
    );
    expect(deviceUi.sendCommand).toHaveBeenNthCalledWith(
      2,
      logicalDeviceId,
      'brightness',
      64,
    );
    expect(deviceUi.connect).not.toHaveBeenCalled();
  });

  it('maps get to DeviceUiPort connect without sending a command', async () => {
    const { deviceUi, service } = createHarness();

    service.sendData(device, JSON.stringify({ get: 'state' }));

    await vi.waitFor(() => {
      expect(deviceUi.connect).toHaveBeenCalledWith(logicalDeviceId);
    });
    expect(deviceUi.connect).toHaveBeenCalledTimes(1);
    expect(deviceUi.sendCommand).not.toHaveBeenCalled();
  });
});
