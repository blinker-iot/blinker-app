import type { DeviceV2ReceivedDevice } from '../../../core/model/response.model';
import { profileReceivedDeviceCount } from './profile-sharing';

const first = 'device_11111111-1111-4111-8111-111111111111';
const second = 'device_22222222-2222-4222-8222-222222222222';
const device = (logicalDeviceId: string, state = 'active') => ({ logicalDeviceId, share: { state } } as DeviceV2ReceivedDevice);

describe('profile received sharing projection', () => {
  it('keeps unavailable and confirmed empty projections distinct', () => {
    expect(profileReceivedDeviceCount([], false)).toBeNull();
    expect(profileReceivedDeviceCount(undefined, true)).toBeNull();
    expect(profileReceivedDeviceCount([], true)).toBe(0);
  });

  it('counts only distinct active logical identities and does not use a grant as the device identity', () => {
    expect(profileReceivedDeviceCount([device(first), device(first), device(second), device(second, 'revoked')], true)).toBe(2);
    expect(profileReceivedDeviceCount([device(first, 'revoked')], true)).toBe(0);
  });

  it('returns unknown for a malformed active identity rather than silently reducing a total to zero', () => {
    expect(profileReceivedDeviceCount([device('')], true)).toBeNull();
    expect(profileReceivedDeviceCount([device(first), device('not-a-logical-device')], true)).toBeNull();
    expect(profileReceivedDeviceCount([device(first, 'pending')], true)).toBeNull();
  });
});
