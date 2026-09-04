import {
  CborReader,
  encodeCanonicalArray,
  encodeCanonicalByteString,
  encodeCanonicalUnsigned,
} from './codec';

export const EDGE_GATEWAY_PERMIT_JOIN_VERSION = 1;
export const EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_LIMIT = 4;
export const EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_TOKEN_LIMIT = 16;
export const EDGE_GATEWAY_PERMIT_JOIN_PACKET_LIMIT = 20;
export const EDGE_GATEWAY_PERMIT_JOIN_BATCH_PACKET_LIMIT = 16;

const OPERATION_ID_SIZE = 16;
const SNAPSHOT_KIND = 7;
const SELECT_COMMAND_KIND = 8;
const SELECT_RESULT_KIND = 9;
const RELAY_BATCH_KIND = 10;
const RELAY_ACK_KIND = 11;
const SNAPSHOT_SIZE_LIMIT = 125;
const SELECT_COMMAND_SIZE_LIMIT = 37;
const SELECT_RESULT_SIZE_LIMIT = 41;
const RELAY_BATCH_SIZE_LIMIT = 363;
const RELAY_ACK_SIZE_LIMIT = 32;

export enum EdgeGatewayPermitJoinRelayDirection {
  Down = 1,
  Up = 2,
}

export enum EdgeGatewayPermitJoinSelectStatus {
  Connecting = 1,
  Connected = 2,
  NotFound = 3,
  Disconnected = 4,
  Rejected = 5,
}

export enum EdgeGatewayPermitJoinRelayAckStatus {
  Accepted = 1,
  Rejected = 2,
}

export interface EdgeGatewayPermitJoinCandidate {
  candidateToken: Uint8Array;
  wireVersion: number;
  capabilities: number;
  signalQuality: number;
}

export interface EdgeGatewayPermitJoinCandidateSnapshot {
  operationId: Uint8Array;
  revision: number;
  candidates: readonly EdgeGatewayPermitJoinCandidate[];
}

export interface EdgeGatewayPermitJoinSelectCommand {
  operationId: Uint8Array;
  candidateToken: Uint8Array;
}

export interface EdgeGatewayPermitJoinSelectResult
  extends EdgeGatewayPermitJoinSelectCommand {
  status: EdgeGatewayPermitJoinSelectStatus;
  maxPacketSize: number;
}

export interface EdgeGatewayPermitJoinRelayBatch {
  operationId: Uint8Array;
  direction: EdgeGatewayPermitJoinRelayDirection;
  sequence: number;
  packets: readonly Uint8Array[];
}

export interface EdgeGatewayPermitJoinRelayAck {
  operationId: Uint8Array;
  direction: EdgeGatewayPermitJoinRelayDirection;
  sequence: number;
  status: EdgeGatewayPermitJoinRelayAckStatus;
}

export function encodePermitJoinCandidateSnapshot(
  value: EdgeGatewayPermitJoinCandidateSnapshot,
): Uint8Array {
  operationId(value.operationId);
  positiveU32(value.revision, 'revision');
  if (!Array.isArray(value.candidates)
    || value.candidates.length > EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_LIMIT) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CANDIDATES_INVALID');
  }
  const candidates = value.candidates.map(candidate => {
    candidateToken(candidate.candidateToken);
    bounded(candidate.wireVersion, 0xff, 'wire version');
    bounded(candidate.capabilities, 0xffff, 'capabilities');
    bounded(candidate.signalQuality, 100, 'signal quality');
    return encodeCanonicalArray([
      encodeCanonicalByteString(candidate.candidateToken),
      encodeCanonicalUnsigned(candidate.wireVersion),
      encodeCanonicalUnsigned(candidate.capabilities),
      encodeCanonicalUnsigned(candidate.signalQuality),
    ]);
  });
  return maximum(encodeCanonicalArray([
    encodeCanonicalUnsigned(EDGE_GATEWAY_PERMIT_JOIN_VERSION),
    encodeCanonicalUnsigned(SNAPSHOT_KIND),
    encodeCanonicalByteString(value.operationId),
    encodeCanonicalUnsigned(value.revision),
    encodeCanonicalArray(candidates),
  ]), SNAPSHOT_SIZE_LIMIT, 'SNAPSHOT');
}

export function decodePermitJoinCandidateSnapshot(
  encoded: Uint8Array,
): EdgeGatewayPermitJoinCandidateSnapshot {
  maximum(encoded, SNAPSHOT_SIZE_LIMIT, 'SNAPSHOT');
  const reader = header(encoded, 5, SNAPSHOT_KIND);
  const value: EdgeGatewayPermitJoinCandidateSnapshot = {
    operationId: reader.readBytes(OPERATION_ID_SIZE),
    revision: reader.readUnsigned(0xffff_ffff),
    candidates: readCandidates(reader),
  };
  reader.finish();
  encodePermitJoinCandidateSnapshot(value);
  return value;
}

