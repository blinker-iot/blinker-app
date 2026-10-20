import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

import { logicalDevicePeerId } from '../../protocol/device-v2';
import {
  DeviceV2AccountScope,
  DeviceV2AccountScopeProvider,
  deviceV2AccountStoragePrefix,
  validateDeviceV2AccountScope,
} from '../account-scope';
import { base64UrlDecode, base64UrlEncode, sameBytes } from './wire';

export type BleControllerCredentialState = 'pending' | 'active';
export type BleControllerCredentialSource = 'enrollment' | 'wifiprov';

export interface BlePresenceCredential {
  state: 'current' | 'previous';
  accessEpoch: number;
  version: number;
  key: Uint8Array;
}

// Non-secret recovery journal. The candidate secret stays in this one secure
// credential record; prepared is never a usable Direct credential.
export interface WiFiProvKeyRotation {
  phase: 'prepared' | 'key-ready';
  operationId: string;
  previousContext: { credentialVersion: number; locator: string };
  expectedAdmin?: { controllerId: string; accessEpoch: number };
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
  // WiFiProv recovery metadata only; the DeviceKey is re-revealed by the owner.
  cloudContext?: { credentialVersion: number; locator: string };
  keyRotation?: WiFiProvKeyRotation;
  intentId: Uint8Array;
  commitId: Uint8Array;
  receipt: Uint8Array;
}

export interface BleControllerCredentialStore {
  save(credential: BleControllerCredential): Promise<void>;
  load(logicalDeviceId: string): Promise<BleControllerCredential | undefined>;
  findPending(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined>;
  listPending(): Promise<string[]>;
  replacePresenceKeys(
    logicalDeviceId: string,
    presenceKeys: readonly BlePresenceCredential[],
  ): Promise<void>;
  remove(logicalDeviceId: string): Promise<void>;
}

interface StoredCredential {
  version: 5 | 6;
  authority: string;
  accountId: string;
  source?: BleControllerCredentialSource;
  state: BleControllerCredentialState;
  logicalDeviceId: string;
  deviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  controllerSecret: string;
  credentialVersion: number;
  permissions: number;
  cloudContext?: { credentialVersion: number; locator: string };
  keyRotation?: WiFiProvKeyRotation;
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
  constructor(private readonly scope: DeviceV2AccountScopeProvider) {}

  async save(credential: BleControllerCredential): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    await this.saveForScope(scope, credential);
  }

  async load(logicalDeviceId: string): Promise<BleControllerCredential | undefined> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    return this.loadForScope(scope, logicalDeviceId);
  }

  async findPending(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined> {
    return this.findByInstance(deviceInstanceId, 'enrollment');
  }

  async findWiFiProv(deviceInstanceId: Uint8Array, pendingOnly = false): Promise<BleControllerCredential | undefined> {
    return this.findByInstance(deviceInstanceId, 'wifiprov', pendingOnly);
  }

  private async findByInstance(
    deviceInstanceId: Uint8Array, source: BleControllerCredentialSource, pendingOnly = false,
  ): Promise<BleControllerCredential | undefined> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    if (!exactNonZero(deviceInstanceId, 16)) throw new Error('BLE_DIRECT_DEVICE_ID_INVALID');
    const scope = this.currentScope();
    const prefix = scopedPrefix(scope);
    let match: BleControllerCredential | undefined;
    try {
      for (const storedKey of new Set(await SecureStorage.keys())) {
        if (!storedKey.startsWith(prefix)) continue;
        const logicalDeviceId = storedKey.slice(prefix.length);
        const encoded = await SecureStorage.getItem(storedKey);
        if (encoded === null) continue;
        const stored = parseStoredCredential(encoded, scope, logicalDeviceId);
        const storedDeviceInstanceId = base64UrlDecode(stored.deviceInstanceId, 16);
        try {
          if (storedCredentialSource(stored) !== source
            || (pendingOnly && stored.state !== 'pending')
            || (source === 'enrollment' ? stored.state !== 'pending' : !stored.cloudContext)
            || !sameBytes(storedDeviceInstanceId, deviceInstanceId)) {
            continue;
          }
        } finally {
          storedDeviceInstanceId.fill(0);
        }
        if (match) throw new Error('BLE_DIRECT_PENDING_AMBIGUOUS');
        match = decodeStoredCredential(stored);
      }
      return match;
    } catch (error) {
      if (match) clearBleControllerCredentialSecrets(match);
      throw error;
    }
  }

  async listPending(): Promise<string[]> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    const prefix = scopedPrefix(scope);
    const output: string[] = [];
    for (const storedKey of new Set(await SecureStorage.keys())) {
      if (!storedKey.startsWith(prefix)) continue;
      const logicalDeviceId = storedKey.slice(prefix.length);
      const encoded = await SecureStorage.getItem(storedKey);
      if (encoded === null) continue;
      const stored = parseStoredCredential(encoded, scope, logicalDeviceId);
      if (stored.state === 'pending'
        && storedCredentialSource(stored) === 'enrollment') {
        output.push(logicalDeviceId);
      }
    }
    return output.sort();
  }

  async replacePresenceKeys(
    logicalDeviceId: string,
    presenceKeys: readonly BlePresenceCredential[],
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    const credential = await this.loadForScope(scope, logicalDeviceId);
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
      await this.saveForScope(scope, { ...credential, presenceKeys: replacement });
    } finally {
      clearBleControllerCredentialSecrets(credential);
      for (const value of replacement) value.key.fill(0);
    }
  }

  async remove(logicalDeviceId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    await SecureStorage.removeItem(key(this.currentScope(), logicalDeviceId));
  }

  private currentScope(): DeviceV2AccountScope {
    return validateDeviceV2AccountScope(this.scope());
  }

  private async loadForScope(
    scope: DeviceV2AccountScope,
    logicalDeviceId: string,
  ): Promise<BleControllerCredential | undefined> {
    const encoded = await SecureStorage.getItem(key(scope, logicalDeviceId));
    return encoded === null
      ? undefined
      : decodeStoredCredential(parseStoredCredential(encoded, scope, logicalDeviceId));
  }

  private async saveForScope(
    scope: DeviceV2AccountScope,
    credential: BleControllerCredential,
  ): Promise<void> {
    validateCredential(credential);
    const source = credential.source ?? 'enrollment';
    const rotation = credential.keyRotation;
    const stored: StoredCredential = {
      version: credential.keyRotation ? 6 : 5,
      authority: scope.authority,
      accountId: scope.accountId,
      source,
      state: credential.state,
      logicalDeviceId: credential.logicalDeviceId,
      deviceInstanceId: base64UrlEncode(credential.deviceInstanceId),
      accessEpoch: credential.accessEpoch,
      controllerId: base64UrlEncode(credential.controllerId),
      controllerSecret: base64UrlEncode(credential.controllerSecret),
      credentialVersion: credential.credentialVersion,
      permissions: credential.permissions,
      cloudContext: credential.cloudContext && { credentialVersion: credential.cloudContext.credentialVersion,
        locator: credential.cloudContext.locator },
      keyRotation: rotation && { phase: rotation.phase, operationId: rotation.operationId,
        previousContext: { credentialVersion: rotation.previousContext.credentialVersion, locator: rotation.previousContext.locator },
        expectedAdmin: rotation.expectedAdmin && { accessEpoch: rotation.expectedAdmin.accessEpoch,
          controllerId: rotation.expectedAdmin.controllerId } },
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
    await SecureStorage.setItem(key(scope, credential.logicalDeviceId), JSON.stringify(stored));
  }
}

