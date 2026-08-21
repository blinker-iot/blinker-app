export const BBP2_HEADER_BYTES = 10;
export const BBP2_MAX_MANIFEST_FIELDS = 256;
export const BBP2_MAX_PAGE_VALUES = 32;
export const BBP2_FINGERPRINT_BYTES = 32;
export const BBP2_ROUTE_IDENTITY_BYTES = 16;

export enum Bbp2MessageKind {
  Hello = 0x01,
  ManifestRequest = 0x02,
  Manifest = 0x03,
  ManifestAccept = 0x06,
  Route = 0x09,
  Delivery = 0x0a,
  StateRequest = 0x10,
  Patch = 0x11,
  Command = 0x12,
  Event = 0x13,
  Ack = 0x14,
  Error = 0x15,
  StatePage = 0x16,
}

export enum Bbp2FrameFlag {
  AckRequired = 1 << 0,
  IsResponse = 1 << 1,
  IdMode = 1 << 2,
}

export enum Bbp2RoutePeerKind {
  LogicalDevice = 0,
  CloudService = 1,
  DeviceGroup = 2,
  Account = 3,
  Platform = 4,
}

export enum Bbp2ErrorCode {
  NegotiationRequired = 3,
  UnsupportedMessage = 4,
  UnknownEndpoint = 5,
  CommandRejected = 6,
  ResourceExhausted = 7,
  Internal = 8,
  SequenceConflict = 9,
  StateConflict = 10,
  ManifestConflict = 11,
}

export enum DeviceV2EndpointKind {
  Property = 0,
  Action = 1,
  Event = 2,
}

export enum DeviceV2EndpointAccess {
  Read = 1 << 0,
  Write = 1 << 1,
  Notify = 1 << 2,
  Event = 1 << 3,
  Command = 1 << 4,
}

export enum DeviceV2ValueType {
  Boolean = 0,
  SignedInteger = 1,
  UnsignedInteger = 2,
  Float32 = 3,
  Float64 = 4,
  Text = 5,
  Bytes = 6,
  Object = 7,
  Array = 8,
  Null = 9,
}

export interface Bbp2Frame {
  kind: Bbp2MessageKind;
  flags: number;
  sequence: number;
  body: Uint8Array;
}

export interface Bbp2ServerHello {
  role: 2;
  versions: number[];
  features: number;
  maxFrameSize: number;
  maxReassemblySize: number;
  reliableReceiveWindow: number;
}

export interface Bbp2Delivery {
  peerKind: Bbp2RoutePeerKind;
  peerId: Uint8Array;
  requestId?: Uint8Array;
  messageKind: Bbp2MessageKind;
  messageFlags: number;
  messageBody: Uint8Array;
}

export interface DeviceV2ManifestConstraints {
  minimum?: number;
  maximum?: number;
  step?: number;
  maxLength?: number;
  unit?: string;
  enumValues?: string[];
}

export interface DeviceV2ManifestField {
  key: string;
  kind: DeviceV2EndpointKind;
  type: DeviceV2ValueType;
  access: number;
  id: number;
  constraints?: DeviceV2ManifestConstraints;
}

export interface DeviceV2ManifestPage {
  revision: number;
  fingerprint: Uint8Array;
  cursor: number;
  nextCursor: number;
  totalFields: number;
  fields: DeviceV2ManifestField[];
  encodedFields: Uint8Array[];
}

export interface DeviceV2Manifest {
  revision: number;
  fingerprint: string;
  fields: DeviceV2ManifestField[];
}

export type DeviceV2Primitive = boolean | number | bigint | string | null;

export interface DeviceV2Value {
  type: DeviceV2ValueType;
  value?: DeviceV2Primitive | Uint8Array;
  cbor: Uint8Array;
}

export interface DeviceV2StatePage {
  revision: number;
  cursor: number;
  nextCursor: number;
  totalFields: number;
  values: Record<string, DeviceV2Value>;
}

export interface DeviceV2Patch {
  mode: 0 | 1;
  revision: number;
  values: Record<string, DeviceV2Value>;
}

export interface DeviceV2EventBody {
  values: Record<string, DeviceV2Value>;
}

export interface DeviceV2Ack {
  acknowledgedSequence: number;
  stateRevision?: number;
}

export interface DeviceV2ErrorBody {
  errorCode: number;
  relatedSequence?: number;
  detail?: string;
  stateRevision?: number;
}

export interface DeviceV2TargetSnapshot {
  manifest: DeviceV2Manifest | null;
  manifestAccepted: boolean;
  stateRevision: number | null;
  stateFresh: boolean;
  values: Readonly<Record<string, DeviceV2Value>>;
  eventInterrupted: boolean;
}

export interface DeviceV2Event {
  logicalDeviceId: string;
  values: Readonly<Record<string, DeviceV2Value>>;
}
