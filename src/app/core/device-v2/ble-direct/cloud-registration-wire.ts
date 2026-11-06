import { base64UrlDecode, base64UrlEncode } from '../base64url';
import { BleDirectCrypto, DirectSecureContext, constantTimeEqual } from './crypto';

export const CLOUD_REGISTRATION_CONTRACT = 'access-registration-cloud-v2';
const ROOT_KIND = 'ble-no-cloud-key-v2';
const RECEIPT_KIND = 'app-verified-initial-cloud-key-v1';
const text = new TextEncoder();
const proofDomain = text.encode('blinker.initial-cloud-key-registration.v1\0');
const locatorDomain = text.encode('blinker/device-key/locator/v1\0');
export const INITIAL_CLOUD_KEY_ACK_SIZE = 36;

export interface IssuedCloudRegistration {
  contract: typeof CLOUD_REGISTRATION_CONTRACT;
  ownerUserId: string;
  tenantId: string;
  intentId: string;
  sourceLogicalDeviceId: string;
  targetLogicalDeviceId: string;
  clientNonce: string;
  expectedRoot: {
    kind: typeof ROOT_KIND;
    deviceInstanceId: string;
    accessEpoch: number;
    controllerId: string;
    credentialVersion: number;
    adminFingerprint: string;
    cloudKey: { state: 'absent' };
  };
  state: 'key_issued';
  expiresAt: number;
  targetKey: { credentialVersion: 1; locator: string; issuanceDigest: string; issuedAt: number };
}

export interface CloudRegistrationConfirmation {
  contract: typeof CLOUD_REGISTRATION_CONTRACT;
  clientNonce: string;
  receipt: {
    kind: typeof RECEIPT_KIND;
    authMethod: 2;
    suite: 1;
    sessionBinding: string;
    deviceNonce: string;
    result: 'installed';
    credentialVersion: 1;
    locator: string;
    issuanceDigest: string;
    ackDigest: string;
  };
  confirmationDigest: string;
}

export interface CloudRegistrationCommitRequest extends CloudRegistrationConfirmation {
  ownerUserId: string;
  tenantId: string;
  intentId: string;
  commitId: string;
}

/** Internal authoritative commit port. Any explicit reconciliation must prove
 * the exact commit request, not infer it from an ordinary read or Cloud presence. */
export type ConfirmCloudRegistration = (request: CloudRegistrationCommitRequest, signal: AbortSignal) => Promise<unknown>;

export function cloudRegistrationCommitRequest(intent: IssuedCloudRegistration, commitId: string,
  confirmation: CloudRegistrationConfirmation): CloudRegistrationCommitRequest {
  identifierBytes(commitId, 16);
  return { ...confirmation, receipt: { ...confirmation.receipt }, ownerUserId: intent.ownerUserId,
    tenantId: intent.tenantId, intentId: intent.intentId, commitId };
}

export function assertCloudRegistrationCommitted(intent: IssuedCloudRegistration, value: unknown): void {
  // Validate the existing repository projection, not an App-assembled target.
  const result = value as (Partial<Omit<IssuedCloudRegistration, 'state'>> & {
    state?: unknown; registrationProduct?: unknown; materialOwnerLogicalDeviceId?: unknown; quotaState?: unknown;
    rootBindingId?: unknown; bindingRevision?: unknown; committedAt?: unknown;
    device?: { logicalDeviceId?: unknown; tenantId?: unknown; registrationProduct?: unknown; state?: unknown;
      cloudEnabled?: unknown; credentialVersion?: unknown };
  }) | null;
  const invalid = () => { throw Error('CLOUD_REGISTRATION_COMMIT_MISMATCH'); };
  const root = result?.expectedRoot, target = result?.targetKey, device = result?.device;
  const expectedRoot = rootTuple(intent.expectedRoot);
  if (!result || result.contract !== intent.contract || result.state !== 'committed' || result.quotaState !== 'consumed'
    || result.registrationProduct !== 'cloud' || result.materialOwnerLogicalDeviceId !== intent.sourceLogicalDeviceId
    || result.intentId !== intent.intentId || result.clientNonce !== intent.clientNonce || result.expiresAt !== intent.expiresAt
    || result.sourceLogicalDeviceId !== intent.sourceLogicalDeviceId || result.targetLogicalDeviceId !== intent.targetLogicalDeviceId
    || !root || rootTuple(root).some((part, index) => part !== expectedRoot[index])
    || target?.locator !== intent.targetKey.locator || target.credentialVersion !== intent.targetKey.credentialVersion
    || target.issuanceDigest !== intent.targetKey.issuanceDigest || target.issuedAt !== intent.targetKey.issuedAt
    || !device || device.logicalDeviceId !== intent.targetLogicalDeviceId || device.tenantId !== intent.tenantId
    || device.registrationProduct !== 'cloud' || device.state !== 'active' || device.cloudEnabled !== true
    || device.credentialVersion !== intent.targetKey.credentialVersion
    || typeof result.bindingRevision !== 'number' || !u32(result.bindingRevision)
    || typeof result.committedAt !== 'number' || !Number.isSafeInteger(result.committedAt)
    || result.committedAt < intent.targetKey.issuedAt || typeof result.rootBindingId !== 'string') return invalid();
  try { identifierBytes(result.rootBindingId, 16); } catch { invalid(); }
}

