import { isLogicalDeviceReferenceId } from '../../protocol/device-v2/logical-device-reference';
import { AccessRegistrationRootContext, accessRegistrationRootJson } from './access-registration-contract';
import { BleDirectCrypto, constantTimeEqual } from './crypto';
import { base64UrlDecode } from './wire';

export interface RegistrationPresenceReference {
  rootBindingId: string;
  bindingRevision: number;
  materialOwnerLogicalDeviceId: string;
  canWritePresence: boolean;
}
export interface RegistrationPresenceBinding extends RegistrationPresenceReference {
  contract: 'access-registration-presence-v1';
  logicalDeviceId: string;
  expectedRoot: AccessRegistrationRootContext;
  keys: Array<{ state: 'current' | 'previous'; accessEpoch: number; version: number; key: string; keyDigest: string }>;
}

export type RegistrationPresenceReadFailure = 'response' | 'envelope' | 'no-store' | 'schema' | 'key-digest' | 'validation';

export class RegistrationPresenceReadError extends Error {
  constructor(readonly reason: RegistrationPresenceReadFailure) {
    super('ACCESS_REGISTRATION_PRESENCE_INVALID');
  }
}

// JSON strings stay bounded to the response/checkpoint boundary; decoded
// buffers are zeroed after digest verification or storage conversion.
export async function validateRegistrationPresenceBinding(value: RegistrationPresenceBinding,
  crypto = new BleDirectCrypto()): Promise<RegistrationPresenceBinding> {
  if (!exact(value, ['contract', 'logicalDeviceId', 'rootBindingId', 'bindingRevision', 'expectedRoot',
    'materialOwnerLogicalDeviceId', 'canWritePresence', 'keys']) || value.contract !== 'access-registration-presence-v1'
    || !u32(value.bindingRevision) || typeof value.canWritePresence !== 'boolean'
    || !Array.isArray(value.keys) || value.keys.length > 2) invalid();
  if (!isLogicalDeviceReferenceId(value.logicalDeviceId) || !isLogicalDeviceReferenceId(value.materialOwnerLogicalDeviceId)) invalid();
  nonzero(value.rootBindingId, 16);
  if (!exact(value.expectedRoot, ['deviceInstanceId', 'accessEpoch', 'controllerId', 'credentialVersion',
    'adminFingerprint', 'cloudCredentialVersion'])) invalid();
  let expectedRoot: AccessRegistrationRootContext;
  try { expectedRoot = accessRegistrationRootJson(value.expectedRoot); } catch { invalid(); }
  if (value.canWritePresence && value.logicalDeviceId !== value.materialOwnerLogicalDeviceId) invalid();
  const context = { contract: value.contract, logicalDeviceId: value.logicalDeviceId, rootBindingId: value.rootBindingId,
    bindingRevision: value.bindingRevision, expectedRoot, materialOwnerLogicalDeviceId: value.materialOwnerLogicalDeviceId,
    canWritePresence: value.canWritePresence };
  const keys = value.keys.map(item => {
    if (!exact(item, ['state', 'accessEpoch', 'version', 'key', 'keyDigest'])
      || !['current', 'previous'].includes(item.state) || !u32(item.version)
      || item.accessEpoch !== expectedRoot.accessEpoch) invalid();
    nonzero(item.key, 16); nonzero(item.keyDigest, 32);
    return { state: item.state, accessEpoch: item.accessEpoch, version: item.version, key: item.key, keyDigest: item.keyDigest };
  });
  if (new Set(keys.map(item => item.state)).size !== keys.length
    || new Set(keys.map(item => item.version)).size !== keys.length
    || new Set(keys.map(item => item.keyDigest)).size !== keys.length) invalid();
  const current = keys.find(item => item.state === 'current'), previous = keys.find(item => item.state === 'previous');
  if (current && previous && previous.version + 1 !== current.version) invalid();
  for (const item of keys) {
    const key = base64UrlDecode(item.key, 16), expected = base64UrlDecode(item.keyDigest, 32);
    let actual: Uint8Array | undefined;
    try {
      actual = await crypto.sha256(key);
      if (!constantTimeEqual(actual, expected)) throw new RegistrationPresenceReadError('key-digest');
    }
    finally { key.fill(0); expected.fill(0); actual?.fill(0); }
  }
  return { ...context, keys };
}
export function registrationPresenceReference(value: RegistrationPresenceReference): RegistrationPresenceReference {
  nonzero(value.rootBindingId, 16);
  if (!isLogicalDeviceReferenceId(value.materialOwnerLogicalDeviceId)) invalid();
  if (!u32(value.bindingRevision) || typeof value.canWritePresence !== 'boolean') invalid();
  return { rootBindingId: value.rootBindingId, bindingRevision: value.bindingRevision,
    materialOwnerLogicalDeviceId: value.materialOwnerLogicalDeviceId, canWritePresence: value.canWritePresence };
}
function exact(value: unknown, keys: string[]): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function u32(value: number): boolean { return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff; }
function nonzero(value: string, size: number): void {
  let decoded: Uint8Array | undefined;
  try { decoded = base64UrlDecode(value, size); if (!decoded.some(Boolean)) invalid(); }
  catch { invalid(); } finally { decoded?.fill(0); }
}
function invalid(): never { throw new RegistrationPresenceReadError('schema'); }
