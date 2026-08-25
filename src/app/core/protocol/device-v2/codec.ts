import {
  BBP2_FINGERPRINT_BYTES,
  BBP2_HEADER_BYTES,
  BBP2_MAX_FRAME_BYTES,
  BBP2_MAX_MANIFEST_FIELDS,
  BBP2_MAX_PAGE_VALUES,
  BBP2_MAX_TELEMETRY_FIELDS,
  BBP2_ROUTE_IDENTITY_BYTES,
  BBP2_TELEMETRY_MAXIMUM_INTERVAL_MS,
  BBP2_TELEMETRY_MAXIMUM_LEASE_MS,
  BBP2_TELEMETRY_MINIMUM_INTERVAL_MS,
  BBP2_TELEMETRY_MINIMUM_LEASE_MS,
  Bbp2Delivery,
  Bbp2Frame,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  Bbp2RoutePeerKind,
  Bbp2ServerHello,
  DeviceV2Ack,
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2ErrorBody,
  DeviceV2EventBody,
  DeviceV2ManifestField,
  DeviceV2ManifestPage,
  DeviceV2Patch,
  DeviceV2StatePage,
  DeviceV2TelemetryControl,
  DeviceV2TelemetryData,
  DeviceV2TelemetryOperation,
  DeviceV2TelemetryStatus,
  DeviceV2TelemetryStatusCode,
  DeviceV2Value,
  DeviceV2ValueType,
} from './types';

const MAGIC_0 = 0x42;
const MAGIC_1 = 0x4b;
const VERSION = 2;
const MAX_TEXT_BYTES = 256;
const MAX_BYTES = 4096;
const MAX_ITEMS = 32;
const MAX_DEPTH = 6;
const MAX_HELLO_VERSIONS = 4;
const MAX_RELIABLE_RECEIVE_WINDOW = 16;
const KNOWN_FEATURES = 0xeff;
const FEATURE_MANIFEST = 1 << 0;
const FEATURE_ENDPOINT_IDS = 1 << 1;
const FEATURE_RELIABLE_DELIVERY = 1 << 6;
const FEATURE_STATE_REVISION = 1 << 7;
const FEATURE_ROUTING = 1 << 10;
const FEATURE_TELEMETRY = 1 << 11;
export const APP_FEATURES = FEATURE_MANIFEST | FEATURE_ENDPOINT_IDS
  | FEATURE_RELIABLE_DELIVERY | FEATURE_STATE_REVISION | FEATURE_ROUTING | FEATURE_TELEMETRY;
const MESSAGE_KINDS = new Set<number>(Object.values(Bbp2MessageKind)
  .filter((value): value is number => typeof value === 'number'));
