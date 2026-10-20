import {
  EdgeGatewayPermitJoinRelayAckStatus,
  EdgeGatewayPermitJoinRelayDirection,
  EdgeGatewayPermitJoinSelectStatus,
  decodePermitJoinRelayBatch,
  encodePermitJoinCandidateSnapshot,
  encodePermitJoinRelayAck,
  encodePermitJoinRelayBatch,
  encodePermitJoinSelectResult,
} from '../../protocol/device-v2';
import { BleApplicationMode } from '../ble-direct/wire';
import {
  EdgeGatewayPermitJoinApi,
  EdgeGatewayPermitJoinRelayView,
  EdgeGatewayPermitJoinWindow,
} from './permit-join-api';
import { GatewayPermitJoinRecordLink } from './permit-join-link';
import { describe, expect, it, vi } from 'vitest';

const sessionId = new Uint8Array(16).fill(0x71);
const provisioningToken = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
const directToken = Uint8Array.of(9, 10, 11, 12, 13, 14, 15, 16);

class FakePermitJoinApi implements EdgeGatewayPermitJoinApi {
  private operationId = new Uint8Array();
  private mode = BleApplicationMode.Provisioning;
  private upstreamPending = true;
  opens = 0;
  closes = 0;
  closeState: EdgeGatewayPermitJoinWindow['state'] = 'closed';
  closeError?: Error;
  changeSessionOnSend = false;
  openPending = false;
  requestDelayMs = 0;
  activeRequests = 0;
  maximumConcurrentRequests = 0;
  replayFirstUpstreamBatch = false;
  selectionUpdate?: { status: EdgeGatewayPermitJoinSelectStatus; token?: Uint8Array; packetSize?: number };
  readonly downBatchPacketCounts: number[] = [];
  private upstreamSequence = 1;
  private upstreamAcknowledgements = 0;

  async open(
    operationId: Uint8Array,
    _edgeHubLogicalDeviceId: string,
    _adapterId: number,
  ): Promise<EdgeGatewayPermitJoinWindow> {
    this.operationId = operationId.slice();
    this.mode = this.opens++ === 0
      ? BleApplicationMode.Provisioning : BleApplicationMode.Direct;
    this.upstreamPending = true;
    this.upstreamSequence = 1;
    this.upstreamAcknowledgements = 0;
    return this.window(this.openPending ? 'pending_open' : 'ready');
  }

  async get(): Promise<EdgeGatewayPermitJoinWindow> {
    return this.window(this.openPending ? 'ready' : 'closed');
  }

  async close(): Promise<EdgeGatewayPermitJoinWindow> {
    this.closes += 1;
    if (this.closeError) throw this.closeError;
    return this.window(this.closeState);
  }

  async readRelay(): Promise<EdgeGatewayPermitJoinRelayView> {
    return this.track(async () => {
      const token = this.token();
      return this.view({
        candidateSnapshot: encodePermitJoinCandidateSnapshot({
          operationId: this.operationId,
          revision: 1,
          candidates: [{
            candidateToken: token,
            wireVersion: this.mode === BleApplicationMode.Provisioning ? 1 : 3,
            capabilities: this.mode === BleApplicationMode.Provisioning ? 0x07 : 0x51,
            signalQuality: 90,
          }],
        }),
        upstreamBatch: this.upstreamPending
          ? encodePermitJoinRelayBatch({
              operationId: this.operationId,
              direction: EdgeGatewayPermitJoinRelayDirection.Up,
              sequence: this.upstreamSequence,
              packets: [Uint8Array.of(
                0xb2, 0x13, 5, 0,
                this.upstreamSequence === 1 ? 0x41 : 0x43,
                this.upstreamSequence === 1 ? 0x42 : 0x44,
              )],
            })
          : null,
      });
    });
  }

