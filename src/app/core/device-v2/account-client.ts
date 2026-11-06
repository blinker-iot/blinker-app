import { AccountConnectionResponse } from '../model/response.model';
import {
  DeviceV2Ack,
  DeviceV2Channel,
  DeviceV2Session,
  DeviceV2Store,
  DeviceV2TargetSnapshot,
  DeviceV2TelemetryLease,
  DeviceV2TelemetryOptions,
  bytesToHex,
} from '../protocol/device-v2';
import { isLogicalDeviceReferenceId } from '../protocol/device-v2/logical-device-reference';
import { accountInventoryPeers, accountLogicalDevicePeerId, DeviceV2AccountPeerCollisionError } from './account-peer-id';
import { DeviceV2TransportConfigError } from './transport-config.error';
import { DeviceV2ReadyWaits } from './ready-waits';
import { DeviceV2DemandOwner, DeviceV2DirectOwner } from '../protocol/device-v2/connection-demand';

export type DeviceV2AccountState = 'idle' | 'connecting' | 'ready' | 'retrying' | 'stopped';
export type DeviceV2CredentialProvider = (signal?: AbortSignal) => Promise<AccountConnectionResponse>;
export type DeviceV2ChannelFactory = (
  response: AccountConnectionResponse,
) => Promise<DeviceV2Channel>;

export interface DeviceV2AccountClientOptions {
  reconnectBaseMs?: number;
  reconnectMaximumMs?: number;
}

export class DeviceV2AccountSuspendedError extends Error {
  readonly code = 'DEVICE_V2_ACCOUNT_SUSPENDED';
  constructor() { super('Device V2 Cloud is suspended by a Local provisioning owner'); }
}

export class DeviceV2AccountClient {
  readonly store = new DeviceV2Store(undefined, undefined, isLogicalDeviceReferenceId);
  private readonly readyWaits = new DeviceV2ReadyWaits(() => this.currentSession(), this.store, isLogicalDeviceReferenceId);

  private stateValue: DeviceV2AccountState = 'idle';
  private desired = false;
  private generation = 0;
  private reconnectAttempt = 0;
  private connecting?: Promise<void>;
  private session?: DeviceV2Session;
  private presenceTargets = new Set<string>();
  private inventoryGeneration = 0;
  private peerClaims = new Map<string, string>();
  private identityError?: DeviceV2AccountPeerCollisionError;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private transportConfigError?: DeviceV2TransportConfigError;
  private suspended = false;
  private credentialAbort?: AbortController;
  private readonly listeners = new Set<(state: DeviceV2AccountState) => void>();
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaximumMs: number;

  constructor(
    private readonly credentials: DeviceV2CredentialProvider,
    private readonly channels: DeviceV2ChannelFactory,
    options: DeviceV2AccountClientOptions = {},
  ) {
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
    this.reconnectMaximumMs = options.reconnectMaximumMs ?? 30_000;
    if (!Number.isInteger(this.reconnectBaseMs) || this.reconnectBaseMs < 1
      || !Number.isInteger(this.reconnectMaximumMs)
      || this.reconnectMaximumMs < this.reconnectBaseMs) {
      throw new Error('Device V2 account reconnect options are invalid');
    }
  }

  get state(): DeviceV2AccountState {
    return this.stateValue;
  }

  subscribeState(listener: (state: DeviceV2AccountState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.identityError) return Promise.reject(this.identityError);
    if (this.suspended) return Promise.reject(new DeviceV2AccountSuspendedError());
    if (this.transportConfigError) return Promise.reject(this.transportConfigError);
    this.desired = true;
    for (const id of this.presenceTargets) this.claimTarget(id);
    if (this.session?.state === 'ready') return Promise.resolve();
    return this.connect();
  }

  async stop(): Promise<void> {
    this.readyWaits.retire();
    this.peerClaims.clear();
    if (!this.desired && this.stateValue === 'stopped') return;
    this.desired = false;
    this.generation += 1;
    this.credentialAbort?.abort(new Error('Device V2 account session changed'));
    this.credentialAbort = undefined;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    // An unresponsive credential provider must not hold account teardown.
    // open() and its finally already fence late results by generation/task.
    this.connecting = undefined;
    this.setState('stopped');
    await this.closeSession();
  }

  /** Preserve cached state, presence targets and normal UNKNOWN teardown semantics. */
  async setSuspended(suspended: boolean): Promise<void> {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (!suspended) return; // Permission for future work, never an automatic resume.
    this.readyWaits.retire();
    this.generation += 1;
    clearTimeout(this.refreshTimer); this.refreshTimer = undefined;
    clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
    this.credentialAbort?.abort(new DeviceV2AccountSuspendedError());
    this.credentialAbort = undefined;
    this.connecting = undefined;
    this.setState('stopped');
    await this.closeSession();
  }

  async reset(): Promise<void> {
    try {
      await this.stop();
    } finally {
      this.transportConfigError = undefined;
      this.reconnectAttempt = 0;
      this.presenceTargets.clear();
      this.peerClaims.clear();
      this.identityError = undefined;
      ++this.inventoryGeneration;
      this.store.clear();
    }
  }

