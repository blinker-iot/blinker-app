import { describe, expect, it } from 'vitest';
import { mapGatewayUser } from './gateway-user.adapter';

describe('mapGatewayUser', () => {
  it('maps the documented profile, plan, permissions, and entitlements', () => {
    const subscriptionPlan = {
      name: 'pro',
      display_name: 'Pro',
      service_tier: 'dedicated',
      subscription_id: 'subscription-1',
      status: 'active',
      end_date: '2026-12-01T00:00:00Z',
    };

    const result = mapGatewayUser({
      id: 'user-1',
      nickname: 'Person',
      email: 'person@example.com',
      phone: '13800008888',
      avatar: 'https://example.com/avatar.webp',
      subscription_plan: subscriptionPlan,
      permissions: ['devices:read'],
      rbac_permissions: ['devices:*'],
      entitlement_revision: 7,
      entitlements: { 'iot.devices': 10 },
      unknown: true,
    });

    expect(result).toMatchObject({
      id: 'user-1',
      nickname: 'Person',
      email: 'person@example.com',
      username: 'Person',
      phone: '13800008888',
      avatar: 'https://example.com/avatar.webp',
      subscriptionPlan,
      permissions: ['devices:read'],
      rbacPermissions: ['devices:*'],
      entitlementRevision: 7,
      entitlements: { 'iot.devices': 10 },
    });
  });

  it('falls back to email and normalizes nullable display fields', () => {
    const result = mapGatewayUser({
      id: 'user-2',
      nickname: '   ',
      email: 'fallback@example.com',
      phone: null,
      avatar: null,
      subscription_plan: null,
      permissions: [],
      rbac_permissions: [],
      entitlements: { 'iot.enabled': true },
    });

    expect(result.username).toBe('fallback@example.com');
    expect(result.phone).toBe('');
    expect(result.avatar).toBe('');
    expect(result.subscriptionPlan).toBeNull();
    expect(result.permissions).toEqual([]);
    expect(result.rbacPermissions).toEqual([]);
    expect(result.entitlementRevision).toBeUndefined();
    expect(result.entitlements).toEqual({ 'iot.enabled': true });
  });
});
