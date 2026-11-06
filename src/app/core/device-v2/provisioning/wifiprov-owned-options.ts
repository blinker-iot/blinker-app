import type { ProvisionOptions } from 'capacitor-wifiprov';
import { isolatedWiFiProvOwner } from './wifiprov-softap-stages';

export function exactWiFiProvKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every(key => keys.includes(key));
}

/** Native main-process owner correlation only, never device root authorization. */
export function assertWiFiProvResponseOwner(owner: unknown, expected: string): void {
  try {
    if (isolatedWiFiProvOwner({ transport: 'softap', security: 1, localOwner: owner }).session !== expected) throw Error();
  } catch {
    throw Object.assign(Error('PROVISIONING_RESULT_UNKNOWN'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
  }
}

/** Bounded snapshot before native entry. Whitespace in a valid SSID/password is significant. */
export function copyWiFiProvWifiOptions(options: ProvisionOptions): ProvisionOptions {
  const hasPassword = Object.prototype.hasOwnProperty.call(options ?? {}, 'password');
  const invalid = () => Object.assign(Error('WIFIPROV_REQUEST_INVALID'), { code: 'WIFIPROV_REQUEST_INVALID' });
  if (!exactWiFiProvKeys(options, hasPassword ? ['ssid', 'password'] : ['ssid'])) throw invalid();
  const ssid = options.ssid, password = hasPassword ? options.password : undefined;
  if (typeof ssid !== 'string' || !ssid.trim() || ssid.includes('\0') || new TextEncoder().encode(ssid).length > 32
    || (password !== undefined && (typeof password !== 'string' || password.includes('\0')
      || new TextEncoder().encode(password).length > 64))) throw invalid();
  return { ssid, ...(password === undefined ? {} : { password }) };
}
