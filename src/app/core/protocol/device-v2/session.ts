import {
  bytesToHex,
  BBP2_FEATURE_PRESENCE,
  BBP2_FEATURE_PRESENCE_RECOVERY,
  BBP2_FEATURE_STATE_INTEREST,
  BBP2_FEATURE_MANIFEST_CHANGED,
  BBP2_FEATURE_STATE_RECOVERY,
  decodeManifestChangedBody,
  decodePresenceLostBody,
  BBP2_FEATURE_CONNECTION_DEMAND,
  BBP2_FEATURE_DIRECT_PRIORITY,
  BBP2_FEATURE_DIRECT_READY,
  decodeDirectReadyStatusBody,
  encodeDirectReadyQueryBody,
  decodeDirectPriorityStatusBody,
  encodeDirectPriorityBody,
  decodeConnectionDemandStatusBody,
  encodeConnectionDemandBody,
  decodeAckBody,
  decodeDeliveryBody,
  decodeErrorBody,
  decodeEventBody,
  decodeFrame,
  decodeManifestPageBody,
  decodePatchBody,
  decodePresenceBody,
  decodeServerHelloBody,
  decodeStatePageBody,
  decodeTelemetryDataBody,
  decodeTelemetryStatusBody,
  encodeAppHelloBody,
  encodeCommandBody,
  encodeFrame,
  encodeManifestAcceptBody,
  encodeManifestRequestBody,
  encodePresenceControlBody,
  encodeRouteBody,
  encodeStateRequestBody,
  encodeTelemetryControlBody,
  hexToBytes,
  logicalDevicePeerId,
} from './codec';
import { DeviceV2Store, isDeviceV2TargetReady } from './store';
import { DeviceV2PresenceSubscriptions } from './presence';
import { DeviceV2DemandOwner, DeviceV2DemandOwners, DeviceV2DirectOwner, DeviceV2DemandError, DeviceV2DemandCloseReason } from './connection-demand';
import {
  DeviceV2TelemetryLease,
  DeviceV2TelemetryManager,
  DeviceV2TelemetryOptions,
  validateDeviceV2TelemetryFields,
} from './telemetry';
import {
  Bbp2Delivery,
  Bbp2ErrorCode,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  Bbp2RoutePeerKind,
  DeviceV2Ack,
  DeviceV2ManifestField,
  DeviceV2PresenceOperation,
  DeviceV2TelemetryControl,
  DeviceV2TelemetryStatus,
} from './types';

export interface DeviceV2Channel {
  publish(payload: Uint8Array): Promise<void>;
  onMessage(listener: (payload: Uint8Array) => void): () => void;
  onClose(listener: (reason?: unknown) => void): () => void;
  close?(): Promise<void>;
}

export interface DeviceV2SessionOptions {
  maxFrameSize?: number;
  reliableWindow?: number;
  requestTimeoutMs?: number;
  routeRetries?: number;
  requestId?: () => Uint8Array;
}

export type DeviceV2SessionState = 'idle' | 'negotiating' | 'ready' | 'closed';

export class DeviceV2TargetUnavailableError extends Error {
  readonly code = 'DEVICE_V2_TARGET_UNREACHABLE';

  constructor() {
    super('Device is currently unreachable');
    this.name = 'DeviceV2TargetUnavailableError';
  }
}

export class DeviceV2RouteError extends Error {
  constructor(
    readonly code: Bbp2ErrorCode,
    readonly relatedSequence?: number,
    readonly stateRevision?: number,
  ) {
    super(`Device V2 route failed with wire error ${code}`);
    this.name = 'DeviceV2RouteError';
  }
}

export class DeviceV2CommandOutcomeUnknownError extends Error {
  readonly code = 'DEVICE_V2_COMMAND_OUTCOME_UNKNOWN';
  constructor() {
    super('Device command execution has not been confirmed');
    this.name = 'DeviceV2CommandOutcomeUnknownError';
  }
}

interface PendingRoute {
  targetPeerId: Uint8Array;
  sequence: number;
  frame: Uint8Array;
  retries: number;
  release: boolean;
  dispose: () => void;
  timer?: ReturnType<typeof setTimeout>;
  resolve: (result: RouteResult) => void;
  reject: (error: Error) => void;
}

const MAX_PENDING_ROUTES = 16;
const MAX_PUBLISHES_WITH_RELEASES = 32;

interface RouteResult {
  sequence: number;
  delivery: Bbp2Delivery;
}

interface StateConsumer {
  accept(): void;
  reject(error: Error): void;
  close(reason: DeviceV2DemandCloseReason): void;
  dispose(): void;
}
interface StateConsumers {
  owners: Set<StateConsumer>;
  lease?: DeviceV2DemandOwner;
  accepted: boolean;
  established: boolean;
  generation: number;
  recoveries: number;
  due?: number;
  pending: boolean;
  manifestFingerprint?: string;
}

function asError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function randomRequestId(): Uint8Array {
  const output = new Uint8Array(16);
  do globalThis.crypto.getRandomValues(output);
  while (!output.some(value => value !== 0));
  return output;
}

export class DeviceV2Session {
  readonly store: DeviceV2Store;
  readonly telemetry: DeviceV2TelemetryManager;
  private readonly connectionDemands: DeviceV2DemandOwners;
  private readonly stateInterests: DeviceV2DemandOwners;
  private readonly stateConsumers = new Map<string, StateConsumers>();
  private resyncTimer?: ReturnType<typeof setTimeout>;
  private resyncActive = 0;
  private publishing = 0;

