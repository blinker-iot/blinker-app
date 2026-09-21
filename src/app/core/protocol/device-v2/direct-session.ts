import { Bbp2ErrorCode, Bbp2Frame, Bbp2FrameFlag, Bbp2MessageKind,
  DeviceV2Ack, DeviceV2Manifest, DeviceV2ManifestField } from './types';
import { DeviceV2Store } from './store';
import { DirectTimeOptions, DirectTimeResponder } from './direct-time';
import { decodeAckBody, decodeCachedManifest, decodeErrorBody, decodeEventBody, decodeManifestPageBody,
  decodePatchBody, decodeStatePageBody, encodeAckBody, encodeCommandBody,
  encodeManifestAcceptBody, encodeManifestRequestBody, encodeStateRequestBody, hexToBytes } from './codec';

// A self-device BBP lane, independent of BLE/LAN and of the account broker's
// Route/Delivery session. The carrier supplies authenticated bounded frames.
export interface DirectDeviceFrameChannel {
  readonly logicalDeviceId: string;
  createFrame(kind: Bbp2MessageKind, flags: number, body: Uint8Array): Bbp2Frame;
  send(frame: Bbp2Frame): Promise<void>;
  receive(): Promise<Bbp2Frame>;
  close(): Promise<void>;
}

export type DirectDeviceSessionState = 'ready' | 'closed';

// The carrier supplies the Hello hint only after authenticating the peer.
// Loading remains account-scoped at the service boundary, not in this protocol.
export interface DirectManifestCache {
  hello: Pick<DeviceV2Manifest, 'revision' | 'fingerprint'>;
  load: () => DeviceV2Manifest | undefined;
}

const DIRECT_RELIABLE_RETRY_MS = 1000;

export class DirectDeviceProtocolError extends Error {
  constructor(
    readonly code: Bbp2ErrorCode,
    readonly relatedSequence?: number,
    readonly stateRevision?: number,
  ) {
    super(`Device Direct request failed with wire error ${code}`);
    this.name = 'DirectDeviceProtocolError';
  }
}

interface PendingRequest {
  sequence: number;
  kind: Bbp2MessageKind;
  flags: number;
  timer?: ReturnType<typeof setTimeout>;
  resolve: (frame: Bbp2Frame) => void;
  reject: (error: Error) => void;
}

function asError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback);
}

export class DirectDeviceSession {
  readonly logicalDeviceId: string;
  readonly store: DeviceV2Store;

  private stateValue: DirectDeviceSessionState = 'ready';
  private pending?: PendingRequest;
  private lastAck?: DeviceV2Ack;
  private operations: Promise<void> = Promise.resolve();
  private closePromise?: Promise<void>;
  private terminalError?: Error;
  private readonly errors = new Set<(error: Error) => void>();
  private readonly closedListeners = new Set<() => void>();
  private readonly time?: DirectTimeResponder;

