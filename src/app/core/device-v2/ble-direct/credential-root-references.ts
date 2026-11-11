import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { DeviceV2AccountScope, deviceV2AccountStoragePrefix } from '../account-scope';
import { base64UrlDecode } from './wire';
import { AccessRegistrationRootContext, accessRegistrationRootJson, accessRegistrationRootTuple } from './access-registration-contract';
import { RegistrationPresenceBinding, RegistrationPresenceReference, registrationPresenceReference } from './registration-presence-contract';
import type { Bc5PresenceAliasReference } from './bc5-registered-presence';

type StoredPresence = { state: 'current' | 'previous'; accessEpoch: number; version: number; key: string };
interface RegistrationRoot { bindingRevision: number; expectedRoot: AccessRegistrationRootContext; materialOwnerLogicalDeviceId: string; }

// Root material is stored once. Card records remain independently owned and
// include only non-secret recovery metadata and a scoped root reference.
export interface SerializedRootCredential {
  version: 5 | 6;
  authority: string;
  accountId: string;
  logicalDeviceId: string;
  deviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  controllerSecret: string;
  credentialVersion: number;
  permissions: number;
  state: string;
  source?: string;
  intentId: string;
  commitId: string;
  presenceKeys?: unknown;
  [name: string]: unknown;
}
interface CardReference {
  version: 7;
  authority: string;
  accountId: string;
  logicalDeviceId: string;
  rootCredentialRef: string;
  presenceAccess: boolean;
  credential: Pick<SerializedRootCredential, 'version' | 'authority' | 'accountId' | 'logicalDeviceId'
    | 'deviceInstanceId' | 'accessEpoch' | 'controllerId' | 'credentialVersion' | 'permissions'
    | 'state' | 'source' | 'intentId' | 'commitId'> & Record<string, unknown>;
}
interface RootRecord {
  version: 1;
  authority: string;
  accountId: string;
  rootCredentialRef: string;
  stale?: true;
  registrationRoot?: RegistrationRoot;
  presenceWriteCandidate?: StoredPresence;
  root: Pick<SerializedRootCredential, 'deviceInstanceId' | 'accessEpoch' | 'controllerId'
    | 'controllerSecret' | 'credentialVersion' | 'permissions' | 'presenceKeys'>;
}

export class CredentialRootReferences {
  constructor(private readonly scope: DeviceV2AccountScope, private readonly assertCurrent: () => void,
    private readonly cardKey: (id: string) => string) {}

  isReference(encoded: string): boolean {
    try { return JSON.parse(encoded)?.version === 7; } catch { return false; }
  }

  // Reverse registration keeps its existing BLE credential as the sole
  // material owner. Store one non-secret, nearby-only reference; never move
  // the original authorization to a partly written multi-record root.
  async compareAndSetBc5Alias(value: Bc5PresenceAliasReference): Promise<boolean> {
    const key = this.bc5AliasKey(value.targetLogicalDeviceId);
    const next = this.encodeBc5Alias(value), prior = await SecureStorage.getItem(key); this.assertCurrent();
    if (prior === next) return false;
    if (prior !== null) conflict();
    await this.writeVerified(key, next);
    return true;
  }

  async readBc5Alias(id: string): Promise<Bc5PresenceAliasReference | undefined> {
    const raw = await SecureStorage.getItem(this.bc5AliasKey(id)); this.assertCurrent();
    if (raw === null) return undefined;
    let value: Bc5PresenceAliasReference;
    try { value = JSON.parse(raw); } catch { return corrupt(); }
    if (value?.targetLogicalDeviceId !== id || this.encodeBc5Alias(value) !== raw) corrupt();
    return value;
  }

  async removeBc5Alias(id: string): Promise<void> {
    const key = this.bc5AliasKey(id);
    if (await SecureStorage.getItem(key) === null) { this.assertCurrent(); return; }
    this.assertCurrent(); await SecureStorage.removeItem(key); this.assertCurrent();
  }

  private bc5AliasKey(id: string): string {
    this.cardKey(id); // Same logical-ID validation as ordinary references.
    return deviceV2AccountStoragePrefix('blinker_v2_ble_presence_alias_', this.scope) + id;
  }

