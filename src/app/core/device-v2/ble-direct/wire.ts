import {
  Bbp2Frame,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  CborReader,
  decodeFrame,
  encodeCanonicalArray,
  encodeCanonicalByteString,
  encodeCanonicalMap,
  encodeCanonicalTextString,
  encodeCanonicalUnsigned,
  encodeFrame,
} from '../../protocol/device-v2';
import { concatBytes, constantTimeEqual, NoisePattern } from './crypto';

export const BLINKER_BLE_SERVICE_UUID = '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32';
export const BLINKER_BLE_RECEIVE_UUID = '5f6d0002-3f5b-4e4f-9f4d-626c696e6b32';
export const BLINKER_BLE_TRANSMIT_UUID = '5f6d0003-3f5b-4e4f-9f4d-626c696e6b32';

export enum BleApplicationMode {
  Provisioning = 1,
  Direct = 2,
}

export enum BleModeCapability {
  FragmentedRecords = 1 << 0,
  NoiseNn = 1 << 1,
  EnrollmentV1 = 1 << 2,
  WifiConfigV1 = 1 << 3,
  DirectBbp2 = 1 << 4,
  NoiseNnPsk0 = 1 << 5,
}

export interface BleModeProfile {
  mode: BleApplicationMode;
  wireVersion: number;
  capabilities: number;
  setupSessionLocator: Uint8Array;
}

export function decodeBleModeProfile(value: DataView | Uint8Array): BleModeProfile {
  const bytes = value instanceof Uint8Array
    ? value.slice()
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  if (bytes.length !== 13 || bytes[0] !== 1) throw new Error('BLE_DIRECT_MODE_INVALID');
  const profile: BleModeProfile = {
    mode: bytes[1] as BleApplicationMode,
    wireVersion: bytes[2]!,
    capabilities: bytes[3]! | (bytes[4]! << 8),
    setupSessionLocator: bytes.slice(5),
  };
  const known = 0x3f;
  if ((profile.capabilities & ~known) !== 0) throw new Error('BLE_DIRECT_MODE_UNSUPPORTED');
  const locatorIsZero = !profile.setupSessionLocator.some(byte => byte !== 0);
  if (profile.mode === BleApplicationMode.Provisioning) {
    const noise = profile.capabilities & (
      BleModeCapability.NoiseNn | BleModeCapability.NoiseNnPsk0
    );
    if (profile.wireVersion !== 1 || locatorIsZero
      || (profile.capabilities & BleModeCapability.FragmentedRecords) === 0
      || (profile.capabilities & BleModeCapability.EnrollmentV1) === 0
      || (profile.capabilities & BleModeCapability.DirectBbp2) !== 0
      || (noise !== BleModeCapability.NoiseNn && noise !== BleModeCapability.NoiseNnPsk0)) {
      throw new Error('BLE_DIRECT_PROVISIONING_MODE_INVALID');
    }
  } else if (profile.mode === BleApplicationMode.Direct) {
    if (profile.wireVersion !== 2 || !locatorIsZero
      || profile.capabilities !== (
        BleModeCapability.FragmentedRecords | BleModeCapability.DirectBbp2
      )) {
      throw new Error('BLE_DIRECT_DATA_MODE_INVALID');
    }
  } else {
    throw new Error('BLE_DIRECT_MODE_UNSUPPORTED');
  }
  return profile;
}

export function provisioningNoisePattern(profile: BleModeProfile): NoisePattern {
  if (profile.mode !== BleApplicationMode.Provisioning) {
    throw new Error('BLE_DIRECT_PROVISIONING_MODE_REQUIRED');
  }
  return (profile.capabilities & BleModeCapability.NoiseNnPsk0) !== 0
    ? NoisePattern.NnPsk0
    : NoisePattern.Nn;
}

export function localSecureNoisePrologue(pattern: NoisePattern): Uint8Array {
  return concatBytes(
    new TextEncoder().encode('BLINKER-LOCAL-SETUP-V1'),
    Uint8Array.of(0xb3, 1, pattern),
  );
}

export enum LocalSecureRecordType {
  InitiatorHandshake = 1,
  ResponderHandshake = 2,
  Transport = 3,
}

