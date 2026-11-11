import '@angular/compiler';
import { of } from 'rxjs';
import { API } from '../../configs/api.config';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';
import { DeviceV2ManagementService } from './device-v2-management.service';

describe('explicit product instance lookup', () => {
  const instance = new Uint8Array(16).fill(1);
  const id = 'device_11111111-1111-4111-8111-111111111111';
  const locator = 'AQEBAQEBAQEBAQEBAQEBAQ';
  const cloud = { logicalDeviceId: id, state: 'active', cloudEnabled: true,
    registrationProduct: 'cloud', credentialVersion: 1, locator, name: 'Cloud card' };
  function setup(device: unknown = cloud, cache = 'private, no-store') {
    const http = { post: vi.fn(() => of({ status: 200, headers: { get: () => cache },
      body: { status: 200, data: { device } } })) };
    return { service: new DeviceV2ManagementService(http as any), http };
  }
  it('uses the explicit contract and product instead of legacy instance priority', async () => {
    const f = setup();
    await expect(f.service.resolveDeviceInstanceV2(instance, 'cloud')).resolves.toMatchObject({ data: { device: cloud } });
    const [url, body, options] = f.http.post.mock.calls[0] as unknown as [string, unknown, any];
    expect(url).toBe(API.DEVICE_V2.RESOLVE_INSTANCE);
    expect(body).toEqual({ deviceInstanceId: locator, registrationProduct: 'cloud' });
    expect(options.headers).toEqual({ 'X-Blinker-Contract': 'access-registration-v1' });
    expect(options.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
  });
  it.each([null, { ...cloud, registrationProduct: 'ble_direct' }, { ...cloud, registrationProduct: null },
    { ...cloud, state: 'deleted' }, { ...cloud, credentialVersion: 0 }, { ...cloud, locator: '' }])(
    'accepts only absence or an active matching Cloud registration', async device => {
      const f = setup(device), read = f.service.resolveDeviceInstanceV2(instance, 'cloud');
      if (device === null) await expect(read).resolves.toMatchObject({ data: { device: null } });
      else await expect(read).rejects.toThrow('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
      expect(f.http.post).toHaveBeenCalledOnce();
    });
  it('requires no-store for product reads, without falling back to the legacy lookup', async () => {
    const f = setup(cloud, 'private, max-age=0');
    await expect(f.service.resolveDeviceInstanceV2(instance, 'cloud')).rejects.toThrow();
    expect(f.http.post).toHaveBeenCalledOnce();
  });
  it('preserves the legacy wire only for an explicitly non-product consumer', async () => {
    const f = setup(); await f.service.resolveDeviceInstanceV2(instance);
    expect(f.http.post.mock.calls[0][1]).toEqual({ deviceInstanceId: locator });
    expect(f.http.post.mock.calls[0][2]).not.toHaveProperty('headers');
  });
});