export function encodePermitJoinSelectCommand(
  value: EdgeGatewayPermitJoinSelectCommand,
): Uint8Array {
  operationId(value.operationId);
  candidateToken(value.candidateToken);
  return maximum(encodeCanonicalArray([
    encodeCanonicalUnsigned(EDGE_GATEWAY_PERMIT_JOIN_VERSION),
    encodeCanonicalUnsigned(SELECT_COMMAND_KIND),
    encodeCanonicalByteString(value.operationId),
    encodeCanonicalByteString(value.candidateToken),
  ]), SELECT_COMMAND_SIZE_LIMIT, 'SELECT_COMMAND');
}

export function decodePermitJoinSelectResult(
  encoded: Uint8Array,
): EdgeGatewayPermitJoinSelectResult {
  maximum(encoded, SELECT_RESULT_SIZE_LIMIT, 'SELECT_RESULT');
  const reader = header(encoded, 6, SELECT_RESULT_KIND);
  const value: EdgeGatewayPermitJoinSelectResult = {
    operationId: reader.readBytes(OPERATION_ID_SIZE),
    candidateToken: reader.readBytes(EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_TOKEN_LIMIT),
    status: reader.readUnsigned(0xff) as EdgeGatewayPermitJoinSelectStatus,
    maxPacketSize: reader.readUnsigned(EDGE_GATEWAY_PERMIT_JOIN_PACKET_LIMIT),
  };
  reader.finish();
  operationId(value.operationId);
  candidateToken(value.candidateToken);
  if (!validSelectStatus(value.status)
    || (value.status === EdgeGatewayPermitJoinSelectStatus.Connected)
      !== (value.maxPacketSize > 0)) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SELECT_RESULT_INVALID');
  }
  return value;
}

export function encodePermitJoinSelectResult(
  value: EdgeGatewayPermitJoinSelectResult,
): Uint8Array {
  operationId(value.operationId);
  candidateToken(value.candidateToken);
  if (!validSelectStatus(value.status)
    || !Number.isSafeInteger(value.maxPacketSize) || value.maxPacketSize < 0
    || value.maxPacketSize > EDGE_GATEWAY_PERMIT_JOIN_PACKET_LIMIT
    || (value.status === EdgeGatewayPermitJoinSelectStatus.Connected)
      !== (value.maxPacketSize > 0)) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SELECT_RESULT_INVALID');
  }
  return maximum(encodeCanonicalArray([
    encodeCanonicalUnsigned(EDGE_GATEWAY_PERMIT_JOIN_VERSION),
    encodeCanonicalUnsigned(SELECT_RESULT_KIND),
    encodeCanonicalByteString(value.operationId),
    encodeCanonicalByteString(value.candidateToken),
    encodeCanonicalUnsigned(value.status),
    encodeCanonicalUnsigned(value.maxPacketSize),
  ]), SELECT_RESULT_SIZE_LIMIT, 'SELECT_RESULT');
}

export function encodePermitJoinRelayBatch(
  value: EdgeGatewayPermitJoinRelayBatch,
): Uint8Array {
  operationId(value.operationId);
  direction(value.direction);
  positiveU32(value.sequence, 'sequence');
  if (!Array.isArray(value.packets) || !value.packets.length
    || value.packets.length > EDGE_GATEWAY_PERMIT_JOIN_BATCH_PACKET_LIMIT) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_BATCH_INVALID');
  }
  const packets = value.packets.map(packet => {
    if (!(packet instanceof Uint8Array) || !packet.length
      || packet.length > EDGE_GATEWAY_PERMIT_JOIN_PACKET_LIMIT) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_PACKET_INVALID');
    }
    return encodeCanonicalByteString(packet);
  });
  return maximum(encodeCanonicalArray([
    encodeCanonicalUnsigned(EDGE_GATEWAY_PERMIT_JOIN_VERSION),
    encodeCanonicalUnsigned(RELAY_BATCH_KIND),
    encodeCanonicalByteString(value.operationId),
    encodeCanonicalUnsigned(value.direction),
    encodeCanonicalUnsigned(value.sequence),
    encodeCanonicalArray(packets),
  ]), RELAY_BATCH_SIZE_LIMIT, 'RELAY_BATCH');
}

export function decodePermitJoinRelayBatch(
  encoded: Uint8Array,
): EdgeGatewayPermitJoinRelayBatch {
  maximum(encoded, RELAY_BATCH_SIZE_LIMIT, 'RELAY_BATCH');
  const reader = header(encoded, 6, RELAY_BATCH_KIND);
  const operation = reader.readBytes(OPERATION_ID_SIZE);
  const relayDirection =
    reader.readUnsigned(0xff) as EdgeGatewayPermitJoinRelayDirection;
  const sequence = reader.readUnsigned(0xffff_ffff);
  const packetCount = reader.readArraySize();
  if (!packetCount || packetCount > EDGE_GATEWAY_PERMIT_JOIN_BATCH_PACKET_LIMIT) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_BATCH_INVALID');
  }
  const packets: Uint8Array[] = [];
  for (let index = 0; index < packetCount; index += 1) {
    packets.push(reader.readBytes(EDGE_GATEWAY_PERMIT_JOIN_PACKET_LIMIT));
  }
  const value: EdgeGatewayPermitJoinRelayBatch = {
    operationId: operation,
    direction: relayDirection,
    sequence,
    packets,
  };
  reader.finish();
  encodePermitJoinRelayBatch(value);
  return value;
}

