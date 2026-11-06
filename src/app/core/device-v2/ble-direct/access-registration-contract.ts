import { logicalDevicePeerId } from '../../protocol/device-v2';
import { BleDirectCrypto, DirectSecureContext, directAuthTranscript } from './crypto';
import { base64UrlDecode, base64UrlEncode } from './wire';

export interface AccessRegistrationRootContext {
  deviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  credentialVersion: 1;
  adminFingerprint: string;
  cloudCredentialVersion: number;
}

export interface AccessRegistrationIntent {
  intentId: string;
  sourceLogicalDeviceId: string;
  targetLogicalDeviceId: string;
  registrationProduct: 'ble_direct';
  rootBindingId: string;
  bindingRevision: number;
  expectedRoot: AccessRegistrationRootContext;
  clientNonce: string;
  expiresAt: number;
  state: 'prepared' | 'committed' | 'cancelled' | 'expired' | 'invalidated';
  quotaState: 'reserved' | 'consumed' | 'released';
  replayed: boolean;
  device?: { logicalDeviceId: string; state: string; registrationProduct?: string | null } | null;
}

export interface AccessRegistrationReferencePreparation {
  sourceLogicalDeviceId: string;
  targetLogicalDeviceId: string;
  rootBindingId: string;
  bindingRevision: number;
  intentId: string;
  commitId: Uint8Array;
  expectedRoot: AccessRegistrationRootContext;
}

export interface AccessRegistrationCredentialContext {
  intentId: string;
  sourceLogicalDeviceId: string;
  rootBindingId: string;
  bindingRevision: number;
}

export function validateAccessRegistrationRoot(value: AccessRegistrationRootContext): void {
  if (!value || value.credentialVersion !== 1 || !u32(value.accessEpoch) || !u32(value.cloudCredentialVersion)) invalid();
  nonzero(value.deviceInstanceId, 16); nonzero(value.controllerId, 16); nonzero(value.adminFingerprint, 32);
}

export function accessRegistrationRootTuple(value: AccessRegistrationRootContext): Array<string | number> {
  validateAccessRegistrationRoot(value);
  return [value.deviceInstanceId, value.accessEpoch, value.controllerId, value.credentialVersion,
    value.adminFingerprint, value.cloudCredentialVersion];
}

export function accessRegistrationRootJson(value: AccessRegistrationRootContext): AccessRegistrationRootContext {
  validateAccessRegistrationRoot(value);
  return { deviceInstanceId: value.deviceInstanceId, accessEpoch: value.accessEpoch, controllerId: value.controllerId,
    credentialVersion: value.credentialVersion, adminFingerprint: value.adminFingerprint,
    cloudCredentialVersion: value.cloudCredentialVersion };
}

export function validateAccessRegistrationIntent(value: AccessRegistrationIntent): void {
  if (!value || value.registrationProduct !== 'ble_direct' || !u32(value.bindingRevision)
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0 || typeof value.replayed !== 'boolean'
    || !['prepared', 'committed', 'cancelled', 'expired', 'invalidated'].includes(value.state)
    || !['reserved', 'consumed', 'released'].includes(value.quotaState)) invalid();
  logicalDevicePeerId(value.sourceLogicalDeviceId); logicalDevicePeerId(value.targetLogicalDeviceId);
  if (value.sourceLogicalDeviceId === value.targetLogicalDeviceId) invalid();
  nonzero(value.intentId, 16); nonzero(value.rootBindingId, 16); nonzero(value.clientNonce, 16);
  validateAccessRegistrationRoot(value.expectedRoot);
  if ((value.state === 'prepared' && value.quotaState !== 'reserved')
    || (value.state === 'committed' && value.quotaState !== 'consumed')
    || (['cancelled', 'expired', 'invalidated'].includes(value.state) && value.quotaState !== 'released')) invalid();
  if (value.device && value.device.logicalDeviceId !== value.targetLogicalDeviceId) invalid();
}

// Correlation only: Gateway cannot verify the Admin HMAC from this digest.
export async function accessRegistrationConfirmationDigest(
  crypto: BleDirectCrypto, intent: AccessRegistrationIntent, context: DirectSecureContext,
): Promise<string> {
  validateAccessRegistrationIntent(intent);
  const expected = intent.expectedRoot;
  if (context.domain !== 2 || context.accessEpoch !== expected.accessEpoch
    || context.credentialVersion !== expected.credentialVersion || context.permissions !== 15
    || base64UrlEncode(context.controllerId) !== expected.controllerId
    || base64UrlEncode(context.clientNonce) !== intent.clientNonce) invalid();
  const prefix = ['blinker.access-registration.confirmation.v1', intent.intentId,
    intent.sourceLogicalDeviceId, intent.targetLogicalDeviceId, intent.registrationProduct,
    intent.rootBindingId, intent.bindingRevision,
    accessRegistrationRootTuple(expected), intent.clientNonce];
  const transcript = directAuthTranscript(context);
  let digest: Uint8Array | undefined;
  try {
    digest = await crypto.sha256(transcript);
    const encoded = new TextEncoder().encode(JSON.stringify([...prefix, base64UrlEncode(digest)]));
    return base64UrlEncode(await crypto.sha256(encoded));
  } finally { transcript.fill(0); digest?.fill(0); }
}

function nonzero(value: string, size: number): void {
  try { if (!base64UrlDecode(value, size).some(Boolean)) invalid(); }
  catch { invalid(); }
}
function u32(value: number): boolean { return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff; }
function invalid(): never { throw Error('ACCESS_REGISTRATION_CONTEXT_INVALID'); }
