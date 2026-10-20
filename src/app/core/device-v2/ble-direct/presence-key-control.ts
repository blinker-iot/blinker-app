import {
  CborReader,
  encodeCanonicalByteString,
  encodeCanonicalMap,
  encodeCanonicalUnsigned,
} from '../../protocol/device-v2';
import { BleDirectCrypto, constantTimeEqual } from './crypto';

const CONTROL_VERSION = 1;
const RECEIPT_DOMAIN = new TextEncoder()
  .encode('blinker.presence-key-receipt.v1\0');

export interface PresenceKeyMutation {
  accessEpoch: number;
  expectedVersion: number;
  presenceKeyVersion: number;
  presenceKey: Uint8Array;
}

export interface PresenceKeyReceipt {
  encoded: Uint8Array;
  accessEpoch: number;
  expectedVersion: number;
  presenceKeyVersion: number;
  keyDigest: Uint8Array;
  proofKind: 1;
  proof: Uint8Array;
}

export function encodePresenceKeyMutation(value: PresenceKeyMutation): Uint8Array {
  validateVersions(value.accessEpoch, value.expectedVersion, value.presenceKeyVersion);
  exactNonZero(value.presenceKey, 16);
  return encodeCanonicalMap([
    [0, encodeCanonicalUnsigned(CONTROL_VERSION)],
    [1, encodeCanonicalUnsigned(value.accessEpoch)],
    [2, encodeCanonicalUnsigned(value.expectedVersion)],
    [3, encodeCanonicalUnsigned(value.presenceKeyVersion)],
    [4, encodeCanonicalByteString(value.presenceKey)],
  ]);
}

export function decodePresenceKeyReceipt(encoded: Uint8Array): PresenceKeyReceipt {
  if (encoded.length < 1 || encoded.length > 93) {
    throw new Error('BLE_PRESENCE_RECEIPT_INVALID');
  }
  const reader = new CborReader(encoded);
  if (reader.readMapSize(7) !== 7) throw new Error('BLE_PRESENCE_RECEIPT_INVALID');
  readKey(reader, 0);
  if (reader.readUnsigned() !== CONTROL_VERSION) {
    throw new Error('BLE_PRESENCE_RECEIPT_VERSION_UNSUPPORTED');
  }
  readKey(reader, 1); const accessEpoch = reader.readUnsigned();
  readKey(reader, 2); const expectedVersion = reader.readUnsigned();
  readKey(reader, 3); const presenceKeyVersion = reader.readUnsigned();
  readKey(reader, 4); const keyDigest = reader.readBytes(32);
  readKey(reader, 5); const proofKind = reader.readUnsigned();
  readKey(reader, 6); const proof = reader.readBytes(32);
  reader.finish();
  validateVersions(accessEpoch, expectedVersion, presenceKeyVersion);
  exactNonZero(keyDigest, 32);
  exactNonZero(proof, 32);
  if (proofKind !== 1) throw new Error('BLE_PRESENCE_RECEIPT_INVALID');
  return {
    encoded: encoded.slice(),
    accessEpoch,
    expectedVersion,
    presenceKeyVersion,
    keyDigest,
    proofKind,
    proof,
  };
}

export async function verifyPresenceKeyReceipt(
  crypto: BleDirectCrypto,
  presenceKey: Uint8Array,
  receipt: PresenceKeyReceipt,
): Promise<boolean> {
  exactNonZero(presenceKey, 16);
  const digest = await crypto.sha256(presenceKey);
  try {
    if (!constantTimeEqual(digest, receipt.keyDigest)) return false;
    const metadata = new Uint8Array(12);
    const view = new DataView(metadata.buffer);
    view.setUint32(0, receipt.accessEpoch, false);
    view.setUint32(4, receipt.expectedVersion, false);
    view.setUint32(8, receipt.presenceKeyVersion, false);
    const proof = await crypto.hmac(
      presenceKey, RECEIPT_DOMAIN, metadata, receipt.keyDigest,
    );
    try {
      return constantTimeEqual(proof, receipt.proof);
    } finally {
      proof.fill(0);
      metadata.fill(0);
    }
  } finally {
    digest.fill(0);
  }
}

function readKey(reader: CborReader, expected: number): void {
  if (reader.readUnsigned(6) !== expected) throw new Error('BLE_PRESENCE_RECEIPT_INVALID');
}

function validateVersions(
  accessEpoch: number,
  expectedVersion: number,
  presenceKeyVersion: number,
): void {
  if (!u32(accessEpoch, false) || !u32(expectedVersion, true)
    || !u32(presenceKeyVersion, false) || expectedVersion === 0xffff_ffff
    || presenceKeyVersion !== expectedVersion + 1) {
    throw new Error('BLE_PRESENCE_VERSION_INVALID');
  }
}

function u32(value: number, allowZero: boolean): boolean {
  return Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1)
    && value <= 0xffff_ffff;
}

function exactNonZero(value: Uint8Array, size: number): void {
  if (!(value instanceof Uint8Array) || value.length !== size
    || !value.some(byte => byte !== 0)) {
    throw new Error('BLE_PRESENCE_BYTES_INVALID');
  }
}