export function encodeLocalSecureRecord(
  type: LocalSecureRecordType,
  body: Uint8Array,
): Uint8Array {
  if (!body.length || body.length > 1024) throw new Error('BLE_DIRECT_LOCAL_RECORD_INVALID');
  const output = new Uint8Array(4 + body.length);
  output.set([0xb3, 0x10 | type]);
  new DataView(output.buffer).setUint16(2, body.length, false);
  output.set(body, 4);
  return output;
}

export function decodeLocalSecureRecord(
  encoded: Uint8Array,
  expected: LocalSecureRecordType,
): Uint8Array {
  if (encoded.length < 5 || encoded[0] !== 0xb3 || encoded[1] !== (0x10 | expected)) {
    throw new Error('BLE_DIRECT_LOCAL_RECORD_INVALID');
  }
  const size = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength)
    .getUint16(2, false);
  if (!size || size > 1024 || encoded.length !== 4 + size) {
    throw new Error('BLE_DIRECT_LOCAL_RECORD_SIZE');
  }
  return encoded.slice(4);
}

export interface BleEnrollmentHello {
  requestId: number;
  deviceInstanceId: Uint8Array;
  setupSessionId: Uint8Array;
  setupSessionLocator: Uint8Array;
  accessEpoch: number;
  securityProfile: number;
  serverKeyId: number;
  signatureAlgorithm: number;
}

export interface BleEnrollmentGrant {
  grantId: Uint8Array;
  deviceInstanceId: Uint8Array;
  setupSessionId: Uint8Array;
  setupTranscriptHash: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  controllerSecretDigest: Uint8Array;
  controllerPermissions: number;
  securityProfile: number;
  serverKeyId: number;
  signatureAlgorithm: number;
}

export interface ControllerMutationReceipt {
  encoded: Uint8Array;
  operation: number;
  grantId: Uint8Array;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  credentialVersion: number;
  permissions: number;
  secretDigest: Uint8Array;
  proofKind: number;
  proof: Uint8Array;
}

export function encodeBleEnrollmentHelloRequest(requestId = 1): Uint8Array {
  return encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(1)],
    [1, encodeCanonicalUnsigned(1)],
    [2, encodeCanonicalUnsigned(u32(requestId, 'requestId'))],
  ]);
}

export function decodeBleEnrollmentHelloResponse(encoded: Uint8Array): BleEnrollmentHello {
  const reader = new CborReader(encoded);
  exactMap(reader, 10);
  readKey(reader, 0); exactUnsigned(reader, 1, 'enrollment version');
  readKey(reader, 1); exactUnsigned(reader, 2, 'enrollment message type');
  readKey(reader, 2); const requestId = reader.readUnsigned();
  readKey(reader, 3); const deviceInstanceId = exactBytes(reader, 16, 'device instance id');
  readKey(reader, 4); const setupSessionId = exactBytes(reader, 16, 'setup session id');
  readKey(reader, 5); const setupSessionLocator = exactBytes(reader, 8, 'setup session locator');
  readKey(reader, 6); const accessEpoch = reader.readUnsigned();
  readKey(reader, 7); const securityProfile = reader.readUnsigned();
  readKey(reader, 8); const serverKeyId = reader.readUnsigned();
  readKey(reader, 9); const signatureAlgorithm = reader.readUnsigned();
  reader.finish();
  if (requestId !== 1 || !accessEpoch || !serverKeyId
    || (securityProfile !== 1 && securityProfile !== 2)
    || (signatureAlgorithm !== 1 && signatureAlgorithm !== 2)) {
    throw new Error('BLE_DIRECT_HELLO_INVALID');
  }
  return {
    requestId, deviceInstanceId, setupSessionId, setupSessionLocator,
    accessEpoch, securityProfile, serverKeyId, signatureAlgorithm,
  };
}

export function encodeBleEnrollmentRequest(
  grant: Uint8Array,
  controllerSecret: Uint8Array,
  requestId = 2,
): Uint8Array {
  if (!grant.length || grant.length > 270 || !exactNonZero(controllerSecret, 32)) {
    throw new Error('BLE_DIRECT_ENROLLMENT_REQUEST_INVALID');
  }
  return encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(1)],
    [1, encodeCanonicalUnsigned(3)],
    [2, encodeCanonicalUnsigned(u32(requestId, 'requestId'))],
    [3, encodeCanonicalByteString(grant)],
    [4, encodeCanonicalByteString(controllerSecret)],
  ]);
}

