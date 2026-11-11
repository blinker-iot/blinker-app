import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { DeviceKeyContext } from '../../model/response.model';
import { deviceV2AccountStoragePrefix, DeviceV2AccountScope, DeviceV2AccountScopeProvider, validateDeviceV2AccountScope } from '../account-scope';
import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';
import { logicalDevicePeerId } from '../../protocol/device-v2';
import { allocationContext, sameAllocationContext, WiFiProvAllocationRecord, WiFiProvAllocationStore } from './wifiprov-allocation';
import { createWiFiProvUnknownCheckpoint, validateWiFiProvUnknownCheckpoint, wiFiProvUnknownAvailability,
  WiFiProvUnknownRecovery } from './wifiprov-unknown-checkpoint';
import { WiFiProvSealedInstallationStore } from './wifiprov-sealed-installation-store';
import type { WiFiProvInstallRegion } from './wifiprov-sealed-installation-contract';

const PREFIX = 'blinker_v2_wifiprov_allocation_';
const MAX_STORED_BYTES = 4096, MAX_KEYS = 2048, MAX_SCOPED_RECORDS = 32, MAX_UNKNOWN = 8;

export class CapacitorWiFiProvAllocationStore implements WiFiProvAllocationStore {
  // Reject concurrent journal mutations; no queue held across network/native I/O.
  private static writing = false;
  private readonly sealed: WiFiProvSealedInstallationStore;
  constructor(private readonly scope: DeviceV2AccountScopeProvider, private readonly clock = Date.now) {
    this.sealed = new WiFiProvSealedInstallationStore(scope, async instance => (await this.load(instance)) !== undefined);
  }

  get sealedInstallationsAvailable(): boolean { return this.sealed.available; }

  loadSealedInstallation(instance: Uint8Array, region: WiFiProvInstallRegion) { return this.sealed.load(instance, region); }

  listSealedInstallations(region: WiFiProvInstallRegion) { return this.sealed.list(region); }

  prepareSealedInstallation(instance: Uint8Array, name: string, region: WiFiProvInstallRegion) {
    return this.sealed.prepare(instance, name, region);
  }

  markSealedCreateDispatched(instance: Uint8Array, requestId: string, recipient: string, region: WiFiProvInstallRegion) {
    return this.sealed.dispatch(instance, requestId, recipient, region);
  }

  bindSealedInstallation(instance: Uint8Array, requestId: string, context: DeviceKeyContext, region: WiFiProvInstallRegion) {
    return this.sealed.bind(instance, requestId, context, region);
  }

  markSealedBootstrapDispatched(instance: Uint8Array, requestId: string, region: WiFiProvInstallRegion) {
    return this.sealed.mark(instance, requestId, region, 'bootstrap-dispatched');
  }

  markSealedBootstrapAccepted(instance: Uint8Array, requestId: string, region: WiFiProvInstallRegion) {
    return this.sealed.mark(instance, requestId, region, 'bootstrap-accepted');
  }

  markSealedWifiDispatched(instance: Uint8Array, requestId: string, region: WiFiProvInstallRegion) {
    return this.sealed.mark(instance, requestId, region, 'wifi-dispatched');
  }

  markSealedWifiConfirmed(instance: Uint8Array, requestId: string, region: WiFiProvInstallRegion) {
    return this.sealed.mark(instance, requestId, region, 'wifi-confirmed');
  }

  load(instance: Uint8Array): Promise<WiFiProvAllocationRecord | undefined> {
    return this.update(instance, async record => record);
  }

  /** Called only after a real submitted WiFi operation has become UNKNOWN. */
  async saveUnknown(instance: Uint8Array, context: DeviceKeyContext, attemptedAt: number): Promise<WiFiProvUnknownRecovery> {
    const expected = allocationContext(context), checkpoint = createWiFiProvUnknownCheckpoint(attemptedAt);
    const snapshot = instance instanceof Uint8Array ? instance.slice() : instance;
    return this.update(snapshot, async (record, save, scope) => {
      if (!record?.context || !sameAllocationContext(record.context, expected)) throw Error('WIFIPROV_ALLOCATION_CONFLICT');
      const existing = await this.scanUnknown(scope);
      if (record.wifiUnknown) {
        if (record.wifiUnknown.attemptedAt !== checkpoint.attemptedAt) throw Error('WIFIPROV_ALLOCATION_CONFLICT');
      } else {
        if (existing.length >= MAX_UNKNOWN) throw Error('WIFIPROV_UNKNOWN_LIMIT');
        record = { ...record, wifiUnknown: checkpoint };
        await save(record);
      }
      return this.recovery(snapshot, record);
    }, true);
  }

  async listUnknown(): Promise<WiFiProvUnknownRecovery[]> {
    if (!Capacitor.isNativePlatform()) return [];
    return this.locked(scope => this.scanUnknown(scope));
  }

