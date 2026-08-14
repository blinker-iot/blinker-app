import { describe, expect, it } from 'vitest';
import { mapGatewayUser } from './gateway-user.adapter';

describe('mapGatewayUser', () => {
  it('uses email as the existing UI display name and keeps entitlement fields', () => {
    const result = mapGatewayUser({
      id: 'user-1',
      email: 'person@example.com',
      entitlement_revision: 7,
      entitlements: { 'iot.devices': 10 },
      unknown: true,
    });
    expect(result.username).toBe('person@example.com');
    expect(result.entitlementRevision).toBe(7);
    expect(result.entitlements).toEqual({ 'iot.devices': 10 });
  });
});
