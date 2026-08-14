import { describe, expect, it } from 'vitest';

import {
  createDeviceDeepLink,
  parseDeviceDeepLink,
  parseShortcutDeviceId,
} from './device-deep-link';

describe('device deep links', () => {
  it('round-trips a device id', () => {
    const link = createDeviceDeepLink('device 42');

    expect(link).toBe('diandeng://device/device%2042');
    expect(parseDeviceDeepLink(link)).toBe('device 42');
  });

  it('keeps old shortcut routes working', () => {
    expect(parseShortcutDeviceId('/device/device-42', '')).toBe('device-42');
  });

  it('uses a shortcut id when an older shortcut has no data', () => {
    expect(parseShortcutDeviceId('', 'device:device-42')).toBe('device-42');
    expect(parseShortcutDeviceId('', 'legacy-device-42')).toBe(
      'legacy-device-42',
    );
  });

  it('rejects links outside the device deep-link namespace', () => {
    expect(parseDeviceDeepLink('https://example.com/device/device-42')).toBeNull();
    expect(parseDeviceDeepLink('diandeng://device/a/b')).toBeNull();
  });
});
