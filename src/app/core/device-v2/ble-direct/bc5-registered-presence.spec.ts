import { describe, expect, it, vi } from 'vitest';
import { bc5PresenceRecoveryStop, diagnoseBc5OriginalSourcePresence,
  verifyBc5PresenceAliasRecovery, verifyBc5RegisteredPresence } from './bc5-registered-presence';
import { CLOUD_REGISTRATION_CONTRACT, type IssuedCloudRegistration } from './cloud-registration-wire';
import { CapacitorBleControllerCredentialStore, type BleControllerCredential } from './credential-store';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BleDirectCrypto } from './crypto';
import { RegistrationPresenceReadError, type RegistrationPresenceBinding } from './registration-presence-contract';
import { base64UrlEncode } from './wire';

const bytes = (size: number, n: number) => new Uint8Array(size).fill(n);
const b64 = (size: number, n: number) => base64UrlEncode(bytes(size, n));
const saved = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', async original => {
  const real = await original<typeof import('@capacitor/core')>();
  return Object.assign({}, real, { Capacitor: Object.assign({}, real.Capacitor, { isNativePlatform: () => true }) });
});
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  keys: vi.fn(async () => [...saved.keys()]), getItem: vi.fn(async (key: string) => saved.get(key) ?? null),
  setItem: vi.fn(async (key: string, raw: string) => { saved.set(key, raw); }),
  removeItem: vi.fn(async (key: string) => { saved.delete(key); }),
} }));

async function fixture(targetId = 'device_11111111-1111-4111-8111-111111111111') {
  const sourceId = 'ble_AgICAgICAgICAgICAgICAg';
  const source: BleControllerCredential = { source: 'enrollment', state: 'active', logicalDeviceId: sourceId,
    deviceInstanceId: bytes(16, 2), accessEpoch: 3, controllerId: bytes(16, 4), controllerSecret: bytes(32, 5),
    credentialVersion: 1, permissions: 15, intentId: bytes(16, 6), commitId: bytes(16, 7), receipt: bytes(16, 8),
    presenceKeys: [{ state: 'current', accessEpoch: 3, version: 1, key: bytes(16, 9) }] };
  const crypto = new BleDirectCrypto(), adminFingerprint = base64UrlEncode(await crypto.adminFingerprint(source.controllerId, source.controllerSecret));
  const root = { deviceInstanceId: b64(16, 2), accessEpoch: 3, controllerId: b64(16, 4), credentialVersion: 1 as const, adminFingerprint };
  const issued: IssuedCloudRegistration = { contract: CLOUD_REGISTRATION_CONTRACT, ownerUserId: 'owner', tenantId: 'tenant',
    intentId: b64(16, 10), sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: targetId, clientNonce: b64(16, 11),
    expectedRoot: { ...root, kind: 'ble-no-cloud-key-v2', cloudKey: { state: 'absent' } }, state: 'key_issued', expiresAt: 1000,
    targetKey: { credentialVersion: 1, locator: b64(16, 12), issuanceDigest: b64(32, 13), issuedAt: 100 } };
  const committed = { ...issued, state: 'committed', quotaState: 'consumed', registrationProduct: 'cloud',
    materialOwnerLogicalDeviceId: sourceId, rootBindingId: b64(16, 14), bindingRevision: 4, committedAt: 200,
    device: { logicalDeviceId: targetId, tenantId: 'tenant', registrationProduct: 'cloud', state: 'active', cloudEnabled: true, credentialVersion: 1 } };
  const owner: RegistrationPresenceBinding = { contract: 'access-registration-presence-v1', logicalDeviceId: sourceId,
    rootBindingId: committed.rootBindingId, bindingRevision: 4, expectedRoot: { ...root, cloudCredentialVersion: 1 },
    materialOwnerLogicalDeviceId: sourceId, canWritePresence: true, keys: [{ state: 'current', accessEpoch: 3, version: 1,
      key: b64(16, 9), keyDigest: base64UrlEncode(await crypto.sha256(bytes(16, 9))) }] };
  const alias = structuredClone({ ...owner, logicalDeviceId: targetId, canWritePresence: false });
  const abort = new AbortController(), read = vi.fn(async (id: string, _signal: AbortSignal) => id === sourceId ? owner : alias);
  return { sourceId, targetId, source, owner, alias, committed, issued, abort, read,
    run: () => verifyBc5RegisteredPresence({ issued, committed, source, read, signal: abort.signal, assertCurrent: () => undefined }) };
}