  private encodeBc5Alias(value: Bc5PresenceAliasReference): string {
    const { authority, accountId, sourceLogicalDeviceId, targetLogicalDeviceId, rootBindingId, bindingRevision,
      accessEpoch, presenceVersion, intentId, commitId, sourceStamp } = value;
    if (authority !== this.scope.authority || accountId !== this.scope.accountId || sourceLogicalDeviceId === targetLogicalDeviceId
      || ![bindingRevision, accessEpoch, presenceVersion].every(n => Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff)
      || !base64UrlDecode(sourceStamp, 32).some(Boolean)) corrupt();
    this.cardKey(sourceLogicalDeviceId); this.cardKey(targetLogicalDeviceId);
    for (const id of [rootBindingId, intentId, commitId]) this.validRef(id);
    return JSON.stringify({ version: 1, authority, accountId, sourceLogicalDeviceId, targetLogicalDeviceId,
      rootBindingId, bindingRevision, accessEpoch, presenceVersion, intentId, commitId, sourceStamp });
  }

  async expand(id: string, encoded: string): Promise<string> {
    if (!this.isReference(encoded)) return encoded;
    const reference = this.reference(id, encoded), root = await this.readRoot(reference.rootCredentialRef);
    this.match(reference.credential, root.root);
    const binding = reference.credential['presenceBinding'] as RegistrationPresenceReference | undefined;
    if (binding) this.matchPresenceRoot(reference, root, binding);
    return JSON.stringify({ ...reference.credential, controllerSecret: root.root.controllerSecret,
      ...(reference.presenceAccess ? { presenceKeys: root.root.presenceKeys } : {}),
      ...(binding?.canWritePresence && root.presenceWriteCandidate ? { presenceWriteCandidate: root.presenceWriteCandidate } : {}),
      rootCredentialRef: reference.rootCredentialRef });
  }

  async prepare(rootRef: string, source: SerializedRootCredential, target: SerializedRootCredential,
    registrationRoot: RegistrationRoot): Promise<void> {
    this.assertCurrent(); this.validRef(rootRef);
    const sourceKey = this.cardKey(source.logicalDeviceId), targetKey = this.cardKey(target.logicalDeviceId);
    const currentTarget = await SecureStorage.getItem(targetKey); this.assertCurrent();
    if (currentTarget !== null) {
      if (!this.isReference(currentTarget)) conflict();
      const targetRef = this.reference(target.logicalDeviceId, currentTarget);
      if (targetRef.rootCredentialRef !== rootRef
        || targetRef.credential.intentId !== target.intentId || targetRef.credential.commitId !== target.commitId) conflict();
    }
    const rootRecord: RootRecord = { version: 1, ...this.scope, rootCredentialRef: rootRef, registrationRoot,
      root: this.rootFields(source) };
    const rootKey = this.rootKey(rootRef), currentRoot = await SecureStorage.getItem(rootKey); this.assertCurrent();
    if (currentRoot !== null) {
      const existing = this.rootRecord(rootRef, currentRoot);
      if (existing.stale) changedRoot();
      this.match(source, existing.root);
      if (source.controllerSecret !== existing.root.controllerSecret) conflict();
      if (existing.registrationRoot) this.sameRegistrationRoot(existing.registrationRoot, registrationRoot);
      else await this.writeVerified(rootKey, JSON.stringify({ ...existing, registrationRoot }));
    } else await this.writeVerified(rootKey, JSON.stringify(rootRecord));
    // Source migration is recoverable independently of the second card write.
    await this.writeVerified(sourceKey, this.encodeReference(rootRef, source));
    if (currentTarget === null) await this.writeVerified(targetKey, this.encodeReference(rootRef, target));
  }

  async save(id: string, encoded: string, credential: SerializedRootCredential): Promise<string[]> {
    const reference = this.reference(id, encoded), root = await this.readRoot(reference.rootCredentialRef);
    this.match(credential, root.root);
    if (credential.controllerSecret !== root.root.controllerSecret) sharedWrite();
    if (reference.presenceAccess && JSON.stringify(credential.presenceKeys) !== JSON.stringify(root.root.presenceKeys)) sharedWrite();
    if (JSON.stringify(credential['presenceBinding']) !== JSON.stringify(reference.credential['presenceBinding'])) sharedWrite();
    await this.writeVerified(this.cardKey(id), this.encodeReference(reference.rootCredentialRef, credential,
      reference.presenceAccess));
    return [id];
  }