function key(scope: DeviceV2AccountScope, logicalDeviceId: string): string {
  try {
    logicalDevicePeerId(logicalDeviceId);
  } catch {
    throw new Error('BLE_DIRECT_LOGICAL_DEVICE_ID_INVALID');
  }
  return scopedPrefix(scope) + logicalDeviceId;
}

const CREDENTIAL_PREFIX = 'blinker_v2_ble_credential_';

function scopedPrefix(scope: DeviceV2AccountScope): string {
  return deviceV2AccountStoragePrefix(CREDENTIAL_PREFIX, scope);
}

function parseStoredCredential(
  encoded: string,
  scope: DeviceV2AccountScope,
  logicalDeviceId: string,
): StoredCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
  }
  const stored = parsed as StoredCredential;
  if ((stored.version !== 5 && stored.version !== 6)
    || (stored.version === 6) !== (stored.keyRotation !== undefined)
    || stored.authority !== scope.authority
    || stored.accountId !== scope.accountId
    || stored.logicalDeviceId !== logicalDeviceId) {
    throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
  }
  storedCredentialSource(stored);
  return stored;
}

function storedCredentialSource(stored: StoredCredential): BleControllerCredentialSource {
  const source = stored.source;
  if (source !== 'enrollment' && source !== 'wifiprov') {
    throw new Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
  }
  return source;
}

function decodeStoredCredential(stored: StoredCredential): BleControllerCredential {
  const source = storedCredentialSource(stored);
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
    cloudContext: stored.cloudContext,
    keyRotation: stored.keyRotation,
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
  try {
    validateCredential(credential);
    return credential;
  } catch (error) {
    clearBleControllerCredentialSecrets(credential);
    throw error;
  }
}

function validateCredential(credential: BleControllerCredential): void {
  try {
    logicalDevicePeerId(credential.logicalDeviceId);
  } catch {
    throw new Error('BLE_DIRECT_LOGICAL_DEVICE_ID_INVALID');
  }
  const source = credential.source ?? 'enrollment';
  const validEvidence = source === 'wifiprov'
    ? (credential.state === 'active' || !!credential.cloudContext)
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
    || !validKeyRotation(credential)
    || (credential.cloudContext !== undefined && (source !== 'wifiprov'
      || !u32(credential.cloudContext.credentialVersion)
      || !/^[A-Za-z0-9_-]{22}$/.test(credential.cloudContext.locator)
      || base64UrlDecode(credential.cloudContext.locator, 16).every(byte => byte === 0)))
    || !validEvidence) {
    throw new Error('BLE_DIRECT_CREDENTIAL_INVALID');
  }
}

function validKeyRotation(credential: BleControllerCredential): boolean {
  const rotation = credential.keyRotation;
  if (rotation === undefined) return true;
  try {
    const previous = rotation.previousContext, expected = rotation.expectedAdmin;
    return credential.source === 'wifiprov' && credential.state === 'pending'
      && credential.presenceKeys === undefined && !!credential.cloudContext
      && (rotation.phase === 'prepared' || rotation.phase === 'key-ready')
      && base64UrlDecode(rotation.operationId, 16).some(Boolean)
      && u32(previous.credentialVersion) && previous.credentialVersion < 0xffffffff
      && base64UrlDecode(previous.locator, 16).some(Boolean)
      && (expected === undefined || (u32(expected.accessEpoch) && expected.accessEpoch < 0xffffffff
        && base64UrlDecode(expected.controllerId, 16).some(Boolean)
        && expected.controllerId !== base64UrlEncode(credential.controllerId)))
      && credential.accessEpoch === (expected ? expected.accessEpoch + 1 : 1)
      && (rotation.phase === 'prepared'
        ? credential.cloudContext.credentialVersion === previous.credentialVersion && credential.cloudContext.locator === previous.locator
        : credential.cloudContext.credentialVersion === previous.credentialVersion + 1 && credential.cloudContext.locator !== previous.locator);
  } catch { return false; }
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
