import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Subject } from 'rxjs';

import { logicalDevicePeerId } from '../../protocol/device-v2';
import { isLogicalDeviceReferenceId } from '../../protocol/device-v2/logical-device-reference';
import {
  DeviceV2AccountScope,
  DeviceV2AccountScopeProvider,
  deviceV2AccountStoragePrefix,
  validateDeviceV2AccountScope,
} from '../account-scope';
import { base64UrlDecode, base64UrlEncode, sameBytes } from './wire';
import { BleDirectCrypto } from './crypto';
import { CredentialRootReferences, SerializedRootCredential } from './credential-root-references';
import { AccessRegistrationCredentialContext, AccessRegistrationReferencePreparation,
  validateAccessRegistrationRoot } from './access-registration-contract';
import { RegistrationPresenceBinding, RegistrationPresenceReference, registrationPresenceReference,
  validateRegistrationPresenceBinding } from './registration-presence-contract';
import { bc5PresenceSourceStamp, isVerifiedBc5PresenceAlias, type Bc5PresenceAliasReference,
  type VerifiedBc5PresenceAlias } from './bc5-registered-presence';

export type BleControllerCredentialState = 'pending' | 'active';
export type BleControllerCredentialSource = 'enrollment' | 'wifiprov' | 'access-registration';

export interface BleControllerCredentialChange extends DeviceV2AccountScope {
  logicalDeviceId: string;
  reason?: 'root_invalidated' | 'registration_deleted';
}

// In-memory invalidation only, shared by all store instances. No credential,
// key, epoch or receipt is retained or replayed to a later subscriber.
const credentialChanges = new Subject<Readonly<BleControllerCredentialChange>>();
export const bleControllerCredentialChanges = credentialChanges.asObservable();

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
  presenceBinding?: RegistrationPresenceReference;
  presenceWriteCandidate?: BlePresenceCredential;
  // WiFiProv recovery metadata only; the DeviceKey is re-revealed by the owner.
  cloudContext?: { credentialVersion: number; locator: string };
  keyRotation?: WiFiProvKeyRotation;
  intentId: Uint8Array;
  commitId: Uint8Array;
  receipt: Uint8Array;
  rootCredentialRef?: string;
  registrationContext?: AccessRegistrationCredentialContext;
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

interface StoredCredential extends SerializedRootCredential {
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
  rootCredentialRef?: string;
  registrationContext?: AccessRegistrationCredentialContext;
  presenceBinding?: RegistrationPresenceReference;
  presenceWriteCandidate?: { state: 'current' | 'previous'; accessEpoch: number; version: number; key: string };
}