export function decodeBleEnrollmentResponse(encoded: Uint8Array): Uint8Array {
  const reader = new CborReader(encoded);
  const size = reader.readMapSize(5);
  readKey(reader, 0); exactUnsigned(reader, 1, 'enrollment version');
  readKey(reader, 1); const type = reader.readUnsigned();
  readKey(reader, 2); const requestId = reader.readUnsigned();
  if (type === 5) {
    if (size !== 5) throw new Error('BLE_DIRECT_ENROLLMENT_ERROR_INVALID');
    readKey(reader, 3); const code = reader.readUnsigned();
    readKey(reader, 4); const retry = reader.readUnsigned();
    reader.finish();
    throw new Error(`BLE_DIRECT_DEVICE_ERROR_${code}_${retry}`);
  }
  if (size !== 4 || type !== 4 || requestId !== 2) {
    throw new Error('BLE_DIRECT_ENROLLMENT_RESPONSE_INVALID');
  }
  readKey(reader, 3);
  const receipt = reader.readBytes(145);
  reader.finish();
  return receipt;
}

export function decodeBleEnrollmentGrant(encoded: Uint8Array): BleEnrollmentGrant {
  if (!encoded.length || encoded.length > 270) throw new Error('BLE_DIRECT_GRANT_INVALID');
  const reader = new CborReader(encoded);
  exactMap(reader, 16);
  readKey(reader, 0); exactUnsigned(reader, 2, 'grant version');
  readKey(reader, 1); const grantId = exactBytes(reader, 16, 'grant id');
  readKey(reader, 2); const deviceInstanceId = exactBytes(reader, 16, 'device instance id');
  readKey(reader, 3); const setupSessionId = exactBytes(reader, 16, 'setup session id');
  readKey(reader, 4); const setupTranscriptHash = exactBytes(reader, 32, 'setup transcript hash');
  readKey(reader, 5); const accessEpoch = reader.readUnsigned();
  readKey(reader, 6); const controllerId = exactBytes(reader, 16, 'controller id');
  readKey(reader, 7); const controllerSecretDigest = exactBytes(reader, 32, 'secret digest');
  readKey(reader, 8); const controllerPermissions = reader.readUnsigned();
  readKey(reader, 9); exactBytes(reader, 16, 'grant nonce');
  readKey(reader, 10); const issuedAt = reader.readUnsigned();
  readKey(reader, 11); const expiresAt = reader.readUnsigned();
  readKey(reader, 12); const securityProfile = reader.readUnsigned();
  readKey(reader, 13); const serverKeyId = reader.readUnsigned();
  readKey(reader, 14); const signatureAlgorithm = reader.readUnsigned();
  readKey(reader, 15); exactBytes(reader, 64, 'grant signature');
  reader.finish();
  if (!accessEpoch || controllerPermissions !== 0x0f || !issuedAt
    || expiresAt <= issuedAt || expiresAt - issuedAt > 900
    || (securityProfile !== 1 && securityProfile !== 2)
    || !serverKeyId || (signatureAlgorithm !== 1 && signatureAlgorithm !== 2)) {
    throw new Error('BLE_DIRECT_GRANT_CONTEXT_INVALID');
  }
  return {
    grantId, deviceInstanceId, setupSessionId, setupTranscriptHash,
    accessEpoch, controllerId, controllerSecretDigest,
    controllerPermissions, securityProfile, serverKeyId, signatureAlgorithm,
  };
}