  constructor(
    private readonly channel: DirectDeviceFrameChannel,
    store = new DeviceV2Store(),
    private readonly requestTimeoutMs = 6000,
    time?: DirectTimeOptions,
    private manifestCache?: DirectManifestCache,
  ) {
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
      throw new Error('Device Direct request timeout is invalid');
    }
    this.logicalDeviceId = channel.logicalDeviceId;
    this.store = store;
    this.time = time ? new DirectTimeResponder(time) : undefined;
    void this.receiveLoop();
  }

  get state(): DirectDeviceSessionState {
    return this.stateValue;
  }

  subscribeErrors(listener: (error: Error) => void): () => void {
    this.errors.add(listener);
    return () => this.errors.delete(listener);
  }

  subscribeClosed(listener: () => void): () => void {
    if (this.stateValue === 'closed') {
      void this.closePromise?.then(listener).catch(() => undefined);
      return () => undefined;
    }
    this.closedListeners.add(listener);
    return () => this.closedListeners.delete(listener);
  }

  synchronize(): Promise<void> {
    return this.enqueue(() => this.synchronizeTarget());
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      this.manifestCache = undefined;
      this.store.invalidate(this.logicalDeviceId);
      await this.synchronizeTarget();
    });
  }

  command(endpointKey: string, value: unknown): Promise<DeviceV2Ack> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await this.synchronizeTarget();
        try {
          const request = await this.exchange(
            Bbp2MessageKind.Command,
            Bbp2FrameFlag.AckRequired | Bbp2FrameFlag.IdMode,
            encodeCommandBody(this.field(endpointKey), value),
            Bbp2MessageKind.Ack,
            Bbp2FrameFlag.IsResponse,
          );
          return decodeAckBody(request.body);
        } catch (error) {
          if (attempt === 0 && error instanceof DirectDeviceProtocolError
            && (error.code === Bbp2ErrorCode.ManifestConflict
              || error.code === Bbp2ErrorCode.NegotiationRequired)) {
            this.store.invalidate(this.logicalDeviceId);
            continue;
          }
          throw error;
        }
      }
      throw new Error('Device Direct command retry exhausted');
    });
  }

  async close(): Promise<void> {
    if (!this.closePromise) {
      this.fail(new Error('Device Direct session closed'), false);
    }
    await this.closePromise;
  }

  protected enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.operations.then(() => {
      this.assertReady();
      return operation();
    });
    this.operations = task.then(() => undefined, () => undefined);
    return task;
  }

  private async synchronizeTarget(): Promise<void> {
    const snapshot = this.store.snapshot(this.logicalDeviceId);
    if (snapshot.manifestAccepted && snapshot.stateFresh) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (!this.store.snapshot(this.logicalDeviceId).manifestAccepted) {
          await this.synchronizeManifest();
        }
        if (!this.store.snapshot(this.logicalDeviceId).stateFresh) {
          await this.synchronizeState();
        }
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof DirectDeviceProtocolError
          && error.code === Bbp2ErrorCode.ManifestConflict) {
          this.store.invalidate(this.logicalDeviceId);
          continue;
        }
        throw error;
      }
    }
  }

  private async synchronizeManifest(): Promise<void> {
    const cache = this.manifestCache;
    this.manifestCache = undefined; // One candidate per connection, including rejection/retry.
    const candidate = cache?.load(); // Account changes must fail, not become a cache miss.
    if (candidate && candidate.revision === cache!.hello.revision
      && candidate.fingerprint === cache!.hello.fingerprint) {
      let verified: DeviceV2Manifest | undefined;
      try {
        verified = (await this.store.applyManifestPage(
          this.logicalDeviceId, decodeCachedManifest(candidate),
        )).manifest;
      } catch {
        // Only cache validation falls back; auth, ACK and transport failures do not.
        this.store.invalidate(this.logicalDeviceId);
      }
      this.assertReady();
      if (verified) {
        await this.acceptManifest(verified);
        return;
      }
    }
    let cursor = 0;
    for (let pages = 0; pages <= 256; pages += 1) {
      const response = await this.exchange(
        Bbp2MessageKind.ManifestRequest,
        0,
        encodeManifestRequestBody(cursor),
        Bbp2MessageKind.Manifest,
        Bbp2FrameFlag.IsResponse,
      );
      const applied = await this.store.applyManifestPage(
        this.logicalDeviceId,
        decodeManifestPageBody(response.body),
      );
      cursor = applied.nextCursor;
      if (!applied.complete) continue;
      await this.acceptManifest(applied.manifest!);
      return;
    }
    throw new Error('Device Direct Manifest pagination exceeded the field limit');
  }

  private async acceptManifest(manifest: DeviceV2Manifest): Promise<void> {
    await this.exchange(
      Bbp2MessageKind.ManifestAccept, Bbp2FrameFlag.AckRequired,
      encodeManifestAcceptBody(manifest.revision, hexToBytes(manifest.fingerprint)),
      Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse,
    );
    this.assertReady();
    this.store.markManifestAccepted(this.logicalDeviceId, manifest.revision, manifest.fingerprint);
  }

  private async synchronizeState(): Promise<void> {
    const fields = this.store.snapshot(this.logicalDeviceId).manifest?.fields;
    if (!fields) throw new Error('verified Manifest is missing');
    for (let restart = 0; restart < 2; restart += 1) {
      this.store.beginState(this.logicalDeviceId);
      let cursor = 0;
      let revision: number | undefined;
      try {
        for (let pages = 0; pages <= fields.length; pages += 1) {
          const response = await this.exchange(
            Bbp2MessageKind.StateRequest,
            Bbp2FrameFlag.IdMode,
            encodeStateRequestBody(cursor, revision),
            Bbp2MessageKind.StatePage,
            Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode,
          );
          const applied = this.store.applyStatePage(
            this.logicalDeviceId,
            decodeStatePageBody(response.body, fields),
          );
          cursor = applied.nextCursor;
          revision = applied.revision;
          if (applied.complete) return;
        }
        throw new Error('Device Direct State pagination exceeded the Manifest field count');
      } catch (error) {
        if (restart === 0 && error instanceof DirectDeviceProtocolError
          && error.code === Bbp2ErrorCode.StateConflict) continue;
        throw error;
      }
    }
  }

  protected exchange(
    kind: Bbp2MessageKind,
    flags: number,
    body: Uint8Array,
    responseKind: Bbp2MessageKind,
    responseFlags: number,
  ): Promise<Bbp2Frame> {
    this.assertReady();
    if (this.pending) return Promise.reject(new Error('Device Direct request is already pending'));
    const frame = this.channel.createFrame(kind, flags, body);
    return new Promise<Bbp2Frame>((resolve, reject) => {
      const pending: PendingRequest = {
        sequence: frame.sequence,
        kind: responseKind,
        flags: responseFlags,
        resolve,
        reject,
      };
      const maximumAttempts = (flags & Bbp2FrameFlag.AckRequired) !== 0 ? 2 : 1;
      let attempts = 0;
      const send = async (): Promise<void> => {
        attempts += 1;
        const timeoutMs = attempts < maximumAttempts
          ? Math.min(DIRECT_RELIABLE_RETRY_MS, this.requestTimeoutMs)
          : this.requestTimeoutMs;
        try {
          // A relay transport may need more than the application retry
          // interval to durably deliver one record. Response timeout starts
          // only after that send completes; otherwise the retry races the
          // still-active send and violates the transport's single-flight
          // contract.
          await this.channel.send(frame);
        } catch (error) {
          if (this.pending !== pending) return;
          this.pending = undefined;
          const failure = asError(error, 'Device Direct request send failed');
          reject(failure);
          this.fail(failure);
          return;
        }
        if (this.pending !== pending) return;
        pending.timer = setTimeout(() => {
          if (this.pending !== pending) return;
          if (attempts < maximumAttempts) {
            void send();
            return;
          }
          const error = new Error('Device Direct request timed out');
          this.pending = undefined;
          reject(error);
          this.fail(error);
        }, timeoutMs);
      };
      this.pending = pending;
      void send();
    });
  }

  private async receiveLoop(): Promise<void> {
    try {
      while (this.stateValue === 'ready') {
        await this.receive(await this.channel.receive());
      }
    } catch (error) {
      if (this.stateValue === 'ready') {
        this.fail(asError(error, 'Device Direct inbound frame is invalid'));
      }
    }
  }

  private async receive(frame: Bbp2Frame): Promise<void> {
    this.assertReady(); // A receive resolving after close must not send a reply.
    if (frame.kind === Bbp2MessageKind.TimeRequest) {
      const response = this.time?.reply(frame);
      if (response) await this.channel.send(response);
      return; // Independent of the App's command/Manifest pending slot.
    }
    if (frame.kind === Bbp2MessageKind.Patch || frame.kind === Bbp2MessageKind.Event) {
      await this.notification(frame);
      return;
    }
    const pending = this.pending;
    const ack = frame.kind === Bbp2MessageKind.Ack && frame.flags === Bbp2FrameFlag.IsResponse
      ? decodeAckBody(frame.body) : undefined;
    // A reliable request may be retried before its first ACK reaches App.
    // The child then sends a fresh secure record / frame sequence for the
    // same confirmation. Ignore only the last exact ACK body, never a reply
    // for the currently pending sequence or a changed revision/status.
    if (ack && pending?.sequence !== ack.acknowledgedSequence
      && this.lastAck?.acknowledgedSequence === ack.acknowledgedSequence
      && this.lastAck.stateRevision === ack.stateRevision) return;
    if (frame.kind === Bbp2MessageKind.Error) {
      if (frame.flags !== Bbp2FrameFlag.IsResponse || !pending) {
        throw new Error('Device Direct Error does not match a request');
      }
      const body = decodeErrorBody(frame.body);
      if (body.relatedSequence !== pending.sequence) {
        throw new Error('Device Direct Error sequence does not match the request');
      }
      this.settle(pending);
      pending.reject(new DirectDeviceProtocolError(
        body.errorCode as Bbp2ErrorCode, body.relatedSequence, body.stateRevision,
      ));
      return;
    }
    if (!pending || frame.kind !== pending.kind || frame.flags !== pending.flags) {
      throw new Error('Device Direct response does not match the request');
    }
    if (ack) {
      if (ack.acknowledgedSequence !== pending.sequence) {
        throw new Error('Device Direct Ack sequence does not match the request');
      }
      this.lastAck = ack;
    } else if (frame.sequence !== pending.sequence) {
      throw new Error('Device Direct response sequence does not match the request');
    }
    this.settle(pending);
    pending.resolve(frame);
  }

  private async notification(frame: Bbp2Frame): Promise<void> {
    const allowed = Bbp2FrameFlag.IdMode
      | (frame.kind === Bbp2MessageKind.Patch ? Bbp2FrameFlag.AckRequired : 0);
    if (frame.sequence === 0 || (frame.flags & ~allowed) !== 0) {
      throw new Error('Device Direct notification metadata is invalid');
    }
    const snapshot = this.store.snapshot(this.logicalDeviceId);
    if (!snapshot.manifestAccepted || !snapshot.manifest) {
      if ((frame.flags & Bbp2FrameFlag.AckRequired) !== 0) {
        throw new Error('Device Direct reliable notification arrived before Manifest');
      }
      return;
    }
    const idMode = (frame.flags & Bbp2FrameFlag.IdMode) !== 0;
    if (frame.kind === Bbp2MessageKind.Patch) {
      const result = this.store.applyPatch(
        this.logicalDeviceId,
        decodePatchBody(frame.body, snapshot.manifest.fields, idMode),
      );
      if ((frame.flags & Bbp2FrameFlag.AckRequired) !== 0) {
        const revision = this.store.snapshot(this.logicalDeviceId).stateRevision ?? undefined;
        await this.channel.send(this.channel.createFrame(
          Bbp2MessageKind.Ack,
          Bbp2FrameFlag.IsResponse,
          encodeAckBody(frame.sequence, revision),
        ));
      }
      if (result === 'resync') this.scheduleResync();
      return;
    }
    this.store.applyEvent(
      this.logicalDeviceId,
      decodeEventBody(frame.body, snapshot.manifest.fields, idMode),
    );
  }

  private scheduleResync(): void {
    void this.enqueue(() => this.synchronizeTarget()).catch(error => {
      if (this.stateValue === 'ready') this.emitError(asError(error, 'Device Direct resync failed'));
    });
  }

  private field(endpointKey: string): DeviceV2ManifestField {
    const field = this.store.snapshot(this.logicalDeviceId).manifest?.fields.find(
      candidate => candidate.key === endpointKey,
    );
    if (!field) throw new Error(`unknown Device V2 endpoint ${endpointKey}`);
    return field;
  }

  private settle(pending: PendingRequest): void {
    if (this.pending !== pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending = undefined;
  }

  private assertReady(): void {
    if (this.stateValue !== 'ready') {
      throw this.terminalError ?? new Error('Device Direct session is closed');
    }
  }

  private fail(error: Error, notify = true): void {
    if (this.stateValue === 'closed') return;
    this.terminalError = error;
    this.stateValue = 'closed';
    this.lastAck = undefined;
    const pending = this.pending;
    if (pending) {
      this.settle(pending);
      pending.reject(error);
    }
    this.store.resetSession();
    this.closePromise = this.channel.close()
      .then(() => {
        for (const listener of this.closedListeners) {
          try {
            listener();
          } catch {
            // Session cleanup cannot be blocked by an observer.
          }
        }
        this.closedListeners.clear();
      });
    // Receive-loop failures can initiate cleanup without a close() caller.
    // Observe rejection, but retain it on closePromise and never signal release.
    void this.closePromise.catch(() => undefined);
    if (notify) this.emitError(error);
  }

  private emitError(error: Error): void {
    for (const listener of this.errors) listener(error);
  }
}