  async applyPresence(id: string, encoded: string, binding: RegistrationPresenceBinding,
    changing: (ids: string[]) => void): Promise<string[]> {
    const reference = this.reference(id, encoded), root = await this.readRoot(reference.rootCredentialRef);
    if (reference.credential.state !== 'active' || reference.credential['keyRotation'] !== undefined) conflict();
    this.match(reference.credential, root.root);
    if (binding.logicalDeviceId !== id || binding.rootBindingId !== reference.rootCredentialRef) changedRoot();
    const grant = registrationPresenceReference(binding);
    this.matchPresenceRoot(reference, root, grant);
    const registration = root.registrationRoot!;
    if (JSON.stringify(accessRegistrationRootTuple(registration.expectedRoot)) !== JSON.stringify(accessRegistrationRootTuple(binding.expectedRoot))) changedRoot();
    const next = binding.keys.map(({ state, accessEpoch, version, key }) => ({ state, accessEpoch, version, key }))
      .sort((a, b) => b.version - a.version);
    this.checkPresenceVersions(root, next);
    const pending = root.presenceWriteCandidate;
    const confirmedPending = pending && next.some(item => item.version === pending.version && item.key === pending.key);
    const nextMaterial = next.length ? next : undefined;
    if (reference.presenceAccess && JSON.stringify(reference.credential['presenceBinding']) === JSON.stringify(grant)
      && JSON.stringify(root.root.presenceKeys) === JSON.stringify(nextMaterial) && !confirmedPending) return [];
    const ids = await this.presenceReferences(reference.rootCredentialRef); this.assertCurrent();
    if (!ids.includes(id)) ids.push(id);
    changing(ids);
    await this.writeVerified(this.rootKey(reference.rootCredentialRef), JSON.stringify({ ...root,
      ...(confirmedPending ? { presenceWriteCandidate: undefined } : {}),
      root: { ...root.root, presenceKeys: nextMaterial } }));
    await this.writeVerified(this.cardKey(id), this.encodeReference(reference.rootCredentialRef,
      { ...reference.credential, controllerSecret: root.root.controllerSecret, presenceBinding: grant } as SerializedRootCredential, true));
    return ids.sort();
  }

  async replacePresence(id: string, encoded: string, keys: StoredPresence[], changing: (ids: string[]) => void): Promise<string[]> {
    const reference = this.reference(id, encoded), root = await this.readRoot(reference.rootCredentialRef);
    const grant = reference.credential['presenceBinding'] as RegistrationPresenceReference | undefined;
    this.matchPresenceRoot(reference, root, grant);
    if (!grant?.canWritePresence || grant.materialOwnerLogicalDeviceId !== id || reference.credential.state !== 'active')
      throw Error('ACCESS_REGISTRATION_PRESENCE_WRITE_REQUIRED');
    this.checkPresenceVersions(root, keys);
    keys.sort((a, b) => b.version - a.version);
    if (JSON.stringify(root.root.presenceKeys) === JSON.stringify(keys) && !root.presenceWriteCandidate) return [];
    const ids = await this.presenceReferences(reference.rootCredentialRef); this.assertCurrent(); changing(ids);
    const pending = root.presenceWriteCandidate;
    if (pending && !keys.some(item => item.version === pending.version && item.key === pending.key))
      throw Error('ACCESS_REGISTRATION_PRESENCE_VERSION_CONFLICT');
    await this.writeVerified(this.rootKey(reference.rootCredentialRef), JSON.stringify({ ...root,
      presenceWriteCandidate: undefined, root: { ...root.root, presenceKeys: keys } }));
    return ids.sort();
  }