  async ensureReady(logicalDeviceId: string): Promise<void> {
    this.claimTarget(logicalDeviceId);
    await (await this.currentSession()).ensureReady(logicalDeviceId);
  }

  waitUntilReady(logicalDeviceId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return this.readyWaits.wait(logicalDeviceId, signal);
    try { this.claimTarget(logicalDeviceId); } catch (error) { return Promise.reject(error); }
    return this.readyWaits.wait(logicalDeviceId, signal);
  }

  async acquireStateInterest(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceV2DemandOwner | undefined> {
    signal.throwIfAborted();
    this.claimTarget(logicalDeviceId);
    const session = await this.currentSession();
    signal.throwIfAborted();
    return session.acquireStateInterest(logicalDeviceId, signal);
  }

  async acquireConnectionDemand(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceV2DemandOwner> {
    signal.throwIfAborted();
    this.claimTarget(logicalDeviceId);
    const session = await this.currentSession();
    signal.throwIfAborted();
    return session.acquireConnectionDemand(logicalDeviceId, signal);
  }

  async reserveDirectPriority(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceV2DirectOwner> {
    signal.throwIfAborted();
    this.claimTarget(logicalDeviceId);
    const session = await this.currentSession();
    signal.throwIfAborted();
    return session.reserveDirectPriority(logicalDeviceId, signal);
  }

  async command(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<DeviceV2Ack> {
    this.claimTarget(logicalDeviceId);
    return (await this.currentSession()).command(logicalDeviceId, endpointKey, value);
  }

  async openTelemetry(
    logicalDeviceId: string,
    endpointKeys: string[],
    intervalMs: number,
    options?: DeviceV2TelemetryOptions,
  ): Promise<DeviceV2TelemetryLease> {
    this.claimTarget(logicalDeviceId);
    return (await this.currentSession()).openTelemetry(logicalDeviceId, endpointKeys, intervalMs, options);
  }

  async watchPresence(logicalDeviceIds: string[]): Promise<void> {
    if (!Array.isArray(logicalDeviceIds) || logicalDeviceIds.length > 256
      || logicalDeviceIds.some(id => !isLogicalDeviceReferenceId(id))) {
      throw new Error('Device V2 presence targets are invalid');
    }
    let peers: Map<string, string>;
    try { peers = accountInventoryPeers(logicalDeviceIds); }
    catch (error) {
      if (error instanceof DeviceV2AccountPeerCollisionError) this.rejectPeerCollision();
      throw error;
    }
    // A fresh nonambiguous inventory may retire a collision fence, but never
    // remap a live session's bytes to another card. The old session was closed.
    if (this.identityError) { this.identityError = undefined; this.peerClaims.clear(); }
    for (const [peer, id] of peers) {
      const existing = this.peerClaims.get(peer);
      if (existing !== undefined && existing !== id) this.rejectPeerCollision();
    }
    if (new Set([...this.peerClaims.keys(), ...peers.keys()]).size > 256) throw Error('Device V2 account peer capacity');
    for (const [peer, id] of peers) this.peerClaims.set(peer, id);
    this.presenceTargets = new Set(logicalDeviceIds);
    const inventory = ++this.inventoryGeneration;
    if (!this.presenceTargets.size) return;
    const session = await this.currentSession();
    if (inventory !== this.inventoryGeneration) return;
    await this.subscribePresence(session, inventory);
  }

  snapshot(logicalDeviceId: string): DeviceV2TargetSnapshot {
    return this.store.snapshot(logicalDeviceId);
  }

  private connect(force = false): Promise<void> {
    if (this.suspended) return Promise.reject(new DeviceV2AccountSuspendedError());
    if (this.transportConfigError) return Promise.reject(this.transportConfigError);
    if (!this.desired) return Promise.reject(new Error('Device V2 account client is stopped'));
    if (!force && this.session?.state === 'ready') return Promise.resolve();
    if (this.connecting) return this.connecting;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const generation = ++this.generation;
    const credentialAbort = new AbortController();
    this.credentialAbort = credentialAbort;
    const task = this.open(generation, credentialAbort.signal).catch(async error => {
      if (!this.suspended && this.desired && generation === this.generation) {
        if (error instanceof DeviceV2TransportConfigError) {
          await this.blockTransport(error);
        } else {
          this.scheduleReconnect();
        }
      }
      throw error;
    }).finally(() => {
      if (this.connecting === task) this.connecting = undefined;
      if (this.credentialAbort === credentialAbort) this.credentialAbort = undefined;
    });
    if (!this.suspended && generation === this.generation) this.connecting = task;
    return task;
  }

  private async open(generation: number, signal: AbortSignal): Promise<void> {
    this.setState('connecting');
    if (this.suspended || !this.desired || generation !== this.generation) return;
    const response = await this.credentials(signal);
    if (this.suspended || !this.desired || generation !== this.generation) return;
    this.validateCredential(response);
    await this.closeSession();
    if (this.suspended || !this.desired || generation !== this.generation) return;
    const channel = await this.channels(response);
    if (this.suspended || !this.desired || generation !== this.generation) {
      await channel.close?.();
      return;
    }
    const session: DeviceV2Session = new DeviceV2Session(channel, this.store, { peerId: id => {
      if (this.session !== session || session.state === 'closed' || !this.desired || this.suspended)
        throw Error('Device V2 account session changed');
      return this.claimTarget(id);
    } });
    session.subscribeErrors(() => {
      // A target's bounded recovery/resync error is not an account transport loss.
      if (this.desired && this.session === session && session.state === 'closed') this.scheduleReconnect();
    });
    this.session = session;
    try {
      await session.start();
      await this.subscribePresence(session);
    } catch (error) {
      if (this.session === session) this.session = undefined;
      await session.close().catch(() => undefined);
      throw error;
    }
    if (this.suspended || !this.desired || generation !== this.generation || this.session !== session) {
      await session.close();
      return;
    }
    this.reconnectAttempt = 0;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.setState('ready');
    // State consumers are synchronous and may enter Local while notified.
    if (this.suspended || !this.desired || generation !== this.generation || this.session !== session) return;
    const refreshSeconds = Math.max(1, Math.floor(response.mqtt.expiresIn * 0.8));
    const refreshTimer = setTimeout(() => {
      if (this.refreshTimer !== refreshTimer) return;
      this.refreshTimer = undefined;
      if (this.suspended || !this.desired || generation !== this.generation || this.session !== session) return;
      void this.connect(true).catch(() => undefined);
    }, refreshSeconds * 1000);
    this.refreshTimer = refreshTimer;
  }

  private scheduleReconnect(): void {
    if (this.suspended || !this.desired || this.reconnectTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    const generation = this.generation;
    this.setState('retrying');
    if (this.suspended || !this.desired || generation !== this.generation || this.reconnectTimer) return;
    const delay = Math.min(
      this.reconnectMaximumMs,
      this.reconnectBaseMs * (2 ** Math.min(this.reconnectAttempt, 10)),
    );
    this.reconnectAttempt += 1;
    const reconnectTimer = setTimeout(() => {
      if (this.reconnectTimer !== reconnectTimer) return;
      this.reconnectTimer = undefined;
      if (this.suspended || !this.desired || generation !== this.generation) return;
      void this.connect(true).catch(() => undefined);
    }, delay);
    this.reconnectTimer = reconnectTimer;
  }

  private async closeSession(): Promise<void> {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    const session = this.session;
    this.session = undefined;
    if (session) await session.close();
  }

  private validateCredential(response: AccountConnectionResponse): void {
    if (!response || response.wire !== 'bbp2' || response.protocolVersion !== 2
      || response.transport !== 'websocket'
      || !response.mqtt
      || !Number.isInteger(response.mqtt.expiresIn) || response.mqtt.expiresIn < 1) {
      throw new DeviceV2TransportConfigError(
        'Device V2 account credential contract is invalid',
      );
    }
  }

  private async blockTransport(error: DeviceV2TransportConfigError): Promise<void> {
    this.desired = false;
    this.generation += 1;
    this.transportConfigError = error;
    this.reconnectAttempt = 0;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    await this.closeSession().catch(() => undefined);
    this.setState('stopped');
  }

  private async currentSession(): Promise<DeviceV2Session> {
    const connecting = this.start();
    const generation = this.generation;
    await connecting;
    if (this.suspended || !this.desired || generation !== this.generation) throw new Error('Device V2 account session changed');
    if (this.session?.state !== 'ready') throw new Error('Device V2 account session is not ready');
    return this.session;
  }

  private claimTarget(id: string): Uint8Array {
    if (this.identityError) throw this.identityError;
    const peer = accountLogicalDevicePeerId(id), key = bytesToHex(peer), existing = this.peerClaims.get(key);
    if (existing !== undefined && existing !== id) this.rejectPeerCollision();
    if (existing === undefined && this.peerClaims.size >= 256) throw Error('Device V2 account peer capacity');
    this.peerClaims.set(key, id);
    return peer;
  }

  private rejectPeerCollision(): never {
    const error = this.identityError = new DeviceV2AccountPeerCollisionError();
    this.presenceTargets.clear(); ++this.inventoryGeneration;
    // stop() closes/fences the session synchronously before awaiting channel
    // release. A collision cannot leave the first spelling subscribed/usable.
    void this.stop().catch(() => undefined);
    this.store.resetSession();
    throw error;
  }

  private async subscribePresence(session: DeviceV2Session, inventory = this.inventoryGeneration): Promise<void> {
    for (const logicalDeviceId of this.presenceTargets) {
      if (inventory !== this.inventoryGeneration || this.session !== session) return;
      try {
        await session.subscribePresence(logicalDeviceId);
      } catch (error) {
        if (session.state !== 'ready') throw error;
        // Inventory and ACL can change between HTTP load and MQTT subscribe.
      }
    }
  }

  private setState(state: DeviceV2AccountState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    for (const listener of this.listeners) listener(state);
  }
}