export function decodeControllerMutationReceipt(encoded: Uint8Array): ControllerMutationReceipt {
  if (!encoded.length || encoded.length > 145) throw new Error('BLE_DIRECT_RECEIPT_INVALID');
  const reader = new CborReader(encoded);
  exactMap(reader, 11);
  readKey(reader, 0); exactUnsigned(reader, 2, 'receipt version');
  readKey(reader, 1); const operation = reader.readUnsigned();
  readKey(reader, 2); const grantId = exactBytes(reader, 16, 'grant id');
  readKey(reader, 3); const deviceInstanceId = exactBytes(reader, 16, 'device instance id');
  readKey(reader, 4); const accessEpoch = reader.readUnsigned();
  readKey(reader, 5); const controllerId = exactBytes(reader, 16, 'controller id');
  readKey(reader, 6); const credentialVersion = reader.readUnsigned();
  readKey(reader, 7); const permissions = reader.readUnsigned();
  readKey(reader, 8); const secretDigest = exactBytes(reader, 32, 'secret digest');
  readKey(reader, 9); const proofKind = reader.readUnsigned();
  readKey(reader, 10); const proof = exactBytes(reader, 32, 'receipt proof');
  reader.finish();
  if (operation !== 1 || !accessEpoch || credentialVersion !== 1
    || permissions !== 0x0f || proofKind !== 1) {
    throw new Error('BLE_DIRECT_RECEIPT_CONTEXT_INVALID');
  }
  return {
    encoded: encoded.slice(), operation, grantId, deviceInstanceId,
    accessEpoch, controllerId, credentialVersion, permissions,
    secretDigest, proofKind, proof,
  };
}

export function encodeControllerReceiptTranscript(receipt: ControllerMutationReceipt): Uint8Array {
  return encodeCanonicalArray([
    encodeCanonicalTextString('blinker.controller-receipt.v2'),
    encodeCanonicalUnsigned(2),
    encodeCanonicalUnsigned(receipt.operation),
    encodeCanonicalByteString(receipt.grantId),
    encodeCanonicalByteString(receipt.deviceInstanceId),
    encodeCanonicalUnsigned(receipt.accessEpoch),
    encodeCanonicalByteString(receipt.controllerId),
    encodeCanonicalUnsigned(receipt.credentialVersion),
    encodeCanonicalUnsigned(receipt.permissions),
    encodeCanonicalByteString(receipt.secretDigest),
    encodeCanonicalUnsigned(receipt.proofKind),
  ]);
}

export function encodeControllerMutationReceipt(
  receipt: Omit<ControllerMutationReceipt, 'encoded'>,
): Uint8Array {
  if (receipt.operation !== 1 || receipt.credentialVersion !== 1
    || receipt.permissions !== 0x0f || receipt.proofKind !== 1
    || !exactNonZero(receipt.grantId, 16)
    || !exactNonZero(receipt.deviceInstanceId, 16)
    || !exactNonZero(receipt.controllerId, 16)
    || !exactNonZero(receipt.secretDigest, 32)
    || !exactNonZero(receipt.proof, 32)) {
    throw new Error('BLE_DIRECT_RECEIPT_CONTEXT_INVALID');
  }
  return encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(2)],
    [1, encodeCanonicalUnsigned(receipt.operation)],
    [2, encodeCanonicalByteString(receipt.grantId)],
    [3, encodeCanonicalByteString(receipt.deviceInstanceId)],
    [4, encodeCanonicalUnsigned(receipt.accessEpoch)],
    [5, encodeCanonicalByteString(receipt.controllerId)],
    [6, encodeCanonicalUnsigned(receipt.credentialVersion)],
    [7, encodeCanonicalUnsigned(receipt.permissions)],
    [8, encodeCanonicalByteString(receipt.secretDigest)],
    [9, encodeCanonicalUnsigned(receipt.proofKind)],
    [10, encodeCanonicalByteString(receipt.proof)],
  ]);
}

const FEATURE_MANIFEST = 1 << 0;
const FEATURE_ENDPOINT_IDS = 1 << 1;
const FEATURE_AUTHENTICATION = 1 << 5;
const FEATURE_RELIABLE = 1 << 6;
const FEATURE_STATE_REVISION = 1 << 7;
const DIRECT_APP_FEATURES = FEATURE_MANIFEST | FEATURE_ENDPOINT_IDS
  | FEATURE_AUTHENTICATION | FEATURE_RELIABLE | FEATURE_STATE_REVISION;

export interface DeviceDirectHello {
  features: number;
  maxFrameSize: number;
  maxReassemblySize: number;
  reliableWindow: number;
}

export function encodeDirectAppHelloBody(maxFrameSize = 512): Uint8Array {
  return encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(1)],
    [1, encodeCanonicalArray([encodeCanonicalUnsigned(2)])],
    [2, encodeCanonicalUnsigned(DIRECT_APP_FEATURES)],
    [3, encodeCanonicalUnsigned(maxFrameSize)],
    [4, encodeCanonicalUnsigned(maxFrameSize)],
    [8, encodeCanonicalArray([encodeCanonicalUnsigned(2)])],
    [9, encodeCanonicalUnsigned(4)],
  ]);
}

