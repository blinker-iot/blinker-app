import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

import { logicalDevicePeerId } from '../../protocol/device-v2';
import { base64UrlDecode, base64UrlEncode, sameBytes } from './wire';

export type BleControllerCredentialState = 'pending' | 'active';
export type BleControllerCredentialSource = 'enrollment' | 'wifiprov';

export interface BlePresenceCredential {
  state: 'current' | 'previous';
  accessEpoch: number;
  version: number;
  key: Uint8Array;
}

export interface BleControllerCredential {
  source?: BleControllerCredentialSource;
  state: BleControllerCredentialState;
  logicalDeviceId: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  controllerSecret: Uint8Array;
  credentialVersion: number;
  permissions: number;
  presenceKeys?: BlePresenceCredential[];
  intentId: Uint8Array;
  commitId: Uint8Array;
  receipt: Uint8Array;
}

export interface BleControllerCredentialStore {
  save(credential: BleControllerCredential): Promise<void>;
  load(logicalDeviceId: string): Promise<BleControllerCredential | undefined>;
  findPending(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined>;
  replacePresenceKeys(
    logicalDeviceId: string,
    presenceKeys: readonly BlePresenceCredential[],
  ): Promise<void>;
  remove(logicalDeviceId: string): Promise<void>;
}

interface StoredCredential {
  version: 1 | 2 | 3 | 4;
  source?: BleControllerCredentialSource;
  state: BleControllerCredentialState;
  logicalDeviceId: string;
  deviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  controllerSecret: string;
  credentialVersion: number;
  permissions: number;
  presenceKeys?: Array<{
    state: 'current' | 'previous';
    accessEpoch: number;
    version: number;
    key: string;
  }>;
  intentId: string;
  commitId: string;
  receipt: string;
}

export class CapacitorBleControllerCredentialStore implements BleControllerCredentialStore {
  async save(credential: BleControllerCredential): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    validateCredential(credential);
    const source = credential.source ?? 'enrollment';
    const stored: StoredCredential = {
      version: 4,
      source,
      state: credential.state,
      logicalDeviceId: credential.logicalDeviceId,
      deviceInstanceId: base64UrlEncode(credential.deviceInstanceId),
      accessEpoch: credential.accessEpoch,
      controllerId: base64UrlEncode(credential.controllerId),
      controllerSecret: base64UrlEncode(credential.controllerSecret),
      credentialVersion: credential.credentialVersion,
      permissions: credential.permissions,
      presenceKeys: credential.presenceKeys?.map(value => ({
        state: value.state,
        accessEpoch: value.accessEpoch,
        version: value.version,
        key: base64UrlEncode(value.key),
      })),
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
    if ((stored.version !== 1 && stored.version !== 2
      && stored.version !== 3 && stored.version !== 4)
      || stored.logicalDeviceId !== logicalDeviceId) {
      throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
    }
    const source = stored.version === 3 || stored.version === 4
      ? stored.source
      : 'enrollment';
    if (source !== 'enrollment' && source !== 'wifiprov') {
      throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
    }
    const credential: BleControllerCredential = {
      source,
      state: stored.state,
      logicalDeviceId: stored.logicalDeviceId,
      deviceInstanceId: base64UrlDecode(stored.deviceInstanceId, 16),
      accessEpoch: stored.accessEpoch,
      controllerId: base64UrlDecode(stored.controllerId, 16),
      controllerSecret: base64UrlDecode(stored.controllerSecret, 32),
      credentialVersion: stored.credentialVersion,
      permissions: stored.permissions,
      presenceKeys: stored.presenceKeys?.map(value => ({
        state: value.state,
        accessEpoch: value.accessEpoch,
        version: value.version,
        key: base64UrlDecode(value.key, 16),
      })),
      intentId: source === 'wifiprov'
        ? new Uint8Array()
        : base64UrlDecode(stored.intentId, 16),
      commitId: source === 'wifiprov'
        ? new Uint8Array()
        : base64UrlDecode(stored.commitId, 16),
      receipt: source === 'wifiprov'
        ? new Uint8Array()
        : base64UrlDecode(stored.receipt),
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
      if ((stored.version !== 1 && stored.version !== 2
        && stored.version !== 3 && stored.version !== 4)
        || stored.logicalDeviceId !== logicalDeviceId) {
        throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
      }
      if (stored.state !== 'pending'
        || !sameBytes(base64UrlDecode(stored.deviceInstanceId, 16), deviceInstanceId)) {
        continue;
      }
      if (match) {
        clearBleControllerCredentialSecrets(match);
        throw new Error('BLE_DIRECT_PENDING_AMBIGUOUS');
      }
      match = await this.load(logicalDeviceId);
    }
    return match;
  }

