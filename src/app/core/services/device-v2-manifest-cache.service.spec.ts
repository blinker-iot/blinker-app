import { beforeEach, describe, expect, it } from 'vitest';
import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2ValueType,
} from '../protocol/device-v2';
import { DeviceV2ManifestCache } from './device-v2-manifest-cache.service';
import { API } from '../../configs/api.config';

describe('DeviceV2ManifestCache', () => {
  beforeEach(() => localStorage.clear());

  it('persists only account-scoped, structurally valid capabilities', () => {
    const manifest = {
      revision: 1,
      fingerprint: 'ab'.repeat(32),
      fields: [{
        id: 1,
        key: 'power',
        kind: DeviceV2EndpointKind.Property,
        type: DeviceV2ValueType.Boolean,
        access: DeviceV2EndpointAccess.Read | DeviceV2EndpointAccess.Write,
      }],
    };
    const owner = new DeviceV2ManifestCache({
      auth: { uuid: 'owner' }, user: {},
    } as any);
    owner.save('device-one', manifest);
    expect(owner.load('device-one')).toEqual(manifest);
    const authority = API.BASE_URL;
    try {
      Object.assign(API, { BASE_URL: 'https://another.example' });
      expect(owner.load('device-one')).toBeUndefined();
    } finally { Object.assign(API, { BASE_URL: authority }); }

    const another = new DeviceV2ManifestCache({
      auth: { uuid: 'another' }, user: {},
    } as any);
    expect(another.load('device-one')).toBeUndefined();

    owner.save('device-bad', { ...manifest, fingerprint: 'bad' });
    expect(owner.load('device-bad')).toBeUndefined();

    localStorage.setItem('blinker-v2-manifest:owner:old', JSON.stringify({ version: 1, logicalDeviceId: 'old', manifest }));
    expect(owner.load('old')).toBeUndefined();
    const loggedOut = new DeviceV2ManifestCache({ auth: null, user: { id: 'owner' } } as any);
    expect(loggedOut.load('device-one')).toBeUndefined();
  });
});
