import { describe, expect, it } from 'vitest';
import { logicalDevicePeerId } from './codec';
import { isLogicalDeviceReferenceId } from './logical-device-reference';

describe('logical device metadata references', () => {
  it('accepts existing UUID and BLE references plus server-generated opaque Cloud IDs unchanged', () => {
    const uuid = 'device_11111111-2222-4333-8444-555555555555';
    expect(isLogicalDeviceReferenceId(uuid)).toBe(true);
    for (const byte of [1, 2, 3, 4, 7, 63, 127, 255]) {
      const id = Buffer.alloc(16, byte).toString('base64url');
      expect(isLogicalDeviceReferenceId(`ble_${id}`)).toBe(true);
      expect(isLogicalDeviceReferenceId(`device_${id}`)).toBe(true);
      expect(() => logicalDevicePeerId(`device_${id}`)).toThrow();
    }
  });

  it('requires exact canonical unpadded nonzero sixteen-byte IDs without coercing input', () => {
    const id = Buffer.alloc(16, 1).toString('base64url');
    const valid = `device_${id}`;
    for (const value of [null, undefined, {}, [], 1, '', ' ' + valid, valid + ' ', valid + '\n', valid + '=', valid + '/extra',
      valid + '?owner=other', valid + '#fragment', 'device_' + id.slice(0, -1), 'device_' + id + 'A',
      'device_' + id.slice(0, -1) + 'R', 'device_' + id.replaceAll('A', '+'), 'cloud_' + id,
      'device_AAAAAAAAAAAAAAAAAAAAAA', 'ble_AAAAAAAAAAAAAAAAAAAAAA',
      'device_11111111-2222-4333-8444-55555555555A', 'device_11111111222243338444555555555555']) {
      expect(isLogicalDeviceReferenceId(value), String(value)).toBe(false);
    }
  });
});
