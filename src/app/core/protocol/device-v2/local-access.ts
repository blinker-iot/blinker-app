import { CborReader } from './codec';

export const LOCAL_ACCESS_PROFILE = 1;
export const LOCAL_ACCESS_PLAIN_PROFILE = 2;
export const LOCAL_ACCESS_RESPONSE_WINDOW_MS = 15000;
export const LOCAL_ACCESS_MAX_LIFETIME_MS = 300000;
export enum LocalAccessTarget { Self = 1, Child = 2 }
export enum LocalAccessPermission { Observe = 1, Control = 2 }

export interface LocalAccessChallenge {
  version: number;
  recipientDeviceInstanceId: Uint8Array;
  deviceKeyVersion: number;
  receiverSessionId: Uint8Array;
  challenge: Uint8Array;
  authorityRevision: number;
  responseWindowMillis: number;
  maximumLifetimeMillis: number;
  securityProfile: number;
}

export interface LocalAccessGrant {
  version: number;
  grantId: Uint8Array;
  authorizationId: Uint8Array;
  recipientDeviceInstanceId: Uint8Array;
  deviceKeyVersion: number;
  receiverSessionId: Uint8Array;
  challenge: Uint8Array;
  callerSessionId: Uint8Array;
  authorityRevision: number;
  targetKind: LocalAccessTarget;
  targetLogicalDeviceId: string;
  targetDeviceInstanceId: Uint8Array;
  accessEpoch: number;
  topologyVersion: number;
  permissions: number;
  lifetimeMillis: number;
  securityProfile: number;
  authenticator: Uint8Array;
}

export function sameLocalAccessBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

export function isLocalAccessIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7e]{1,64}$/.test(value) && !/[/\\#+]/.test(value);
}

function exact(r: CborReader, length: number): Uint8Array {
  const value = r.readBytes(length);
  if (value.length !== length || !value.some(byte => byte !== 0)) throw new Error('LOCAL_ACCESS_BYTES_INVALID');
  return value;
}

function reader(input: Uint8Array, maximum: number, count: number, kind: number): CborReader {
  if (!(input instanceof Uint8Array) || input.length > maximum) throw new Error('LOCAL_ACCESS_SIZE_INVALID');
  const r = new CborReader(input);
  if (r.readArraySize() !== count || r.readUnsigned() !== 1 || r.readUnsigned() !== kind) {
    throw new Error('LOCAL_ACCESS_ENVELOPE_INVALID');
  }
  return r;
}

export function decodeLocalAccessChallenge(input: Uint8Array): LocalAccessChallenge {
  const r = reader(input, 96, 10, 1);
  const value: LocalAccessChallenge = { version: 1, recipientDeviceInstanceId: exact(r, 16),
    deviceKeyVersion: r.readUnsigned(), receiverSessionId: exact(r, 16), challenge: exact(r, 16),
    authorityRevision: r.readUnsigned(), responseWindowMillis: r.readUnsigned(),
    maximumLifetimeMillis: r.readUnsigned(), securityProfile: r.readUnsigned() };
  r.finish();
  if (!value.deviceKeyVersion || !value.authorityRevision || ![LOCAL_ACCESS_PROFILE, LOCAL_ACCESS_PLAIN_PROFILE].includes(value.securityProfile)
    || value.responseWindowMillis !== LOCAL_ACCESS_RESPONSE_WINDOW_MS
    || value.maximumLifetimeMillis !== LOCAL_ACCESS_MAX_LIFETIME_MS) throw new Error('LOCAL_ACCESS_CHALLENGE_INVALID');
  return value;
}

