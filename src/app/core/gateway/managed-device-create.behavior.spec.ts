import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { ManagedDeviceCreateService } from './managed-device-create.service';

describe('ManagedDeviceCreateService behavior', () => {
  it('reuses one idempotency key for the same logical attempt', async () => {
    const calls: Array<[unknown, string]> = [];
    const devices = {
      createDevice(input: unknown, key: string) {
        calls.push([input, key]);
        return of({
          device: { deviceId: 'device_1', name: 'One', deviceType: 'diy', status: 'active' },
          replayed: true,
        });
      },
    };
    const service = new ManagedDeviceCreateService(devices as any);
    const attempt = service.begin({ name: ' One ', deviceType: '' });
    await service.execute(attempt);
    await service.execute(attempt);
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(calls[0][0]).toEqual({ name: 'One', deviceType: 'diy' });
  });
});