/** One-way explicit PreCloudDirect handoff; not a WiFi credential request. */
export function encodeInitialCloudWifiHandoff(intent: IssuedCloudRegistration): Uint8Array {
  const body = new Uint8Array(36);
  body.set([0x83, 1, 0x50]); body.set(base64UrlDecode(intent.intentId, 16), 3);
  body[19] = 0x50; body.set(base64UrlDecode(intent.targetKey.locator, 16), 20);
  return body;
}

// The account/service port supplies these metadata, never a caller-asserted
// hardware success. Detach everything before opening the authenticated link.
export function snapshotIssuedCloudRegistration(value: IssuedCloudRegistration): IssuedCloudRegistration {
  if (!value || value.contract !== CLOUD_REGISTRATION_CONTRACT || value.state !== 'key_issued') invalid();
  const { ownerUserId, tenantId, intentId, sourceLogicalDeviceId, targetLogicalDeviceId, clientNonce, expiresAt } = value;
  const root = value.expectedRoot, target = value.targetKey;
  for (const id of [ownerUserId, tenantId, sourceLogicalDeviceId, targetLogicalDeviceId]) {
    if (typeof id !== 'string' || !id || id.trim() !== id || id.includes('\0') || id.includes('/')
      || text.encode(id).length > 128) invalid();
  }
  if (sourceLogicalDeviceId === targetLogicalDeviceId || !root || root.kind !== ROOT_KIND || root.cloudKey?.state !== 'absent'
    || !u32(root.accessEpoch) || !u32(root.credentialVersion) || target?.credentialVersion !== 1
    || !Number.isSafeInteger(target.issuedAt) || target.issuedAt < 0
    || !Number.isSafeInteger(expiresAt) || expiresAt <= target.issuedAt || expiresAt - target.issuedAt > 120_000) invalid();
  identifierBytes(intentId, 16); identifierBytes(clientNonce, 16);
  const { deviceInstanceId, accessEpoch, controllerId, credentialVersion, adminFingerprint } = root;
  identifierBytes(deviceInstanceId, 16); identifierBytes(controllerId, 16); identifierBytes(adminFingerprint, 32);
  const { locator, issuanceDigest, issuedAt } = target;
  identifierBytes(locator, 16); identifierBytes(issuanceDigest, 32);
  return { contract: CLOUD_REGISTRATION_CONTRACT, ownerUserId, tenantId, intentId, sourceLogicalDeviceId,
    targetLogicalDeviceId, clientNonce, expiresAt, state: 'key_issued', expectedRoot: { kind: ROOT_KIND, deviceInstanceId,
      accessEpoch, controllerId, credentialVersion, adminFingerprint, cloudKey: { state: 'absent' } },
    targetKey: { credentialVersion: 1, locator, issuanceDigest, issuedAt } };
}

const rootTuple = (root: IssuedCloudRegistration['expectedRoot']) => [root.kind, root.deviceInstanceId,
  root.accessEpoch, root.controllerId, root.credentialVersion, root.adminFingerprint, root.cloudKey?.state];
const scopeTuple = (value: IssuedCloudRegistration) => [value.ownerUserId, value.tenantId, value.intentId,
  value.sourceLogicalDeviceId, value.targetLogicalDeviceId, rootTuple(value.expectedRoot), value.clientNonce,
  value.targetKey.credentialVersion, value.targetKey.locator];

export async function verifyIssuedCloudRegistrationKey(
  crypto: BleDirectCrypto, intent: IssuedCloudRegistration, key: Uint8Array,
): Promise<void> {
  exactNonzero(key, 32);
  const locator = await crypto.sha256(locatorDomain, key);
  try { if (!constantTimeEqual(locator.subarray(0, 16), base64UrlDecode(intent.targetKey.locator, 16))) invalid(); }
  finally { locator.fill(0); }
  const digest = await crypto.sha256(text.encode(JSON.stringify([
    'blinker.access-registration-cloud.issuance.v2', ...scopeTuple(intent),
  ])));
  try { if (!constantTimeEqual(digest, base64UrlDecode(intent.targetKey.issuanceDigest, 32))) invalid(); }
  finally { digest.fill(0); }
}