  async sendRelay(
    _operationId: Uint8Array,
    exactFrame: Uint8Array,
  ): Promise<EdgeGatewayPermitJoinRelayView> {
    return this.track(async () => {
      const kind = exactFrame[2];
      const relaySessionId = this.changeSessionOnSend
        ? new Uint8Array(16).fill(0x72) : sessionId;
      if (kind === 8) {
        return this.view({
          relaySessionId,
          selectResult: encodePermitJoinSelectResult({
            operationId: this.operationId,
            candidateToken: this.token(),
            status: EdgeGatewayPermitJoinSelectStatus.Connected,
            maxPacketSize: 20,
          }),
        });
      }
      if (kind === 10) {
        const batch = decodePermitJoinRelayBatch(exactFrame);
        this.downBatchPacketCounts.push(batch.packets.length);
        return this.view({
          relaySessionId,
          downAck: encodePermitJoinRelayAck({
            operationId: this.operationId,
            direction: EdgeGatewayPermitJoinRelayDirection.Down,
            sequence: batch.sequence,
            status: EdgeGatewayPermitJoinRelayAckStatus.Accepted,
          }),
        });
      }
      this.upstreamAcknowledgements += 1;
      if (this.replayFirstUpstreamBatch && this.upstreamSequence === 1
        && this.upstreamAcknowledgements === 1) {
        return this.view({ relaySessionId });
      }
      if (this.replayFirstUpstreamBatch && this.upstreamSequence === 1) {
        this.upstreamSequence = 2;
      } else {
        this.upstreamPending = false;
      }
      return this.view({ relaySessionId });
    });
  }

  private async track<T>(operation: () => Promise<T>): Promise<T> {
    this.activeRequests += 1;
    this.maximumConcurrentRequests = Math.max(
      this.maximumConcurrentRequests, this.activeRequests,
    );
    try {
      if (this.requestDelayMs) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelayMs));
      }
      return await operation();
    } finally {
      this.activeRequests -= 1;
    }
  }

  private token(): Uint8Array {
    return this.mode === BleApplicationMode.Provisioning
      ? provisioningToken : directToken;
  }

  private window(state: EdgeGatewayPermitJoinWindow['state']): EdgeGatewayPermitJoinWindow {
    return {
      operationId: this.operationId.slice(),
      edgeHubLogicalDeviceId: 'device_hub',
      adapterId: 1,
      state,
      expiresAt: Date.now() + 60_000,
      readyAt: Date.now(),
      closedAt: state === 'closed' ? Date.now() : null,
      updatedAt: Date.now(),
      replayed: false,
    };
  }

  private view(
    value: Partial<EdgeGatewayPermitJoinRelayView> = {},
  ): EdgeGatewayPermitJoinRelayView {
    return {
      operationId: this.operationId.slice(),
      relaySessionId: value.relaySessionId?.slice() ?? sessionId.slice(),
      revision: value.revision ?? 1,
      candidateSnapshot: value.candidateSnapshot ?? null,
      selectResult: value.selectResult ?? (this.selectionUpdate ? encodePermitJoinSelectResult({
        operationId: this.operationId,
        candidateToken: this.selectionUpdate.token ?? this.token(),
        status: this.selectionUpdate.status,
        maxPacketSize: this.selectionUpdate.packetSize ?? 0,
      }) : null),
      downAck: value.downAck ?? null,
      upstreamBatch: value.upstreamBatch ?? null,
      expiresAt: Date.now() + 60_000,
    };
  }
}

