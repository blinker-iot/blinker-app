export const BBP2_HEADER_BYTES = 10;
export const BBP2_MAX_FRAME_BYTES = 512;
export const BBP2_MAX_MANIFEST_FIELDS = 256;
export const BBP2_MAX_PAGE_VALUES = 32;
export const BBP2_FINGERPRINT_BYTES = 32;
export const BBP2_ROUTE_IDENTITY_BYTES = 16;
export const BBP2_MAX_TELEMETRY_FIELDS = 32;
export const BBP2_TELEMETRY_MINIMUM_LEASE_MS = 5000;
export const BBP2_TELEMETRY_MAXIMUM_LEASE_MS = 60000;
export const BBP2_TELEMETRY_MINIMUM_INTERVAL_MS = 100;
export const BBP2_TELEMETRY_MAXIMUM_INTERVAL_MS = 60000;

export enum Bbp2MessageKind {
  Hello = 0x01,
  ManifestRequest = 0x02,
  Manifest = 0x03,
  Authenticate = 0x04,
  AuthResult = 0x05,
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
  TelemetryControl = 0x17,
  TelemetryStatus = 0x18,
  TelemetryData = 0x19,
  PresenceControl = 0x1a,
  Presence = 0x1b,
  ControllerControlOpen = 0x30,
  ControllerControlChallenge = 0x31,
  ControllerMutation = 0x32,
  ControllerMutationReceipt = 0x33,
  PresenceKeyMutation = 0x34,
  PresenceKeyReceipt = 0x35,
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
  MalformedMessage = 1,
  AuthenticationRequired = 2,
  NegotiationRequired = 3,
  UnsupportedMessage = 4,
  UnknownEndpoint = 5,
  CommandRejected = 6,
  ResourceExhausted = 7,
  Internal = 8,
  SequenceConflict = 9,
  StateConflict = 10,
  ManifestConflict = 11,
  RateLimited = 12,
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
  telemetryMinimumIntervalMs?: number;
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

export enum DeviceV2TelemetryOperation {
  Open = 0,
  Renew = 1,
  Close = 2,
}

export enum DeviceV2TelemetryStatusCode {
  Opened = 0,
  Renewed = 1,
  Closed = 2,
  Expired = 3,
}

export type DeviceV2TelemetryControl = {
  operation: DeviceV2TelemetryOperation.Open;
  streamId: number;
  leaseMs: number;
  intervalMs: number;
  fieldIds: number[];
} | {
  operation: DeviceV2TelemetryOperation.Renew;
  streamId: number;
  epoch: number;
  leaseMs: number;
} | {
  operation: DeviceV2TelemetryOperation.Close;
  streamId: number;
  epoch: number;
};

export interface DeviceV2TelemetryStatus {
  streamId: number;
  epoch: number;
  status: DeviceV2TelemetryStatusCode;
  effectiveIntervalMs: number;
  leaseMs: number;
}

export interface DeviceV2TelemetryData {
  streamId: number;
  epoch: number;
  sampleSequence: number;
  monotonicMs: number;
  values: Record<string, DeviceV2Value>;
}

export enum DeviceV2PresenceOperation {
  Subscribe = 0,
}

export interface DeviceV2Presence {
  cloudReachable: boolean;
  cloudLastSeenAt: number | null;
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
  cloudReachable: boolean | null;
  cloudLastSeenAt: number | null;
}

export interface DeviceV2Event {
  logicalDeviceId: string;
  values: Readonly<Record<string, DeviceV2Value>>;
}