describe('BC5 exact committed Presence preflight', () => {
  it('cannot turn a source-only check into exact binding proof', async () => {
    const f = await fixture();
    f.owner.rootBindingId = b64(16, 25);
    await expect(diagnoseBc5OriginalSourcePresence({ issued: f.issued, source: f.source, read: f.read,
      signal: f.abort.signal, assertCurrent: () => undefined })).resolves.toBeUndefined();
    expect(f.read.mock.calls.map(([id]) => id)).toEqual([f.sourceId]);
    f.read.mockClear();
    expect(await f.run().catch(bc5PresenceRecoveryStop)).toEqual({ stage: 'source-presence', reason: 'binding' });
    expect(f.read.mock.calls.map(([id]) => id)).toEqual([f.sourceId]);
  });

  it('reads exactly the original two cards and returns only non-secret projection metadata', async () => {
    const f = await fixture();
    expect(await f.run()).toEqual({ sourceLogicalDeviceId: f.sourceId, targetLogicalDeviceId: f.targetId,
      rootBindingId: f.committed.rootBindingId, bindingRevision: 4, accessEpoch: 3, presenceVersion: 1 });
    expect(f.read.mock.calls.map(([id]) => id)).toEqual([f.sourceId, f.targetId]);
    expect(f.source.rootCredentialRef).toBeUndefined();
  });
  it.each(['pending', 'locator', 'target-tenant', 'local-admin', 'unsupported-admin'] as const)('rejects %s before either Presence read', async change => {
    const f = await fixture();
    if (change === 'pending') f.committed.state = 'install_unknown';
    if (change === 'locator') f.committed.targetKey = { ...f.committed.targetKey, locator: b64(16, 19) };
    if (change === 'target-tenant') f.committed.device.tenantId = 'other';
    if (change === 'local-admin') f.source.controllerSecret[0] ^= 1;
    if (change === 'unsupported-admin') f.source.credentialVersion = f.issued.expectedRoot.credentialVersion = 2;
    await expect(f.run()).rejects.toThrow(); expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['root', 'revision', 'alias-writer', 'owner', 'epoch', 'material', 'missing'] as const)('rejects paired %s even with the same instance', async change => {
    const f = await fixture();
    if (change === 'root') f.alias.rootBindingId = b64(16, 19);
    if (change === 'revision') f.alias.bindingRevision++;
    if (change === 'alias-writer') f.alias.canWritePresence = true;
    if (change === 'owner') f.alias.materialOwnerLogicalDeviceId = f.targetId;
    if (change === 'epoch') f.alias.expectedRoot.accessEpoch++;
    if (change === 'material') f.alias.keys[0].key = b64(16, 20);
    if (change === 'missing') f.alias.keys = [];
    await expect(f.run()).rejects.toThrow('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('stops between reads on cancellation and never retries', async () => {
    const f = await fixture();
    f.read.mockImplementationOnce(async () => { f.abort.abort(); return f.owner; });
    await expect(f.run()).rejects.toThrow(); expect(f.read).toHaveBeenCalledOnce();
  });

  it.each(['no-store', 'envelope', 'schema', 'key-digest', 'request'] as const)
  ('projects %s from the first read without exporting the exception or starting the target read', async reason => {
    const f = await fixture();
    const thrown = reason === 'request' ? new Error('never project this raw body or credential')
      : new RegistrationPresenceReadError(reason);
    f.read.mockRejectedValueOnce(thrown);
    expect(await f.run().catch(bc5PresenceRecoveryStop)).toEqual({ stage: 'source-presence', reason });
    expect(f.read.mock.calls.map(([id]) => id)).toEqual([f.sourceId]);
    expect(bc5PresenceRecoveryStop(new Error('no raw error'))).toEqual({ stage: 'outside-presence', reason: 'unclassified' });
  });

  it.each(['binding', 'card-role', 'root', 'current-missing', 'current-version', 'current-material'] as const)
  ('stops after a parsed source response with %s, without reading the target', async reason => {
    const f = await fixture();
    if (reason === 'binding') f.owner.bindingRevision++;
    if (reason === 'card-role') f.owner.canWritePresence = false;
    if (reason === 'root') f.owner.expectedRoot.cloudCredentialVersion++;
    if (reason === 'current-missing') f.owner.keys = [];
    if (reason === 'current-version') f.owner.keys[0].version++;
    if (reason === 'current-material') {
      f.owner.keys[0].key = b64(16, 27);
      f.owner.keys[0].keyDigest = base64UrlEncode(await new BleDirectCrypto().sha256(bytes(16, 27)));
    }
    expect(await f.run().catch(bc5PresenceRecoveryStop)).toEqual({ stage: 'source-presence', reason });
    expect(f.read.mock.calls.map(([id]) => id)).toEqual([f.sourceId]);
  });
});

describe('BC5 single-owner nearby-only alias CAS', () => {
  async function local(targetId?: string) {
    saved.clear(); vi.mocked(SecureStorage.setItem).mockClear();
    const f = await fixture(targetId), scope = { authority: 'https://example.test', accountId: 'owner' };
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    const checkpoint = { issued: f.issued, commitId: b64(16, 23), recordedAt: 300, armedAt: 400 };
    const authorize = (authoritativeCommitId = checkpoint.commitId) => verifyBc5PresenceAliasRecovery({ scope,
      checkpoint, authoritativeCommitId, committed: f.committed, source: f.source, read: f.read, signal: f.abort.signal,
      assertCurrent: () => f.abort.signal.throwIfAborted() });
    await store.save(f.source);
    return { ...f, scope, store, authorize, checkpoint };
  }

  it.each(['device_11111111-1111-4111-8111-111111111111', 'device_' + b64(16, 22)])
  ('creates and independently deletes nearby-only metadata for %s without a Direct grant', async targetId => {
    const f = await local(targetId), original = [...saved.values()][0], proof = await f.authorize();
    expect(await f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).toBe(true);
    expect(await f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).toBe(false);
    expect(SecureStorage.setItem).toHaveBeenCalledTimes(2); // original source, then one reference
    expect([...saved.values()][0]).toBe(original);
    expect([...saved.values()][1]).not.toMatch(/controllerSecret|presenceKeys|permissions/);
    expect(await f.store.load(f.targetId)).toBeUndefined();
    expect(await f.store.readBc5PresenceAlias(f.targetId)).toMatchObject({ sourceLogicalDeviceId: f.sourceId, presenceVersion: 1 });
    const source = await f.store.readBc5NearbySource(f.targetId);
    expect(source).toMatchObject({ deviceInstanceId: f.source.deviceInstanceId, key: f.source.presenceKeys![0].key });
    expect(source).not.toHaveProperty('controllerSecret');
    source?.key.fill(0);
    await f.store.removeDeletedRegistration(f.targetId);
    expect(await f.store.readBc5PresenceAlias(f.targetId)).toBeUndefined();
    expect(await f.store.readBc5NearbySource(f.targetId)).toBeUndefined();
    expect([...saved.values()]).toEqual([original]);
  });

  it('does not turn an opaque Cloud metadata index into a valid Direct credential', async () => {
    const f = await local('device_' + b64(16, 22)), original = [...saved.values()][0];
    await expect(f.store.save({ ...f.source, logicalDeviceId: f.targetId })).rejects.toThrow('LOGICAL_DEVICE_ID_INVALID');
    expect([...saved.values()]).toEqual([original]);
    // A forged legacy record at the valid metadata index must also fail the
    // ordinary credential decoder, even though this ID can own an alias.
    const sourceKey = [...saved.keys()][0];
    saved.set(sourceKey.slice(0, -f.sourceId.length) + f.targetId,
      JSON.stringify({ ...JSON.parse(original), logicalDeviceId: f.targetId }));
    await expect(f.store.load(f.targetId)).rejects.toThrow('LOGICAL_DEVICE_ID_INVALID');
    expect(await f.store.load(f.sourceId)).toEqual(f.source);
  });

  it('rejects wrong commitId or an unarmed checkpoint before reading either Presence endpoint', async () => {
    const f = await local();
    await expect(f.authorize(b64(16, 24))).rejects.toThrow('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
    f.checkpoint.armedAt = 0;
    await expect(f.authorize()).rejects.toThrow('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
    expect(f.read).not.toHaveBeenCalled(); expect(saved.size).toBe(1);
  });

  it('rejects stale source proof and a changed account without writing a target', async () => {
    const f = await local(), proof = await f.authorize();
    f.source.presenceKeys![0].key[0] ^= 1; await f.store.save(f.source);
    await expect(f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).rejects.toThrow('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
    f.scope.accountId = 'other';
    await expect(f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).rejects.toThrow('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
    expect(saved.size).toBe(1);
  });

  it('keeps source intact on failed alias write and never replaces an independent target credential', async () => {
    const f = await local(), proof = await f.authorize(), original = [...saved.values()][0];
    vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(Error('storage failed'));
    await expect(f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).rejects.toThrow('storage failed');
    expect([...saved.values()]).toEqual([original]);
    await f.store.save({ ...f.source, logicalDeviceId: f.targetId });
    const unchanged = [...saved.entries()];
    await expect(f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).rejects.toThrow('ACCESS_REGISTRATION_REFERENCE_CONFLICT');
    expect([...saved.entries()]).toEqual(unchanged);
  });

  it('stops using the stored reference when the source no longer has its matching material', async () => {
    const f = await local(), proof = await f.authorize();
    await f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined);
    await f.store.remove(f.sourceId);
    expect(await f.store.readBc5PresenceAlias(f.targetId)).toBeUndefined();
    expect(await f.store.load(f.targetId)).toBeUndefined();
  });

  it('cannot turn a cancelled read into a local grant while waiting for the target check', async () => {
    const f = await local(), proof = await f.authorize(), original = [...saved.values()][0];
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async () => { f.abort.abort(); return null; });
    await expect(f.store.restoreCommittedBc5PresenceAlias(proof, () => undefined)).rejects.toThrow();
    expect([...saved.values()]).toEqual([original]);
  });
});