describe('GatewayPermitJoinRecordLink', () => {
  it.each(['closed', 'expired', 'rejected', 'busy', 'unsupported'] as const)(
    'clears the exact window checkpoint on terminal %s without masking the connection error', async state => {
      const api = new FakePermitJoinApi();
      const checkpoints = { save: vi.fn(), list: vi.fn(), remove: vi.fn() };
      const link = new GatewayPermitJoinRecordLink(api, 'device_hub', 1, checkpoints);
      await link.waitForMode(BleApplicationMode.Provisioning);
      api.closeState = state;
      await expect(link.disconnect()).resolves.toBeUndefined();
      expect(checkpoints.remove).toHaveBeenCalledOnce();
      await link.disconnect();
      expect(api.closes).toBe(1);
    },
  );

  it('retains recovery when closing has no authoritative terminal response', async () => {
    const api = new FakePermitJoinApi();
    const checkpoints = { save: vi.fn(), list: vi.fn(), remove: vi.fn() };
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub', 1, checkpoints);
    await link.waitForMode(BleApplicationMode.Provisioning);
    api.closeError = new Error('offline');
    await expect(link.disconnect()).rejects.toThrow('offline');
    expect(checkpoints.remove).not.toHaveBeenCalled();
  });

  it.each(['receive', 'send'] as const)('stops %s immediately on a bound Hub disconnect update', async operation => {
    const api = new FakePermitJoinApi();
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');
    const target = await link.waitForMode(BleApplicationMode.Provisioning);
    await link.connect(target);
    // Even an otherwise valid upstream record/down ACK cannot mask disconnect.
    api.selectionUpdate = { status: EdgeGatewayPermitJoinSelectStatus.Disconnected };
    await expect(operation === 'receive' ? link.receiveRecord() : link.sendRecord(Uint8Array.of(1)))
      .rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECTED');
    await expect(link.sendRecord(Uint8Array.of(2)))
      .rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_NOT_CONNECTED');
    await link.disconnect();
    expect(api.closes).toBe(1);
  });

  it.each(['token', 'packetSize'] as const)('rejects changed %s in post-connect selection updates', async field => {
    const api = new FakePermitJoinApi();
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');
    const target = await link.waitForMode(BleApplicationMode.Provisioning);
    await link.connect(target);
    api.selectionUpdate = {
      status: EdgeGatewayPermitJoinSelectStatus.Connected,
      token: field === 'token' ? directToken : provisioningToken,
      packetSize: field === 'packetSize' ? 19 : 20,
    };
    await expect(link.receiveRecord()).rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_SELECT_MISMATCH');
    await link.disconnect();
  });

  it('starts the BLE discovery budget after a pending window becomes ready', async () => {
    const api = new FakePermitJoinApi();
    api.openPending = true;
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');

    await expect(link.discoverProvisioningDevices(1_000))
      .resolves.toHaveLength(1);
    await link.disconnect();
  });

  it('reuses the BLE enrollment link across separate Provisioning and Direct windows', async () => {
    const api = new FakePermitJoinApi();
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');

    const provisioning = await link.waitForMode(BleApplicationMode.Provisioning);
    await link.connect(provisioning);
    await link.sendRecord(Uint8Array.of(0x21, 0x22));
    await link.disconnect();

    const direct = await link.waitForMode(
      BleApplicationMode.Direct,
      1_000,
      target => target.profile.modeLocator[0] === directToken[0],
    );
    await link.connect(direct);
    await expect(link.receiveRecord()).resolves.toEqual(Uint8Array.of(0x41, 0x42));
    await link.disconnect();

    expect(api.opens).toBe(2);
    expect(api.closes).toBe(2);
  });

  it('abandons transport state when the Broker relay session changes', async () => {
    const api = new FakePermitJoinApi();
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');
    const target = await link.waitForMode(BleApplicationMode.Provisioning);
    api.changeSessionOnSend = true;

    await expect(link.connect(target))
      .rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_RELAY_SESSION_CHANGED');
    await link.disconnect();
  });

  it('sends a maximum record as two bounded 16-packet cloud batches', async () => {
    const api = new FakePermitJoinApi();
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');
    const target = await link.waitForMode(BleApplicationMode.Provisioning);
    await link.connect(target);

    await link.sendRecord(new Uint8Array(512).fill(0x5a));

    expect(api.downBatchPacketCounts).toEqual([16, 16]);
    await link.disconnect();
  });

  it('serializes concurrent receive polling and record sends at the cloud boundary', async () => {
    const api = new FakePermitJoinApi();
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');
    const target = await link.waitForMode(BleApplicationMode.Provisioning);
    await link.connect(target);
    api.requestDelayMs = 10;
    api.maximumConcurrentRequests = 0;

    const [record] = await Promise.all([
      link.receiveRecord(),
      link.sendRecord(Uint8Array.of(0x21, 0x22)),
    ]);

    expect(record).toEqual(Uint8Array.of(0x41, 0x42));
    expect(api.maximumConcurrentRequests).toBe(1);
    await link.disconnect();
  });

  it('re-acknowledges an in-flight duplicate upstream batch without duplicating data', async () => {
    const api = new FakePermitJoinApi();
    api.replayFirstUpstreamBatch = true;
    const link = new GatewayPermitJoinRecordLink(api, 'device_hub');
    const target = await link.waitForMode(BleApplicationMode.Provisioning);
    await link.connect(target);

    await expect(link.receiveRecord()).resolves.toEqual(Uint8Array.of(0x41, 0x42));
    await expect(link.receiveRecord()).resolves.toEqual(Uint8Array.of(0x43, 0x44));

    await link.disconnect();
  });
});
