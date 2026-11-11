import { accessRegistrationRootTuple } from './access-registration-contract';
import { assertCloudRegistrationCommitted, snapshotIssuedCloudRegistration, type IssuedCloudRegistration } from './cloud-registration-wire';
import type { BleControllerCredential } from './credential-store';
import type { Bc5InstallCheckpoint } from './bc5-install-checkpoint';
import type { DeviceV2AccountScope } from '../account-scope';
import { BleDirectCrypto } from './crypto';
import type { HttpRegistrationPresenceApi } from './registration-presence-api';
import { RegistrationPresenceReadError, type RegistrationPresenceBinding,
  type RegistrationPresenceReadFailure } from './registration-presence-contract';
import { base64UrlDecode, base64UrlEncode } from './wire';

export interface Bc5RegisteredPresenceProof {
  sourceLogicalDeviceId: string;
  targetLogicalDeviceId: string;
  rootBindingId: string;
  bindingRevision: number;
  accessEpoch: number;
  presenceVersion: number;
}

const changed = () => Error('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
type PresenceStage = 'source-presence' | 'target-presence';
type PresenceStop = RegistrationPresenceReadFailure | 'request' | 'context-retired' | 'card-role' | 'binding'
  | 'root' | 'current-missing' | 'current-version' | 'current-material' | 'paired-material';

class Bc5PresenceBoundaryError extends Error {
  constructor(readonly stage: PresenceStage, readonly reason: PresenceStop) {
    super('BC5_REGISTERED_PRESENCE_CONTEXT_CHANGED');
  }
}

/** For the private recovery route only. Never include the exception or its cause. */
export function bc5PresenceRecoveryStop(error: unknown): { stage: PresenceStage; reason: PresenceStop }
  | { stage: 'outside-presence'; reason: 'unclassified' } {
  return error instanceof Bc5PresenceBoundaryError
    ? { stage: error.stage, reason: error.reason } : { stage: 'outside-presence', reason: 'unclassified' };
}
const verified = Symbol('bc5-presence-alias-recovery');
export interface Bc5PresenceAliasReference extends Bc5RegisteredPresenceProof, DeviceV2AccountScope {
  intentId: string;
  commitId: string;
  sourceStamp: string;
}
export type VerifiedBc5PresenceAlias = Readonly<Bc5PresenceAliasReference> & { readonly [verified]: () => boolean };

export function isVerifiedBc5PresenceAlias(value: VerifiedBc5PresenceAlias): boolean {
  return typeof value?.[verified] === 'function' && value[verified]();
}

// Fingerprint the authorization and Presence material, not account tokens or
// a second copy of the source controller. Any source replacement fails closed.
export async function bc5PresenceSourceStamp(source: BleControllerCredential, crypto = new BleDirectCrypto()): Promise<string> {
  const admin = await crypto.adminFingerprint(source.controllerId, source.controllerSecret);
  const presence: (string | number)[][] = [];
  try {
    for (const entry of source.presenceKeys ?? []) {
      const hash = await crypto.sha256(entry.key);
      try { presence.push([entry.state, entry.accessEpoch, entry.version, base64UrlEncode(hash)]); }
      finally { hash.fill(0); }
    }
    const stamp = await crypto.sha256(new TextEncoder().encode(JSON.stringify(['blinker.bc5-presence-source.v1',
      source.logicalDeviceId, source.state, source.source, source.rootCredentialRef, source.cloudContext, source.keyRotation,
      base64UrlEncode(source.deviceInstanceId), source.accessEpoch, base64UrlEncode(source.controllerId),
      source.credentialVersion, source.permissions, base64UrlEncode(admin), base64UrlEncode(source.intentId),
      base64UrlEncode(source.commitId), base64UrlEncode(source.receipt), presence])));
    try { return base64UrlEncode(stamp); } finally { stamp.fill(0); }
  } finally { admin.fill(0); }
}

// This is deliberately stronger than recoverInstall's existing projection:
// its read does not expose commitId and therefore cannot authorize a local CAS.
export async function verifyBc5PresenceAliasRecovery(input: Omit<Parameters<typeof verifyBc5RegisteredPresence>[0], 'issued'> & {
  scope: DeviceV2AccountScope;
  checkpoint: Bc5InstallCheckpoint;
  authoritativeCommitId: string;
}): Promise<VerifiedBc5PresenceAlias> {
  const { source, checkpoint, authoritativeCommitId, signal, assertCurrent, read, committed } = input;
  const { authority, accountId } = input.scope;
  const { issued, commitId, armedAt, recordedAt } = checkpoint;
  signal.throwIfAborted(); assertCurrent();
  if (!authority || accountId !== issued.ownerUserId || source.rootCredentialRef !== undefined || authoritativeCommitId !== commitId
    || typeof armedAt !== 'number' || !Number.isSafeInteger(armedAt) || !Number.isSafeInteger(recordedAt)
    || recordedAt <= 0 || armedAt < recordedAt || armedAt >= issued.expiresAt) throw changed();
  const id = base64UrlDecode(commitId, 16);
  try { if (!id.some(Boolean)) throw changed(); } finally { id.fill(0); }
  const sourceStamp = await bc5PresenceSourceStamp(source);
  const proof = await verifyBc5RegisteredPresence({ issued, committed, source, signal, assertCurrent, read });
  if (sourceStamp !== await bc5PresenceSourceStamp(source)) throw changed();
  signal.throwIfAborted(); assertCurrent();
  const deadline = performance.now() + 15_000;
  return Object.freeze({ ...proof, authority, accountId, intentId: issued.intentId, commitId, sourceStamp, [verified]: () => {
    signal.throwIfAborted(); assertCurrent();
    return performance.now() < deadline;
  } });
}

interface SourcePresenceRead {
  issued: IssuedCloudRegistration;
  source: BleControllerCredential;
  read: HttpRegistrationPresenceApi['read'];
  signal: AbortSignal;
  assertCurrent(): void;
}

// Without a committed binding this can only diagnose the source, never issue
// a proof. Do not infer a durable root reference from a Presence response.
async function readOriginalSourcePresence(input: SourcePresenceRead, crypto: BleDirectCrypto,
  binding?: { rootBindingId: string; bindingRevision: number },
) {
  const { source, signal, read } = input;
  const current = () => { signal.throwIfAborted(); input.assertCurrent(); };
  current();
  const issued = snapshotIssuedCloudRegistration(input.issued);
  const expected = issued.expectedRoot;
  const sourceId = issued.sourceLogicalDeviceId, targetId = issued.targetLogicalDeviceId;
  if (expected.credentialVersion !== 1 || sourceId === targetId || source.logicalDeviceId !== sourceId || source.state !== 'active'
    || source.source !== 'enrollment' || source.cloudContext || source.keyRotation || source.permissions !== 15
    || source.rootCredentialRef && source.rootCredentialRef !== binding?.rootBindingId
    || base64UrlEncode(source.deviceInstanceId) !== expected.deviceInstanceId || source.accessEpoch !== expected.accessEpoch
    || base64UrlEncode(source.controllerId) !== expected.controllerId || source.credentialVersion !== expected.credentialVersion) throw changed();
  const local = source.presenceKeys?.find(k => k.state === 'current' && k.accessEpoch === expected.accessEpoch);
  if (!local) throw changed();
  const localVersion = local.version, localKey = base64UrlEncode(local.key);
  const fingerprint = await crypto.adminFingerprint(source.controllerId, source.controllerSecret);
  try { current(); if (base64UrlEncode(fingerprint) !== expected.adminFingerprint) throw changed(); }
  finally { fingerprint.fill(0); }

  const root = { deviceInstanceId: expected.deviceInstanceId, accessEpoch: expected.accessEpoch,
    controllerId: expected.controllerId, credentialVersion: 1 as const, adminFingerprint: expected.adminFingerprint,
    cloudCredentialVersion: issued.targetKey.credentialVersion };
  const tuple = accessRegistrationRootTuple(root);
  const checkCurrent = (stage: PresenceStage) => {
    try { current(); } catch { throw new Bc5PresenceBoundaryError(stage, 'context-retired'); }
  };
  const readBound = async (stage: PresenceStage, id: string, writer: boolean): Promise<RegistrationPresenceBinding> => {
    const stop = (reason: PresenceStop) => new Bc5PresenceBoundaryError(stage, reason);
    let value: RegistrationPresenceBinding;
    try { value = await read(id, signal); }
    catch (error) {
      throw stop(signal.aborted ? 'context-retired' : error instanceof RegistrationPresenceReadError ? error.reason : 'request');
    }
    checkCurrent(stage);
    if (value.logicalDeviceId !== id || value.materialOwnerLogicalDeviceId !== sourceId || value.canWritePresence !== writer)
      throw stop('card-role');
    if (binding && (value.rootBindingId !== binding.rootBindingId || value.bindingRevision !== binding.bindingRevision))
      throw stop('binding');
    if (!accessRegistrationRootTuple(value.expectedRoot).every((part, index) => part === tuple[index])) throw stop('root');
    return value;
  };
  const owner = await readBound('source-presence', sourceId, true);
  checkCurrent('source-presence');
  const confirmed = owner.keys.find(item => item.state === 'current');
  if (!confirmed) throw new Bc5PresenceBoundaryError('source-presence', 'current-missing');
  if (confirmed.version !== localVersion) throw new Bc5PresenceBoundaryError('source-presence', 'current-version');
  if (confirmed.key !== localKey) throw new Bc5PresenceBoundaryError('source-presence', 'current-material');
  return { owner, presenceVersion: confirmed.version, issued, readBound, checkCurrent };
}

export async function diagnoseBc5OriginalSourcePresence(input: SourcePresenceRead): Promise<void> {
  await readOriginalSourcePresence(input, new BleDirectCrypto());
}

// Only the exact committed projection can provide the binding and authorize
// the paired reads from which the existing local proof is built.
export async function verifyBc5RegisteredPresence(input: SourcePresenceRead & { committed: unknown },
  crypto = new BleDirectCrypto(),
): Promise<Bc5RegisteredPresenceProof> {
  input.signal.throwIfAborted(); input.assertCurrent();
  const issuedSnapshot = snapshotIssuedCloudRegistration(input.issued);
  assertCloudRegistrationCommitted(issuedSnapshot, input.committed);
  const { rootBindingId, bindingRevision } = input.committed as { rootBindingId: string; bindingRevision: number };
  const { owner, presenceVersion, issued, readBound, checkCurrent } = await readOriginalSourcePresence(
    { ...input, issued: issuedSnapshot }, crypto, { rootBindingId, bindingRevision });
  const { sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: targetId } = issued;
  checkCurrent('source-presence');
  const alias = await readBound('target-presence', targetId, false);
  checkCurrent('target-presence');
  if (owner.keys.length !== alias.keys.length || owner.keys.some(k =>
    !alias.keys.some(other => k.state === other.state && k.version === other.version && k.accessEpoch === other.accessEpoch
      && k.keyDigest === other.keyDigest && k.key === other.key))) throw new Bc5PresenceBoundaryError('target-presence', 'paired-material');
  return { sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: targetId, rootBindingId, bindingRevision,
    accessEpoch: issued.expectedRoot.accessEpoch, presenceVersion };
}
