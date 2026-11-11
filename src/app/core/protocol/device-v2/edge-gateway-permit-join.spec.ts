import {
  EdgeGatewayPermitJoinRelayAckStatus,
  EdgeGatewayPermitJoinRelayDirection,
  decodePermitJoinCandidateSnapshot,
  decodePermitJoinRelayAck,
  decodePermitJoinRelayBatch,
  encodePermitJoinCandidateSnapshot,
  encodePermitJoinRelayAck,
  encodePermitJoinRelayBatch,
  encodePermitJoinSelectCommand,
} from './edge-gateway-permit-join';

const operationId = Uint8Array.from({ length: 16 }, (_, index) => 0x10 + index);
const token = Uint8Array.of(0xa1, 0xb2, 0xc3, 0xd4);
const hex = (value: Uint8Array) => Array.from(
  value, byte => byte.toString(16).padStart(2, '0'),
).join('');

describe('Edge Gateway permit-join wire', () => {
  it('matches the frozen device and broker canonical CBOR vectors', () => {
    const snapshot = encodePermitJoinCandidateSnapshot({
      operationId,
      revision: 1,
      candidates: [{
        candidateToken: token,
        wireVersion: 1,
        capabilities: 0,
        signalQuality: 85,
      }],
    });
    expect(hex(snapshot)).toBe(
      '85010750101112131415161718191a1b1c1d1e1f01818444a1b2c3d401001855',
    );
    expect(decodePermitJoinCandidateSnapshot(snapshot).candidates[0]?.signalQuality)
      .toBe(85);

    expect(hex(encodePermitJoinSelectCommand({ operationId, candidateToken: token })))
      .toBe('84010850101112131415161718191a1b1c1d1e1f44a1b2c3d4');
    const batch = encodePermitJoinRelayBatch({
      operationId,
      direction: EdgeGatewayPermitJoinRelayDirection.Down,
      sequence: 1,
      packets: [Uint8Array.of(1, 2, 3)],
    });
    expect(hex(batch))
      .toBe('86010a50101112131415161718191a1b1c1d1e1f01018143010203');
    expect(decodePermitJoinRelayBatch(batch).sequence).toBe(1);

    const ack = encodePermitJoinRelayAck({
      operationId,
      direction: EdgeGatewayPermitJoinRelayDirection.Down,
      sequence: 1,
      status: EdgeGatewayPermitJoinRelayAckStatus.Accepted,
    });
    expect(hex(ack)).toBe('86010b50101112131415161718191a1b1c1d1e1f010101');
    expect(decodePermitJoinRelayAck(ack).status)
      .toBe(EdgeGatewayPermitJoinRelayAckStatus.Accepted);
  });

  it('rejects non-canonical, zero-token and oversized relay input', () => {
    expect(() => encodePermitJoinSelectCommand({
      operationId,
      candidateToken: Uint8Array.of(0),
    })).toThrow('EDGE_GATEWAY_PERMIT_JOIN_CANDIDATE_TOKEN_INVALID');
    expect(() => encodePermitJoinRelayBatch({
      operationId,
      direction: EdgeGatewayPermitJoinRelayDirection.Down,
      sequence: 1,
      packets: [new Uint8Array(21)],
    })).toThrow('EDGE_GATEWAY_PERMIT_JOIN_PACKET_INVALID');
    const nonCanonical = Uint8Array.from([
      0x85, 0x18, 0x01, 0x07, 0x50, ...operationId, 0x01, 0x80,
    ]);
    expect(() => decodePermitJoinCandidateSnapshot(nonCanonical)).toThrow();
  });
});