  async savePresenceCandidate(id: string, encoded: string, candidate: StoredPresence): Promise<void> {
    const reference = this.reference(id, encoded), root = await this.readRoot(reference.rootCredentialRef);
    const grant = reference.credential['presenceBinding'] as RegistrationPresenceReference | undefined;
    this.matchPresenceRoot(reference, root, grant);
    if (!grant?.canWritePresence || grant.materialOwnerLogicalDeviceId !== id || reference.credential.state !== 'active')
      throw Error('ACCESS_REGISTRATION_PRESENCE_WRITE_REQUIRED');
    this.checkPresenceVersions(root, [candidate]);
    if (root.presenceWriteCandidate && (root.presenceWriteCandidate.version !== candidate.version
      || root.presenceWriteCandidate.key !== candidate.key)) throw Error('ACCESS_REGISTRATION_PRESENCE_VERSION_CONFLICT');
    await this.writeVerified(this.rootKey(reference.rootCredentialRef), JSON.stringify({ ...root, presenceWriteCandidate: candidate }));
  }

  private matchPresenceRoot(reference: CardReference, root: RootRecord, grant?: RegistrationPresenceReference): void {
    if (!root.registrationRoot) throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_REQUIRED');
    if (!grant || grant.rootBindingId !== reference.rootCredentialRef || grant.bindingRevision !== root.registrationRoot.bindingRevision
      || grant.materialOwnerLogicalDeviceId !== root.registrationRoot.materialOwnerLogicalDeviceId
      || (grant.canWritePresence && reference.logicalDeviceId !== grant.materialOwnerLogicalDeviceId)) changedRoot();
    registrationPresenceReference(grant);
  }
  private sameRegistrationRoot(a: RegistrationRoot, b: RegistrationRoot): void {
    if (a.bindingRevision !== b.bindingRevision || a.materialOwnerLogicalDeviceId !== b.materialOwnerLogicalDeviceId
      || JSON.stringify(accessRegistrationRootTuple(a.expectedRoot)) !== JSON.stringify(accessRegistrationRootTuple(b.expectedRoot))) changedRoot();
  }
  private checkPresenceVersions(root: RootRecord, next: StoredPresence[]): void {
    const old = root.root.presenceKeys;
    if (old !== undefined && !Array.isArray(old)) corrupt();
    const previous = (old ?? []) as StoredPresence[];
    for (const item of previous) {
      const replacement = next.find(value => value.version === item.version);
      if (replacement && (replacement.key !== item.key || replacement.accessEpoch !== item.accessEpoch))
        throw Error('ACCESS_REGISTRATION_PRESENCE_VERSION_CONFLICT');
    }
    if (Math.max(0, ...next.map(value => value.version)) < Math.max(0, ...previous.map(value => value.version)))
      throw Error('ACCESS_REGISTRATION_PRESENCE_VERSION_CONFLICT');
    const pending = root.presenceWriteCandidate, confirmed = pending && next.find(value => value.version === pending.version);
    if (confirmed && confirmed.key !== pending!.key) throw Error('ACCESS_REGISTRATION_PRESENCE_VERSION_CONFLICT');
  }
  private async presenceReferences(rootRef: string): Promise<string[]> {
    const prefix = deviceV2AccountStoragePrefix('blinker_v2_ble_credential_', this.scope), ids: string[] = [];
    for (const storedKey of new Set(await SecureStorage.keys())) {
      this.assertCurrent(); if (!storedKey.startsWith(prefix)) continue;
      const encoded = await SecureStorage.getItem(storedKey); this.assertCurrent();
      if (encoded !== null && this.isReference(encoded)) {
        const id = storedKey.slice(prefix.length), reference = this.reference(id, encoded);
        if (reference.rootCredentialRef === rootRef && reference.presenceAccess && reference.credential.state === 'active') ids.push(id);
      }
    }
    return ids;
  }