export function decodeLocalAccessGrant(input: Uint8Array): LocalAccessGrant {
  const r = reader(input, 272, 19, 2);
  const value: LocalAccessGrant = { version: 1, grantId: exact(r, 16), authorizationId: exact(r, 16),
    recipientDeviceInstanceId: exact(r, 16), deviceKeyVersion: r.readUnsigned(), receiverSessionId: exact(r, 16),
    challenge: exact(r, 16), callerSessionId: exact(r, 16), authorityRevision: r.readUnsigned(),
    targetKind: r.readUnsigned(), targetLogicalDeviceId: r.readText(64, true), targetDeviceInstanceId: exact(r, 16),
    accessEpoch: r.readUnsigned(), topologyVersion: r.readUnsigned(), permissions: r.readUnsigned(),
    lifetimeMillis: r.readUnsigned(), securityProfile: r.readUnsigned(), authenticator: exact(r, 32) };
  r.finish();
  if (!value.deviceKeyVersion || !value.authorityRevision || ![LOCAL_ACCESS_PROFILE, LOCAL_ACCESS_PLAIN_PROFILE].includes(value.securityProfile)
    || value.permissions < 1 || value.permissions > 3 || value.lifetimeMillis < 1000
    || value.lifetimeMillis > LOCAL_ACCESS_MAX_LIFETIME_MS) throw new Error('LOCAL_ACCESS_GRANT_INVALID');
  if (value.targetKind === LocalAccessTarget.Self) {
    if (value.targetLogicalDeviceId !== '' || value.accessEpoch !== 0 || value.topologyVersion !== 0
      || !sameLocalAccessBytes(value.targetDeviceInstanceId, value.recipientDeviceInstanceId)) {
      throw new Error('LOCAL_ACCESS_SELF_INVALID');
    }
  } else if (value.targetKind !== LocalAccessTarget.Child || !value.accessEpoch || !value.topologyVersion
    || !isLocalAccessIdentifier(value.targetLogicalDeviceId)) throw new Error('LOCAL_ACCESS_CHILD_INVALID');
  return value;
}

export function localAccessNoisePrologue(): Uint8Array {
  return new Uint8Array([...new TextEncoder().encode('BLINKER-LAN-ACCESS-V1'), 0xb3, 1, 2]);
}

export function encodeLocalAccessPlainProof(kind: number, proof: Uint8Array): Uint8Array {
  if ((kind !== 8 && kind !== 9) || !(proof instanceof Uint8Array) || proof.length !== 32)
    throw new Error('LOCAL_ACCESS_PLAIN_PROOF_INVALID');
  return new Uint8Array([0x83, 1, kind, 0x58, 32, ...proof]);
}

export function decodeLocalAccessPlainProof(input: Uint8Array, expectedKind: number): Uint8Array {
  if ((expectedKind !== 8 && expectedKind !== 9) || input?.length !== 37)
    throw new Error('LOCAL_ACCESS_PLAIN_PROOF_INVALID');
  const r = reader(input, 37, 3, expectedKind), proof = r.readBytes(32);
  r.finish();
  if (proof.length !== 32) throw new Error('LOCAL_ACCESS_PLAIN_PROOF_INVALID');
  return proof;
}

// Inject only HMAC: the Plain protocol does not import a BLE/Noise client or
// create another crypto implementation. No business-message MAC is implied.
export async function computeLocalAccessPlainProof(
  crypto: { hmac(key: Uint8Array, ...parts: Uint8Array[]): Promise<Uint8Array> },
  key: Uint8Array, grantAuthenticator: Uint8Array, kind: number,
): Promise<Uint8Array> {
  if (!(key instanceof Uint8Array) || key.length !== 32 || !key.some(byte => byte !== 0)
    || !(grantAuthenticator instanceof Uint8Array) || grantAuthenticator.length !== 32
    || !grantAuthenticator.some(byte => byte !== 0) || (kind !== 8 && kind !== 9))
    throw new Error('LOCAL_ACCESS_PLAIN_PROOF_INVALID');
  const domain = kind === 8 ? 'BLINKER-LAN-PLAIN-CALLER/1' : 'BLINKER-LAN-PLAIN-RECIPIENT/1';
  return crypto.hmac(key, new TextEncoder().encode(domain), grantAuthenticator);
}