// Reuse the existing BC-2 HMAC transcript exactly; this is not a new identity
// or an attestation. The only consumer takes context from authenticated M2.
export async function encodeInitialCloudKeyInstall(
  crypto: BleDirectCrypto, intent: IssuedCloudRegistration, context: DirectSecureContext,
  binding: Uint8Array, secret: Uint8Array, key: Uint8Array,
): Promise<Uint8Array> {
  const root = intent.expectedRoot;
  exactNonzero(binding, 16); exactNonzero(secret, 32); exactNonzero(key, 32);
  exactNonzero(context.deviceNonce, 16);
  if (context.domain !== 2 || context.permissions !== 15 || context.accessEpoch !== root.accessEpoch
    || context.credentialVersion !== root.credentialVersion || base64UrlEncode(context.controllerId) !== root.controllerId
    || base64UrlEncode(context.clientNonce) !== intent.clientNonce) invalid();
  const metadata = new Uint8Array(13), view = new DataView(metadata.buffer);
  metadata[0] = context.domain;
  view.setUint32(1, context.accessEpoch, false);
  view.setUint32(5, context.credentialVersion, false);
  view.setUint32(9, context.permissions, false);
  const intentId = base64UrlDecode(intent.intentId, 16);
  const proof = await crypto.hmac(secret, proofDomain, base64UrlDecode(root.deviceInstanceId, 16),
    Uint8Array.of(0, 2, 1), context.controllerId, metadata, context.clientNonce, context.deviceNonce, binding, intentId, key);
  try {
    exactNonzero(proof, 32);
    // Fixed canonical CBOR; avoid intermediate owned copies of Key/proof.
    const body = new Uint8Array(87);
    body.set([0x84, 1, 0x50]); body.set(intentId, 3);
    body.set([0x58, 32], 19); body.set(key, 21);
    body.set([0x58, 32], 53); body.set(proof, 55);
    return body;
  } finally { proof.fill(0); }
}

// This helper must receive the exact body from the purpose-specific secure
// exchange, not from a generic protocol success, cached data or a UI flag.
export async function confirmInitialCloudKeyAck(
  crypto: BleDirectCrypto, intent: IssuedCloudRegistration, binding: Uint8Array,
  deviceNonce: Uint8Array, body: Uint8Array,
): Promise<CloudRegistrationConfirmation> {
  exactNonzero(binding, 16); exactNonzero(deviceNonce, 16);
  if (!(body instanceof Uint8Array) || body.length !== INITIAL_CLOUD_KEY_ACK_SIZE
    || body[0] !== 0x83 || body[1] !== 1 || body[2] !== 0x50 || body[19] !== 0x50
    || !constantTimeEqual(body.subarray(3, 19), base64UrlDecode(intent.intentId, 16))
    || !constantTimeEqual(body.subarray(20), base64UrlDecode(intent.targetKey.locator, 16))) {
    throw Error('CLOUD_REGISTRATION_ACK_INVALID');
  }
  const ackDigest = base64UrlEncode(await crypto.sha256(body));
  const receipt: CloudRegistrationConfirmation['receipt'] = { kind: RECEIPT_KIND, authMethod: 2, suite: 1,
    sessionBinding: base64UrlEncode(binding), deviceNonce: base64UrlEncode(deviceNonce), result: 'installed',
    credentialVersion: 1, locator: intent.targetKey.locator, issuanceDigest: intent.targetKey.issuanceDigest, ackDigest };
  const receiptTuple = [receipt.kind, receipt.authMethod, receipt.suite, receipt.sessionBinding, receipt.deviceNonce,
    receipt.result, receipt.credentialVersion, receipt.locator, receipt.issuanceDigest, receipt.ackDigest];
  const confirmationDigest = base64UrlEncode(await crypto.sha256(text.encode(JSON.stringify([
    'blinker.access-registration-cloud.confirmation.v2', ...scopeTuple(intent), receipt.issuanceDigest, receiptTuple,
  ]))));
  return { contract: CLOUD_REGISTRATION_CONTRACT, clientNonce: intent.clientNonce, receipt, confirmationDigest };
}

function u32(value: number): boolean { return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff; }
function identifierBytes(value: string, size: number): void {
  if (typeof value !== 'string' || value.length !== Math.ceil(size * 8 / 6)) invalid();
  base64UrlDecode(value, size);
}
function exactNonzero(bytes: Uint8Array, size: number): void {
  if (!(bytes instanceof Uint8Array) || bytes.length !== size || !bytes.some(Boolean)) invalid();
}
function invalid(): never { throw Error('CLOUD_REGISTRATION_CONTEXT_INVALID'); }
