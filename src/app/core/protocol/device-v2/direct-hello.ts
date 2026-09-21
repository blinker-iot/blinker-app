import { BBP2_FEATURE_TIME_SYNC, CborReader, bytesToHex, encodeCanonicalArray, encodeCanonicalMap, encodeCanonicalUnsigned } from './codec';
import { DeviceV2Manifest } from './types';
import { DIRECT_TIME_MAX_FRAME_BYTES } from './direct-time';

const FEATURE_MANIFEST = 1 << 0;
const FEATURE_ENDPOINT_IDS = 1 << 1;
const FEATURE_AUTHENTICATION = 1 << 5;
const FEATURE_RELIABLE = 1 << 6;
const FEATURE_STATE_REVISION = 1 << 7;
const FEATURE_CONTROLLER_CONTROL = 1 << 9;
const FEATURE_PRESENCE_KEY_CONTROL = 1 << 13;
const REQUIRED_FEATURES = FEATURE_MANIFEST | FEATURE_ENDPOINT_IDS | FEATURE_RELIABLE | FEATURE_STATE_REVISION;
const CONTROLLER_FEATURES = REQUIRED_FEATURES | FEATURE_AUTHENTICATION
  | FEATURE_CONTROLLER_CONTROL | FEATURE_PRESENCE_KEY_CONTROL;

// Transport means the carrier has ALREADY verified its own authorization.
// It is not a fallback for a failed controller Method 2 handshake.
export type DirectHelloSecurity = 'controller' | 'transport';

export interface DeviceDirectHello {
  features: number;
  maxFrameSize: number;
  maxReassemblySize: number;
  reliableWindow: number;
  manifest?: Pick<DeviceV2Manifest, 'revision' | 'fingerprint'>;
}

export function encodeDirectAppHelloBody(security: DirectHelloSecurity, maxFrameSize = 512, timeResponder = false): Uint8Array {
  if (!Number.isInteger(maxFrameSize) || maxFrameSize < 10 || maxFrameSize > 0xffff)
    throw new Error('DIRECT_APP_HELLO_LIMIT_INVALID');
  const fields: Array<[number, Uint8Array]> = [
    [0, encodeCanonicalUnsigned(1)],
    [1, encodeCanonicalArray([encodeCanonicalUnsigned(2)])],
    [2, encodeCanonicalUnsigned((security === 'controller' ? CONTROLLER_FEATURES : REQUIRED_FEATURES)
      | (timeResponder && maxFrameSize >= DIRECT_TIME_MAX_FRAME_BYTES ? BBP2_FEATURE_TIME_SYNC : 0))],
    [3, encodeCanonicalUnsigned(maxFrameSize)],
    [4, encodeCanonicalUnsigned(maxFrameSize)],
  ];
  if (security === 'controller') fields.push([8, encodeCanonicalArray([encodeCanonicalUnsigned(2)])]);
  fields.push([9, encodeCanonicalUnsigned(security === 'controller' ? 4 : 1)]);
  return encodeCanonicalMap(fields);
}

export function decodeDirectDeviceHelloBody(body: Uint8Array, security: DirectHelloSecurity): DeviceDirectHello {
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
    if (key <= previous) throw new Error('DIRECT_HELLO_KEYS_INVALID');
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
    else throw new Error('DIRECT_HELLO_FIELD_UNSUPPORTED');
  }
  reader.finish();
  const knownFeatures = 0x2eff | BBP2_FEATURE_TIME_SYNC;
  if (role !== 0 || !versions?.includes(2) || features === undefined
    || (features & ~knownFeatures) !== 0 || maxFrameSize === undefined
    || maxFrameSize < 10 || maxReassemblySize === undefined
    || maxReassemblySize < maxFrameSize
    || (security === 'controller' && ((features & FEATURE_AUTHENTICATION) === 0 || !methods?.includes(2)))
    || (features & REQUIRED_FEATURES) !== REQUIRED_FEATURES
    || ((features & FEATURE_RELIABLE) !== 0) !== (reliableWindow !== 0)
    || (manifestRevision === undefined) !== (manifestFingerprint === undefined)
    || (manifestFingerprint && manifestFingerprint.length !== 32)) {
    throw new Error('DIRECT_DEVICE_HELLO_INVALID');
  }
  return { features, maxFrameSize, maxReassemblySize, reliableWindow,
    ...(manifestRevision === undefined ? {} : {
      manifest: { revision: manifestRevision, fingerprint: bytesToHex(manifestFingerprint!) },
    }),
  };
}

function readUnsignedArray(reader: CborReader, maximum: number, valueMaximum: number): number[] {
  const size = reader.readArraySize(maximum);
  if (!size) throw new Error('DIRECT_CBOR_ARRAY_INVALID');
  const output: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const value = reader.readUnsigned(valueMaximum);
    if (!value || output.includes(value)) throw new Error('DIRECT_CBOR_ARRAY_INVALID');
    output.push(value);
  }
  return output;
}
