import {
  EdgeGatewayPermitJoinRelayAckStatus,
  EDGE_GATEWAY_PERMIT_JOIN_BATCH_PACKET_LIMIT,
  EdgeGatewayPermitJoinRelayDirection,
  EdgeGatewayPermitJoinSelectStatus,
  decodePermitJoinCandidateSnapshot,
  decodePermitJoinRelayAck,
  decodePermitJoinRelayBatch,
  decodePermitJoinSelectResult,
  encodePermitJoinRelayAck,
  encodePermitJoinRelayBatch,
  encodePermitJoinSelectCommand,
} from '../../protocol/device-v2';
import { BleDirectCrypto } from '../ble-direct/crypto';
import {
  BleDirectRecordLink,
  BleDirectTarget,
  BleDirectTargetMatcher,
  FragmentReassembler,
  fragmentBleRecord,
} from '../ble-direct/transport';
import {
  BleApplicationMode,
  BleModeCapability,
  base64UrlEncode,
  decodeBleModeProfile,
  sameBytes,
} from '../ble-direct/wire';
import {
  EdgeGatewayPermitJoinApi,
  EdgeGatewayPermitJoinRelayView,
  EdgeGatewayPermitJoinWindow,
} from './permit-join-api';
import { EdgeGatewayPermitJoinCheckpointStore } from './permit-join-checkpoint-store';

const NATIVE_GATT_ADAPTER_ID = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
// A record may span 32 stop-and-wait ATT20 packets. Bound time without
// penalizing healthy progress: this is an inactivity deadline, while the
// server-owned permit-window expiry remains the hard whole-operation limit.
const RECORD_IDLE_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 200;
const CONTROL_POLL_INTERVAL_MS = 500;
const CLOSE_TIMEOUT_MS = 15_000;

interface CandidateReference {
  operationId: Uint8Array;
  candidateToken: Uint8Array;
}

// This link deliberately implements only the existing record-link boundary.
// Noise, enrollment grants, Method 2 and BBP/2 remain end-to-end between App
// and child. The Edge Hub sees bounded GATT packets and rotating locators only.
export class GatewayPermitJoinRecordLink implements BleDirectRecordLink {
  private operationId?: Uint8Array;
  private relaySessionId?: Uint8Array;
  private expiresAt = 0;
  private revision = 0;
  private packetSize = 0;
  private downSequence = 1;
  private upSequence = 1;
  private frameId = 0;
  private connected = false;
  private closing = false;
  private requestTail: Promise<void> = Promise.resolve();
  private disconnectPromise?: Promise<void>;
  private readonly candidates = new Map<string, CandidateReference>();
  private readonly reassembler = new FragmentReassembler();
  private readonly receivedRecords: Uint8Array[] = [];