  async replacePresenceKeys(
    logicalDeviceId: string,
    presenceKeys: readonly BlePresenceCredential[],
  ): Promise<void> {
    const credential = await this.load(logicalDeviceId);
    if (!credential || credential.state !== 'active') {
      if (credential) clearBleControllerCredentialSecrets(credential);
      throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    }
    const replacement = presenceKeys.map(value => ({
      state: value.state,
      accessEpoch: value.accessEpoch,
      version: value.version,
      key: value.key.slice(),
    }));
    try {
      await this.save({ ...credential, presenceKeys: replacement });
    } finally {
      clearBleControllerCredentialSecrets(credential);
      for (const value of replacement) value.key.fill(0);
    }
  }

  async remove(logicalDeviceId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    await SecureStorage.removeItem(key(logicalDeviceId));
  }
}

function key(logicalDeviceId: string): string {
  try {
    logicalDevicePeerId(logicalDeviceId);
  } catch {
    throw new Error('BLE_DIRECT_LOGICAL_DEVICE_ID_INVALID');
  }
  return CREDENTIAL_PREFIX + logicalDeviceId;
}

const CREDENTIAL_PREFIX = 'blinker_v2_ble_credential_';

function validateCredential(credential: BleControllerCredential): void {
  key(credential.logicalDeviceId);
  const source = credential.source ?? 'enrollment';
  const validEvidence = source === 'wifiprov'
    ? credential.state === 'active'
      && credential.intentId.length === 0
      && credential.commitId.length === 0
      && credential.receipt.length === 0
    : source === 'enrollment'
      ? exactNonZero(credential.intentId, 16)
        && exactNonZero(credential.commitId, 16)
        && credential.receipt.length > 0
        && credential.receipt.length <= 145
      : false;
  if ((credential.state !== 'pending' && credential.state !== 'active')
    || !exactNonZero(credential.deviceInstanceId, 16)
    || !u32(credential.accessEpoch) || !exactNonZero(credential.controllerId, 16)
    || !exactNonZero(credential.controllerSecret, 32)
    || credential.credentialVersion !== 1 || credential.permissions !== 0x0f
    || !validPresenceKeys(credential.presenceKeys, credential.accessEpoch)
    || !validEvidence) {
    throw new Error('BLE_DIRECT_CREDENTIAL_INVALID');
  }
}

function validPresenceKeys(
  values: BlePresenceCredential[] | undefined,
  currentAccessEpoch: number,
): boolean {
  if (values === undefined) return true;
  if (values.length < 1 || values.length > 2) return false;
  const states = new Set(values.map(value => value.state));
  const versions = new Set(values.map(value => value.version));
  const current = values.find(value => value.state === 'current');
  return states.size === values.length
    && versions.size === values.length
    && !!current
    && current.accessEpoch === currentAccessEpoch
    && values.every(value => (value.state === 'current' || value.state === 'previous')
      && u32(value.accessEpoch) && u32(value.version)
      && exactNonZero(value.key, 16));
}

export function clearBleControllerCredentialSecrets(
  credential: BleControllerCredential,
): void {
  credential.controllerSecret.fill(0);
  for (const presence of credential.presenceKeys ?? []) presence.key.fill(0);
}

function exactNonZero(value: Uint8Array, size: number): boolean {
  return value instanceof Uint8Array
    && value.length === size
    && value.some(byte => byte !== 0);
}

function u32(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
}
