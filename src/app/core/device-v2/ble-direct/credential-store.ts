import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

import { logicalDevicePeerId } from '../../protocol/device-v2';
import { base64UrlDecode, base64UrlEncode, sameBytes } from './wire';

export type BleControllerCredentialState = 'pending' | 'active';

export interface BleControllerCredential {
  state: BleControllerCredentialState;
  logicalDeviceId: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  controllerSecret: Uint8Array;
  credentialVersion: number;
  permissions: number;
  intentId: Uint8Array;
  commitId: Uint8Array;
  receipt: Uint8Array;
}

export interface BleControllerCredentialStore {
  save(credential: BleControllerCredential): Promise<void>;
  load(logicalDeviceId: string): Promise<BleControllerCredential | undefined>;
  findPending(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined>;
  remove(logicalDeviceId: string): Promise<void>;
}

interface StoredCredential {
  version: 1;
  state: BleControllerCredentialState;
  logicalDeviceId: string;
  deviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  controllerSecret: string;
  credentialVersion: number;
  permissions: number;
  intentId: string;
  commitId: string;
  receipt: string;
}

export class CapacitorBleControllerCredentialStore implements BleControllerCredentialStore {
  async save(credential: BleControllerCredential): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    validateCredential(credential);
    const stored: StoredCredential = {
      version: 1,
      state: credential.state,
      logicalDeviceId: credential.logicalDeviceId,
      deviceInstanceId: base64UrlEncode(credential.deviceInstanceId),
      accessEpoch: credential.accessEpoch,
      controllerId: base64UrlEncode(credential.controllerId),
      controllerSecret: base64UrlEncode(credential.controllerSecret),
      credentialVersion: credential.credentialVersion,
      permissions: credential.permissions,
      intentId: base64UrlEncode(credential.intentId),
      commitId: base64UrlEncode(credential.commitId),
      receipt: base64UrlEncode(credential.receipt),
    };
    await SecureStorage.setItem(key(credential.logicalDeviceId), JSON.stringify(stored));
  }

  async load(logicalDeviceId: string): Promise<BleControllerCredential | undefined> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const encoded = await SecureStorage.getItem(key(logicalDeviceId));
    if (encoded === null) return undefined;
    let stored: StoredCredential;
    try {
      stored = JSON.parse(encoded) as StoredCredential;
    } catch {
      throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
    }
    if (stored.version !== 1 || stored.logicalDeviceId !== logicalDeviceId) {
      throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
    }
    const credential: BleControllerCredential = {
      state: stored.state,
      logicalDeviceId: stored.logicalDeviceId,
      deviceInstanceId: base64UrlDecode(stored.deviceInstanceId, 16),
      accessEpoch: stored.accessEpoch,
      controllerId: base64UrlDecode(stored.controllerId, 16),
      controllerSecret: base64UrlDecode(stored.controllerSecret, 32),
      credentialVersion: stored.credentialVersion,
      permissions: stored.permissions,
      intentId: base64UrlDecode(stored.intentId, 16),
      commitId: base64UrlDecode(stored.commitId, 16),
      receipt: base64UrlDecode(stored.receipt),
    };
    validateCredential(credential);
    return credential;
  }

  async findPending(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    if (!exactNonZero(deviceInstanceId, 16)) throw new Error('BLE_DIRECT_DEVICE_ID_INVALID');
    let match: BleControllerCredential | undefined;
    for (const storedKey of new Set(await SecureStorage.keys())) {
      if (!storedKey.startsWith(CREDENTIAL_PREFIX)) continue;
      const logicalDeviceId = storedKey.slice(CREDENTIAL_PREFIX.length);
      const encoded = await SecureStorage.getItem(storedKey);
      if (encoded === null) continue;
      let stored: StoredCredential;
      try {
        stored = JSON.parse(encoded) as StoredCredential;
      } catch {
        throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
      }
      if (stored.version !== 1 || stored.logicalDeviceId !== logicalDeviceId) {
        throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
      }
      if (stored.state !== 'pending'
        || !sameBytes(base64UrlDecode(stored.deviceInstanceId, 16), deviceInstanceId)) {
        continue;
      }
      if (match) {
        match.controllerSecret.fill(0);
        throw new Error('BLE_DIRECT_PENDING_AMBIGUOUS');
      }
      match = await this.load(logicalDeviceId);
    }
    return match;
  }

  async remove(logicalDeviceId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    await SecureStorage.removeItem(key(logicalDeviceId));
  }
}

function key(logicalDeviceId: string): string {
  try {
    if (!logicalDeviceId.startsWith('ble_')) throw new Error();
    logicalDevicePeerId(logicalDeviceId);
  } catch {
    throw new Error('BLE_DIRECT_LOGICAL_DEVICE_ID_INVALID');
  }
  return CREDENTIAL_PREFIX + logicalDeviceId;
}

const CREDENTIAL_PREFIX = 'blinker_v2_ble_credential_';

function validateCredential(credential: BleControllerCredential): void {
  key(credential.logicalDeviceId);
  if ((credential.state !== 'pending' && credential.state !== 'active')
    || !exactNonZero(credential.deviceInstanceId, 16)
    || !u32(credential.accessEpoch) || !exactNonZero(credential.controllerId, 16)
    || !exactNonZero(credential.controllerSecret, 32)
    || credential.credentialVersion !== 1 || credential.permissions !== 0x0f
    || !exactNonZero(credential.intentId, 16) || !exactNonZero(credential.commitId, 16)
    || !credential.receipt.length || credential.receipt.length > 145) {
    throw new Error('BLE_DIRECT_CREDENTIAL_INVALID');
  }
}

function exactNonZero(value: Uint8Array, size: number): boolean {
  return value instanceof Uint8Array
    && value.length === size
    && value.some(byte => byte !== 0);
}

function u32(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
}