  constructor(
    private readonly api: EdgeGatewayPermitJoinApi,
    private readonly edgeHubLogicalDeviceId: string,
    private readonly adapterId = NATIVE_GATT_ADAPTER_ID,
    private readonly checkpoints?: EdgeGatewayPermitJoinCheckpointStore,
    private readonly crypto = new BleDirectCrypto(),
  ) {
    if (!edgeHubLogicalDeviceId || edgeHubLogicalDeviceId.length > 128
      || edgeHubLogicalDeviceId.includes('\0') || edgeHubLogicalDeviceId.includes('/')
      || !Number.isSafeInteger(adapterId) || adapterId < 1 || adapterId > 0xffff) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_LINK_CONFIG_INVALID');
    }
  }

  async waitForMode(
    mode: BleApplicationMode,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    matcher?: BleDirectTargetMatcher,
  ): Promise<BleDirectTarget> {
    this.timeout(timeoutMs, false);
    if (this.operationId || this.connected) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECT_REQUIRED');
    }
    try {
      await this.openWindow(Date.now() + DEFAULT_TIMEOUT_MS);
      const deadline = Date.now() + timeoutMs;
      const evaluated = new Set<string>();
      while (Date.now() < this.deadline(deadline)) {
        const view = await this.readRelay();
        for (const target of this.targets(view, mode)) {
          if (evaluated.has(target.device.deviceId)) continue;
          evaluated.add(target.device.deviceId);
          if (!matcher || await matcher(target)) return target;
          this.candidates.delete(target.device.deviceId);
        }
        await this.pause(deadline);
      }
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SCAN_TIMEOUT');
    } catch (error) {
      await this.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async discoverProvisioningDevices(timeoutMs = 2_500): Promise<BleDirectTarget[]> {
    this.timeout(timeoutMs, false);
    if (this.operationId || this.connected) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECT_REQUIRED');
    }
    const found = new Map<string, BleDirectTarget>();
    try {
      // Network/control-plane latency is not BLE scan time. First establish a
      // bounded permit window, then give the radio the requested scan budget.
      await this.openWindow(Date.now() + DEFAULT_TIMEOUT_MS);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < this.deadline(deadline)) {
        const view = await this.readRelay();
        for (const target of this.targets(view, BleApplicationMode.Provisioning)) {
          found.set(target.device.deviceId, target);
        }
        const remaining = this.deadline(deadline) - Date.now();
        if (remaining <= 0) break;
        await new Promise(resolve => setTimeout(
          resolve, Math.min(POLL_INTERVAL_MS, remaining),
        ));
      }
      if (!found.size) throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SCAN_TIMEOUT');
      return [...found.values()].sort(
        (left, right) => (right.rssi ?? -100) - (left.rssi ?? -100),
      );
    } catch (error) {
      await this.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async connect(target: BleDirectTarget): Promise<void> {
    if (this.connected || !this.operationId) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CONNECT_STATE_INVALID');
    }
    const reference = this.candidates.get(target.device.deviceId);
    if (!reference || !sameBytes(reference.operationId, this.operationId)
      || !sameBytes(reference.candidateToken, target.profile.modeLocator)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_TARGET_INVALID');
    }
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    let view = await this.sendRelay(encodePermitJoinSelectCommand({
      operationId: this.operationId,
      candidateToken: reference.candidateToken,
    }));
    while (Date.now() < this.deadline(deadline)) {
      if (view.selectResult) {
        const result = decodePermitJoinSelectResult(view.selectResult);
        this.requireOperation(result.operationId);
        if (!sameBytes(result.candidateToken, reference.candidateToken)) {
          throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SELECT_MISMATCH');
        }
        if (result.status === EdgeGatewayPermitJoinSelectStatus.Connected) {
          this.packetSize = result.maxPacketSize;
          this.connected = true;
          return;
        }
        if (result.status !== EdgeGatewayPermitJoinSelectStatus.Connecting) {
          throw new Error(`EDGE_GATEWAY_PERMIT_JOIN_SELECT_${result.status}`);
        }
      }
      await this.pause(deadline);
      view = await this.readRelay();
    }
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CONNECT_TIMEOUT');
  }

  async sendRecord(record: Uint8Array, writeTimeoutMs = RECORD_IDLE_TIMEOUT_MS): Promise<void> {
    this.timeout(writeTimeoutMs, false);
    this.requireConnected();
    this.frameId = this.frameId === 0xff ? 1 : this.frameId + 1;
    const packets = fragmentBleRecord(record, this.packetSize, this.frameId);
    for (let offset = 0; offset < packets.length;
      offset += EDGE_GATEWAY_PERMIT_JOIN_BATCH_PACKET_LIMIT) {
      const deadline = Date.now() + writeTimeoutMs;
      const sequence = this.nextDownSequence();
      let view = await this.sendRelay(encodePermitJoinRelayBatch({
        operationId: this.operationId!,
        direction: EdgeGatewayPermitJoinRelayDirection.Down,
        sequence,
        packets: packets.slice(
          offset, offset + EDGE_GATEWAY_PERMIT_JOIN_BATCH_PACKET_LIMIT,
        ),
      }));
      while (Date.now() < this.deadline(deadline)) {
        if (view.downAck) {
          const ack = decodePermitJoinRelayAck(view.downAck);
          this.requireOperation(ack.operationId);
          if (ack.direction !== EdgeGatewayPermitJoinRelayDirection.Down
            || ack.sequence > sequence) {
            throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DOWN_ACK_MISMATCH');
          }
          if (ack.sequence === sequence) {
            if (ack.status !== EdgeGatewayPermitJoinRelayAckStatus.Accepted) {
              throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DOWN_REJECTED');
            }
            break;
          }
        }
        await this.pause(deadline);
        view = await this.readRelay();
      }
      if (!view.downAck
        || decodePermitJoinRelayAck(view.downAck).sequence !== sequence) {
        throw new Error('EDGE_GATEWAY_PERMIT_JOIN_WRITE_TIMEOUT');
      }
    }
  }

  async receiveRecord(timeoutMs = RECORD_IDLE_TIMEOUT_MS): Promise<Uint8Array> {
    this.timeout(timeoutMs, true);
    this.requireConnected();
    const queued = this.receivedRecords.shift();
    if (queued) return queued;
    let idleDeadline = timeoutMs === 0
      ? Number.MAX_SAFE_INTEGER : Date.now() + timeoutMs;
    while (!this.closing && Date.now() < this.deadline(idleDeadline)) {
      const view = await this.readRelay();
      if (!view.upstreamBatch) {
        await this.pause(idleDeadline);
        continue;
      }
      const batch = decodePermitJoinRelayBatch(view.upstreamBatch);
      this.requireOperation(batch.operationId);
      if (batch.direction !== EdgeGatewayPermitJoinRelayDirection.Up) {
        throw new Error('EDGE_GATEWAY_PERMIT_JOIN_UP_SEQUENCE_MISMATCH');
      }
      if (batch.sequence + 1 === this.upSequence) {
        // The Hub clears its stop-and-wait slot only after this ACK crosses
        // the cloud boundary. Until then a read may replay the exact previous
        // batch; acknowledge it again without feeding duplicate packets to
        // the record reassembler.
        await this.sendRelay(encodePermitJoinRelayAck({
          operationId: this.operationId!,
          direction: EdgeGatewayPermitJoinRelayDirection.Up,
          sequence: batch.sequence,
          status: EdgeGatewayPermitJoinRelayAckStatus.Accepted,
        }));
        continue;
      }
      if (batch.sequence !== this.upSequence) {
        throw new Error('EDGE_GATEWAY_PERMIT_JOIN_UP_SEQUENCE_MISMATCH');
      }
      for (const packet of batch.packets) {
        const record = this.reassembler.push(packet, this.packetSize);
        if (record) this.receivedRecords.push(record);
      }
      await this.sendRelay(encodePermitJoinRelayAck({
        operationId: this.operationId!,
        direction: EdgeGatewayPermitJoinRelayDirection.Up,
        sequence: batch.sequence,
        status: EdgeGatewayPermitJoinRelayAckStatus.Accepted,
      }));
      this.upSequence += 1;
      const record = this.receivedRecords.shift();
      if (record) return record;
      if (timeoutMs !== 0) idleDeadline = Date.now() + timeoutMs;
    }
    this.reassembler.reset();
    this.receivedRecords.length = 0;
    if (this.closing) throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECTED');
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RECEIVE_TIMEOUT');
  }

  async disconnect(): Promise<void> {
    if (this.disconnectPromise) return this.disconnectPromise;
    const pending = this.closeOperation();
    this.disconnectPromise = pending;
    try {
      await pending;
    } finally {
      if (this.disconnectPromise === pending) this.disconnectPromise = undefined;
    }
  }

  private async closeOperation(): Promise<void> {
    const operationId = this.operationId?.slice();
    this.closing = true;
    this.connected = false;
    this.packetSize = 0;
    this.reassembler.reset();
    this.receivedRecords.length = 0;
    if (!operationId) {
      this.clear();
      return;
    }
    let terminal = false;
    try {
      let window = this.acceptWindow(await this.request(
        () => this.api.close(operationId), true,
      ));
      const deadline = Date.now() + CLOSE_TIMEOUT_MS;
      while (window.state === 'pending_open' || window.state === 'ready'
        || window.state === 'pending_close') {
        await this.pause(deadline, CONTROL_POLL_INTERVAL_MS);
        window = this.acceptWindow(await this.request(
          () => this.api.get(operationId), true,
        ));
      }
      if (window.state !== 'closed' && window.state !== 'expired') {
        throw new Error(`EDGE_GATEWAY_PERMIT_JOIN_CLOSE_${window.state.toUpperCase()}`);
      }
      terminal = true;
    } finally {
      try {
        if (terminal) await this.checkpoints?.remove(operationId);
      } finally {
        operationId.fill(0);
        this.clear();
      }
    }
  }

  private target(candidate: {
    candidateToken: Uint8Array;
    wireVersion: number;
    capabilities: number;
    signalQuality: number;
  }): BleDirectTarget | undefined {
    if (candidate.candidateToken.length !== 8) return undefined;
    const provisioning = candidate.wireVersion === 1
      && (candidate.capabilities & BleModeCapability.EnrollmentV2) !== 0;
    const direct = (candidate.wireVersion === 2 || candidate.wireVersion === 3)
      && (candidate.capabilities & BleModeCapability.DirectBbp2) !== 0;
    if (provisioning === direct) return undefined;
    const serviceData = new Uint8Array(13);
    serviceData.set([
      1,
      provisioning ? BleApplicationMode.Provisioning : BleApplicationMode.Direct,
      candidate.wireVersion,
      candidate.capabilities & 0xff,
      (candidate.capabilities >> 8) & 0xff,
    ]);
    serviceData.set(candidate.candidateToken, 5);
    try {
      const profile = decodeBleModeProfile(serviceData);
      return {
        device: {
          deviceId: `gateway:${base64UrlEncode(this.operationId!)}:${base64UrlEncode(
            candidate.candidateToken,
          )}`,
          name: 'Blinker',
        },
        profile,
        rssi: candidate.signalQuality - 100,
      };
    } catch {
      return undefined;
    }
  }

  private targets(
    view: EdgeGatewayPermitJoinRelayView,
    mode: BleApplicationMode,
  ): BleDirectTarget[] {
    if (!view.candidateSnapshot) return [];
    const snapshot = decodePermitJoinCandidateSnapshot(view.candidateSnapshot);
    this.requireOperation(snapshot.operationId);
    const targets: BleDirectTarget[] = [];
    for (const candidate of snapshot.candidates) {
      const target = this.target(candidate);
      if (!target || target.profile.mode !== mode) continue;
      this.candidates.set(target.device.deviceId, {
        operationId: this.operationId!.slice(),
        candidateToken: candidate.candidateToken.slice(),
      });
      targets.push(target);
    }
    return targets;
  }

  private async openWindow(deadline: number): Promise<void> {
    this.closing = false;
    const operationId = this.crypto.random(16);
    this.operationId = operationId;
    this.candidates.clear();
    await this.checkpoints?.save({
      operationId,
      edgeHubLogicalDeviceId: this.edgeHubLogicalDeviceId,
      adapterId: this.adapterId,
    });
    let window = this.acceptWindow(await this.request(() => this.api.open(
      operationId, this.edgeHubLogicalDeviceId, this.adapterId,
    )));
    this.expiresAt = window.expiresAt;
    while (window.state === 'pending_open') {
      await this.pause(deadline, CONTROL_POLL_INTERVAL_MS);
      window = this.acceptWindow(await this.request(() => this.api.get(operationId)));
      this.expiresAt = window.expiresAt;
    }
    if (window.state !== 'ready') {
      throw new Error(`EDGE_GATEWAY_PERMIT_JOIN_${window.state.toUpperCase()}`);
    }
  }

  private async readRelay(): Promise<EdgeGatewayPermitJoinRelayView> {
    const operationId = this.operationId!;
    return this.acceptView(await this.request(() => this.api.readRelay(operationId)));
  }

  private async sendRelay(frame: Uint8Array): Promise<EdgeGatewayPermitJoinRelayView> {
    const operationId = this.operationId!;
    return this.acceptView(await this.request(() => this.api.sendRelay(operationId, frame)));
  }

  private request<T>(operation: () => Promise<T>, allowClosing = false): Promise<T> {
    const pending = this.requestTail.then(() => {
      if (this.closing && !allowClosing) {
        throw new Error('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECTED');
      }
      return operation();
    });
    this.requestTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private acceptView(view: EdgeGatewayPermitJoinRelayView): EdgeGatewayPermitJoinRelayView {
    this.requireOperation(view.operationId);
    if (this.relaySessionId && !sameBytes(this.relaySessionId, view.relaySessionId)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RELAY_SESSION_CHANGED');
    }
    if (view.revision < this.revision) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RELAY_REVISION_REGRESSED');
    }
    if (!this.relaySessionId) this.relaySessionId = view.relaySessionId.slice();
    this.revision = view.revision;
    this.expiresAt = Math.min(this.expiresAt, view.expiresAt);
    return view;
  }

  private acceptWindow(window: EdgeGatewayPermitJoinWindow): EdgeGatewayPermitJoinWindow {
    this.requireOperation(window.operationId);
    if (window.edgeHubLogicalDeviceId !== this.edgeHubLogicalDeviceId
      || window.adapterId !== this.adapterId) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_WINDOW_MISMATCH');
    }
    return window;
  }

  private requireOperation(value: Uint8Array): void {
    if (!this.operationId || !sameBytes(this.operationId, value)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_MISMATCH');
    }
  }

  private requireConnected(): void {
    if (!this.connected || !this.operationId || !this.relaySessionId
      || this.packetSize < 5 || this.packetSize > 20) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_NOT_CONNECTED');
    }
  }

  private nextDownSequence(): number {
    if (this.downSequence > 4096) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_BATCH_LIMIT');
    }
    return this.downSequence++;
  }

  private deadline(requested: number): number {
    return this.expiresAt > 0 ? Math.min(requested, this.expiresAt) : requested;
  }

  private async pause(deadline: number, intervalMs = POLL_INTERVAL_MS): Promise<void> {
    const remaining = this.deadline(deadline) - Date.now();
    if (remaining <= 0) throw new Error('EDGE_GATEWAY_PERMIT_JOIN_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }

  private timeout(value: number, allowZero: boolean): void {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_TIMEOUT_INVALID');
    }
  }

  private clear(): void {
    this.operationId?.fill(0);
    this.relaySessionId?.fill(0);
    for (const value of this.candidates.values()) {
      value.operationId.fill(0);
      value.candidateToken.fill(0);
    }
    this.operationId = undefined;
    this.relaySessionId = undefined;
    this.expiresAt = 0;
    this.revision = 0;
    this.packetSize = 0;
    this.downSequence = 1;
    this.upSequence = 1;
    this.frameId = 0;
    this.connected = false;
    this.candidates.clear();
    this.reassembler.reset();
    this.receivedRecords.length = 0;
  }
}
