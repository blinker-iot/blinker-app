import { describe, expect, it } from 'vitest';
import { environment as development } from './environment';
import { environment as production } from './environment.prod';
import { environment as local } from './environment.local';
import { environment as device } from './environment.local-device';
import { environment as priorityTest } from './environment.ble-priority-test';

describe('build-time device communication profiles', () => {
  it('keeps browser local and Android hardware authorities explicit and separate', () => {
    expect(local.gatewayBaseUrl).toBe('http://127.0.0.1:7000');
    expect(device).toEqual({ ...local, gatewayBaseUrl: 'https://127.0.0.1:17000' });
    expect(device.production).toBe(false);
  });

  it('never promotes local endpoints or preview LAN into production', () => {
    expect(production.production).toBe(true);
    for (const profile of [development, production]) {
      const authority = new URL(profile.gatewayBaseUrl);
      expect(authority.protocol).toBe('https:');
      expect(['localhost', '127.0.0.1', '[::1]']).not.toContain(authority.hostname);
    }
    for (const profile of [development, production, local, device]) {
      expect(profile.deviceV2LanEnabled).toBe(false);
      expect(profile.deviceV2BleBootstrapPriorityEnabled).toBe(false);
    }
  });

  it('confines the opt-in priority hint to the explicit USB experiment', () => {
    expect(priorityTest).toEqual({ ...device, deviceV2BleBootstrapPriorityEnabled: true });
    expect(priorityTest.production).toBe(false);
    expect(priorityTest.deviceV2LanEnabled).toBe(false);
  });
});
