import { assertFirstInstallPoP } from './wifiprov-first-install';
import { readWiFiProvPoP } from './wifiprov-pop';
import { assertWifiReconfigurePoP } from './wifiprov-wifi-reconfigure';

describe('one explicit firmware PoP validation contract', () => {
  it('omits an empty optional value, without deriving a value from other fields', () => {
    expect(readWiFiProvPoP('')).toBeUndefined(); expect(readWiFiProvPoP(undefined)).toBeUndefined();
  });
  it('preserves meaningful leading and trailing whitespace exactly', () => {
    const value = ' factory PoP '; expect(readWiFiProvPoP(value)).toBe(value);
    expect(readWiFiProvPoP(value, true)).toBe(value);
  });
  it('bounds UTF8 bytes rather than UTF16 characters', () => {
    expect(readWiFiProvPoP('温'.repeat(21) + 'a')).toBe('温'.repeat(21) + 'a');
    expect(() => readWiFiProvPoP('温'.repeat(22))).toThrow('WIFIPROV_POP_INVALID');
    expect(() => readWiFiProvPoP('x'.repeat(65))).toThrow('WIFIPROV_POP_INVALID');
  });
  it('rejects NUL, whitespace-only and non-string values rather than silently dropping them', () => {
    for (const value of ['a\0b', ' \t', null, 1, {}]) expect(() => readWiFiProvPoP(value)).toThrow('WIFIPROV_POP_INVALID');
  });
  it('keeps manual empty-root first install required with its original public error', () => {
    for (const value of ['', undefined, '\0', 'x'.repeat(65)]) {
      expect(() => assertFirstInstallPoP(value)).toThrow('WIFIPROV_FIRST_INSTALL_POP_REQUIRED');
    }
    expect(assertFirstInstallPoP(' original ')).toBe(' original ');
  });
  it('keeps manual existing-root reconfiguration required with its original public error', () => {
    for (const value of ['', undefined, '\0', 'x'.repeat(65)]) {
      expect(() => assertWifiReconfigurePoP(value)).toThrow('WIFIPROV_WIFI_RECONFIGURE_POP_REQUIRED');
    }
    expect(assertWifiReconfigurePoP(' original ')).toBe(' original ');
  });
});