const credentialWrites = new Map<string, Promise<unknown>>();
async function mutateCredentialScope<T>(scope: DeviceV2AccountScope, work: () => Promise<T>): Promise<T> {
  const id = scopedPrefix(scope), previous = credentialWrites.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  credentialWrites.set(id, next);
  try { return await next; }
  finally { if (credentialWrites.get(id) === next) credentialWrites.delete(id); }
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

  /** Record a confirmed cloud rotation without replacing the local Admin. */
  async recordWiFiProvRekey(logicalDeviceId: string, expected: {
    deviceInstanceId: string; accessEpoch: number; controllerId: string; adminVersion: number;
    previous: NonNullable<StoredCredential['cloudContext']>;
  }, next: NonNullable<StoredCredential['cloudContext']>, assertCurrent: () => void): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope(), storedKey = key(scope, logicalDeviceId);
    const conflict = () => Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
    const old = { ...expected, previous: { ...expected.previous } }, updated = { ...next };
    if (!u32(old.previous.credentialVersion) || !u32(updated.credentialVersion)
      || updated.credentialVersion !== old.previous.credentialVersion + 1
      || updated.locator === old.previous.locator || !base64UrlDecode(updated.locator, 16).some(Boolean)) throw conflict();
    await mutateCredentialScope(scope, async () => {
      this.assertScope(scope); assertCurrent();
      const raw = await SecureStorage.getItem(storedKey);
      this.assertScope(scope); assertCurrent();
      if (raw === null || this.references(scope).isReference(raw)) throw conflict();
      const stored = parseStoredCredential(raw, scope, logicalDeviceId);
      if (stored.state !== 'active' || stored.source !== 'wifiprov' || stored.keyRotation || stored.rootCredentialRef
        || stored.registrationContext || stored.presenceWriteCandidate || stored.deviceInstanceId !== old.deviceInstanceId
        || stored.accessEpoch !== old.accessEpoch || stored.controllerId !== old.controllerId
        || stored.credentialVersion !== old.adminVersion
        || stored.cloudContext?.credentialVersion !== old.previous.credentialVersion
        || stored.cloudContext.locator !== old.previous.locator) throw conflict();
      const value = JSON.stringify({ ...stored, cloudContext: updated });
      await SecureStorage.setItem(storedKey, value);
      this.assertScope(scope); assertCurrent();
      if (await SecureStorage.getItem(storedKey) !== value) throw conflict();
      this.assertScope(scope); assertCurrent();
      credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId }));
    });
  }

  async findPending(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined> {
    return this.findByInstance(deviceInstanceId, 'enrollment');
  }

  async findWiFiProv(deviceInstanceId: Uint8Array, pendingOnly = false): Promise<BleControllerCredential | undefined> {
    return this.findByInstance(deviceInstanceId, 'wifiprov', pendingOnly);
  }

  /** Preflight existence only: a legacy or enrollment record is not a fresh setup. */
  async findForProvisioning(deviceInstanceId: Uint8Array): Promise<BleControllerCredential | undefined> {
    return this.findByInstance(deviceInstanceId);
  }

  /** Existence is not card selection: inspect every same-instance reference. */
  async inspectForProvisioning(deviceInstanceId: Uint8Array): Promise<{ hasAny: boolean; hasUnconfirmed: boolean }> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    if (!exactNonZero(deviceInstanceId, 16)) throw Error('BLE_DIRECT_DEVICE_ID_INVALID');
    const scope = this.currentScope(), prefix = scopedPrefix(scope), instance = deviceInstanceId.slice();
    let hasAny = false, hasUnconfirmed = false;
    for (const storedKey of new Set(await SecureStorage.keys())) {
      this.assertScope(scope);
      if (!storedKey.startsWith(prefix)) continue;
      const credential = await this.loadForScope(scope, storedKey.slice(prefix.length));
      try {
        this.assertScope(scope);
        if (!credential || !sameBytes(credential.deviceInstanceId, instance)) continue;
        hasAny = true;
        hasUnconfirmed ||= credential.state !== 'active' || credential.keyRotation !== undefined;
      } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
    }
    this.assertScope(scope);
    return Object.freeze({ hasAny, hasUnconfirmed });
  }

  private async findByInstance(
    deviceInstanceId: Uint8Array, source?: BleControllerCredentialSource, pendingOnly = false,
  ): Promise<BleControllerCredential | undefined> {
    if (!Capacitor.isNativePlatform()) throw new Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    if (!exactNonZero(deviceInstanceId, 16)) throw new Error('BLE_DIRECT_DEVICE_ID_INVALID');
    const scope = this.currentScope();
    const prefix = scopedPrefix(scope);
    const checkPreflightScope = () => {
      if (source !== undefined) return;
      const current = this.currentScope();
      if (current.accountId !== scope.accountId || current.authority !== scope.authority) {
        throw new Error('BLE_DIRECT_CREDENTIAL_SCOPE_CHANGED');
      }
    };
    let match: BleControllerCredential | undefined;
    try {
      const storedKeys = new Set(await SecureStorage.keys());
      checkPreflightScope();
      for (const storedKey of storedKeys) {
        if (!storedKey.startsWith(prefix)) continue;
        const logicalDeviceId = storedKey.slice(prefix.length);
        const encoded = await SecureStorage.getItem(storedKey);
        checkPreflightScope();
        if (encoded === null) continue;
        const stored = parseStoredCredential(await this.references(scope).expand(logicalDeviceId, encoded), scope, logicalDeviceId);
        const storedDeviceInstanceId = base64UrlDecode(stored.deviceInstanceId, 16);
        try {
          if ((source !== undefined && (storedCredentialSource(stored) !== source
            || (pendingOnly && stored.state !== 'pending')
            || (source === 'enrollment' ? stored.state !== 'pending' : !stored.cloudContext)))
            || !sameBytes(storedDeviceInstanceId, deviceInstanceId)) {
            continue;
          }
        } finally {
          storedDeviceInstanceId.fill(0);
        }
        if (match) throw new Error('BLE_DIRECT_PENDING_AMBIGUOUS');
        match = decodeStoredCredential(stored);
      }
      checkPreflightScope();
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
      const stored = parseStoredCredential(await this.references(scope).expand(logicalDeviceId, encoded), scope, logicalDeviceId);
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
    const scope = this.currentScope();
    const storedKey = key(scope, logicalDeviceId);
    await mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      const encoded = await SecureStorage.getItem(storedKey), references = this.references(scope);
      this.assertScope(scope);
      if (encoded !== null && references.isReference(encoded)) await references.remove(logicalDeviceId, encoded);
      else await SecureStorage.removeItem(storedKey);
      this.assertScope(scope);
      credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId }));
    });
  }

  // Only after an authoritative registration DELETE. Unlike generic remove,
  // this reports retained unresolved evidence instead of calling it cleaned.
  async removeDeletedRegistration(logicalDeviceId: string, expectedWiFiProvInstance?: Uint8Array): Promise<{ cleanupPending: boolean }> {
    // Browser builds cannot own native BLE credentials. This does not claim
    // that another phone or the MCU has lost its physical authorization.
    if (!Capacitor.isNativePlatform()) return { cleanupPending: false };
    if (expectedWiFiProvInstance !== undefined && !exactNonZero(expectedWiFiProvInstance, 16))
      throw Error('WIFIPROV_CHECKPOINT_CONFLICT');
    const expectedInstance = expectedWiFiProvInstance === undefined ? undefined : base64UrlEncode(expectedWiFiProvInstance);
    const scope = this.currentScope(), storedKey = key(scope, logicalDeviceId);
    return mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      const encoded = await SecureStorage.getItem(storedKey); this.assertScope(scope);
      if (encoded === null) {
        if (expectedInstance === undefined) await this.references(scope).removeBc5Alias(logicalDeviceId);
        credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId, reason: 'registration_deleted' as const }));
        return { cleanupPending: false };
      }
      const references = this.references(scope);
      let cleanupPending: boolean;
      if (references.isReference(encoded)) cleanupPending = await references.removeDeleted(logicalDeviceId, encoded, expectedInstance);
      else {
        const stored = parseStoredCredential(encoded, scope, logicalDeviceId);
        if (expectedInstance !== undefined && (stored.source !== 'wifiprov' || stored.deviceInstanceId !== expectedInstance))
          throw Error('WIFIPROV_CHECKPOINT_CONFLICT');
        if (!['pending', 'active'].includes(stored.state)) throw Error('BLE_DIRECT_CREDENTIAL_CORRUPT');
        cleanupPending = stored.state === 'pending' || stored.keyRotation !== undefined;
        if (!cleanupPending) { this.assertScope(scope); await SecureStorage.removeItem(storedKey); }
      }
      this.assertScope(scope);
      credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId, reason: 'registration_deleted' as const }));
      return { cleanupPending };
    });
  }

  async restoreCommittedBc5PresenceAlias(proof: VerifiedBc5PresenceAlias, assertCurrent: () => void): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    const check = () => {
      this.assertScope(scope); assertCurrent();
      if (!isVerifiedBc5PresenceAlias(proof) || proof.authority !== scope.authority || proof.accountId !== scope.accountId)
        throw Error('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
    };
    check();
    return mutateCredentialScope(scope, async () => {
      check();
      const target = await SecureStorage.getItem(key(scope, proof.targetLogicalDeviceId)); check();
      if (target !== null) throw Error('ACCESS_REGISTRATION_REFERENCE_CONFLICT');
      const source = await this.loadForScope(scope, proof.sourceLogicalDeviceId);
      try {
        check();
        if (!source || source.state !== 'active' || await bc5PresenceSourceStamp(source) !== proof.sourceStamp)
          throw Error('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
        check();
        const references = new CredentialRootReferences(scope, check, id => key(scope, id));
        return references.compareAndSetBc5Alias(proof);
      } finally { if (source) clearBleControllerCredentialSecrets(source); }
    });
  }

  // This metadata is a nearby reference only. Ordinary load(), enrollment,
  // and Direct controls continue to find no credential for this Cloud alias.
  async readBc5PresenceAlias(logicalDeviceId: string): Promise<Bc5PresenceAliasReference | undefined> {
    return this.withBc5PresenceAlias(logicalDeviceId, reference => reference);
  }

  async readBc5NearbySource(logicalDeviceId: string) {
    return this.withBc5PresenceAlias(logicalDeviceId, (reference, source) => {
      const current = source.presenceKeys?.find(item => item.state === 'current'
        && item.accessEpoch === reference.accessEpoch && item.version === reference.presenceVersion);
      if (!current || source.accessEpoch !== reference.accessEpoch) return undefined;
      // Copy only the exact confirmed material under the same validation/lock.
      // The scanner uses it to check its existing candidate, then wipes it.
      return { reference, deviceInstanceId: source.deviceInstanceId.slice(), key: current.key.slice() };
    });
  }

  private async withBc5PresenceAlias<T>(logicalDeviceId: string,
    use: (reference: Bc5PresenceAliasReference, source: BleControllerCredential) => T,
  ): Promise<T | undefined> {
    if (!Capacitor.isNativePlatform()) return undefined;
    const scope = this.currentScope();
    return mutateCredentialScope(scope, async () => {
      const reference = await this.references(scope).readBc5Alias(logicalDeviceId);
      if (!reference || await SecureStorage.getItem(key(scope, logicalDeviceId)) !== null) return undefined;
      this.assertScope(scope);
      const source = await this.loadForScope(scope, reference.sourceLogicalDeviceId);
      try {
        const match = source?.state === 'active' && await bc5PresenceSourceStamp(source) === reference.sourceStamp;
        this.assertScope(scope);
        return source && match ? use(reference, source) : undefined;
      } finally { if (source) clearBleControllerCredentialSecrets(source); }
    });
  }

  async prepareAccessRegistrationReference(input: AccessRegistrationReferencePreparation): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    validateAccessRegistrationRoot(input.expectedRoot);
    const scope = this.currentScope(), prepared = {
      ...input, expectedRoot: { ...input.expectedRoot }, commitId: input.commitId.slice(),
    };
    key(scope, prepared.sourceLogicalDeviceId); key(scope, prepared.targetLogicalDeviceId);
    if (prepared.sourceLogicalDeviceId === prepared.targetLogicalDeviceId
      || !u32(prepared.bindingRevision) || !exactNonZero(prepared.commitId, 16)
      || !base64UrlDecode(prepared.intentId, 16).some(Boolean)
      || !base64UrlDecode(prepared.rootBindingId, 16).some(Boolean)) throw Error('ACCESS_REGISTRATION_CONTEXT_INVALID');
    await mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      const credential = await this.loadForScope(scope, prepared.sourceLogicalDeviceId);
      if (!credential || credential.state !== 'active' || credential.keyRotation) {
        if (credential) clearBleControllerCredentialSecrets(credential);
        throw Error('ACCESS_REGISTRATION_SOURCE_ACTIVE_REQUIRED');
      }
      try {
        const expected = prepared.expectedRoot;
        const fingerprint = await new BleDirectCrypto().adminFingerprint(credential.controllerId, credential.controllerSecret);
        try {
          if (base64UrlEncode(credential.deviceInstanceId) !== expected.deviceInstanceId
            || credential.accessEpoch !== expected.accessEpoch || base64UrlEncode(credential.controllerId) !== expected.controllerId
            || credential.credentialVersion !== expected.credentialVersion || base64UrlEncode(fingerprint) !== expected.adminFingerprint
            || credential.cloudContext?.credentialVersion !== expected.cloudCredentialVersion
            || (credential.rootCredentialRef !== undefined && credential.rootCredentialRef !== prepared.rootBindingId))
            throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED');
        } finally { fingerprint.fill(0); }
        const context: AccessRegistrationCredentialContext = { intentId: prepared.intentId,
          sourceLogicalDeviceId: prepared.sourceLogicalDeviceId, rootBindingId: prepared.rootBindingId,
          bindingRevision: prepared.bindingRevision };
        const target: BleControllerCredential = { ...credential, source: 'access-registration', state: 'pending',
          logicalDeviceId: prepared.targetLogicalDeviceId, rootCredentialRef: prepared.rootBindingId,
          cloudContext: undefined, presenceKeys: undefined, keyRotation: undefined,
          registrationContext: context, intentId: base64UrlDecode(prepared.intentId, 16),
          commitId: prepared.commitId, receipt: new Uint8Array() };
        const source = this.storedForScope(scope, credential), targetStored = this.storedForScope(scope, target);
        await this.references(scope).prepare(prepared.rootBindingId, source, targetStored,
          { bindingRevision: prepared.bindingRevision, expectedRoot: prepared.expectedRoot,
            materialOwnerLogicalDeviceId: prepared.sourceLogicalDeviceId });
        for (const logicalDeviceId of [prepared.sourceLogicalDeviceId, prepared.targetLogicalDeviceId])
          credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId }));
      } finally { clearBleControllerCredentialSecrets(credential); prepared.commitId.fill(0); }
    });
  }

  async confirmAccessRegistrationReference(logicalDeviceId: string, intentId: string): Promise<void> {
    await this.finishAccessRegistrationReference(logicalDeviceId, intentId, false);
  }

  async applyRegistrationPresence(value: RegistrationPresenceBinding): Promise<string[]> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope(), binding = await validateRegistrationPresenceBinding(value); this.assertScope(scope);
    return mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      const encoded = await SecureStorage.getItem(key(scope, binding.logicalDeviceId)); this.assertScope(scope);
      if (encoded === null || !this.references(scope).isReference(encoded)) throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_REQUIRED');
      const notify = (ids: string[]) => { this.assertScope(scope); for (const logicalDeviceId of ids)
        credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId })); };
      const ids = await this.references(scope).applyPresence(binding.logicalDeviceId, encoded, binding, notify);
      notify(ids); return ids;
    });
  }

  async replaceRegistrationPresenceKeys(logicalDeviceId: string, keys: readonly BlePresenceCredential[]): Promise<void> {
    await this.mutateRegistrationPresence(logicalDeviceId, keys, false);
  }
  async saveRegistrationPresenceCandidate(logicalDeviceId: string, candidate: BlePresenceCredential): Promise<void> {
    await this.mutateRegistrationPresence(logicalDeviceId, [candidate], true);
  }
  private async mutateRegistrationPresence(id: string, keys: readonly BlePresenceCredential[], pending: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope(), copied = keys.map(value => ({ ...value, key: value.key.slice() }));
    try {
      await mutateCredentialScope(scope, async () => {
        this.assertScope(scope); const encoded = await SecureStorage.getItem(key(scope, id)); this.assertScope(scope);
        const references = this.references(scope);
        if (encoded === null || !references.isReference(encoded)) throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_REQUIRED');
        const credential = await this.loadForScope(scope, id);
        if (!credential) throw Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
        try {
          if (!validPresenceKeys(copied, credential.accessEpoch, true) || !copied.some(value => value.state === 'current'))
            throw Error('ACCESS_REGISTRATION_PRESENCE_INVALID');
          const stored = copied.map(value => ({ ...value, key: base64UrlEncode(value.key) }));
          if (pending) await references.savePresenceCandidate(id, encoded, stored[0]);
          else {
            const notify = (ids: string[]) => { this.assertScope(scope); for (const logicalDeviceId of ids)
              credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId })); };
            const ids = await references.replacePresence(id, encoded, stored, notify); notify(ids);
          }
        } finally { clearBleControllerCredentialSecrets(credential); }
      });
    } finally { for (const value of copied) value.key.fill(0); }
  }

  async loadForRootReference(logicalDeviceId: string, rootCredentialRef: string): Promise<BleControllerCredential | undefined> {
    if (!base64UrlDecode(rootCredentialRef, 16).some(Boolean)) throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED');
    const credential = await this.load(logicalDeviceId);
    if (credential && credential.rootCredentialRef !== rootCredentialRef) {
      clearBleControllerCredentialSecrets(credential); throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED');
    }
    return credential;
  }

  // Only the explicit coordinator calls this after an authoritative closed
  // server intent; generic remove deliberately retains unresolved references.
  async retireAccessRegistrationReference(logicalDeviceId: string, intentId: string): Promise<void> {
    await this.finishAccessRegistrationReference(logicalDeviceId, intentId, true);
  }

  // Explicit known-root invalidation only. It neither rotates material nor
  // assigns presence access to another logical product.
  async invalidateRootReferences(rootCredentialRef: string): Promise<string[]> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    return mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      const ids = await this.references(scope).invalidate(rootCredentialRef); this.assertScope(scope);
      for (const logicalDeviceId of ids) credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId, reason: 'root_invalidated' as const }));
      return ids;
    });
  }

  private async finishAccessRegistrationReference(id: string, intentId: string, retired: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw Error('BLE_DIRECT_SECURE_STORAGE_REQUIRED');
    const scope = this.currentScope();
    await mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      if (retired) {
        const encoded = await SecureStorage.getItem(key(scope, id)); this.assertScope(scope);
        if (encoded === null) return;
        await this.references(scope).retire(id, encoded, intentId); this.assertScope(scope);
        credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId: id }));
        return;
      }
      const credential = await this.loadForScope(scope, id);
      if (!credential) throw Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
      try {
        if (credential.source !== 'access-registration' || credential.registrationContext?.intentId !== intentId)
          throw Error('ACCESS_REGISTRATION_REFERENCE_CONFLICT');
        const encoded = await SecureStorage.getItem(key(scope, id));
        this.assertScope(scope);
        if (!encoded) throw Error('BLE_DIRECT_ROOT_REFERENCE_CORRUPT');
        await this.references(scope).save(id, encoded, this.storedForScope(scope, { ...credential, state: 'active' }));
        credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId: id }));
      } finally { clearBleControllerCredentialSecrets(credential); }
    });
  }

  private references(scope: DeviceV2AccountScope): CredentialRootReferences {
    return new CredentialRootReferences(scope, () => this.assertScope(scope), id => key(scope, id));
  }

  private assertScope(scope: DeviceV2AccountScope): void {
    const current = this.currentScope();
    if (current.authority !== scope.authority || current.accountId !== scope.accountId)
      throw Error('BLE_DIRECT_CREDENTIAL_SCOPE_CHANGED');
  }

  private currentScope(): DeviceV2AccountScope {
    return validateDeviceV2AccountScope(this.scope());
  }

  private async loadForScope(
    scope: DeviceV2AccountScope,
    logicalDeviceId: string,
  ): Promise<BleControllerCredential | undefined> {
    const encoded = await SecureStorage.getItem(key(scope, logicalDeviceId));
    this.assertScope(scope);
    return encoded === null
      ? undefined
      : decodeStoredCredential(parseStoredCredential(await this.references(scope).expand(logicalDeviceId, encoded), scope, logicalDeviceId));
  }

  private async saveForScope(
    scope: DeviceV2AccountScope,
    credential: BleControllerCredential,
  ): Promise<void> {
    const stored = this.storedForScope(scope, credential);
    await mutateCredentialScope(scope, async () => {
      this.assertScope(scope);
      const encoded = await SecureStorage.getItem(key(scope, stored.logicalDeviceId)), references = this.references(scope);
      this.assertScope(scope);
      if (encoded !== null && references.isReference(encoded)) await references.save(stored.logicalDeviceId, encoded, stored);
      else {
        if (stored.rootCredentialRef !== undefined) throw Error('BLE_DIRECT_ROOT_REFERENCE_CORRUPT');
        await SecureStorage.setItem(key(scope, stored.logicalDeviceId), JSON.stringify(stored));
      }
      this.assertScope(scope);
      credentialChanges.next(Object.freeze({ ...scope, logicalDeviceId: stored.logicalDeviceId }));
    });
  }

  private storedForScope(scope: DeviceV2AccountScope, credential: BleControllerCredential): StoredCredential {
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
      rootCredentialRef: credential.rootCredentialRef,
      registrationContext: credential.registrationContext && { ...credential.registrationContext },
      presenceBinding: credential.presenceBinding && registrationPresenceReference(credential.presenceBinding),
    };
    return stored;
  }
}