  private stateValue: DeviceV2SessionState = 'idle';
  private sequence = 0;
  private helloSequence = 0;
  private helloResponse = false;
  private helloAck = false;
  private negotiatedFeatures = 0;
  private readonly presence: DeviceV2PresenceSubscriptions;
  private helloTimer?: ReturnType<typeof setTimeout>;
  private startPromise?: Promise<void>;
  private closePromise?: Promise<void>;
  private resolveStart?: () => void;
  private rejectStart?: (error: Error) => void;
  private detachMessage?: () => void;
  private detachClose?: () => void;
  private readonly pending = new Map<string, PendingRoute>();
  private readonly logicalDeviceByPeer = new Map<string, string>();
  private readonly synchronizing = new Map<string, { task: Promise<void>; notifiedRevision: number; stateGeneration: number;
    manifestGeneration: number; manifestFingerprint?: string }>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly stateListeners = new Set<(state: DeviceV2SessionState) => void>();
  private readonly maxFrameSize: number;
  private readonly reliableWindow: number;
  private readonly requestTimeoutMs: number;
  private readonly routeRetries: number;
  private readonly makeRequestId: () => Uint8Array;

  constructor(
    private readonly channel: DeviceV2Channel,
    store = new DeviceV2Store(),
    options: DeviceV2SessionOptions = {},
  ) {
    this.store = store;
    this.presence = new DeviceV2PresenceSubscriptions({
      id: () => this.makeRequestId(),
      request: async (target, requestId, signal) => {
        const result = await this.route(target, Bbp2MessageKind.PresenceControl, 0,
          encodePresenceControlBody(DeviceV2PresenceOperation.Subscribe), { requestId, signal });
        this.assertReady();
        this.expectDelivery(result.delivery, Bbp2MessageKind.Presence, Bbp2FrameFlag.IsResponse);
        return decodePresenceBody(result.delivery.messageBody);
      },
      apply: (target, value) => { this.store.applyPresence(target, value, true); },
      lost: target => {
        this.store.losePresence(target);
        const peer = logicalDevicePeerId(target);
        for (const [id, pending] of this.pending) {
          if (equalBytes(peer, pending.targetPeerId)) this.rejectPending(id, pending, new DeviceV2TargetUnavailableError());
        }
        this.synchronizing.delete(target);
      },
      terminal: error => error instanceof DeviceV2RouteError
        && [Bbp2ErrorCode.AuthenticationRequired, Bbp2ErrorCode.UnsupportedMessage].includes(error.code),
      failed: error => this.emitError(asError(error, 'Device Presence recovery exhausted')),
    });
    this.connectionDemands = new DeviceV2DemandOwners(async (request, signal) => {
      const direct = request.purpose === 'direct';
      if ((this.negotiatedFeatures & (direct ? BBP2_FEATURE_DIRECT_PRIORITY : BBP2_FEATURE_CONNECTION_DEMAND)) === 0) {
        throw new Error('Connection ownership purpose is not negotiated');
      }
      const { delivery } = await this.route(request.target, direct ? Bbp2MessageKind.DirectPriority : Bbp2MessageKind.ConnectionDemand, 0,
        direct ? encodeDirectPriorityBody(request) : encodeConnectionDemandBody(request), { signal, release: request.action === 'release' });
      if (delivery.messageKind !== (direct ? Bbp2MessageKind.DirectPriorityStatus : Bbp2MessageKind.ConnectionDemandStatus)
        || delivery.messageFlags !== Bbp2FrameFlag.IsResponse) {
        throw new Error('Invalid connection demand response');
      }
      const reply = direct ? decodeDirectPriorityStatusBody(delivery.messageBody) : decodeConnectionDemandStatusBody(delivery.messageBody);
      if (reply.ownerId !== request.ownerId || reply.revision !== request.revision) {
        throw new Error('Connection demand response does not match the owner');
      }
      return reply;
    }, async (query, signal) => {
      if ((this.negotiatedFeatures & BBP2_FEATURE_DIRECT_READY) === 0) throw new Error('Direct Ready is not negotiated');
      const { delivery } = await this.route(query.target, Bbp2MessageKind.DirectReadyQuery, 0,
        encodeDirectReadyQueryBody(query), { signal });
      if (delivery.messageKind !== Bbp2MessageKind.DirectReadyStatus || delivery.messageFlags !== Bbp2FrameFlag.IsResponse) {
        throw new Error('Invalid Direct Ready response');
      }
      return decodeDirectReadyStatusBody(delivery.messageBody);
    });
    this.stateInterests = new DeviceV2DemandOwners(async (request, signal) => {
      const { delivery } = await this.route(request.target, Bbp2MessageKind.StateInterest, 0,
        encodeConnectionDemandBody(request), { signal, release: request.action === 'release' }).catch(error => {
          if (!(error instanceof DeviceV2RouteError) || [Bbp2ErrorCode.Internal, Bbp2ErrorCode.ResourceExhausted].includes(error.code)) {
            throw new DeviceV2DemandError('unavailable');
          }
          throw error;
        });
      this.expectDelivery(delivery, Bbp2MessageKind.StateInterestStatus, Bbp2FrameFlag.IsResponse);
      const reply = decodeConnectionDemandStatusBody(delivery.messageBody);
      if (reply.ownerId !== request.ownerId || reply.revision !== request.revision) throw new Error('State owner mismatch');
      if (request.action !== 'release' && ['stale', 'busy', 'capacity'].includes(reply.status)) throw new DeviceV2DemandError('unavailable');
      return reply;
    });
    this.telemetry = new DeviceV2TelemetryManager(
      async (logicalDeviceId, endpointKeys) => {
        await this.ensureReady(logicalDeviceId);
        const manifest = this.store.snapshot(logicalDeviceId).manifest;
        if (!manifest) throw new Error('verified Manifest is missing');
        return validateDeviceV2TelemetryFields(manifest.fields, endpointKeys);
      },
      (logicalDeviceId, control) => this.telemetryControl(logicalDeviceId, control),
      error => this.emitError(error),
    );
    this.maxFrameSize = options.maxFrameSize ?? 512;
    this.reliableWindow = options.reliableWindow ?? 4;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 6000;
    this.routeRetries = options.routeRetries ?? 1;
    this.makeRequestId = options.requestId ?? randomRequestId;
    if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1
      || !Number.isInteger(this.routeRetries) || this.routeRetries < 0 || this.routeRetries > 3) {
      throw new Error('Device V2 session options are invalid');
    }
  }

  get state(): DeviceV2SessionState {
    return this.stateValue;
  }

  subscribeState(listener: (state: DeviceV2SessionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeErrors(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.stateValue === 'ready') return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    if (this.stateValue === 'closed') return Promise.reject(new Error('Device V2 session is closed'));

    this.setState('negotiating');
    this.detachMessage = this.channel.onMessage(payload => this.receive(payload));
    this.detachClose = this.channel.onClose(reason => this.fail(
      asError(reason, 'Device V2 channel closed'),
    ));
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    this.helloSequence = this.nextSequence();
    const frame = encodeFrame({
      kind: Bbp2MessageKind.Hello,
      flags: Bbp2FrameFlag.AckRequired,
      sequence: this.helloSequence,
      body: encodeAppHelloBody(this.maxFrameSize, this.reliableWindow),
    });
    void this.channel.publish(frame).then(() => {
      if (this.stateValue !== 'negotiating') return;
      this.helloTimer = setTimeout(
        () => this.fail(new Error('Device V2 HELLO timed out')),
        this.requestTimeoutMs,
      );
    }, error => this.fail(asError(error, 'Device V2 HELLO publish failed')));
    return this.startPromise;
  }

  ensureReady(logicalDeviceId: string): Promise<void> {
    return this.synchronizeTarget(logicalDeviceId, false);
  }

  refresh(logicalDeviceId: string): Promise<void> {
    return this.synchronizeTarget(logicalDeviceId, true);
  }

  private synchronizeTarget(logicalDeviceId: string, refreshState: boolean): Promise<void> {
    this.assertReady();
    const snapshot = this.store.snapshot(logicalDeviceId);
    if (snapshot.cloudReachable === false || snapshot.cloudPresenceLost) return Promise.reject(new DeviceV2TargetUnavailableError());
    const active = this.synchronizing.get(logicalDeviceId);
    if (active) return active.task;
    if (!refreshState && isDeviceV2TargetReady(snapshot)) return Promise.resolve();
    // Register the shared task before Store notifications can synchronously
    // reenter refresh/ensureReady. One target owns one paginated transfer.
    const task = Promise.resolve().then(() => {
      this.assertTargetReachable(logicalDeviceId);
      if (refreshState) this.store.invalidateState(logicalDeviceId);
      return this.synchronize(logicalDeviceId);
    }).then(() => {
      this.assertTargetReachable(logicalDeviceId);
    }).finally(() => {
      if (this.synchronizing.get(logicalDeviceId)?.task === task) {
        this.synchronizing.delete(logicalDeviceId);
      }
    });
    this.synchronizing.set(logicalDeviceId, { task, notifiedRevision: 0, stateGeneration: 0, manifestGeneration: 0 });
    return task;
  }

  async command(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<DeviceV2Ack> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.ensureReady(logicalDeviceId);
      const field = this.field(logicalDeviceId, endpointKey);
      try {
        const result = await this.route(
          logicalDeviceId,
          Bbp2MessageKind.Command,
          Bbp2FrameFlag.AckRequired | Bbp2FrameFlag.IdMode,
          encodeCommandBody(field, value),
        );
        try {
          this.expectDelivery(result.delivery, Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse);
          const ack = decodeAckBody(result.delivery.messageBody);
          if (ack.acknowledgedSequence !== result.sequence) throw new Error('Command Ack sequence mismatch');
          return ack;
        } catch {
          throw new DeviceV2CommandOutcomeUnknownError();
        }
      } catch (error) {
        if (attempt === 0 && error instanceof DeviceV2RouteError
          && (error.code === Bbp2ErrorCode.ManifestConflict
            || error.code === Bbp2ErrorCode.NegotiationRequired)) {
          this.store.invalidate(logicalDeviceId);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Device V2 command retry exhausted');
  }

  openTelemetry(
    logicalDeviceId: string,
    endpointKeys: string[],
    intervalMs: number,
    options?: DeviceV2TelemetryOptions,
  ): Promise<DeviceV2TelemetryLease> {
    return this.telemetry.open(logicalDeviceId, endpointKeys, intervalMs, options);
  }

  subscribePresence(logicalDeviceId: string, restart = false): Promise<boolean> {
    this.assertReady();
    if ((this.negotiatedFeatures & BBP2_FEATURE_PRESENCE) === 0) return Promise.resolve(false);
    return this.presence.subscribe(logicalDeviceId, restart);
  }

  // Independent observer lifetime. Reuse the bounded owner engine, not Hub
  // wake semantics. Unnegotiated Brokers retain the old accepted-gate contract.
  acquireStateInterest(logicalDeviceId: string, signal?: AbortSignal): DeviceV2DemandOwner | undefined {
    this.assertReady(); signal?.throwIfAborted();
    if ((this.negotiatedFeatures & BBP2_FEATURE_STATE_INTEREST) === 0) return undefined;
    logicalDevicePeerId(logicalDeviceId);
    if ([...this.stateConsumers.values()].reduce((n, group) => n + group.owners.size, 0) >= 16) throw new DeviceV2DemandError('capacity');
    let accept!: () => void, reject!: (error: Error) => void, finish!: (reason: DeviceV2DemandCloseReason) => void;
    const accepted = new Promise<void>((resolve, fail) => { accept = resolve; reject = fail; });
    const closed = new Promise<DeviceV2DemandCloseReason>(resolve => { finish = resolve; });
    const consumer: StateConsumer = { accept, reject, close: finish, dispose: () => undefined };
    let consumers = this.stateConsumers.get(logicalDeviceId);
    if (!consumers) {
      consumers = { owners: new Set(), generation: 0, recoveries: 0, pending: false, accepted: false, established: false };
      this.stateConsumers.set(logicalDeviceId, consumers);
    }
    const group = consumers;
    group.owners.add(consumer);
    const release = () => {
      if (!group.owners.delete(consumer)) return;
      consumer.dispose(); consumer.reject(new DeviceV2DemandError('cancelled')); consumer.close('cancelled');
      if (!group.owners.size) this.retireStateConsumers(logicalDeviceId, group, 'cancelled');
    };
    signal?.addEventListener('abort', release, { once: true });
    consumer.dispose = () => signal?.removeEventListener('abort', release);
    if (group.accepted) consumer.accept();
    else if (!group.lease && !group.established) {
      void this.startStateObservation(logicalDeviceId, group).catch(error => {
        if (!group.established) this.retireStateConsumers(logicalDeviceId, group,
          error instanceof DeviceV2DemandError ? error.reason : 'rejected');
      });
    }
    return { accepted, closed, release };
  }

  private retireStateConsumers(id: string, group: StateConsumers, reason: DeviceV2DemandCloseReason): void {
    if (this.stateConsumers.get(id) !== group) return;
    this.stateConsumers.delete(id); ++group.generation; group.due = undefined; group.accepted = false;
    const lease = group.lease; group.lease = undefined;
    for (const consumer of group.owners) {
      consumer.dispose(); consumer.reject(new DeviceV2DemandError(reason)); consumer.close(reason);
    }
    group.owners.clear(); lease?.release();
    if (this.stateValue !== 'closed') this.interruptStateNotifications(id);
    this.scheduleObservedResync();
  }

  private async startStateObservation(id: string, group: StateConsumers): Promise<void> {
    if (this.stateConsumers.get(id) !== group || !group.owners.size) throw new DeviceV2DemandError('cancelled');
    if (group.lease) return group.lease.accepted;
    const lease = this.stateInterests.acquire(id); group.lease = lease;
    void lease.closed.then(reason => {
      if (this.stateConsumers.get(id) !== group || group.lease !== lease) return;
      const accepted = group.accepted;
      group.lease = undefined; group.accepted = false;
      if (accepted) { ++group.generation; this.interruptStateNotifications(id); }
      if ((this.negotiatedFeatures & BBP2_FEATURE_STATE_RECOVERY) !== 0 && group.established
        && ['unavailable', 'timeout', 'capacity'].includes(reason)) {
        if (!group.pending && group.recoveries >= 3) {
          this.retireStateConsumers(id, group, 'unavailable'); return;
        }
        if ((accepted || !group.pending) && group.recoveries < 3) group.due = performance.now();
        this.scheduleObservedResync();
      } else this.retireStateConsumers(id, group, reason);
    });
    await lease.accepted;
    if (this.stateConsumers.get(id) !== group || group.lease !== lease) throw new DeviceV2DemandError('cancelled');
    group.accepted = true; group.established = true;
    this.interruptStateNotifications(id);
    for (const consumer of group.owners) consumer.accept();
  }

  private interruptStateNotifications(logicalDeviceId: string): void {
    const sync = this.synchronizing.get(logicalDeviceId);
    if (sync) ++sync.stateGeneration;
    this.store.interruptNotifications(logicalDeviceId);
  }

  // Explicit ownership only. Pages must not activate this until Hub arbitration
  // is paired; accepted is neither physical wake nor verified fresh State.
  acquireConnectionDemand(logicalDeviceId: string, signal?: AbortSignal): DeviceV2DemandOwner {
    this.assertReady();
    if ((this.negotiatedFeatures & BBP2_FEATURE_CONNECTION_DEMAND) === 0) {
      throw new Error('Connection demand is not negotiated');
    }
    logicalDevicePeerId(logicalDeviceId); // Validate before allocating an owner.
    return this.connectionDemands.acquire(logicalDeviceId, signal);
  }

  // Reservation and physical Ready remain separate. A caller must await ready
  // and assertReady immediately before BLE acquisition; closed retires its link.
  reserveDirectPriority(logicalDeviceId: string, signal?: AbortSignal): DeviceV2DirectOwner {
    this.assertReady();
    const features = BBP2_FEATURE_DIRECT_PRIORITY | BBP2_FEATURE_DIRECT_READY;
    if ((this.negotiatedFeatures & features) !== features) {
      throw new Error('Direct priority/Ready is not negotiated');
    }
    logicalDevicePeerId(logicalDeviceId);
    return this.connectionDemands.acquire(logicalDeviceId, signal, 'direct');
  }

  async close(): Promise<void> {
    if (!this.closePromise) {
      if (this.stateValue !== 'closed') {
        this.fail(new Error('Device V2 session closed'), false);
      }
      this.closePromise = Promise.resolve()
        .then(() => this.channel.close?.())
        .then(() => undefined);
    }
    await this.closePromise;
  }

  private async synchronize(logicalDeviceId: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sync = this.synchronizing.get(logicalDeviceId), generation = sync?.manifestGeneration;
      try {
        if (!this.store.snapshot(logicalDeviceId).manifestAccepted) {
          await this.synchronizeManifest(logicalDeviceId);
        }
        if (!this.store.snapshot(logicalDeviceId).stateFresh) {
          await this.synchronizeState(logicalDeviceId);
        }
        return;
      } catch (error) {
        if (attempt === 0 && (generation !== sync?.manifestGeneration || (error instanceof DeviceV2RouteError
          && (error.code === Bbp2ErrorCode.ManifestConflict
            || error.code === Bbp2ErrorCode.NegotiationRequired)))) {
          this.store.invalidate(logicalDeviceId);
          continue;
        }
        throw error;
      }
    }
  }

  private async synchronizeManifest(logicalDeviceId: string): Promise<void> {
    const sync = this.synchronizing.get(logicalDeviceId), generation = sync?.manifestGeneration;
    const current = () => {
      if (sync !== this.synchronizing.get(logicalDeviceId) || generation !== sync?.manifestGeneration) {
        throw new DeviceV2RouteError(Bbp2ErrorCode.ManifestConflict);
      }
    };
    let cursor = 0;
    for (let pages = 0; pages <= 256; pages += 1) {
      const result = await this.route(
        logicalDeviceId,
        Bbp2MessageKind.ManifestRequest,
        0,
        encodeManifestRequestBody(cursor),
      );
      this.expectDelivery(result.delivery, Bbp2MessageKind.Manifest, Bbp2FrameFlag.IsResponse);
      current();
      const page = decodeManifestPageBody(result.delivery.messageBody);
      if (sync) sync.manifestFingerprint = bytesToHex(page.fingerprint);
      const applied = await this.store.applyManifestPage(
        logicalDeviceId,
        page,
      );
      current();
      cursor = applied.nextCursor;
      if (!applied.complete) continue;
      const manifest = applied.manifest!;
      const acceptance = await this.route(
        logicalDeviceId,
        Bbp2MessageKind.ManifestAccept,
        Bbp2FrameFlag.AckRequired,
        encodeManifestAcceptBody(manifest.revision, hexToBytes(manifest.fingerprint)),
      );
      this.expectDelivery(acceptance.delivery, Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse);
      current();
      const ack = decodeAckBody(acceptance.delivery.messageBody);
      if (ack.acknowledgedSequence !== acceptance.sequence) {
        throw new Error('Manifest Ack sequence does not match the Route');
      }
      this.store.markManifestAccepted(logicalDeviceId, manifest.revision, manifest.fingerprint);
      return;
    }
    throw new Error('Manifest pagination exceeded the field limit');
  }

  private async synchronizeState(logicalDeviceId: string): Promise<void> {
    const fields = this.store.snapshot(logicalDeviceId).manifest?.fields;
    if (!fields) throw new Error('verified Manifest is missing');
    for (let restart = 0; restart < 2; restart += 1) {
      const sync = this.synchronizing.get(logicalDeviceId), generation = sync?.stateGeneration;
      const manifestGeneration = sync?.manifestGeneration;
      this.store.beginState(logicalDeviceId);
      let cursor = 0;
      let revision: number | undefined;
      try {
        for (let pages = 0; pages <= fields.length; pages += 1) {
          const result = await this.route(
            logicalDeviceId,
            Bbp2MessageKind.StateRequest,
            Bbp2FrameFlag.IdMode,
            encodeStateRequestBody(cursor, revision),
          );
          this.expectDelivery(
            result.delivery,
            Bbp2MessageKind.StatePage,
            Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode,
          );
          // A pre-gap snapshot cannot restore fresh after page interest ended
          // or restarted. Reuse the existing single StateConflict restart.
          if (manifestGeneration !== sync?.manifestGeneration) {
            throw new DeviceV2RouteError(Bbp2ErrorCode.ManifestConflict);
          }
          if (sync !== this.synchronizing.get(logicalDeviceId) || generation !== sync?.stateGeneration) {
            throw new DeviceV2RouteError(Bbp2ErrorCode.StateConflict);
          }
          const applied = this.store.applyStatePage(
            logicalDeviceId,
            decodeStatePageBody(result.delivery.messageBody, fields),
          );
          cursor = applied.nextCursor;
          revision = applied.revision;
          if (applied.complete) {
            if ((this.synchronizing.get(logicalDeviceId)?.notifiedRevision ?? 0) <= applied.revision) return;
            // A newer notification arrived during this snapshot. Reuse the
            // existing bounded StateConflict restart, never queue its payload.
            this.store.invalidateState(logicalDeviceId);
            throw new DeviceV2RouteError(Bbp2ErrorCode.StateConflict);
          }
        }
        throw new Error('State pagination exceeded the Manifest field count');
      } catch (error) {
        if (restart === 0 && error instanceof DeviceV2RouteError
          && error.code === Bbp2ErrorCode.StateConflict) continue;
        throw error;
      }
    }
  }

  private async telemetryControl(
    logicalDeviceId: string,
    control: DeviceV2TelemetryControl,
  ): Promise<DeviceV2TelemetryStatus> {
    const result = await this.route(
      logicalDeviceId,
      Bbp2MessageKind.TelemetryControl,
      Bbp2FrameFlag.IdMode,
      encodeTelemetryControlBody(control),
    );
    this.expectDelivery(
      result.delivery,
      Bbp2MessageKind.TelemetryStatus,
      Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode,
    );
    return decodeTelemetryStatusBody(result.delivery.messageBody);
  }

  private route(
    logicalDeviceId: string,
    messageKind: Bbp2MessageKind,
    messageFlags: number,
    messageBody: Uint8Array,
    options: { signal?: AbortSignal; release?: boolean; requestId?: Uint8Array } = {},
  ): Promise<RouteResult> {
    this.assertReady();
    options.signal?.throwIfAborted();
    // Check again after command()'s await, before allocating any request identity.
    // Once published, ACK/ledger/timeout determine the result, not later Presence.
    if (messageKind === Bbp2MessageKind.Command) this.assertTargetReachable(logicalDeviceId);
    const limit = options.release ? MAX_PUBLISHES_WITH_RELEASES : MAX_PENDING_ROUTES;
    if (this.pending.size >= limit || this.publishing >= limit) {
      return Promise.reject(new Error('Device V2 pending Route limit reached'));
    }
    const requestId = options.requestId ?? this.makeRequestId();
    if (requestId.length !== 16 || !requestId.some(value => value !== 0)) {
      return Promise.reject(new Error('Device V2 request identity is invalid'));
    }
    const requestKey = bytesToHex(requestId);
    if (this.pending.has(requestKey)) {
      return Promise.reject(new Error('Device V2 request identity is duplicated'));
    }
    const targetPeerId = logicalDevicePeerId(logicalDeviceId);
    const peerKey = bytesToHex(targetPeerId);
    const mapped = this.logicalDeviceByPeer.get(peerKey);
    if (mapped && mapped !== logicalDeviceId) {
      return Promise.reject(new Error('Device V2 peer identity is ambiguous'));
    }
    // Demand has only correlated responses, no unsolicited State/Presence.
    // Do not retain every cancelled demand target in the notification lookup.
    if (messageKind !== Bbp2MessageKind.ConnectionDemand && messageKind !== Bbp2MessageKind.DirectPriority
      && messageKind !== Bbp2MessageKind.DirectReadyQuery) {
      this.logicalDeviceByPeer.set(peerKey, logicalDeviceId);
    }
    const sequence = this.nextSequence();
    const frame = encodeFrame({
      kind: Bbp2MessageKind.Route,
      flags: Bbp2FrameFlag.AckRequired,
      sequence,
      body: encodeRouteBody({
        peerKind: Bbp2RoutePeerKind.LogicalDevice,
        peerId: targetPeerId,
        requestId,
        messageKind,
        messageFlags,
        messageBody,
      }),
    });
    return new Promise<RouteResult>((resolve, reject) => {
      const pending: PendingRoute = {
        targetPeerId,
        sequence,
        frame,
        retries: 0,
        release: options.release === true,
        dispose: () => options.signal?.removeEventListener('abort', abort),
        resolve,
        reject: error => {
          // This slot has been handed to publish. Transport failure, timeout,
          // malformed response or Broker Internal cannot prove non-execution.
          const uncertain = messageKind === Bbp2MessageKind.Command
            && (!(error instanceof DeviceV2RouteError) || error.code === Bbp2ErrorCode.Internal);
          reject(uncertain ? new DeviceV2CommandOutcomeUnknownError() : error);
        },
      };
      const abort = () => this.rejectPending(requestKey, pending,
        new DOMException('Connection demand cancelled', 'AbortError'));
      this.pending.set(requestKey, pending);
      options.signal?.addEventListener('abort', abort, { once: true });
      this.publishPending(requestKey, pending);
    });
  }

  private publishPending(requestKey: string, pending: PendingRoute): void {
    if (this.pending.get(requestKey) !== pending) return;
    const limit = pending.release ? MAX_PUBLISHES_WITH_RELEASES : MAX_PENDING_ROUTES;
    if (this.publishing >= limit) {
      this.rejectPending(requestKey, pending, new Error('Device V2 publish limit reached'));
      return;
    }
    let sent = false;
    pending.timer = setTimeout(() => {
      if (this.pending.get(requestKey) !== pending) return;
      if (!sent || pending.retries >= this.routeRetries) {
        this.rejectPending(requestKey, pending, new Error('Device V2 Route timed out'));
        return;
      }
      pending.retries += 1;
      this.publishPending(requestKey, pending);
    }, this.requestTimeoutMs);
    ++this.publishing;
    let task: Promise<void>;
    try { task = this.channel.publish(pending.frame); }
    catch (error) {
      --this.publishing;
      this.rejectPending(requestKey, pending, asError(error, 'Device V2 Route publish failed'));
      return;
    }
    void task.then(() => { sent = true; }, error => this.rejectPending(
      requestKey, pending, asError(error, 'Device V2 Route publish failed'),
    )).finally(() => { --this.publishing; });
    // Cancellation ends the Route, not an already submitted MQTT write. Count
    // that underlying Promise until settlement so churn cannot orphan unbounded work.
  }

  private receive(payload: Uint8Array): void {
    if (this.stateValue === 'closed') return;
    try {
      const frame = decodeFrame(payload);
      if (frame.kind === Bbp2MessageKind.Hello) {
        if (this.stateValue !== 'negotiating' || frame.flags !== Bbp2FrameFlag.IsResponse
          || frame.sequence !== this.helloSequence) {
          throw new Error('Server HELLO does not match this session');
        }
        this.negotiatedFeatures = decodeServerHelloBody(frame.body).features;
        this.helloResponse = true;
        this.completeHello();
        return;
      }
      if (frame.kind === Bbp2MessageKind.Ack && this.stateValue === 'negotiating') {
        if (frame.flags !== Bbp2FrameFlag.IsResponse || frame.sequence === 0
          || decodeAckBody(frame.body).acknowledgedSequence !== this.helloSequence) {
          throw new Error('Server HELLO Ack does not match this session');
        }
        this.helloAck = true;
        this.completeHello();
        return;
      }
      if (frame.kind === Bbp2MessageKind.Error && this.stateValue === 'ready') {
        if (frame.flags !== Bbp2FrameFlag.IsResponse || frame.sequence === 0) {
          throw new Error('top-level Error metadata is invalid');
        }
        this.topLevelError(decodeErrorBody(frame.body));
        return;
      }
      if (this.stateValue !== 'ready' || frame.kind !== Bbp2MessageKind.Delivery
        || frame.flags !== Bbp2FrameFlag.IsResponse || frame.sequence === 0) {
        throw new Error('unexpected Device V2 session frame');
      }
      this.delivery(decodeDeliveryBody(frame.body));
    } catch (error) {
      this.fail(asError(error, 'Device V2 inbound frame is invalid'));
    }
  }

  private topLevelError(error: ReturnType<typeof decodeErrorBody>): void {
    for (const [requestKey, pending] of this.pending) {
      if (pending.sequence !== error.relatedSequence) continue;
      this.rejectPending(requestKey, pending, this.routeError(error));
      return;
    }
  }

  private delivery(delivery: Bbp2Delivery): void {
    if (delivery.requestId) {
      const requestKey = bytesToHex(delivery.requestId);
      const pending = this.pending.get(requestKey);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(requestKey);
      pending.dispose();
      if (delivery.messageKind === Bbp2MessageKind.Error) {
        const error = decodeErrorBody(delivery.messageBody);
        if (delivery.messageFlags !== Bbp2FrameFlag.IsResponse
          || error.relatedSequence !== pending.sequence) {
          pending.reject(new Error('Route Error does not match the request'));
          return;
        }
        pending.reject(this.routeError(error));
        return;
      }
      if (delivery.peerKind !== Bbp2RoutePeerKind.LogicalDevice
        || !equalBytes(delivery.peerId, pending.targetPeerId)) {
        pending.reject(new Error('Route Delivery source does not match the target'));
        return;
      }
      pending.resolve({ sequence: pending.sequence, delivery });
      return;
    }
    this.notification(delivery);
  }

  private notification(delivery: Bbp2Delivery): void {
    if (delivery.peerKind !== Bbp2RoutePeerKind.LogicalDevice) {
      throw new Error('unsolicited Delivery metadata is invalid');
    }
    const logicalDeviceId = this.logicalDeviceByPeer.get(bytesToHex(delivery.peerId));
    if (!logicalDeviceId) throw new Error('unsolicited Delivery peer identity is unknown');
    if (delivery.messageKind === Bbp2MessageKind.StateInterestStatus) {
      const features = BBP2_FEATURE_STATE_INTEREST | BBP2_FEATURE_STATE_RECOVERY;
      if (delivery.messageFlags !== Bbp2FrameFlag.IsResponse || (this.negotiatedFeatures & features) !== features) {
        throw new Error('State recovery is not negotiated');
      }
      const reply = decodeConnectionDemandStatusBody(delivery.messageBody);
      if (this.stateInterests.lost(logicalDeviceId, reply)) {
        // Fence synchronously, before a following State/Event in this same tick.
        const group = this.stateConsumers.get(logicalDeviceId);
        if (group) {
          group.accepted = false; ++group.generation;
          if (reply.status === 'stale' && group.recoveries < 3) group.due = performance.now();
        }
        this.interruptStateNotifications(logicalDeviceId);
        this.scheduleObservedResync();
      }
      return;
    }
    if (delivery.messageKind === Bbp2MessageKind.PresenceLost) {
      const features = BBP2_FEATURE_PRESENCE | BBP2_FEATURE_PRESENCE_RECOVERY;
      if (delivery.messageFlags !== 0 || (this.negotiatedFeatures & features) !== features) {
        throw new Error('Presence recovery is not negotiated');
      }
      this.presence.lost(logicalDeviceId, decodePresenceLostBody(delivery.messageBody));
      return;
    }
    if (delivery.messageKind === Bbp2MessageKind.Presence) {
      if (delivery.messageFlags !== 0
        || (this.negotiatedFeatures & BBP2_FEATURE_PRESENCE) === 0) {
        throw new Error('unsolicited Presence metadata is invalid');
      }
      const presence = decodePresenceBody(delivery.messageBody);
      if (this.presence.accepts(logicalDeviceId)) this.store.applyPresence(logicalDeviceId, presence, true);
      return;
    }
    if (delivery.messageKind === Bbp2MessageKind.ManifestChanged) {
      const features = BBP2_FEATURE_STATE_INTEREST | BBP2_FEATURE_MANIFEST_CHANGED;
      if (delivery.messageFlags !== 0 || (this.negotiatedFeatures & features) !== features) {
        throw new Error('Manifest change is not negotiated');
      }
      const notice = decodeManifestChangedBody(delivery.messageBody);
      const group = this.stateConsumers.get(logicalDeviceId), sync = this.synchronizing.get(logicalDeviceId);
      if (!this.hasStateConsumers(group) || group!.manifestFingerprint === notice.fingerprint
        || (this.store.snapshot(logicalDeviceId).manifest?.fingerprint !== notice.previous
          && sync?.manifestFingerprint !== notice.previous)) return;
      group!.manifestFingerprint = notice.fingerprint;
      if (sync) { ++sync.manifestGeneration; ++sync.stateGeneration; sync.notifiedRevision = 0; }
      this.store.invalidate(logicalDeviceId);
      this.scheduleResync(logicalDeviceId);
      return;
    }
    if (delivery.messageFlags !== Bbp2FrameFlag.IdMode) {
      throw new Error('unsolicited Delivery field mode is invalid');
    }
    if ((this.negotiatedFeatures & BBP2_FEATURE_STATE_INTEREST) !== 0
      && [Bbp2MessageKind.StatePage, Bbp2MessageKind.Patch, Bbp2MessageKind.Event].includes(delivery.messageKind)
      && !this.hasStateConsumers(this.stateConsumers.get(logicalDeviceId))) return;
    const snapshot = this.store.snapshot(logicalDeviceId);
    if (!snapshot.manifestAccepted || !snapshot.manifest) return;
    if (delivery.messageKind === Bbp2MessageKind.StatePage) {
      const page = decodeStatePageBody(delivery.messageBody, snapshot.manifest.fields);
      if (this.deferStateNotification(logicalDeviceId, page.revision)) return;
      if (page.cursor === 0) this.store.beginState(logicalDeviceId);
      this.store.applyStatePage(logicalDeviceId, page);
    } else if (delivery.messageKind === Bbp2MessageKind.Patch) {
      const patch = decodePatchBody(delivery.messageBody, snapshot.manifest.fields);
      if (this.deferStateNotification(logicalDeviceId, patch.revision)) return;
      const result = this.store.applyPatch(
        logicalDeviceId,
        patch,
      );
      if (result === 'resync') this.scheduleResync(logicalDeviceId);
    } else if (delivery.messageKind === Bbp2MessageKind.Event) {
      this.store.applyEvent(
        logicalDeviceId,
        decodeEventBody(delivery.messageBody, snapshot.manifest.fields),
      );
    } else if (delivery.messageKind === Bbp2MessageKind.TelemetryData) {
      this.telemetry.receiveData(
        logicalDeviceId,
        decodeTelemetryDataBody(delivery.messageBody, snapshot.manifest.fields),
      );
    } else if (delivery.messageKind === Bbp2MessageKind.TelemetryStatus) {
      this.telemetry.receiveStatus(
        logicalDeviceId,
        decodeTelemetryStatusBody(delivery.messageBody),
      );
    } else {
      throw new Error('unsolicited Delivery kind is invalid');
    }
  }

  private scheduleResync(logicalDeviceId: string): void {
    if ((this.negotiatedFeatures & BBP2_FEATURE_STATE_INTEREST) !== 0) {
      const group = this.stateConsumers.get(logicalDeviceId);
      if (!group || !this.hasStateConsumers(group) || group.due !== undefined) return;
      if (group.recoveries >= 3) return;
      group.due = performance.now(); this.scheduleObservedResync();
      return;
    }
    void this.ensureReady(logicalDeviceId).catch(error => {
      // One unavailable child must not reconnect the shared account channel.
      if (!(error instanceof DeviceV2TargetUnavailableError)) {
        this.emitError(asError(error, 'Device V2 state resync failed'));
      }
    });
  }

  private hasStateConsumers(group: StateConsumers | undefined): boolean {
    return !!group?.accepted && group.owners.size > 0;
  }

  // A finite resync budget on the existing observation group, NOT another
  // lease. Success/renewal never replenishes it; explicit new observation does.
  private scheduleObservedResync(): void {
    clearTimeout(this.resyncTimer); this.resyncTimer = undefined;
    if (this.stateValue === 'closed' || this.resyncActive >= 4) return;
    const due = [...this.stateConsumers.values()].filter(g => !g.pending && g.due !== undefined && g.owners.size)
      .map(g => g.due!);
    if (!due.length) return;
    this.resyncTimer = setTimeout(() => {
      for (const [id, group] of this.stateConsumers) {
        if (this.resyncActive >= 4) break;
        if (group.pending || group.due === undefined || group.due > performance.now() || !group.owners.size) continue;
        group.pending = true; group.due = undefined; ++group.recoveries; ++this.resyncActive;
        const generation = group.generation;
        const current = () => this.stateValue !== 'closed' && this.stateConsumers.get(id) === group
          && group.generation === generation && group.owners.size > 0;
        void Promise.resolve().then(async () => {
          if (!current()) return;
          if (!group.accepted) await this.startStateObservation(id, group);
          if (current()) await this.ensureReady(id);
        }).then(() => {
          if (!current()) return;
          if (isDeviceV2TargetReady(this.store.snapshot(id))) group.due = undefined;
          else if (group.recoveries < 3) group.due = performance.now() + [0, 1000, 3000][group.recoveries];
          else this.emitError(new Error('Device model recovery exhausted'));
        }).catch(error => {
          if (!current()) return;
          const denied = error instanceof DeviceV2RouteError
            && [Bbp2ErrorCode.AuthenticationRequired, Bbp2ErrorCode.UnsupportedMessage].includes(error.code)
            || error instanceof DeviceV2DemandError && ['rejected', 'cancelled', 'session-ended'].includes(error.reason);
          if (!denied && group.recoveries < 3) group.due = performance.now() + [0, 1000, 3000][group.recoveries];
          else {
            group.due = undefined; group.recoveries = 3;
            this.emitError(asError(error, 'Device model recovery exhausted'));
            if (!group.accepted) this.retireStateConsumers(id, group, 'unavailable');
          }
        }).finally(() => {
          // Even after cancellation, retain the actual slot until the shared
          // paginated transfer settles. No Command/Action is replayed here.
          group.pending = false; --this.resyncActive;
          if (!group.accepted && !group.lease && group.recoveries >= 3) this.retireStateConsumers(id, group, 'unavailable');
          this.scheduleObservedResync();
        });
      }
      this.scheduleObservedResync();
    }, Math.max(1, Math.min(...due) - performance.now()));
  }

  private deferStateNotification(logicalDeviceId: string, revision: number): boolean {
    const sync = this.synchronizing.get(logicalDeviceId);
    if (!sync || this.store.snapshot(logicalDeviceId).stateFresh) return false;
    // A solicited snapshot owns the sole Store transfer. Broadcast State/Patch
    // must not replace or invalidate it; one revision watermark detects gaps.
    sync.notifiedRevision = Math.max(sync.notifiedRevision, revision);
    return true;
  }

  private completeHello(): void {
    if (!this.helloResponse || !this.helloAck || this.stateValue !== 'negotiating') return;
    clearTimeout(this.helloTimer);
    this.setState('ready');
    this.resolveStart?.();
    this.resolveStart = undefined;
    this.rejectStart = undefined;
  }

  private expectDelivery(
    delivery: Bbp2Delivery,
    kind: Bbp2MessageKind,
    flags: number,
  ): void {
    if (delivery.messageKind !== kind || delivery.messageFlags !== flags) {
      throw new Error('Route Delivery does not match the requested operation');
    }
  }

  private field(logicalDeviceId: string, endpointKey: string): DeviceV2ManifestField {
    const field = this.store.snapshot(logicalDeviceId).manifest?.fields.find(
      candidate => candidate.key === endpointKey,
    );
    if (!field) throw new Error(`unknown Device V2 endpoint ${endpointKey}`);
    return field;
  }

  private nextSequence(): number {
    this.sequence = this.sequence === 0xffff ? 1 : this.sequence + 1;
    return this.sequence;
  }

  private rejectPending(requestKey: string, pending: PendingRoute, error: Error): void {
    if (this.pending.get(requestKey) !== pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestKey);
    pending.dispose();
    pending.reject(error);
  }

  private routeError(error: ReturnType<typeof decodeErrorBody>): DeviceV2RouteError {
    return new DeviceV2RouteError(
      error.errorCode as Bbp2ErrorCode,
      error.relatedSequence,
      error.stateRevision,
    );
  }

  private assertReady(): void {
    if (this.stateValue !== 'ready') throw new Error('Device V2 session is not ready');
  }

  private assertTargetReachable(logicalDeviceId: string): void {
    const snapshot = this.store.snapshot(logicalDeviceId);
    if (snapshot.cloudReachable === false || snapshot.cloudPresenceLost) {
      throw new DeviceV2TargetUnavailableError();
    }
  }

  private fail(error: Error, notify = true): void {
    if (this.stateValue === 'closed') return;
    // Retire consumers before resetSession emits synchronous Store events.
    this.setState('closed');
    this.connectionDemands.close();
    this.stateInterests.close();
    for (const [id, group] of this.stateConsumers) this.retireStateConsumers(id, group, 'session-ended');
    clearTimeout(this.resyncTimer); this.resyncTimer = undefined;
    clearTimeout(this.helloTimer);
    this.detachMessage?.();
    this.detachClose?.();
    this.detachMessage = undefined;
    this.detachClose = undefined;
    for (const [requestKey, pending] of this.pending) {
      this.rejectPending(requestKey, pending, error);
    }
    this.synchronizing.clear();
    this.presence.close();
    this.telemetry.reset();
    this.store.resetSession();
    this.rejectStart?.(error);
    this.resolveStart = undefined;
    this.rejectStart = undefined;
    if (notify) this.emitError(error);
  }

  private setState(state: DeviceV2SessionState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}