const ROUTED_KINDS = new Set<number>([
  Bbp2MessageKind.ManifestRequest,
  Bbp2MessageKind.Manifest,
  Bbp2MessageKind.ManifestAccept,
  Bbp2MessageKind.StateRequest,
  Bbp2MessageKind.Patch,
  Bbp2MessageKind.Command,
  Bbp2MessageKind.Event,
  Bbp2MessageKind.Ack,
  Bbp2MessageKind.Error,
  Bbp2MessageKind.StatePage,
  Bbp2MessageKind.TelemetryControl,
  Bbp2MessageKind.TelemetryStatus,
  Bbp2MessageKind.TelemetryData,
]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function concat(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function copy(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function encodeHead(major: number, input: number | bigint): Uint8Array {
  const value = typeof input === 'bigint' ? input : BigInt(input);
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error('CBOR value is out of range');
  if (value < 24n) return Uint8Array.of((major << 5) | Number(value));
  if (value <= 0xffn) return Uint8Array.of((major << 5) | 24, Number(value));
  if (value <= 0xffffn) {
    const output = new Uint8Array(3);
    output[0] = (major << 5) | 25;
    new DataView(output.buffer).setUint16(1, Number(value));
    return output;
  }
  if (value <= 0xffffffffn) {
    const output = new Uint8Array(5);
    output[0] = (major << 5) | 26;
    new DataView(output.buffer).setUint32(1, Number(value));
    return output;
  }
  const output = new Uint8Array(9);
  output[0] = (major << 5) | 27;
  new DataView(output.buffer).setBigUint64(1, value);
  return output;
}

function encodeUnsigned(value: number | bigint): Uint8Array {
  return encodeHead(0, value);
}

function encodeInteger(value: number | bigint): Uint8Array {
  const integer = typeof value === 'bigint' ? value : BigInt(value);
  return integer >= 0n ? encodeHead(0, integer) : encodeHead(1, -integer - 1n);
}

function encodeBytes(value: Uint8Array): Uint8Array {
  if (value.length > MAX_BYTES) throw new Error('CBOR bytes exceed the limit');
  return concat(encodeHead(2, value.length), value);
}

function encodeText(value: string, maximum = MAX_TEXT_BYTES): Uint8Array {
  if (!value || value.includes('\0')) throw new Error('CBOR text is invalid');
  const encoded = textEncoder.encode(value);
  if (encoded.length > maximum) throw new Error('CBOR text exceeds the limit');
  return concat(encodeHead(3, encoded.length), encoded);
}

function encodeUnsignedMap(entries: Array<[number, Uint8Array]>): Uint8Array {
  if (entries.length > MAX_ITEMS) throw new Error('CBOR map exceeds the item limit');
  let previous = -1;
  const encoded: Uint8Array[] = [encodeHead(5, entries.length)];
  for (const [key, value] of entries) {
    if (key <= previous) throw new Error('CBOR map keys are not canonical');
    previous = key;
    encoded.push(encodeUnsigned(key), value);
  }
  return concat(...encoded);
}

export class CborReader {
  private offset = 0;

  constructor(private readonly input: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  get finished(): boolean {
    return this.offset === this.input.length;
  }

  finish(): void {
    if (!this.finished) throw new Error('trailing canonical CBOR data');
  }

  private byte(): number {
    if (this.offset >= this.input.length) throw new Error('truncated canonical CBOR');
    return this.input[this.offset++]!;
  }

  private argument(additional: number, major: number): bigint {
    if (additional < 24) return BigInt(additional);
    if (additional < 24 || additional > 27) throw new Error('unsupported canonical CBOR');
    const byteLength = 1 << (additional - 24);
    if (this.offset + byteLength > this.input.length) throw new Error('truncated canonical CBOR');
    let value = 0n;
    for (let index = 0; index < byteLength; index += 1) {
      value = (value << 8n) | BigInt(this.input[this.offset + index]!);
    }
    this.offset += byteLength;
    if (major !== 7 && ((additional === 24 && value < 24n)
      || (additional === 25 && value <= 0xffn)
      || (additional === 26 && value <= 0xffffn)
      || (additional === 27 && value <= 0xffffffffn))) {
      throw new Error('non-canonical CBOR argument');
    }
    return value;
  }

  private head(expectedMajor?: number): { major: number; additional: number; value: bigint } {
    const initial = this.byte();
    const major = initial >> 5;
    const additional = initial & 0x1f;
    if (additional === 31 || additional > 27
      || (expectedMajor !== undefined && major !== expectedMajor)) {
      throw new Error('unsupported canonical CBOR type');
    }
    return { major, additional, value: this.argument(additional, major) };
  }

  readUnsigned(maximum = 0xffffffff): number {
    const value = this.head(0).value;
    if (value > BigInt(maximum)) throw new Error('CBOR unsigned value is out of range');
    return Number(value);
  }

  readInteger(signed: boolean): number | bigint {
    const head = this.head();
    if (head.major !== 0 && (head.major !== 1 || !signed)) {
      throw new Error('CBOR integer has the wrong sign');
    }
    const value = head.major === 0 ? head.value : -head.value - 1n;
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value;
  }

  readMapSize(maximum = MAX_ITEMS): number {
    const value = this.head(5).value;
    if (value > BigInt(maximum)) throw new Error('CBOR map exceeds the item limit');
    return Number(value);
  }

  readArraySize(maximum = MAX_ITEMS): number {
    const value = this.head(4).value;
    if (value > BigInt(maximum)) throw new Error('CBOR array exceeds the item limit');
    return Number(value);
  }

  readBytes(maximum = MAX_BYTES): Uint8Array {
    const size = this.head(2).value;
    if (size > BigInt(maximum) || size > BigInt(this.input.length - this.offset)) {
      throw new Error('CBOR byte string is invalid');
    }
    const value = copy(this.input.subarray(this.offset, this.offset + Number(size)));
    this.offset += Number(size);
    return value;
  }

  readText(maximum = MAX_TEXT_BYTES, allowEmpty = false): string {
    const bytes = this.readTextBytes(maximum, allowEmpty);
    try {
      const value = textDecoder.decode(bytes);
      if (value.includes('\0')) throw new Error('CBOR text contains NUL');
      return value;
    } catch {
      throw new Error('CBOR text is not valid UTF-8');
    }
  }

  private readTextBytes(maximum: number, allowEmpty: boolean): Uint8Array {
    const size = this.head(3).value;
    if ((!allowEmpty && size === 0n) || size > BigInt(maximum)
      || size > BigInt(this.input.length - this.offset)) {
      throw new Error('CBOR text is invalid');
    }
    const value = this.input.subarray(this.offset, this.offset + Number(size));
    this.offset += Number(size);
    return value;
  }

  readFloat(expected: DeviceV2ValueType.Float32 | DeviceV2ValueType.Float64): number {
    const start = this.offset;
    const initial = this.byte();
    let value: number;
    if (initial === 0xfa) {
      if (this.offset + 4 > this.input.length) throw new Error('truncated CBOR float32');
      value = new DataView(
        this.input.buffer,
        this.input.byteOffset + this.offset,
        4,
      ).getFloat32(0);
      this.offset += 4;
    } else if (initial === 0xfb && expected === DeviceV2ValueType.Float64) {
      if (this.offset + 8 > this.input.length) throw new Error('truncated CBOR float64');
      value = new DataView(
        this.input.buffer,
        this.input.byteOffset + this.offset,
        8,
      ).getFloat64(0);
      this.offset += 8;
    } else {
      this.offset = start;
      throw new Error('CBOR float has the wrong encoding');
    }
    if (!Number.isFinite(value)) throw new Error('CBOR float is not finite');
    return value;
  }

  readFloat64(): number {
    const start = this.offset;
    const initial = this.byte();
    if (initial !== 0xfb || this.offset + 8 > this.input.length) {
      this.offset = start;
      throw new Error('manifest constraint must be float64');
    }
    const value = new DataView(
      this.input.buffer,
      this.input.byteOffset + this.offset,
      8,
    ).getFloat64(0);
    this.offset += 8;
    if (!Number.isFinite(value)) throw new Error('manifest constraint is not finite');
    return value;
  }

  readBool(): boolean {
    const value = this.byte();
    if (value !== 0xf4 && value !== 0xf5) throw new Error('CBOR value is not boolean');
    return value === 0xf5;
  }

  readNull(): null {
    if (this.byte() !== 0xf6) throw new Error('CBOR value is not null');
    return null;
  }

  readEncodedValue(): Uint8Array {
    const start = this.offset;
    this.skip(0);
    return copy(this.input.subarray(start, this.offset));
  }

  private skip(depth: number): void {
    if (depth > MAX_DEPTH) throw new Error('CBOR nesting exceeds the depth limit');
    const head = this.head();
    if (head.major === 0 || head.major === 1) return;
    if (head.major === 2 || head.major === 3) {
      const maximum = head.major === 2 ? MAX_BYTES : MAX_TEXT_BYTES;
      if (head.value > BigInt(maximum) || head.value > BigInt(this.input.length - this.offset)) {
        throw new Error('CBOR string exceeds the limit');
      }
      if (head.major === 3) {
        const bytes = this.input.subarray(this.offset, this.offset + Number(head.value));
        try {
          if (textDecoder.decode(bytes).includes('\0')) throw new Error();
        } catch {
          throw new Error('CBOR text is not valid UTF-8');
        }
      }
      this.offset += Number(head.value);
      return;
    }
    if (head.major === 4 || head.major === 5) {
      if (head.value > BigInt(MAX_ITEMS)) throw new Error('CBOR container exceeds the item limit');
      const count = Number(head.value) * (head.major === 5 ? 2 : 1);
      for (let index = 0; index < count; index += 1) this.skip(depth + 1);
      return;
    }
    if (head.major !== 7) throw new Error('unsupported CBOR type');
    if (head.additional === 20 || head.additional === 21 || head.additional === 22) return;
    if (head.additional === 26) {
      const value = new DataView(new Uint8Array([
        Number((head.value >> 24n) & 0xffn),
        Number((head.value >> 16n) & 0xffn),
        Number((head.value >> 8n) & 0xffn),
        Number(head.value & 0xffn),
      ]).buffer).getFloat32(0);
      if (!Number.isFinite(value)) throw new Error('CBOR float is not finite');
      return;
    }
    if (head.additional === 27) {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setBigUint64(0, head.value);
      if (!Number.isFinite(new DataView(bytes.buffer).getFloat64(0))) {
        throw new Error('CBOR float is not finite');
      }
      return;
    }
    throw new Error('unsupported CBOR simple value');
  }
}

export function encodeCanonicalUnsigned(value: number | bigint): Uint8Array {
  return encodeUnsigned(value);
}

export function encodeCanonicalByteString(value: Uint8Array): Uint8Array {
  return encodeBytes(value);
}

export function encodeCanonicalTextString(value: string): Uint8Array {
  return encodeText(value);
}

export function encodeCanonicalArray(values: Uint8Array[]): Uint8Array {
  if (values.length > MAX_ITEMS) throw new Error('CBOR array exceeds the item limit');
  return concat(encodeHead(4, values.length), ...values);
}

export function encodeCanonicalMap(
  entries: Array<[number, Uint8Array]>,
): Uint8Array {
  return encodeUnsignedMap(entries);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) throw new Error('hex string is invalid');
  return Uint8Array.from(value.match(/../g)!, pair => Number.parseInt(pair, 16));
}

export function logicalDevicePeerId(logicalDeviceId: string): Uint8Array {
  const match = /^device_([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/.exec(
    logicalDeviceId,
  );
  if (match) return hexToBytes(match.slice(1).join(''));
  const direct = /^ble_([A-Za-z0-9_-]{22})$/.exec(logicalDeviceId);
  if (direct) {
    const encoded = direct[1].replace(/-/g, '+').replace(/_/g, '/') + '==';
    try {
      const peerId = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
      if (peerId.length === BBP2_ROUTE_IDENTITY_BYTES
        && peerId.some(byte => byte !== 0)
        && base64Url(peerId) === direct[1]) return peerId;
    } catch {
      // Fall through to the single public validation error below.
    }
  }
  throw new Error('logical device identity is invalid');
}

export function isLogicalDeviceId(logicalDeviceId: string): boolean {
  try {
    logicalDevicePeerId(logicalDeviceId);
    return true;
  } catch {
    return false;
  }
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function peerIdToLogicalDevice(peerId: Uint8Array): string {
  if (peerId.length !== BBP2_ROUTE_IDENTITY_BYTES || !peerId.some(byte => byte !== 0)) {
    throw new Error('logical device peer identity is invalid');
  }
  const hex = bytesToHex(peerId);
  return `device_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function encodeFrame(frame: Bbp2Frame): Uint8Array {
  if (!MESSAGE_KINDS.has(frame.kind)
    || (frame.flags & ~0x07) !== 0
    || !Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence > 0xffff
    || BBP2_HEADER_BYTES + frame.body.length > BBP2_MAX_FRAME_BYTES) {
    throw new Error('BBP/2 frame metadata is invalid');
  }
  const output = new Uint8Array(BBP2_HEADER_BYTES + frame.body.length);
  output.set([MAGIC_0, MAGIC_1, VERSION, frame.kind, frame.flags, BBP2_HEADER_BYTES]);
  const view = new DataView(output.buffer);
  view.setUint16(6, frame.sequence);
  view.setUint16(8, frame.body.length);
  output.set(frame.body, BBP2_HEADER_BYTES);
  return output;
}

export function decodeFrame(payload: Uint8Array): Bbp2Frame {
  if (payload.length < BBP2_HEADER_BYTES || payload.length > BBP2_MAX_FRAME_BYTES
    || payload[0] !== MAGIC_0 || payload[1] !== MAGIC_1 || payload[2] !== VERSION
    || payload[5]! < BBP2_HEADER_BYTES) {
    throw new Error('BBP/2 frame header is invalid');
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const flags = payload[4]!;
  const headerLength = payload[5]!;
  const bodyLength = view.getUint16(8);
  if (!MESSAGE_KINDS.has(payload[3]!) || (flags & ~0x07) !== 0
    || payload.length !== headerLength + bodyLength) {
    throw new Error('BBP/2 frame length or flags are invalid');
  }
  return {
    kind: payload[3]! as Bbp2MessageKind,
    flags,
    sequence: view.getUint16(6),
    body: copy(payload.subarray(headerLength)),
  };
}

export function encodeAppHelloBody(maxFrameSize = 512, reliableWindow = 4): Uint8Array {
  if (!Number.isInteger(maxFrameSize) || maxFrameSize < BBP2_HEADER_BYTES || maxFrameSize > 0xffff
    || !Number.isInteger(reliableWindow) || reliableWindow < 1 || reliableWindow > 16) {
    throw new Error('App HELLO limits are invalid');
  }
  return encodeUnsignedMap([
    [0, encodeUnsigned(1)],
    [1, concat(encodeHead(4, 1), encodeUnsigned(2))],
    [2, encodeUnsigned(APP_FEATURES)],
    [3, encodeUnsigned(maxFrameSize)],
    [4, encodeUnsigned(maxFrameSize)],
    [9, encodeUnsigned(reliableWindow)],
  ]);
}

export function decodeServerHelloBody(body: Uint8Array): Bbp2ServerHello {
  const reader = new CborReader(body);
  const count = reader.readMapSize(6);
  let previous = -1;
  let role: number | undefined;
  let versions: number[] | undefined;
  let features: number | undefined;
  let maxFrameSize: number | undefined;
  let maxReassemblySize: number | undefined;
  let reliableReceiveWindow: number | undefined;

  for (let field = 0; field < count; field += 1) {
    const key = reader.readUnsigned(9);
    if (key <= previous) throw new Error('Server HELLO keys are not canonical');
    previous = key;
    if (key === 0) role = reader.readUnsigned(2);
    else if (key === 1) {
      const versionCount = reader.readArraySize(MAX_HELLO_VERSIONS);
      if (versionCount === 0) throw new Error('Server HELLO versions are empty');
      versions = [];
      for (let index = 0; index < versionCount; index += 1) {
        const version = reader.readUnsigned(0xff);
        if (version === 0 || versions.includes(version)) {
          throw new Error('Server HELLO versions are invalid');
        }
        versions.push(version);
      }
    } else if (key === 2) features = reader.readUnsigned();
    else if (key === 3) maxFrameSize = reader.readUnsigned(0xffff);
    else if (key === 4) maxReassemblySize = reader.readUnsigned();
    else if (key === 9) {
      reliableReceiveWindow = reader.readUnsigned(MAX_RELIABLE_RECEIVE_WINDOW);
    } else {
      throw new Error(`unsupported Server HELLO field ${key}`);
    }
  }

  if (!reader.finished || role !== 2 || !versions?.includes(VERSION)
    || features === undefined || maxFrameSize === undefined || maxReassemblySize === undefined
    || (features & ~KNOWN_FEATURES) !== 0 || (features & APP_FEATURES) !== APP_FEATURES
    || maxFrameSize < BBP2_HEADER_BYTES || maxReassemblySize < maxFrameSize
    || reliableReceiveWindow === undefined || reliableReceiveWindow === 0) {
    throw new Error('Server HELLO negotiation is invalid');
  }
  if ((features & FEATURE_TELEMETRY) !== 0
    && (features & (FEATURE_MANIFEST | FEATURE_ENDPOINT_IDS))
      !== (FEATURE_MANIFEST | FEATURE_ENDPOINT_IDS)) {
    throw new Error('Server HELLO telemetry dependencies are invalid');
  }
  return {
    role: 2,
    versions,
    features,
    maxFrameSize,
    maxReassemblySize,
    reliableReceiveWindow,
  };
}

export function encodeManifestRequestBody(cursor: number): Uint8Array {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0xffff) {
    throw new Error('manifest cursor is invalid');
  }
  return encodeUnsignedMap([[0, encodeUnsigned(cursor)]]);
}

export function encodeManifestAcceptBody(revision: number, fingerprint: Uint8Array): Uint8Array {
  if (!Number.isInteger(revision) || revision < 0 || revision > 0xffffffff
    || fingerprint.length !== BBP2_FINGERPRINT_BYTES) {
    throw new Error('manifest acceptance is invalid');
  }
  return encodeUnsignedMap([
    [0, encodeUnsigned(revision)],
    [1, encodeBytes(fingerprint)],
  ]);
}

export function encodeStateRequestBody(cursor: number, observedRevision?: number): Uint8Array {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0xffff
    || (cursor === 0) === (observedRevision !== undefined)
    || (observedRevision !== undefined && (!Number.isInteger(observedRevision)
      || observedRevision < 0 || observedRevision > 0xffffffff))) {
    throw new Error('state request is invalid');
  }
  const entries: Array<[number, Uint8Array]> = [[0, encodeUnsigned(cursor)]];
  if (observedRevision !== undefined) entries.push([1, encodeUnsigned(observedRevision)]);
  return encodeUnsignedMap(entries);
}

function validIdentity(value: Uint8Array | undefined): value is Uint8Array {
  return value?.length === BBP2_ROUTE_IDENTITY_BYTES && value.some(byte => byte !== 0);
}

function validateEncodedValue(value: Uint8Array): void {
  const reader = new CborReader(value);
  reader.readEncodedValue();
  if (!reader.finished) throw new Error('CBOR value has trailing data');
}

export function encodeRouteBody(input: {
  peerKind: Bbp2RoutePeerKind.LogicalDevice | Bbp2RoutePeerKind.CloudService | Bbp2RoutePeerKind.DeviceGroup;
  peerId: Uint8Array;
  requestId: Uint8Array;
  messageKind: Bbp2MessageKind;
  messageFlags: number;
  messageBody: Uint8Array;
}): Uint8Array {
  if (!validIdentity(input.peerId) || !validIdentity(input.requestId)
    || !ROUTED_KINDS.has(input.messageKind) || (input.messageFlags & ~0x05) !== 0) {
    throw new Error('Route metadata is invalid');
  }
  validateEncodedValue(input.messageBody);
  return encodeUnsignedMap([
    [0, encodeUnsigned(input.peerKind)],
    [1, encodeBytes(input.peerId)],
    [2, encodeBytes(input.requestId)],
    [3, encodeUnsigned(input.messageKind)],
    [4, encodeUnsigned(input.messageFlags)],
    [5, input.messageBody],
  ]);
}

export function encodeDeliveryBody(input: Bbp2Delivery): Uint8Array {
  if (!validIdentity(input.peerId)
    || (input.requestId !== undefined && !validIdentity(input.requestId))
    || !ROUTED_KINDS.has(input.messageKind) || (input.messageFlags & ~0x07) !== 0) {
    throw new Error('Delivery metadata is invalid');
  }
  validateEncodedValue(input.messageBody);
  const entries: Array<[number, Uint8Array]> = [
    [0, encodeUnsigned(input.peerKind)],
    [1, encodeBytes(input.peerId)],
  ];
  if (input.requestId) entries.push([2, encodeBytes(input.requestId)]);
  entries.push(
    [3, encodeUnsigned(input.messageKind)],
    [4, encodeUnsigned(input.messageFlags)],
    [5, input.messageBody],
  );
  return encodeUnsignedMap(entries);
}

export function decodeDeliveryBody(body: Uint8Array): Bbp2Delivery {
  const reader = new CborReader(body);
  const count = reader.readMapSize(6);
  if (count !== 5 && count !== 6) throw new Error('Delivery field count is invalid');
  let previous = -1;
  const decoded: Partial<Bbp2Delivery> = {};
  for (let index = 0; index < count; index += 1) {
    const key = reader.readUnsigned(5);
    if (key <= previous) throw new Error('Delivery keys are not canonical');
    previous = key;
    if (key === 0) decoded.peerKind = reader.readUnsigned(4) as Bbp2RoutePeerKind;
    else if (key === 1) decoded.peerId = reader.readBytes(BBP2_ROUTE_IDENTITY_BYTES);
    else if (key === 2) decoded.requestId = reader.readBytes(BBP2_ROUTE_IDENTITY_BYTES);
    else if (key === 3) decoded.messageKind = reader.readUnsigned(0xff) as Bbp2MessageKind;
    else if (key === 4) decoded.messageFlags = reader.readUnsigned(0xff);
    else if (key === 5) decoded.messageBody = reader.readEncodedValue();
  }
  if (!reader.finished || decoded.peerKind === undefined || !validIdentity(decoded.peerId)
    || decoded.messageKind === undefined || !ROUTED_KINDS.has(decoded.messageKind)
    || decoded.messageFlags === undefined
    || (decoded.messageFlags & ~0x07) !== 0 || !decoded.messageBody
    || (decoded.requestId !== undefined && !validIdentity(decoded.requestId))) {
    throw new Error('Delivery metadata is invalid');
  }
  return decoded as Bbp2Delivery;
}

function validateManifestField(field: DeviceV2ManifestField): void {
  if (field.kind === DeviceV2EndpointKind.Property) {
    if ((field.access & ~0x07) !== 0 || (field.access & 0x03) === 0
      || ((field.access & 0x04) !== 0 && (field.access & 0x01) === 0)
      || field.type === DeviceV2ValueType.Null) {
      throw new Error('manifest property is invalid');
    }
  } else if (field.kind === DeviceV2EndpointKind.Action) {
    if (field.access !== 0x10) throw new Error('manifest action is invalid');
  } else if (field.kind === DeviceV2EndpointKind.Event) {
    if (field.access !== 0x08) throw new Error('manifest event is invalid');
  } else {
    throw new Error('manifest endpoint kind is invalid');
  }
  if (field.telemetryMinimumIntervalMs !== undefined
    && (field.kind !== DeviceV2EndpointKind.Property
      || (field.access & DeviceV2EndpointAccess.Read) === 0
      || (field.access & DeviceV2EndpointAccess.Write) !== 0
      || !Number.isInteger(field.telemetryMinimumIntervalMs)
      || field.telemetryMinimumIntervalMs < 100
      || field.telemetryMinimumIntervalMs > 60000)) {
    throw new Error('manifest telemetry interval is invalid');
  }
  const constraints = field.constraints;
  if (!constraints) return;
  const numeric = field.type >= DeviceV2ValueType.SignedInteger
    && field.type <= DeviceV2ValueType.Float64;
  if ((constraints.minimum !== undefined || constraints.maximum !== undefined
    || constraints.step !== undefined) && !numeric) {
    throw new Error('manifest numeric constraints are invalid');
  }
  if (constraints.step !== undefined && constraints.step <= 0) {
    throw new Error('manifest step is invalid');
  }
  if (constraints.minimum !== undefined && constraints.maximum !== undefined
    && constraints.minimum > constraints.maximum) {
    throw new Error('manifest numeric range is invalid');
  }
  if (constraints.maxLength !== undefined && (constraints.maxLength <= 0
    || field.type < DeviceV2ValueType.Text || field.type > DeviceV2ValueType.Array)) {
    throw new Error('manifest maxLength is invalid');
  }
  if (constraints.unit !== undefined && !numeric) throw new Error('manifest unit is invalid');
  if (constraints.enumValues && (field.type !== DeviceV2ValueType.Text
    || constraints.enumValues.length === 0
    || new Set(constraints.enumValues).size !== constraints.enumValues.length
    || (constraints.maxLength !== undefined && constraints.enumValues.some(
      value => textEncoder.encode(value).length > constraints.maxLength!,
    )))) {
    throw new Error('manifest enum is invalid');
  }
}

function decodeManifestField(reader: CborReader, expectedId: number): DeviceV2ManifestField {
  const count = reader.readMapSize(12);
  let previous = -1;
  const field: Partial<DeviceV2ManifestField> = {};
  const constraints: NonNullable<DeviceV2ManifestField['constraints']> = {};
  let constraintCount = 0;
  for (let index = 0; index < count; index += 1) {
    const key = reader.readUnsigned(11);
    if (key <= previous) throw new Error('manifest field keys are not canonical');
    previous = key;
    if (key === 0) field.key = reader.readText(64);
    else if (key === 1) field.kind = reader.readUnsigned(2) as DeviceV2EndpointKind;
    else if (key === 2) field.type = reader.readUnsigned(9) as DeviceV2ValueType;
    else if (key === 3) field.access = reader.readUnsigned(0x1f);
    else if (key === 4) field.id = reader.readUnsigned(0xffff);
    else if (key === 5) { constraints.minimum = reader.readFloat64(); constraintCount += 1; }
    else if (key === 6) { constraints.maximum = reader.readFloat64(); constraintCount += 1; }
    else if (key === 7) { constraints.step = reader.readFloat64(); constraintCount += 1; }
    else if (key === 8) { constraints.maxLength = reader.readUnsigned(); constraintCount += 1; }
    else if (key === 9) { constraints.unit = reader.readText(16); constraintCount += 1; }
    else if (key === 10) {
      const enumCount = reader.readArraySize(16);
      constraints.enumValues = [];
      for (let enumIndex = 0; enumIndex < enumCount; enumIndex += 1) {
        constraints.enumValues.push(reader.readText(64));
      }
      constraintCount += 1;
    } else if (key === 11) field.telemetryMinimumIntervalMs = reader.readUnsigned(60000);
  }
  if (field.key === undefined || field.kind === undefined || field.type === undefined
    || field.access === undefined || field.id !== expectedId) {
    throw new Error('manifest field is incomplete');
  }
  const result = field as DeviceV2ManifestField;
  if (constraintCount) result.constraints = constraints;
  validateManifestField(result);
  return result;
}

export function decodeManifestPageBody(body: Uint8Array): DeviceV2ManifestPage {
  const reader = new CborReader(body);
  if (reader.readMapSize(6) !== 6) throw new Error('Manifest page field count is invalid');
  const key = (expected: number): void => {
    if (reader.readUnsigned(5) !== expected) throw new Error('Manifest page keys are not canonical');
  };
  key(0);
  const revision = reader.readUnsigned();
  key(1);
  const fingerprint = reader.readBytes(BBP2_FINGERPRINT_BYTES);
  key(2);
  const cursor = reader.readUnsigned(0xffff);
  key(3);
  const nextCursor = reader.readUnsigned(0xffff);
  key(4);
  const totalFields = reader.readUnsigned(BBP2_MAX_MANIFEST_FIELDS);
  key(5);
  const count = reader.readArraySize(BBP2_MAX_MANIFEST_FIELDS);
  if (fingerprint.length !== BBP2_FINGERPRINT_BYTES || cursor > nextCursor
    || nextCursor > totalFields || count !== nextCursor - cursor
    || (cursor < totalFields && cursor === nextCursor)) {
    throw new Error('Manifest page cursor or identity is invalid');
  }
  const fields: DeviceV2ManifestField[] = [];
  const encodedFields: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = reader.position;
    fields.push(decodeManifestField(reader, cursor + index + 1));
    encodedFields.push(copy(body.subarray(start, reader.position)));
  }
  if (!reader.finished) throw new Error('Manifest page has trailing data');
  return { revision, fingerprint, cursor, nextCursor, totalFields, fields, encodedFields };
}

function validateNumeric(field: DeviceV2ManifestField, value: number | bigint): void {
  const constraints = field.constraints;
  if (!constraints) return;
  const numeric = typeof value === 'bigint' ? Number(value) : value;
  if ((constraints.minimum !== undefined && numeric < constraints.minimum)
    || (constraints.maximum !== undefined && numeric > constraints.maximum)) {
    throw new Error('endpoint value is outside manifest range');
  }
}

function decodeValue(field: DeviceV2ManifestField, encoded: Uint8Array): DeviceV2Value {
  const reader = new CborReader(encoded);
  let value: DeviceV2Value['value'];
  if (field.type === DeviceV2ValueType.Boolean) value = reader.readBool();
  else if (field.type === DeviceV2ValueType.SignedInteger) value = reader.readInteger(true);
  else if (field.type === DeviceV2ValueType.UnsignedInteger) value = reader.readInteger(false);
  else if (field.type === DeviceV2ValueType.Float32 || field.type === DeviceV2ValueType.Float64) {
    value = reader.readFloat(field.type);
  } else if (field.type === DeviceV2ValueType.Text) value = reader.readText(MAX_TEXT_BYTES, true);
  else if (field.type === DeviceV2ValueType.Bytes) value = reader.readBytes();
  else if (field.type === DeviceV2ValueType.Object || field.type === DeviceV2ValueType.Array) {
    const expected = field.type === DeviceV2ValueType.Object ? 5 : 4;
    const container = new CborReader(encoded);
    const size = expected === 5 ? container.readMapSize() : container.readArraySize();
    if (field.constraints?.maxLength !== undefined && size > field.constraints.maxLength) {
      throw new Error('endpoint container exceeds manifest maxLength');
    }
    value = undefined;
    reader.readEncodedValue();
  } else if (field.type === DeviceV2ValueType.Null) value = reader.readNull();
  else throw new Error('endpoint value type is unsupported');
  if (!reader.finished) throw new Error('endpoint value has trailing data');
  if (typeof value === 'number' || typeof value === 'bigint') validateNumeric(field, value);
  if (typeof value === 'string') {
    if (field.constraints?.maxLength !== undefined
      && textEncoder.encode(value).length > field.constraints.maxLength) {
      throw new Error('endpoint text exceeds manifest maxLength');
    }
    if (field.constraints?.enumValues && !field.constraints.enumValues.includes(value)) {
      throw new Error('endpoint text is outside manifest enum');
    }
  }
  if (value instanceof Uint8Array && field.constraints?.maxLength !== undefined
    && value.length > field.constraints.maxLength) {
    throw new Error('endpoint bytes exceed manifest maxLength');
  }
  return { type: field.type, value, cbor: copy(encoded) };
}

function compareCanonicalText(left: Uint8Array, right: Uint8Array): number {
  if (left.length !== right.length) return left.length - right.length;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return 0;
}

function decodeEndpointValues(
  reader: CborReader,
  fields: DeviceV2ManifestField[],
  idMode: boolean,
  cursor: number,
  nextCursor: number,
  expectedKind: DeviceV2EndpointKind.Property | DeviceV2EndpointKind.Event,
): Record<string, DeviceV2Value> {
  const count = reader.readMapSize(BBP2_MAX_PAGE_VALUES);
  if (count > nextCursor - cursor) throw new Error('endpoint values exceed the cursor range');
  const values: Record<string, DeviceV2Value> = Object.create(null);
  let previousId = 0;
  let previousKey: Uint8Array | undefined;
  for (let index = 0; index < count; index += 1) {
    let field: DeviceV2ManifestField | undefined;
    if (idMode) {
      const id = reader.readUnsigned(0xffff);
      if (id <= previousId) throw new Error('endpoint IDs are not canonical');
      previousId = id;
      field = fields[id - 1];
    } else {
      const key = reader.readText(64);
      const encodedKey = textEncoder.encode(key);
      if (previousKey && compareCanonicalText(previousKey, encodedKey) >= 0) {
        throw new Error('endpoint keys are not canonical');
      }
      previousKey = encodedKey;
      field = fields.find(candidate => candidate.key === key);
    }
    if (!field || field.id <= cursor || field.id > nextCursor || field.kind !== expectedKind
      || (expectedKind === DeviceV2EndpointKind.Event
        ? field.access !== 0x08
        : (field.access & 0x05) === 0)
      || Object.prototype.hasOwnProperty.call(values, field.key)) {
      throw new Error('endpoint is not allowed by the current manifest');
    }
    values[field.key] = decodeValue(field, reader.readEncodedValue());
  }
  return values;
}

export function decodeStatePageBody(
  body: Uint8Array,
  fields: DeviceV2ManifestField[],
  idMode = true,
): DeviceV2StatePage {
  const reader = new CborReader(body);
  if (reader.readMapSize(5) !== 5) throw new Error('StatePage field count is invalid');
  const key = (expected: number): void => {
    if (reader.readUnsigned(4) !== expected) throw new Error('StatePage keys are not canonical');
  };
  key(0);
  const revision = reader.readUnsigned();
  key(1);
  const cursor = reader.readUnsigned(0xffff);
  key(2);
  const nextCursor = reader.readUnsigned(0xffff);
  key(3);
  const totalFields = reader.readUnsigned(BBP2_MAX_MANIFEST_FIELDS);
  key(4);
  if (cursor > nextCursor || nextCursor > totalFields
    || (cursor < totalFields && cursor === nextCursor)) {
    throw new Error('StatePage cursor is invalid');
  }
  const values = decodeEndpointValues(
    reader,
    fields,
    idMode,
    cursor,
    nextCursor,
    DeviceV2EndpointKind.Property,
  );
  if (!reader.finished) throw new Error('StatePage has trailing data');
  return { revision, cursor, nextCursor, totalFields, values };
}

export function decodePatchBody(
  body: Uint8Array,
  fields: DeviceV2ManifestField[],
  idMode = true,
): DeviceV2Patch {
  const reader = new CborReader(body);
  if (reader.readMapSize(3) !== 3 || reader.readUnsigned(2) !== 0) {
    throw new Error('Patch body is invalid');
  }
  const mode = reader.readUnsigned(1) as 0 | 1;
  if (reader.readUnsigned(2) !== 1) throw new Error('Patch keys are not canonical');
  const revision = reader.readUnsigned();
  if (reader.readUnsigned(2) !== 2) throw new Error('Patch keys are not canonical');
  const values = decodeEndpointValues(
    reader,
    fields,
    idMode,
    0,
    fields.length,
    DeviceV2EndpointKind.Property,
  );
  if (!reader.finished || Object.keys(values).length === 0) throw new Error('Patch body is empty');
  return { mode, revision, values };
}

function telemetryUnsigned(value: number, label: string, allowZero = false): Uint8Array {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 0xffffffff) {
    throw new Error(`${label} is invalid`);
  }
  return encodeUnsigned(value);
}

export function encodeTelemetryControlBody(input: DeviceV2TelemetryControl): Uint8Array {
  const entries: Array<[number, Uint8Array]> = [
    [0, telemetryUnsigned(input.operation, 'telemetry operation', true)],
    [1, telemetryUnsigned(input.streamId, 'telemetry stream identity')],
  ];
  if (input.operation !== DeviceV2TelemetryOperation.Open) {
    entries.push([2, telemetryUnsigned(input.epoch, 'telemetry stream epoch')]);
  }
  if (input.operation !== DeviceV2TelemetryOperation.Close) {
    entries.push([3, telemetryUnsigned(input.leaseMs, 'telemetry lease')]);
  }
  if (input.operation === DeviceV2TelemetryOperation.Open) {
    if (input.leaseMs < BBP2_TELEMETRY_MINIMUM_LEASE_MS
      || input.leaseMs > BBP2_TELEMETRY_MAXIMUM_LEASE_MS
      || !Number.isInteger(input.intervalMs)
      || input.intervalMs < BBP2_TELEMETRY_MINIMUM_INTERVAL_MS
      || input.intervalMs > BBP2_TELEMETRY_MAXIMUM_INTERVAL_MS
      || input.fieldIds.length === 0 || input.fieldIds.length > BBP2_MAX_TELEMETRY_FIELDS) {
      throw new Error('telemetry open limits are invalid');
    }
    let previous = 0;
    const fields: Uint8Array[] = [encodeHead(4, input.fieldIds.length)];
    for (const id of input.fieldIds) {
      if (!Number.isInteger(id) || id <= previous || id > 0xffff) {
        throw new Error('telemetry field IDs are invalid');
      }
      previous = id;
      fields.push(encodeUnsigned(id));
    }
    entries.push([4, encodeUnsigned(input.intervalMs)], [5, concat(...fields)]);
  } else if (input.operation === DeviceV2TelemetryOperation.Renew
    && (input.leaseMs < BBP2_TELEMETRY_MINIMUM_LEASE_MS
      || input.leaseMs > BBP2_TELEMETRY_MAXIMUM_LEASE_MS)) {
    throw new Error('telemetry renew lease is invalid');
  }
  return encodeUnsignedMap(entries);
}

export function decodeTelemetryStatusBody(body: Uint8Array): DeviceV2TelemetryStatus {
  const reader = new CborReader(body);
  if (reader.readMapSize(5) !== 5) throw new Error('telemetry status field count is invalid');
  const value = (key: number, maximum = 0xffffffff): number => {
    if (reader.readUnsigned(4) !== key) throw new Error('telemetry status keys are not canonical');
    return reader.readUnsigned(maximum);
  };
  const result: DeviceV2TelemetryStatus = {
    streamId: value(0),
    epoch: value(1),
    status: value(2, DeviceV2TelemetryStatusCode.Expired) as DeviceV2TelemetryStatusCode,
    effectiveIntervalMs: value(3, BBP2_TELEMETRY_MAXIMUM_INTERVAL_MS),
    leaseMs: value(4, BBP2_TELEMETRY_MAXIMUM_LEASE_MS),
  };
  const terminal = result.status === DeviceV2TelemetryStatusCode.Closed
    || result.status === DeviceV2TelemetryStatusCode.Expired;
  if (!reader.finished || result.streamId === 0 || result.epoch === 0
    || result.effectiveIntervalMs < BBP2_TELEMETRY_MINIMUM_INTERVAL_MS
    || terminal !== (result.leaseMs === 0)
    || (!terminal && result.leaseMs < BBP2_TELEMETRY_MINIMUM_LEASE_MS)) {
    throw new Error('telemetry status is invalid');
  }
  return result;
}

export function decodeTelemetryDataBody(
  body: Uint8Array,
  fields: DeviceV2ManifestField[],
): DeviceV2TelemetryData {
  const reader = new CborReader(body);
  if (reader.readMapSize(5) !== 5) throw new Error('telemetry data field count is invalid');
  const value = (key: number): number => {
    if (reader.readUnsigned(4) !== key) throw new Error('telemetry data keys are not canonical');
    return reader.readUnsigned();
  };
  const streamId = value(0);
  const epoch = value(1);
  const sampleSequence = value(2);
  const monotonicMs = value(3);
  if (reader.readUnsigned(4) !== 4) throw new Error('telemetry data keys are not canonical');
  const values = decodeEndpointValues(
    reader,
    fields,
    true,
    0,
    fields.length,
    DeviceV2EndpointKind.Property,
  );
  if (!reader.finished || streamId === 0 || epoch === 0 || sampleSequence === 0
    || Object.keys(values).length === 0) {
    throw new Error('telemetry data is invalid');
  }
  return { streamId, epoch, sampleSequence, monotonicMs, values };
}

export function decodeEventBody(
  body: Uint8Array,
  fields: DeviceV2ManifestField[],
  idMode = true,
): DeviceV2EventBody {
  const reader = new CborReader(body);
  const values = decodeEndpointValues(
    reader,
    fields,
    idMode,
    0,
    fields.length,
    DeviceV2EndpointKind.Event,
  );
  if (!reader.finished || Object.keys(values).length === 0) throw new Error('Event body is empty');
  return { values };
}

export function decodeAckBody(body: Uint8Array): DeviceV2Ack {
  const reader = new CborReader(body);
  const count = reader.readMapSize(2);
  if (count < 1 || reader.readUnsigned(1) !== 0) throw new Error('Ack body is invalid');
  const acknowledgedSequence = reader.readUnsigned(0xffff);
  let stateRevision: number | undefined;
  if (count === 2) {
    if (reader.readUnsigned(1) !== 1) throw new Error('Ack keys are not canonical');
    stateRevision = reader.readUnsigned();
  }
  if (!reader.finished || acknowledgedSequence === 0) throw new Error('Ack body is invalid');
  return stateRevision === undefined ? { acknowledgedSequence } : { acknowledgedSequence, stateRevision };
}

export function encodeAckBody(
  acknowledgedSequence: number,
  stateRevision?: number,
): Uint8Array {
  if (!Number.isInteger(acknowledgedSequence)
    || acknowledgedSequence < 1 || acknowledgedSequence > 0xffff
    || (stateRevision !== undefined && (!Number.isInteger(stateRevision)
      || stateRevision < 0 || stateRevision > 0xffffffff))) {
    throw new Error('Ack body is invalid');
  }
  return stateRevision === undefined
    ? concat(encodeHead(5, 1), encodeUnsigned(0), encodeUnsigned(acknowledgedSequence))
    : concat(
      encodeHead(5, 2),
      encodeUnsigned(0),
      encodeUnsigned(acknowledgedSequence),
      encodeUnsigned(1),
      encodeUnsigned(stateRevision),
    );
}

export function decodeErrorBody(body: Uint8Array): DeviceV2ErrorBody {
  const reader = new CborReader(body);
  const count = reader.readMapSize(4);
  const result: DeviceV2ErrorBody = { errorCode: 0 };
  let previous = -1;
  for (let index = 0; index < count; index += 1) {
    const key = reader.readUnsigned(3);
    if (key <= previous) throw new Error('Error keys are not canonical');
    previous = key;
    if (key === 0) result.errorCode = reader.readUnsigned(0xffff);
    else if (key === 1) result.relatedSequence = reader.readUnsigned(0xffff);
    else if (key === 2) result.detail = reader.readText();
    else if (key === 3) result.stateRevision = reader.readUnsigned();
  }
  if (!reader.finished || result.errorCode === 0) throw new Error('Error body is invalid');
  return result;
}

export function encodeCanonicalManifestPrefix(revision: number, totalFields: number): Uint8Array {
  if (!Number.isInteger(revision) || revision < 0 || revision > 0xffffffff
    || !Number.isInteger(totalFields) || totalFields < 0 || totalFields > BBP2_MAX_MANIFEST_FIELDS) {
    throw new Error('manifest prefix metadata is invalid');
  }
  return concat(
    encodeHead(5, 2),
    encodeUnsigned(0),
    encodeUnsigned(revision),
    encodeUnsigned(1),
    encodeHead(4, totalFields),
  );
}

function encodeFloat(value: number, float32: boolean): Uint8Array {
  if (!Number.isFinite(value)) throw new Error('floating-point value is invalid');
  const output = new Uint8Array(float32 ? 5 : 9);
  output[0] = float32 ? 0xfa : 0xfb;
  const view = new DataView(output.buffer);
  if (float32) view.setFloat32(1, value);
  else view.setFloat64(1, value);
  return output;
}

function encodeJsonValue(value: unknown, depth: number): Uint8Array {
  if (depth > MAX_DEPTH) throw new Error('command value exceeds the nesting limit');
  if (value === null) return Uint8Array.of(0xf6);
  if (typeof value === 'boolean') return Uint8Array.of(value ? 0xf5 : 0xf4);
  if (typeof value === 'bigint') return encodeInteger(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('command number is invalid');
    return Number.isInteger(value) && Number.isSafeInteger(value) ? encodeInteger(value) : encodeFloat(value, false);
  }
  if (typeof value === 'string') return encodeText(value);
  if (value instanceof Uint8Array) return encodeBytes(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) throw new Error('command array exceeds the item limit');
    return concat(encodeHead(4, value.length), ...value.map(item => encodeJsonValue(item, depth + 1)));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      key: encodeText(key),
      value: encodeJsonValue(item, depth + 1),
    }));
    if (entries.length > MAX_ITEMS) throw new Error('command object exceeds the item limit');
    entries.sort((left, right) => compareCanonicalText(left.key, right.key));
    for (let index = 1; index < entries.length; index += 1) {
      if (bytesEqual(entries[index - 1]!.key, entries[index]!.key)) {
        throw new Error('command object key is duplicated');
      }
    }
    return concat(
      encodeHead(5, entries.length),
      ...entries.flatMap(entry => [entry.key, entry.value]),
    );
  }
  throw new Error('command value type is unsupported');
}

export function encodeCommandBody(field: DeviceV2ManifestField, value: unknown): Uint8Array {
  if (field.kind === DeviceV2EndpointKind.Event || (field.access & 0x12) === 0) {
    throw new Error('endpoint is not commandable');
  }
  let encoded: Uint8Array;
  if (field.type === DeviceV2ValueType.Boolean) {
    if (typeof value !== 'boolean') throw new Error('command boolean is invalid');
    encoded = Uint8Array.of(value ? 0xf5 : 0xf4);
  } else if (field.type === DeviceV2ValueType.SignedInteger
    || field.type === DeviceV2ValueType.UnsignedInteger) {
    if ((typeof value !== 'number' || !Number.isSafeInteger(value)) && typeof value !== 'bigint') {
      throw new Error('command integer is invalid');
    }
    if (field.type === DeviceV2ValueType.UnsignedInteger && value < 0) {
      throw new Error('command unsigned integer is negative');
    }
    encoded = encodeInteger(value as number | bigint);
  } else if (field.type === DeviceV2ValueType.Float32 || field.type === DeviceV2ValueType.Float64) {
    if (typeof value !== 'number') throw new Error('command float is invalid');
    encoded = encodeFloat(value, field.type === DeviceV2ValueType.Float32);
  } else if (field.type === DeviceV2ValueType.Text) {
    if (typeof value !== 'string') throw new Error('command text is invalid');
    encoded = encodeText(value);
  } else if (field.type === DeviceV2ValueType.Bytes) {
    if (!(value instanceof Uint8Array)) throw new Error('command bytes are invalid');
    encoded = encodeBytes(value);
  } else if (field.type === DeviceV2ValueType.Object) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Uint8Array) {
      throw new Error('command object is invalid');
    }
    encoded = encodeJsonValue(value, 0);
  } else if (field.type === DeviceV2ValueType.Array) {
    if (!Array.isArray(value)) throw new Error('command array is invalid');
    encoded = encodeJsonValue(value, 0);
  } else if (field.type === DeviceV2ValueType.Null) {
    if (value !== null) throw new Error('command null is invalid');
    encoded = Uint8Array.of(0xf6);
  } else {
    throw new Error('command endpoint type is unsupported');
  }
  decodeValue({ ...field, kind: DeviceV2EndpointKind.Property, access: 1 }, encoded);
  return concat(encodeHead(5, 1), encodeUnsigned(field.id), encoded);
}
