import { of } from 'rxjs';

import { API } from '../../../configs/api.config';
import { BleDirectCrypto } from './crypto';
import {
  HttpBlePresenceKeyApi,
  clearBlePresenceKeyBundleSecrets,
} from './presence-key-api';
import { base64UrlEncode } from './wire';

describe('HttpBlePresenceKeyApi', () => {
  const logicalDeviceId = 'ble_AAECAwQFBgcICQoLDA0ODw';

  async function version(version: number, fill: number) {
    const key = new Uint8Array(16).fill(fill);
    const digest = await new BleDirectCrypto().sha256(key);
    return {
      version,
      accessEpoch: 7,
      key: base64UrlEncode(key),
      keyDigest: base64UrlEncode(digest),
      deviceConfirmed: version === 2,
    };
  }

  it('validates no-store and the key digest before returning current and previous', async () => {
    const current = await version(3, 3);
    const previous = await version(2, 2);
    const http = {
      get: vi.fn(() => of({
        status: 200,
        headers: { get: () => 'private, no-store' },
        body: {
          status: 200,
          data: { logicalDeviceId, current, previous, replayed: false },
        },
      })),
    };
    const api = new HttpBlePresenceKeyApi(
      http as unknown as ConstructorParameters<typeof HttpBlePresenceKeyApi>[0],
    );

    const result = await api.reveal(logicalDeviceId);

    expect(http.get).toHaveBeenCalledWith(API.DEVICE_V2.PRESENCE_KEY(logicalDeviceId), {
      observe: 'response',
    });
    expect(result.current.version).toBe(3);
    expect(result.previous?.version).toBe(2);
    clearBlePresenceKeyBundleSecrets(result);
  });

  it('uses exact rotate body/idempotency and rejects cacheable secrets', async () => {
    const current = await version(4, 4);
    const post = vi.fn(() => of({
      status: 200,
      headers: { get: () => 'no-cache' },
      body: {
        status: 200,
        data: { logicalDeviceId, current, previous: null, replayed: false },
      },
    }));
    const api = new HttpBlePresenceKeyApi(
      { post } as unknown as ConstructorParameters<typeof HttpBlePresenceKeyApi>[0],
    );

    await expect(api.rotate(logicalDeviceId, 3, 'rotation-1'))
      .rejects.toThrow('BLE_PRESENCE_CACHE_POLICY_INVALID');
    expect(post).toHaveBeenCalledWith(
      API.DEVICE_V2.ROTATE_PRESENCE_KEY(logicalDeviceId),
      { expectedVersion: 3 },
      { headers: { 'Idempotency-Key': 'rotation-1' }, observe: 'response' },
    );
  });

  it('rejects a raw key that does not match the server digest', async () => {
    const current = await version(1, 1);
    current.key = base64UrlEncode(new Uint8Array(16).fill(9));
    const api = new HttpBlePresenceKeyApi({
      get: () => of({
        status: 200,
        headers: { get: () => 'no-store' },
        body: {
          status: 200,
          data: { logicalDeviceId, current, previous: null, replayed: false },
        },
      }),
    } as unknown as ConstructorParameters<typeof HttpBlePresenceKeyApi>[0]);

    await expect(api.reveal(logicalDeviceId))
      .rejects.toThrow('BLE_PRESENCE_RESPONSE_INVALID');
  });

  it('synchronizes a queued owner rotation with an empty exact body', async () => {
    const current = await version(2, 2);
    const post = vi.fn(() => of({
      status: 200,
      headers: { get: () => 'no-store' },
      body: {
        status: 200,
        data: { logicalDeviceId, current, previous: null, replayed: false },
      },
    }));
    const api = new HttpBlePresenceKeyApi(
      { post } as unknown as ConstructorParameters<typeof HttpBlePresenceKeyApi>[0],
    );

    const result = await api.sync(logicalDeviceId);

    expect(post).toHaveBeenCalledWith(
      API.DEVICE_V2.SYNC_PRESENCE_KEY(logicalDeviceId),
      {},
      { observe: 'response' },
    );
    expect(result.current.version).toBe(2);
    clearBlePresenceKeyBundleSecrets(result);
  });

  it('posts the exact receipt and accepts only a confirmed current key', async () => {
    const current = { ...(await version(3, 3)), deviceConfirmed: true };
    const post = vi.fn(() => of({
      status: 200,
      headers: { get: () => 'no-store' },
      body: {
        status: 200,
        data: { logicalDeviceId, current, previous: null, replayed: false },
      },
    }));
    const api = new HttpBlePresenceKeyApi(
      { post } as unknown as ConstructorParameters<typeof HttpBlePresenceKeyApi>[0],
    );
    const receipt = Uint8Array.of(0xa1, 0x00, 0x01);

    await expect(api.confirm(logicalDeviceId, receipt)).resolves.toMatchObject({
      current: { version: 3, deviceConfirmed: true },
      previous: null,
    });
    expect(post).toHaveBeenCalledWith(
      API.DEVICE_V2.CONFIRM_PRESENCE_KEY(logicalDeviceId),
      { receipt: base64UrlEncode(receipt) },
      { observe: 'response' },
    );
  });
});