export function decodeDirectDeviceHelloBody(body: Uint8Array): DeviceDirectHello {
  const reader = new CborReader(body);
  const count = reader.readMapSize(9);
  let role: number | undefined;
  let versions: number[] | undefined;
  let features: number | undefined;
  let maxFrameSize: number | undefined;
  let maxReassemblySize: number | undefined;
  let manifestRevision: number | undefined;
  let manifestFingerprint: Uint8Array | undefined;
  let methods: number[] | undefined;
  let reliableWindow = 0;
  let previous = -1;
  for (let index = 0; index < count; index += 1) {
    const key = reader.readUnsigned(9);
    if (key <= previous) throw new Error('BLE_DIRECT_HELLO_KEYS_INVALID');
    previous = key;
    if (key === 0) role = reader.readUnsigned(2);
    else if (key === 1) versions = readUnsignedArray(reader, 4, 0xff);
    else if (key === 2) features = reader.readUnsigned();
    else if (key === 3) maxFrameSize = reader.readUnsigned(0xffff);
    else if (key === 4) maxReassemblySize = reader.readUnsigned();
    else if (key === 6) manifestRevision = reader.readUnsigned();
    else if (key === 7) manifestFingerprint = reader.readBytes(32);
    else if (key === 8) methods = readUnsignedArray(reader, 4, 0xffff);
    else if (key === 9) reliableWindow = reader.readUnsigned(16);
    else throw new Error('BLE_DIRECT_HELLO_FIELD_UNSUPPORTED');
  }
  reader.finish();
  const knownFeatures = 0xeff;
  if (role !== 0 || !versions?.includes(2) || features === undefined
    || (features & ~knownFeatures) !== 0 || maxFrameSize === undefined
    || maxFrameSize < 10 || maxReassemblySize === undefined
    || maxReassemblySize < maxFrameSize
    || (features & FEATURE_AUTHENTICATION) === 0 || !methods?.includes(2)
    || ((features & FEATURE_RELIABLE) !== 0) !== (reliableWindow !== 0)
    || (manifestRevision === undefined) !== (manifestFingerprint === undefined)
    || (manifestFingerprint && manifestFingerprint.length !== 32)) {
    throw new Error('BLE_DIRECT_DEVICE_HELLO_INVALID');
  }
  return { features, maxFrameSize, maxReassemblySize, reliableWindow };
}

export function encodeControllerAuthInit(
  controllerId: Uint8Array,
  accessEpoch: number,
  clientNonce: Uint8Array,
): Uint8Array {
  if (!exactNonZero(controllerId, 16) || !exactNonZero(clientNonce, 16)) {
    throw new Error('BLE_DIRECT_AUTH_INIT_INVALID');
  }
  const payload = new Uint8Array(42);
  payload[0] = 1;
  payload.set(controllerId, 1);
  payload[17] = 2;
  const view = new DataView(payload.buffer);
  view.setUint32(18, u32(accessEpoch, 'accessEpoch'), false);
  view.setUint32(22, 1, false);
  payload.set(clientNonce, 26);
  return encodeAuthRequestBody(payload);
}

export function encodeControllerAuthProof(proof: Uint8Array): Uint8Array {
  if (proof.length !== 32) throw new Error('BLE_DIRECT_AUTH_PROOF_INVALID');
  return encodeAuthRequestBody(concatBytes(Uint8Array.of(2), proof));
}

export interface ControllerAuthChallenge {
  deviceNonce: Uint8Array;
  permissions: number;
  deviceProof: Uint8Array;
}

export function decodeControllerAuthChallenge(body: Uint8Array): ControllerAuthChallenge {
  const result = decodeAuthResultBody(body);
  if (result.method !== 2 || result.status !== 0 || !result.payload
    || result.payload.length !== 53 || result.payload[0] !== 0x81) {
    throw new Error('BLE_DIRECT_AUTH_CHALLENGE_INVALID');
  }
  const permissions = new DataView(
    result.payload.buffer, result.payload.byteOffset, result.payload.byteLength,
  ).getUint32(17, false);
  if (!permissions) throw new Error('BLE_DIRECT_AUTH_PERMISSIONS_INVALID');
  return {
    deviceNonce: result.payload.slice(1, 17),
    permissions,
    deviceProof: result.payload.slice(21),
  };
}