  async remove(id: string, encoded: string, terminalPending = false): Promise<void> {
    this.assertCurrent();
    const reference = this.reference(id, encoded);
    if (reference.credential.state === 'pending' && !terminalPending) return;
    this.assertCurrent();
    await SecureStorage.removeItem(this.cardKey(id)); this.assertCurrent();
    const prefix = deviceV2AccountStoragePrefix('blinker_v2_ble_credential_', this.scope);
    for (const storedKey of new Set(await SecureStorage.keys())) {
      this.assertCurrent(); if (!storedKey.startsWith(prefix)) continue;
      const value = await SecureStorage.getItem(storedKey); this.assertCurrent();
      if (value === null) continue;
      // Malformed same-scope records cannot prove the root is unused.
      let parsed: unknown; try { parsed = JSON.parse(value); } catch { return; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      if ((parsed as { version?: number }).version === 7) {
        const candidate = this.reference(storedKey.slice(prefix.length), value);
        if (candidate.rootCredentialRef === reference.rootCredentialRef) return;
      }
    }
    this.assertCurrent(); await SecureStorage.removeItem(this.rootKey(reference.rootCredentialRef)); this.assertCurrent();
  }

  async removeDeleted(id: string, encoded: string, expectedWiFiProvInstance?: string): Promise<boolean> {
    this.assertCurrent();
    const reference = this.reference(id, encoded), credential = reference.credential;
    if (expectedWiFiProvInstance !== undefined && (credential.source !== 'wifiprov'
      || credential.deviceInstanceId !== expectedWiFiProvInstance)) conflict();
    if (credential.state === 'pending' || credential['keyRotation'] !== undefined) return true;
    if (credential.state !== 'active') corrupt();
    // The root may already be stale. Deleting this confirmed card needs only
    // its scoped reference, never an expanded secret or physical-root access.
    await this.remove(id, encoded);
    return false;
  }

  async invalidate(rootRef: string): Promise<string[]> {
    this.assertCurrent();
    const encoded = await SecureStorage.getItem(this.rootKey(rootRef)); this.assertCurrent();
    if (encoded === null) return [];
    const root = this.rootRecord(rootRef, encoded), ids: string[] = [];
    const prefix = deviceV2AccountStoragePrefix('blinker_v2_ble_credential_', this.scope);
    for (const storedKey of new Set(await SecureStorage.keys())) {
      this.assertCurrent(); if (!storedKey.startsWith(prefix)) continue;
      const value = await SecureStorage.getItem(storedKey); this.assertCurrent();
      if (value !== null && this.isReference(value)) {
        const id = storedKey.slice(prefix.length);
        if (this.reference(id, value).rootCredentialRef === rootRef) ids.push(id);
      }
    }
    // One verified root marker fences every card, without destroying material
    // required to coordinate an unresolved registration intent.
    await this.writeVerified(this.rootKey(rootRef), JSON.stringify({ ...root, stale: true }));
    return ids.sort();
  }

  async retire(id: string, encoded: string, intentId: string): Promise<void> {
    this.assertCurrent();
    const reference = this.reference(id, encoded);
    if (reference.credential.source !== 'access-registration' || reference.credential.intentId !== intentId)
      conflict();
    // A known stale root must remain non-readable, but an authoritative closed
    // intent may still retire only its own card reference.
    await this.remove(id, encoded, true);
  }

  private encodeReference(rootRef: string, value: SerializedRootCredential, presenceAccess = value.presenceKeys !== undefined): string {
    const { controllerSecret: _secret, presenceKeys: _presence, presenceWriteCandidate: _candidate, rootCredentialRef: _ref, ...credential } = value;
    return JSON.stringify({ version: 7, ...this.scope, logicalDeviceId: value.logicalDeviceId,
      rootCredentialRef: rootRef, presenceAccess, credential });
  }
  private reference(id: string, encoded: string): CardReference {
    let value: CardReference;
    try { value = JSON.parse(encoded); } catch { return corrupt(); }
    if (!value || value.version !== 7 || value.authority !== this.scope.authority || value.accountId !== this.scope.accountId
      || value.logicalDeviceId !== id || typeof value.presenceAccess !== 'boolean'
      || !value.credential || value.credential.logicalDeviceId !== id
      || value.credential.authority !== this.scope.authority || value.credential.accountId !== this.scope.accountId
      || 'controllerSecret' in value.credential || 'presenceKeys' in value.credential || 'presenceWriteCandidate' in value.credential) corrupt();
    this.validRef(value.rootCredentialRef); return value;
  }
  private async readRoot(ref: string): Promise<RootRecord> {
    const encoded = await SecureStorage.getItem(this.rootKey(ref)); this.assertCurrent();
    if (encoded === null) return corrupt();
    const value = this.rootRecord(ref, encoded);
    if (value.stale) changedRoot();
    return value;
  }
  private rootRecord(ref: string, encoded: string): RootRecord {
    let value: RootRecord; try { value = JSON.parse(encoded); } catch { return corrupt(); }
    if (!value || value.version !== 1 || value.authority !== this.scope.authority || value.accountId !== this.scope.accountId
      || value.rootCredentialRef !== ref || (value.stale !== undefined && value.stale !== true)
      || !value.root || typeof value.root.controllerSecret !== 'string') corrupt();
    if (value.registrationRoot) {
      const expected = accessRegistrationRootJson(value.registrationRoot.expectedRoot);
      if (!Number.isSafeInteger(value.registrationRoot.bindingRevision) || value.registrationRoot.bindingRevision < 1
        || value.registrationRoot.bindingRevision > 0xffffffff || !value.registrationRoot.materialOwnerLogicalDeviceId
        || expected.deviceInstanceId !== value.root.deviceInstanceId || expected.accessEpoch !== value.root.accessEpoch
        || expected.controllerId !== value.root.controllerId || expected.credentialVersion !== value.root.credentialVersion) corrupt();
    }
    if (value.root.presenceKeys !== undefined && !validStoredPresence(value.root.presenceKeys, value.root.accessEpoch)) corrupt();
    if (value.presenceWriteCandidate !== undefined && (!validStoredPresence([value.presenceWriteCandidate], value.root.accessEpoch)
      || value.presenceWriteCandidate.state !== 'current')) corrupt();
    return value;
  }
  private match(value: Pick<SerializedRootCredential, 'deviceInstanceId' | 'accessEpoch' | 'controllerId' | 'credentialVersion' | 'permissions'>,
    root: RootRecord['root']): void {
    if (value.deviceInstanceId !== root.deviceInstanceId || value.accessEpoch !== root.accessEpoch
      || value.controllerId !== root.controllerId || value.credentialVersion !== root.credentialVersion
      || value.permissions !== root.permissions) sharedWrite();
  }
  private rootFields(value: SerializedRootCredential): RootRecord['root'] {
    return { deviceInstanceId: value.deviceInstanceId, accessEpoch: value.accessEpoch, controllerId: value.controllerId,
      controllerSecret: value.controllerSecret, credentialVersion: value.credentialVersion, permissions: value.permissions,
      ...(value.presenceKeys === undefined ? {} : { presenceKeys: value.presenceKeys }) };
  }
  private rootKey(ref: string): string {
    this.validRef(ref); return deviceV2AccountStoragePrefix('blinker_v2_ble_root_', this.scope) + ref;
  }
  private validRef(ref: string): void {
    try { if (!base64UrlDecode(ref, 16).some(Boolean)) corrupt(); } catch { corrupt(); }
  }
  private async writeVerified(key: string, value: string): Promise<void> {
    this.assertCurrent(); await SecureStorage.setItem(key, value); this.assertCurrent();
    if (await SecureStorage.getItem(key) !== value) corrupt(); this.assertCurrent();
  }
}
function corrupt(): never { throw Error('BLE_DIRECT_ROOT_REFERENCE_CORRUPT'); }
function conflict(): never { throw Error('ACCESS_REGISTRATION_REFERENCE_CONFLICT'); }
function sharedWrite(): never { throw Error('BLE_DIRECT_SHARED_ROOT_OPERATION_REQUIRED'); }
function changedRoot(): never { throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED'); }
function validStoredPresence(value: unknown, epoch: number): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return false;
  try {
    return new Set(value.map(item => item.state)).size === value.length
      && new Set(value.map(item => item.version)).size === value.length
      && value.every(item => (item.state === 'current' || item.state === 'previous') && item.accessEpoch === epoch
        && Number.isSafeInteger(item.version) && item.version > 0 && item.version <= 0xffffffff
        && (() => { const key = base64UrlDecode(item.key, 16); try { return key.some(Boolean); } finally { key.fill(0); } })());
  } catch { return false; }
}