  /** Explicit local hint removal only; original allocation and authorization remain. */
  async clearUnknown(entry: WiFiProvUnknownRecovery): Promise<void> {
    const expected = allocationContext(entry.context), checkpoint = validateWiFiProvUnknownCheckpoint(entry.checkpoint);
    const requestId = entry.requestId;
    const instance = entry.deviceInstanceId instanceof Uint8Array ? entry.deviceInstanceId.slice() : entry.deviceInstanceId;
    await this.update(instance, async (record, save) => {
      if (!record) return;
      if (record.requestId !== requestId || !record.context || !sameAllocationContext(record.context, expected)) {
        throw Error('WIFIPROV_ALLOCATION_CONFLICT');
      }
      if (!record.wifiUnknown) return;
      if (record.wifiUnknown.attemptedAt !== checkpoint.attemptedAt) throw Error('WIFIPROV_ALLOCATION_CONFLICT');
      const { wifiUnknown: _, ...original } = record;
      await save(original);
    }, true);
  }

  private async scanUnknown(scope: DeviceV2AccountScope): Promise<WiFiProvUnknownRecovery[]> {
    this.assertScope(scope);
    const keys = await SecureStorage.keys();
    this.assertScope(scope);
    if (!Array.isArray(keys) || keys.length > MAX_KEYS || keys.some(key => typeof key !== 'string')) throw Error('WIFIPROV_UNKNOWN_LIMIT');
    const prefix = deviceV2AccountStoragePrefix(PREFIX, scope), matching = [...new Set(keys)].filter(key => key.startsWith(prefix));
    if (matching.length > MAX_SCOPED_RECORDS) throw Error('WIFIPROV_UNKNOWN_LIMIT');
    const output: WiFiProvUnknownRecovery[] = [];
    for (const key of matching) {
      const encoded = key.slice(prefix.length), instance = base64UrlDecode(encoded, 16);
      if (!instance.some(Boolean) || base64UrlEncode(instance) !== encoded) throw Error('WIFIPROV_ALLOCATION_CORRUPT');
      const record = await this.read(key, scope, encoded, true);
      if (!record?.wifiUnknown) continue; // Old allocation is not evidence of a WiFi submission.
      if (output.length >= MAX_UNKNOWN) throw Error('WIFIPROV_UNKNOWN_LIMIT');
      output.push(this.recovery(instance, record));
    }
    return output;
  }

  private recovery(instance: Uint8Array, record: WiFiProvAllocationRecord): WiFiProvUnknownRecovery {
    const checkpoint = validateWiFiProvUnknownCheckpoint(record.wifiUnknown);
    return { requestId: record.requestId, name: record.name, context: allocationContext(record.context),
      deviceInstanceId: instance.slice(), checkpoint, availability: wiFiProvUnknownAvailability(checkpoint, this.clock()) };
  }

  // Native journals only. No secret-store traversal or deletion by the caller.
  async findDevice(logicalDeviceId: string): Promise<Uint8Array | undefined> {
    logicalDevicePeerId(logicalDeviceId);
    if (!Capacitor.isNativePlatform()) return undefined;
    return this.locked(async scope => {
      const prefix = deviceV2AccountStoragePrefix(PREFIX, scope);
      let match: Uint8Array | undefined;
      for (const key of new Set(await SecureStorage.keys())) {
        if (!key.startsWith(prefix)) continue;
        const encodedInstance = key.slice(prefix.length);
        const instance = base64UrlDecode(encodedInstance, 16);
        if (!instance.some(Boolean) || base64UrlEncode(instance) !== encodedInstance) throw Error('WIFIPROV_ALLOCATION_CORRUPT');
        const record = await this.read(key, scope, encodedInstance);
        if (record?.context?.logicalDeviceId !== logicalDeviceId) continue;
        if (match) throw Error('WIFIPROV_ALLOCATION_CONFLICT');
        match = instance;
      }
      return match;
    });
  }

  async prepare(instance: Uint8Array, name: string): Promise<WiFiProvAllocationRecord> {
    return this.prepareRecord(instance, name, false);
  }

  async prepareNew(instance: Uint8Array, name: string): Promise<WiFiProvAllocationRecord> {
    return this.prepareRecord(instance, name, true);
  }

  private async prepareRecord(instance: Uint8Array, name: string, requireNew: boolean): Promise<WiFiProvAllocationRecord> {
    return this.update(instance, async (record, save) => {
      if (record && requireNew) throw Object.assign(Error('WIFIPROV_IDENTITY_UNCONFIRMED'), { code: 'WIFIPROV_IDENTITY_UNCONFIRMED' });
      if (record) return record; // Freeze the original request body across re-entry.
      const value = { requestId: `wifiprov-${Array.from(crypto.getRandomValues(new Uint8Array(16)),
        byte => byte.toString(16).padStart(2, '0')).join('')}`, name: name.trim() };
      validate(value);
      await save(value);
      return value;
    });
  }

  async bind(instance: Uint8Array, requestId: string, context: DeviceKeyContext): Promise<void> {
    const expected = allocationContext(context);
    await this.update(instance, async (record, save) => {
      if (!record || record.requestId !== requestId || (record.context && !sameAllocationContext(record.context, expected))) {
        throw Error('WIFIPROV_ALLOCATION_CONFLICT');
      }
      await save({ ...record, context: expected });
    });
  }

