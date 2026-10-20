import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { DeviceKeyContext } from '../../model/response.model';
import { deviceV2AccountStoragePrefix, DeviceV2AccountScope, DeviceV2AccountScopeProvider, validateDeviceV2AccountScope } from '../account-scope';
import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';
import { logicalDevicePeerId } from '../../protocol/device-v2';
import { allocationContext, sameAllocationContext, WiFiProvAllocationRecord, WiFiProvAllocationStore } from './wifiprov-allocation';

const PREFIX = 'blinker_v2_wifiprov_allocation_';

export class CapacitorWiFiProvAllocationStore implements WiFiProvAllocationStore {
  // Reject concurrent journal mutations; no queue held across network/native I/O.
  private static writing = false;
  constructor(private readonly scope: DeviceV2AccountScopeProvider) {}

  load(instance: Uint8Array): Promise<WiFiProvAllocationRecord | undefined> {
    return this.update(instance, async record => record);
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
    return this.update(instance, async (record, save) => {
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
  ) => Promise<T>): Promise<T> {
    if (!Capacitor.isNativePlatform()) throw Error('WIFIPROV_ALLOCATION_SECURE_STORAGE_REQUIRED');
    if (!(instance instanceof Uint8Array) || instance.length !== 16 || !instance.some(Boolean)) {
      throw Error('WIFIPROV_ALLOCATION_INSTANCE_INVALID');
    }
    return this.locked(async scope => {
      const deviceInstanceId = base64UrlEncode(instance);
      const key = deviceV2AccountStoragePrefix(PREFIX, scope) + deviceInstanceId;
      const record = await this.read(key, scope, deviceInstanceId);
      return work(record, async value => {
        this.assertScope(scope);
        if (value === undefined) await SecureStorage.removeItem(key);
        else {
          validate(value);
          await SecureStorage.setItem(key, JSON.stringify({ version: 1, ...scope, deviceInstanceId, record: value }));
        }
      });
    });
  }

  private async read(key: string, scope: DeviceV2AccountScope, deviceInstanceId: string): Promise<WiFiProvAllocationRecord | undefined> {
    this.assertScope(scope);
    const encoded = await SecureStorage.getItem(key);
    this.assertScope(scope);
    if (encoded === null) return undefined;
    const stored = JSON.parse(encoded);
    if (stored?.version !== 1 || stored.authority !== scope.authority || stored.accountId !== scope.accountId
      || stored.deviceInstanceId !== deviceInstanceId) throw Error('WIFIPROV_ALLOCATION_CORRUPT');
    validate(stored.record);
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
}
