import {
  bytesToHex,
  decodeAckBody,
  decodeDeliveryBody,
  decodeErrorBody,
  decodeEventBody,
  decodeFrame,
  decodeManifestPageBody,
  decodePatchBody,
  decodeServerHelloBody,
  decodeStatePageBody,
  encodeAppHelloBody,
  encodeCommandBody,
  encodeFrame,
  encodeManifestAcceptBody,
  encodeManifestRequestBody,
  encodeRouteBody,
  encodeStateRequestBody,
  hexToBytes,
  logicalDevicePeerId,
  peerIdToLogicalDevice,
} from './codec';
import { DeviceV2Store } from './store';
import {
  Bbp2Delivery,
  Bbp2ErrorCode,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  Bbp2RoutePeerKind,
  DeviceV2Ack,
  DeviceV2ManifestField,
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

interface PendingRoute {
  targetPeerId: Uint8Array;
  sequence: number;
  frame: Uint8Array;
  retries: number;
  timer?: ReturnType<typeof setTimeout>;
  resolve: (result: RouteResult) => void;
  reject: (error: Error) => void;
}

const MAX_PENDING_ROUTES = 16;

interface RouteResult {
  sequence: number;
  delivery: Bbp2Delivery;
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

  private stateValue: DeviceV2SessionState = 'idle';
  private sequence = 0;
  private helloSequence = 0;
  private helloResponse = false;
  private helloAck = false;
  private helloTimer?: ReturnType<typeof setTimeout>;
  private startPromise?: Promise<void>;
  private closePromise?: Promise<void>;
  private resolveStart?: () => void;
  private rejectStart?: (error: Error) => void;
  private detachMessage?: () => void;
  private detachClose?: () => void;
  private readonly pending = new Map<string, PendingRoute>();
  private readonly synchronizing = new Map<string, Promise<void>>();
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
    this.assertReady();
    const snapshot = this.store.snapshot(logicalDeviceId);
    if (snapshot.manifestAccepted && snapshot.stateFresh) return Promise.resolve();
    const active = this.synchronizing.get(logicalDeviceId);
    if (active) return active;
    const task = this.synchronize(logicalDeviceId).finally(() => {
      if (this.synchronizing.get(logicalDeviceId) === task) {
        this.synchronizing.delete(logicalDeviceId);
      }
    });
    this.synchronizing.set(logicalDeviceId, task);
    return task;
  }

  async refresh(logicalDeviceId: string): Promise<void> {
    this.store.invalidate(logicalDeviceId);
    await this.ensureReady(logicalDeviceId);
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
        this.expectDelivery(result.delivery, Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse);
        const ack = decodeAckBody(result.delivery.messageBody);
        if (ack.acknowledgedSequence !== result.sequence) {
          throw new Error('Command Ack sequence does not match the Route');
        }
        return ack;
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
      try {
        if (!this.store.snapshot(logicalDeviceId).manifestAccepted) {
          await this.synchronizeManifest(logicalDeviceId);
        }
        if (!this.store.snapshot(logicalDeviceId).stateFresh) {
          await this.synchronizeState(logicalDeviceId);
        }
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof DeviceV2RouteError
          && error.code === Bbp2ErrorCode.ManifestConflict) {
          this.store.invalidate(logicalDeviceId);
          continue;
        }
        throw error;
      }
    }
  }

  private async synchronizeManifest(logicalDeviceId: string): Promise<void> {
    let cursor = 0;
    for (let pages = 0; pages <= 256; pages += 1) {
      const result = await this.route(
        logicalDeviceId,
        Bbp2MessageKind.ManifestRequest,
        0,
        encodeManifestRequestBody(cursor),
      );
      this.expectDelivery(result.delivery, Bbp2MessageKind.Manifest, Bbp2FrameFlag.IsResponse);
      const applied = await this.store.applyManifestPage(
        logicalDeviceId,
        decodeManifestPageBody(result.delivery.messageBody),
      );
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
          const applied = this.store.applyStatePage(
            logicalDeviceId,
            decodeStatePageBody(result.delivery.messageBody, fields),
          );
          cursor = applied.nextCursor;
          revision = applied.revision;
          if (applied.complete) return;
        }
        throw new Error('State pagination exceeded the Manifest field count');
      } catch (error) {
        if (restart === 0 && error instanceof DeviceV2RouteError
          && error.code === Bbp2ErrorCode.StateConflict) continue;
        throw error;
      }
    }
  }

  private route(
    logicalDeviceId: string,
    messageKind: Bbp2MessageKind,
    messageFlags: number,
    messageBody: Uint8Array,
  ): Promise<RouteResult> {
    this.assertReady();
    if (this.pending.size >= MAX_PENDING_ROUTES) {
      return Promise.reject(new Error('Device V2 pending Route limit reached'));
    }
    const requestId = this.makeRequestId();
    if (requestId.length !== 16 || !requestId.some(value => value !== 0)) {
      return Promise.reject(new Error('Device V2 request identity is invalid'));
    }
    const requestKey = bytesToHex(requestId);
    if (this.pending.has(requestKey)) {
      return Promise.reject(new Error('Device V2 request identity is duplicated'));
    }
    const targetPeerId = logicalDevicePeerId(logicalDeviceId);
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
        resolve,
        reject,
      };
      this.pending.set(requestKey, pending);
      this.publishPending(requestKey, pending);
    });
  }

  private publishPending(requestKey: string, pending: PendingRoute): void {
    void this.channel.publish(pending.frame).then(() => {
      if (this.pending.get(requestKey) !== pending) return;
      pending.timer = setTimeout(() => {
        if (this.pending.get(requestKey) !== pending) return;
        if (pending.retries >= this.routeRetries) {
          this.rejectPending(requestKey, pending, new Error('Device V2 Route timed out'));
          return;
        }
        pending.retries += 1;
        this.publishPending(requestKey, pending);
      }, this.requestTimeoutMs);
    }, error => this.rejectPending(
      requestKey,
      pending,
      asError(error, 'Device V2 Route publish failed'),
    ));
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
        decodeServerHelloBody(frame.body);
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
      if (this.stateValue !== 'ready' || frame.kind !== Bbp2MessageKind.Delivery
        || frame.flags !== Bbp2FrameFlag.IsResponse || frame.sequence === 0) {
        throw new Error('unexpected Device V2 session frame');
      }
      this.delivery(decodeDeliveryBody(frame.body));
    } catch (error) {
      this.fail(asError(error, 'Device V2 inbound frame is invalid'));
    }
  }

  private delivery(delivery: Bbp2Delivery): void {
    if (delivery.requestId) {
      const requestKey = bytesToHex(delivery.requestId);
      const pending = this.pending.get(requestKey);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(requestKey);
      if (delivery.messageKind === Bbp2MessageKind.Error) {
        const error = decodeErrorBody(delivery.messageBody);
        if (delivery.messageFlags !== Bbp2FrameFlag.IsResponse
          || error.relatedSequence !== pending.sequence) {
          pending.reject(new Error('Route Error does not match the request'));
          return;
        }
        pending.reject(new DeviceV2RouteError(
          error.errorCode as Bbp2ErrorCode,
          error.relatedSequence,
          error.stateRevision,
        ));
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
    if (delivery.peerKind !== Bbp2RoutePeerKind.LogicalDevice
      || delivery.messageFlags !== Bbp2FrameFlag.IdMode) {
      throw new Error('unsolicited Delivery metadata is invalid');
    }
    const logicalDeviceId = peerIdToLogicalDevice(delivery.peerId);
    const snapshot = this.store.snapshot(logicalDeviceId);
    if (!snapshot.manifestAccepted || !snapshot.manifest) return;
    if (delivery.messageKind === Bbp2MessageKind.Patch) {
      const result = this.store.applyPatch(
        logicalDeviceId,
        decodePatchBody(delivery.messageBody, snapshot.manifest.fields),
      );
      if (result === 'resync') this.scheduleResync(logicalDeviceId);
    } else if (delivery.messageKind === Bbp2MessageKind.Event) {
      this.store.applyEvent(
        logicalDeviceId,
        decodeEventBody(delivery.messageBody, snapshot.manifest.fields),
      );
    } else {
      throw new Error('unsolicited Delivery kind is invalid');
    }
  }

  private scheduleResync(logicalDeviceId: string): void {
    void this.ensureReady(logicalDeviceId).catch(error => this.emitError(asError(
      error,
      'Device V2 state resync failed',
    )));
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
    pending.reject(error);
  }

  private assertReady(): void {
    if (this.stateValue !== 'ready') throw new Error('Device V2 session is not ready');
  }

  private fail(error: Error, notify = true): void {
    if (this.stateValue === 'closed') return;
    clearTimeout(this.helloTimer);
    this.detachMessage?.();
    this.detachClose?.();
    this.detachMessage = undefined;
    this.detachClose = undefined;
    for (const [requestKey, pending] of this.pending) {
      this.rejectPending(requestKey, pending, error);
    }
    this.synchronizing.clear();
    this.store.resetSession();
    this.setState('closed');
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