export function encodePermitJoinRelayAck(
  value: EdgeGatewayPermitJoinRelayAck,
): Uint8Array {
  operationId(value.operationId);
  direction(value.direction);
  positiveU32(value.sequence, 'sequence');
  if (value.status !== EdgeGatewayPermitJoinRelayAckStatus.Accepted
    && value.status !== EdgeGatewayPermitJoinRelayAckStatus.Rejected) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_ACK_STATUS_INVALID');
  }
  return maximum(encodeCanonicalArray([
    encodeCanonicalUnsigned(EDGE_GATEWAY_PERMIT_JOIN_VERSION),
    encodeCanonicalUnsigned(RELAY_ACK_KIND),
    encodeCanonicalByteString(value.operationId),
    encodeCanonicalUnsigned(value.direction),
    encodeCanonicalUnsigned(value.sequence),
    encodeCanonicalUnsigned(value.status),
  ]), RELAY_ACK_SIZE_LIMIT, 'RELAY_ACK');
}

export function decodePermitJoinRelayAck(
  encoded: Uint8Array,
): EdgeGatewayPermitJoinRelayAck {
  maximum(encoded, RELAY_ACK_SIZE_LIMIT, 'RELAY_ACK');
  const reader = header(encoded, 6, RELAY_ACK_KIND);
  const value: EdgeGatewayPermitJoinRelayAck = {
    operationId: reader.readBytes(OPERATION_ID_SIZE),
    direction: reader.readUnsigned(0xff) as EdgeGatewayPermitJoinRelayDirection,
    sequence: reader.readUnsigned(0xffff_ffff),
    status: reader.readUnsigned(0xff) as EdgeGatewayPermitJoinRelayAckStatus,
  };
  reader.finish();
  encodePermitJoinRelayAck(value);
  return value;
}

function readCandidates(reader: CborReader): EdgeGatewayPermitJoinCandidate[] {
  const count = reader.readArraySize(EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_LIMIT);
  const candidates: EdgeGatewayPermitJoinCandidate[] = [];
  for (let index = 0; index < count; index += 1) {
    if (reader.readArraySize(4) !== 4) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_INVALID');
    }
    candidates.push({
      candidateToken: reader.readBytes(EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_TOKEN_LIMIT),
      wireVersion: reader.readUnsigned(0xff),
      capabilities: reader.readUnsigned(0xffff),
      signalQuality: reader.readUnsigned(100),
    });
  }
  return candidates;
}

function header(encoded: Uint8Array, size: number, kind: number): CborReader {
  const reader = new CborReader(encoded);
  if (reader.readArraySize(size) !== size
    || reader.readUnsigned(EDGE_GATEWAY_PERMIT_JOIN_VERSION)
      !== EDGE_GATEWAY_PERMIT_JOIN_VERSION
    || reader.readUnsigned(RELAY_ACK_KIND) !== kind) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_FRAME_INVALID');
  }
  return reader;
}

function operationId(value: Uint8Array): void {
  if (!(value instanceof Uint8Array) || value.length !== OPERATION_ID_SIZE
    || !value.some(byte => byte !== 0)) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_ID_INVALID');
  }
}

function candidateToken(value: Uint8Array): void {
  if (!(value instanceof Uint8Array) || !value.length
    || value.length > EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_TOKEN_LIMIT
    || !value.some(byte => byte !== 0)) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_TOKEN_INVALID');
  }
}

function direction(value: EdgeGatewayPermitJoinRelayDirection): void {
  if (value !== EdgeGatewayPermitJoinRelayDirection.Down
    && value !== EdgeGatewayPermitJoinRelayDirection.Up) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DIRECTION_INVALID');
  }
}

function validSelectStatus(value: number): value is EdgeGatewayPermitJoinSelectStatus {
  return value >= EdgeGatewayPermitJoinSelectStatus.Connecting
    && value <= EdgeGatewayPermitJoinSelectStatus.Rejected;
}

function positiveU32(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error(`EDGE_GATEWAY_PERMIT_JOIN_${name.toUpperCase()}_INVALID`);
  }
}

function bounded(value: number, limit: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
    throw new Error(`EDGE_GATEWAY_PERMIT_JOIN_${name.toUpperCase().replaceAll(' ', '_')}_INVALID`);
  }
}

function maximum(value: Uint8Array, limit: number, name: string): Uint8Array {
  if (!(value instanceof Uint8Array) || !value.length || value.length > limit) {
    throw new Error(`EDGE_GATEWAY_PERMIT_JOIN_${name}_SIZE`);
  }
  return value;
}
