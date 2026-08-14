import { describe, expect, it } from 'vitest';
import { gatewayUrl, isGatewayRequest } from './gateway.config';

describe('Gateway URL matching', () => {
  it('builds the local development API URL', () => {
    expect(gatewayUrl('/api/v1/devices')).toBe('https://iot.yiyu.pro/api/v1/devices');
  });

  it('matches only the configured Gateway API boundary', () => {
    expect(isGatewayRequest('https://iot.yiyu.pro/api/v1/devices')).toBe(true);
    expect(isGatewayRequest('https://iot.yiyu.pro/api/v10/devices')).toBe(false);
    expect(isGatewayRequest('https://example.invalid/api/v1/devices')).toBe(false);
  });
});
