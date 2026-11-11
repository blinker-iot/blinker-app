import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { deviceV2AccountStoragePrefix, type DeviceV2AccountContext } from '../account-scope';
import { logicalDevicePeerId } from '../../protocol/device-v2';
import { validateWiFiProvRekeyCheckpoint, type WiFiProvRekeyCheckpoint } from './wifiprov-rekey-checkpoint';

const PREFIX = 'blinker_v2_wifiprov_rekey_development_';
const MAX_BYTES = 2048;
const conflict = () => Error('WIFIPROV_REKEY_CHECKPOINT_CONFLICT');

/** One native slot per account and logical device. A slot is not deleted or
 * replaced by a new operation on reload, logout, or an uncertain result. */
export class CapacitorWiFiProvRekeyJournal {
  private static busy = false;

  constructor(private readonly account: () => DeviceV2AccountContext) {}

  load(logicalDeviceId: string): Promise<WiFiProvRekeyCheckpoint | undefined> {
    return this.locked(logicalDeviceId, (key, account) => this.read(key, logicalDeviceId, account));
  }

  replace(expected: WiFiProvRekeyCheckpoint | undefined, next: WiFiProvRekeyCheckpoint): Promise<void> {
    const value = validateWiFiProvRekeyCheckpoint(next);
    const previous = expected === undefined ? undefined : validateWiFiProvRekeyCheckpoint(expected);
    const device = value.scope.logicalDeviceId;
    if (previous ? JSON.stringify(previous.scope) !== JSON.stringify(value.scope)
      || previous.createdAt !== value.createdAt || previous.updatedAt > value.updatedAt
      : value.phase !== 'prepared') throw conflict();
    return this.locked(device, async (key, account) => {
      this.assertRecordScope(value, device, account);
      const current = await this.read(key, device, account);
      if (JSON.stringify(current) !== JSON.stringify(previous)) throw conflict();
      const raw = JSON.stringify(value);
      if (new TextEncoder().encode(raw).length > MAX_BYTES) throw conflict();
      this.assertAccount(account);
      await SecureStorage.setItem(key, raw);
      if (JSON.stringify(await this.read(key, device, account)) !== raw) throw conflict();
    });
  }

  private async read(key: string, device: string, account: DeviceV2AccountContext) {
    this.assertAccount(account);
    const raw = await SecureStorage.getItem(key);
    this.assertAccount(account);
    if (raw === null) return undefined;
    if (typeof raw !== 'string' || raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) throw conflict();
    const value = validateWiFiProvRekeyCheckpoint(JSON.parse(raw));
    this.assertRecordScope(value, device, account);
    return value;
  }

  private assertRecordScope(value: WiFiProvRekeyCheckpoint, device: string, account: DeviceV2AccountContext) {
    const scope = value.scope;
    if (scope.authority !== account.authority || scope.accountId !== account.accountId
      || scope.region !== 'Development' || scope.logicalDeviceId !== device) throw conflict();
  }

  private assertAccount(expected: DeviceV2AccountContext) {
    const current = this.account();
    if (current.authority !== expected.authority || current.accountId !== expected.accountId
      || current.sessionEpoch !== expected.sessionEpoch) throw conflict();
  }

  private async locked<T>(device: string, work: (key: string, account: DeviceV2AccountContext) => Promise<T>): Promise<T> {
    if (!Capacitor.isNativePlatform()) throw Error('WIFIPROV_REKEY_SECURE_STORAGE_REQUIRED');
    logicalDevicePeerId(device);
    const account = { ...this.account() };
    const key = deviceV2AccountStoragePrefix(PREFIX, account) + device;
    if (CapacitorWiFiProvRekeyJournal.busy) throw conflict();
    CapacitorWiFiProvRekeyJournal.busy = true;
    try {
      const result = await work(key, account);
      this.assertAccount(account);
      return result;
    } finally { CapacitorWiFiProvRekeyJournal.busy = false; }
  }
}