  async complete(instance: Uint8Array, logicalDeviceId: string): Promise<void> {
    await this.update(instance, async (record, save) => {
      if (!record) return; // Existing-device reconfiguration has no allocation journal.
      if (record.context?.logicalDeviceId !== logicalDeviceId) throw Error('WIFIPROV_ALLOCATION_CONFLICT');
      await save(undefined);
    });
  }

  private async update<T>(instance: Uint8Array, work: (
    record: WiFiProvAllocationRecord | undefined,
    save: (record: WiFiProvAllocationRecord | undefined) => Promise<void>,
    scope: DeviceV2AccountScope,
  ) => Promise<T>, strict = false): Promise<T> {
    if (!Capacitor.isNativePlatform()) throw Error('WIFIPROV_ALLOCATION_SECURE_STORAGE_REQUIRED');
    if (!(instance instanceof Uint8Array) || instance.length !== 16 || !instance.some(Boolean)) {
      throw Error('WIFIPROV_ALLOCATION_INSTANCE_INVALID');
    }
    return this.locked(async scope => {
      const deviceInstanceId = base64UrlEncode(instance);
      const key = deviceV2AccountStoragePrefix(PREFIX, scope) + deviceInstanceId;
      const record = await this.read(key, scope, deviceInstanceId, strict);
      return work(record, async value => {
        this.assertScope(scope);
        if (value === undefined) await SecureStorage.removeItem(key);
        else {
          validate(value);
          await SecureStorage.setItem(key, JSON.stringify({ version: 1, ...scope, deviceInstanceId, record: value }));
        }
      }, scope);
    });
  }

  private async read(key: string, scope: DeviceV2AccountScope, deviceInstanceId: string, strict = false): Promise<WiFiProvAllocationRecord | undefined> {
    this.assertScope(scope);
    const encoded = await SecureStorage.getItem(key);
    this.assertScope(scope);
    if (encoded === null) return undefined;
    if (strict && (typeof encoded !== 'string' || new TextEncoder().encode(encoded).length > MAX_STORED_BYTES)) {
      throw Error('WIFIPROV_ALLOCATION_CORRUPT');
    }
    const stored = JSON.parse(encoded);
    if (stored?.version !== 1 || stored.authority !== scope.authority || stored.accountId !== scope.accountId
      || stored.deviceInstanceId !== deviceInstanceId) throw Error('WIFIPROV_ALLOCATION_CORRUPT');
    validate(stored.record);
    if (strict) {
      if (!knownKeys(stored, ['version', 'authority', 'accountId', 'deviceInstanceId', 'record'], [])) throw Error('WIFIPROV_ALLOCATION_CORRUPT');
      validateUnknownRecord(stored.record);
    }
    return stored.record;
  }

  private assertScope(expected: DeviceV2AccountScope): void {
    const current = validateDeviceV2AccountScope(this.scope());
    if (current.accountId !== expected.accountId || current.authority !== expected.authority) throw Error('WIFIPROV_ALLOCATION_SCOPE_CHANGED');
  }

  private async locked<T>(work: (scope: DeviceV2AccountScope) => Promise<T>): Promise<T> {
    const scope = validateDeviceV2AccountScope(this.scope());
    if (CapacitorWiFiProvAllocationStore.writing) throw Error('WIFIPROV_ALLOCATION_BUSY');
    CapacitorWiFiProvAllocationStore.writing = true;
    try {
      const result = await work(scope);
      this.assertScope(scope);
      return result;
    } finally { CapacitorWiFiProvAllocationStore.writing = false; }
  }
}

function validate(record: WiFiProvAllocationRecord): void {
  if (!record || !/^wifiprov-[a-f0-9]{32}$/.test(record.requestId) || typeof record.name !== 'string'
    || !record.name || record.name !== record.name.trim() || record.name.length > 128
    || new TextEncoder().encode(record.name).length > 256 || record.name.includes('\0')) {
    throw Error('WIFIPROV_ALLOCATION_CORRUPT');
  }
  if (record.context !== undefined) allocationContext(record.context);
  if (record.wifiUnknown !== undefined) validateUnknownRecord(record);
}

function knownKeys(value: unknown, required: string[], optional: string[]): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function validateUnknownRecord(record: WiFiProvAllocationRecord): void {
  if (!knownKeys(record, ['requestId', 'name'], ['context', 'wifiUnknown'])
    || (record.context !== undefined && !knownKeys(record.context, ['logicalDeviceId', 'credentialVersion', 'locator'], []))) {
    throw Error('WIFIPROV_ALLOCATION_CORRUPT');
  }
  if (record.wifiUnknown !== undefined) {
    if (!record.context) throw Error('WIFIPROV_ALLOCATION_CORRUPT');
    validateWiFiProvUnknownCheckpoint(record.wifiUnknown);
  }
}
