import { explicitWiFiRejectionReason, wiFiProvWiFiFailureReasonFromCode } from './wifiprov-wifi-failure';

describe('WiFiProv exact official WiFi rejection classification', () => {
  it.each([
    ['WIFIPROV_WIFI_AUTH_FAILED', 'AUTH_FAILED'],
    ['WIFIPROV_WIFI_NETWORK_NOT_FOUND', 'NETWORK_NOT_FOUND'],
  ] as const)('preserves %s independently of generic IPC wording', (code, reason) => {
    expect(wiFiProvWiFiFailureReasonFromCode(code)).toBe(reason);
    expect(explicitWiFiRejectionReason({ code, message: 'The isolated local operation did not complete.' })).toBe(reason);
  });

  it('uses a precise code before contradictory legacy wording', () => {
    expect(explicitWiFiRejectionReason({ code: 'WIFIPROV_WIFI_AUTH_FAILED',
      message: 'Provisioning failed on the device: NETWORK_NOT_FOUND' })).toBe('AUTH_FAILED');
  });

  it('keeps exact original BLE wording compatible only without a code or with its old rejection code', () => {
    for (const reason of ['AUTH_FAILED', 'NETWORK_NOT_FOUND']) for (const code of [undefined, 'WIFIPROV_DEVICE_REJECTED']) {
      expect(explicitWiFiRejectionReason({ code, message: 'Provisioning failed on the device: ' + reason })).toBe(reason);
    }
  });

  it('never converts UNKNOWN, timeout, cancellation or other explicit codes through message text', () => {
    for (const code of ['PROVISIONING_RESULT_UNKNOWN', 'WIFIPROV_RPC_TIMEOUT', 'WIFIPROV_OPERATION_CANCELLED',
      'WIFIPROV_SCOPE_QUARANTINED', 'WIFIPROV_CLOSE_UNCONFIRMED', 'WIFIPROV_PROVISION_FAILED', '', null, 1]) {
      expect(wiFiProvWiFiFailureReasonFromCode(code)).toBeUndefined();
      expect(explicitWiFiRejectionReason({ code, message: 'Provisioning failed on the device: AUTH_FAILED' })).toBeUndefined();
    }
  });

  it('rejects fuzzy wording, generic failure, disconnect and malformed input', () => {
    for (const message of ['AUTH_FAILED', 'Provisioning failed on the device: DEVICE_DISCONNECTED',
      'Provisioning failed on the device: AUTH_FAILED ', 'Provisioning failed on the device: UNKNOWN']) {
      expect(explicitWiFiRejectionReason({ message })).toBeUndefined();
    }
    for (const value of [null, undefined, 1, 'AUTH_FAILED', {}]) expect(explicitWiFiRejectionReason(value)).toBeUndefined();
  });
});
