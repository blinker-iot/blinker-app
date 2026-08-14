import { describe, expect, it } from 'vitest';
import { API, isGatewayApiUrl } from './api.config';

describe('API config', () => {
  it('groups gateway authentication and feedback endpoints', () => {
    expect(API.GATEWAY.BASE).toBe('https://iot.yiyu.pro/api/v1');
    expect(API.GATEWAY.AUTH.ALTCHA_CHALLENGE).toBe(
      'https://iot.yiyu.pro/api/v1/auth/altcha/challenge'
    );
    expect(API.GATEWAY.AUTH.EMAIL_CODE).toBe(
      'https://iot.yiyu.pro/api/v1/auth/email/code'
    );
    expect(API.GATEWAY.AUTH.EMAIL_LOGIN).toBe(
      'https://iot.yiyu.pro/api/v1/auth/email/login'
    );
    expect(API.GATEWAY.AUTH.ME).toBe('https://iot.yiyu.pro/api/v1/auth/me');
    expect(API.GATEWAY.AUTH.LOGOUT).toBe(
      'https://iot.yiyu.pro/api/v1/auth/logout'
    );
    expect(API.GATEWAY.AUTH.REFRESH).toBe(
      'https://iot.yiyu.pro/api/v1/auth/refresh'
    );
    expect(API.GATEWAY.FEEDBACK.SUBMIT).toBe(
      'https://iot.yiyu.pro/api/v1/feedback/submit'
    );
  });

  it('builds encoded managed-device endpoints', () => {
    const deviceId = 'device_full/id';

    expect(API.GATEWAY.DEVICE.ALL).toBe(
      'https://iot.yiyu.pro/api/v1/devices'
    );
    expect(API.GATEWAY.DEVICE.DETAIL(deviceId)).toBe(
      'https://iot.yiyu.pro/api/v1/devices/device_full%2Fid'
    );
    expect(API.GATEWAY.DEVICE.STATUS(deviceId)).toBe(
      'https://iot.yiyu.pro/api/v1/devices/device_full%2Fid/status'
    );
    expect(API.GATEWAY.DEVICE.DATA(deviceId)).toBe(
      'https://iot.yiyu.pro/api/v1/devices/device_full%2Fid/data'
    );
    expect(API.GATEWAY.DEVICE.CONFIG(deviceId)).toBe(
      'https://iot.yiyu.pro/api/v1/devices/device_full%2Fid/config'
    );
    expect(() => API.GATEWAY.DEVICE.DETAIL('  ')).toThrowError(
      'Device ID is required.'
    );
  });

  it('accepts only the configured gateway API boundary', () => {
    expect(isGatewayApiUrl('https://iot.yiyu.pro/api/v1/devices')).toBe(true);
    expect(isGatewayApiUrl('https://iot.yiyu.pro/api/v10/devices')).toBe(false);
    expect(isGatewayApiUrl('https://example.invalid/api/v1/devices')).toBe(false);
    expect(isGatewayApiUrl('not a valid URL')).toBe(false);
  });
});