function key(scope: DeviceV2AccountScope, logicalDeviceId: string): string {
  // Indexing a Cloud nearby alias is not a Direct routing grant. Actual
  // credential save/decode still requires logicalDevicePeerId below.
  if (!isLogicalDeviceReferenceId(logicalDeviceId)) {
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
  if (source !== 'enrollment' && source !== 'wifiprov' && source !== 'access-registration') {
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
    rootCredentialRef: stored.rootCredentialRef,
    registrationContext: stored.registrationContext,
    presenceBinding: stored.presenceBinding,
    presenceWriteCandidate: stored.presenceWriteCandidate && { ...stored.presenceWriteCandidate,
      key: base64UrlDecode(stored.presenceWriteCandidate.key, 16) },
    intentId: source === 'wifiprov'
      ? new Uint8Array()
      : base64UrlDecode(stored.intentId, 16),
    commitId: source === 'wifiprov'
      ? new Uint8Array()
      : base64UrlDecode(stored.commitId, 16),
    receipt: source === 'wifiprov' || source === 'access-registration'
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
      : source === 'access-registration'
        ? exactNonZero(credential.intentId, 16) && exactNonZero(credential.commitId, 16)
          && credential.receipt.length === 0 && validRegistrationContext(credential)
        : false;
  if ((credential.state !== 'pending' && credential.state !== 'active')
    || !exactNonZero(credential.deviceInstanceId, 16)
    || !u32(credential.accessEpoch) || !exactNonZero(credential.controllerId, 16)
    || !exactNonZero(credential.controllerSecret, 32)
    || credential.credentialVersion !== 1 || credential.permissions !== 0x0f
    || !validPresenceKeys(credential.presenceKeys, credential.accessEpoch, credential.presenceBinding !== undefined)
    || !validPresenceBinding(credential)
    || !validKeyRotation(credential)
    || (credential.cloudContext !== undefined && (source !== 'wifiprov'
      || !u32(credential.cloudContext.credentialVersion)
      || !/^[A-Za-z0-9_-]{22}$/.test(credential.cloudContext.locator)
      || base64UrlDecode(credential.cloudContext.locator, 16).every(byte => byte === 0)))
    || !validEvidence) {
    throw new Error('BLE_DIRECT_CREDENTIAL_INVALID');
  }
}

function validRegistrationContext(credential: BleControllerCredential): boolean {
  const context = credential.registrationContext;
  try {
    return !!context && !!credential.rootCredentialRef && context.rootBindingId === credential.rootCredentialRef
      && base64UrlDecode(context.rootBindingId, 16).some(Boolean) && u32(context.bindingRevision)
      && context.intentId === base64UrlEncode(credential.intentId)
      && !!logicalDevicePeerId(context.sourceLogicalDeviceId)
      && context.sourceLogicalDeviceId !== credential.logicalDeviceId;
  } catch { return false; }
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
  registration = false,
): boolean {
  if (values === undefined) return true;
  if (values.length < 1 || values.length > 2) return false;
  const states = new Set(values.map(value => value.state));
  const versions = new Set(values.map(value => value.version));
  const current = values.find(value => value.state === 'current');
  return states.size === values.length
    && versions.size === values.length
    && (!!current || registration)
    && (!current || current.accessEpoch === currentAccessEpoch)
    && values.every(value => (value.state === 'current' || value.state === 'previous')
      && value.accessEpoch === currentAccessEpoch && u32(value.version)
      && exactNonZero(value.key, 16));
}

export function clearBleControllerCredentialSecrets(
  credential: BleControllerCredential,
): void {
  credential.controllerSecret.fill(0);
  for (const presence of credential.presenceKeys ?? []) presence.key.fill(0);
  credential.presenceWriteCandidate?.key.fill(0);
}

function validPresenceBinding(credential: BleControllerCredential): boolean {
  try {
    const binding = credential.presenceBinding, pending = credential.presenceWriteCandidate;
    if (!binding) return pending === undefined;
    registrationPresenceReference(binding);
    if (binding.rootBindingId !== credential.rootCredentialRef || credential.state !== 'active'
      || (binding.canWritePresence && binding.materialOwnerLogicalDeviceId !== credential.logicalDeviceId)) return false;
    return pending === undefined || binding.canWritePresence && pending.state === 'current'
      && pending.accessEpoch === credential.accessEpoch && u32(pending.version) && exactNonZero(pending.key, 16);
  } catch { return false; }
}

function exactNonZero(value: Uint8Array, size: number): boolean {
  return value instanceof Uint8Array
    && value.length === size
    && value.some(byte => byte !== 0);
}

function u32(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
}