export function decodeControllerAuthAuthorized(body: Uint8Array): void {
  const result = decodeAuthResultBody(body);
  if (result.method !== 2 || result.status !== 1 || result.payload) {
    throw new Error('BLE_DIRECT_AUTH_RESULT_INVALID');
  }
}

export function makeBbp2Frame(
  kind: Bbp2MessageKind,
  sequence: number,
  body: Uint8Array,
): Uint8Array {
  return encodeFrame({ kind, flags: 0, sequence, body });
}

export function parseBbp2Response(
  encoded: Uint8Array,
  expectedKind: Bbp2MessageKind,
  expectedSequence: number,
): Bbp2Frame {
  const frame = decodeFrame(encoded);
  if (frame.kind !== expectedKind || frame.sequence !== expectedSequence
    || frame.flags !== Bbp2FrameFlag.IsResponse) {
    throw new Error('BLE_DIRECT_BBP2_RESPONSE_INVALID');
  }
  return frame;
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return constantTimeEqual(left, right);
}

export function base64UrlEncode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string, expectedSize?: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('BLE_DIRECT_BASE64URL_INVALID');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('BLE_DIRECT_BASE64URL_INVALID');
  }
  const output = Uint8Array.from(binary, character => character.charCodeAt(0));
  if ((expectedSize !== undefined && output.length !== expectedSize)
    || base64UrlEncode(output) !== value || !output.some(byte => byte !== 0)) {
    throw new Error('BLE_DIRECT_BASE64URL_INVALID');
  }
  return output;
}

function encodeAuthRequestBody(payload: Uint8Array): Uint8Array {
  return encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(2)],
    [1, encodeCanonicalByteString(payload)],
  ]);
}

function decodeAuthResultBody(body: Uint8Array): {
  method: number;
  status: number;
  payload?: Uint8Array;
} {
  const reader = new CborReader(body);
  const size = reader.readMapSize(3);
  if (size !== 2 && size !== 3) throw new Error('BLE_DIRECT_AUTH_RESULT_INVALID');
  readKey(reader, 0); const method = reader.readUnsigned(0xffff);
  readKey(reader, 1); const status = reader.readUnsigned(3);
  let payload: Uint8Array | undefined;
  if (size === 3) {
    readKey(reader, 2);
    payload = reader.readBytes(256);
    if (!payload.length) throw new Error('BLE_DIRECT_AUTH_RESULT_INVALID');
  }
  reader.finish();
  return { method, status, payload };
}

function exactMap(reader: CborReader, expected: number): void {
  if (reader.readMapSize(expected) !== expected) throw new Error('BLE_DIRECT_CBOR_SHAPE_INVALID');
}

function readKey(reader: CborReader, expected: number): void {
  if (reader.readUnsigned() !== expected) throw new Error('BLE_DIRECT_CBOR_KEYS_INVALID');
}

function exactUnsigned(reader: CborReader, expected: number, name: string): void {
  if (reader.readUnsigned() !== expected) throw new Error(`BLE_DIRECT_${name.toUpperCase().replace(/ /g, '_')}_INVALID`);
}

function exactBytes(reader: CborReader, size: number, name: string): Uint8Array {
  const value = reader.readBytes(size);
  if (!exactNonZero(value, size)) throw new Error(`BLE_DIRECT_${name.toUpperCase().replace(/ /g, '_')}_INVALID`);
  return value;
}

function exactNonZero(value: Uint8Array, size: number): boolean {
  return value.length === size && value.some(byte => byte !== 0);
}

function readUnsignedArray(reader: CborReader, maximum: number, valueMaximum: number): number[] {
  const size = reader.readArraySize(maximum);
  if (!size) throw new Error('BLE_DIRECT_CBOR_ARRAY_INVALID');
  const output: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const value = reader.readUnsigned(valueMaximum);
    if (!value || output.includes(value)) throw new Error('BLE_DIRECT_CBOR_ARRAY_INVALID');
    output.push(value);
  }
  return output;
}

function u32(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffffffff) {
    throw new Error(`BLE_DIRECT_${name.toUpperCase()}_INVALID`);
  }
  return value;
}
