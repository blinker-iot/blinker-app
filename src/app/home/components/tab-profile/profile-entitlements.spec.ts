import { profileEntitlements } from './profile-entitlements';

describe('profile entitlement display', () => {
  const user = (name: string, limit: unknown, display_name = '') => ({
    username: 'User', avatar: '', phone: '',
    subscriptionPlan: { name, display_name }, entitlements: { 'iot.devices': limit },
  }) as any;

  it('keeps Free/Pro display separate from the actual device entitlement', () => {
    expect(profileEntitlements(user('pro', 1, 'Pro'), 1))
      .toEqual({ planName: 'Pro', pro: true, limit: 1, used: 1 });
    expect(profileEntitlements(user('free', 7, 'Free'), 2))
      .toEqual({ planName: 'Free', pro: false, limit: 7, used: 2 });
  });

  it.each([0, 1, 10, -1])('accepts the defined integer device limit %s', limit => {
    expect(profileEntitlements(user('pro', limit), 0).limit).toBe(limit);
  });

  it.each([undefined, null, true, '10', 1.5, -2, Infinity, NaN])('does not invent a quota for %s', limit => {
    expect(profileEntitlements(user('pro', limit), null).limit).toBeNull();
  });

  it('keeps an unknown plan and unknown usage unknown instead of Free/zero', () => {
    expect(profileEntitlements({ username: '', avatar: '', phone: '' }, null))
      .toEqual({ planName: '', pro: false, limit: null, used: null });
  });

  it('uses a custom display name without deriving an allowance or exposing other fields', () => {
    expect(profileEntitlements(user('custom', -1, '  Team plan  '), 4))
      .toEqual({ planName: 'Team plan', pro: false, limit: -1, used: 4 });
  });
});
