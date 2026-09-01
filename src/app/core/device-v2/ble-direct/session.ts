import {
  Bbp2ErrorCode,
  Bbp2Frame,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  DeviceV2Ack,
  DeviceV2ManifestField,
  DeviceV2Store,
  decodeAckBody,
  decodeErrorBody,
  decodeEventBody,
  decodeManifestPageBody,
  decodePatchBody,
  decodeStatePageBody,
  encodeAckBody,
  encodeCommandBody,
  encodeManifestAcceptBody,
  encodeManifestRequestBody,
  encodeStateRequestBody,
  hexToBytes,
} from '../../protocol/device-v2';
import { BleDirectFrameChannel } from './secure-channel';
import { BleDirectCrypto } from './crypto';
import {
  ControllerMutationReceipt,
  decodeControllerControlChallengeBody,
  decodeControllerMutationReceipt,
  encodeControllerControlOpenBody,
  encodeControllerMutationBody,
} from './wire';
import {
  PresenceKeyReceipt,
  decodePresenceKeyReceipt,
  encodePresenceKeyMutation,
  verifyPresenceKeyReceipt,
} from './presence-key-control';

export type BleDirectSessionState = 'ready' | 'closed';

const BLE_DIRECT_RELIABLE_RETRY_MS = 1000;

export class BleDirectProtocolError extends Error {
  constructor(
    readonly code: Bbp2ErrorCode,
    readonly relatedSequence?: number,
    readonly stateRevision?: number,
  ) {
    super(`BLE Direct request failed with wire error ${code}`);
    this.name = 'BleDirectProtocolError';
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

export class BleDirectSession {
  readonly logicalDeviceId: string;
  readonly store: DeviceV2Store;

  private stateValue: BleDirectSessionState = 'ready';
  private pending?: PendingRequest;
  private operations: Promise<void> = Promise.resolve();
  private closePromise?: Promise<void>;
  private readonly errors = new Set<(error: Error) => void>();
  private readonly crypto = new BleDirectCrypto();

  constructor(
    private readonly channel: BleDirectFrameChannel,
    store = new DeviceV2Store(),
    private readonly requestTimeoutMs = 6000,
  ) {
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
      throw new Error('BLE Direct request timeout is invalid');
    }
    this.logicalDeviceId = channel.logicalDeviceId;
    this.store = store;
    void this.receiveLoop();
  }

  get state(): BleDirectSessionState {
    return this.stateValue;
  }

  subscribeErrors(listener: (error: Error) => void): () => void {
    this.errors.add(listener);
    return () => this.errors.delete(listener);
  }

  synchronize(): Promise<void> {
    return this.enqueue(() => this.synchronizeTarget());
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
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
          if (attempt === 0 && error instanceof BleDirectProtocolError
            && (error.code === Bbp2ErrorCode.ManifestConflict
              || error.code === Bbp2ErrorCode.NegotiationRequired)) {
            this.store.invalidate(this.logicalDeviceId);
            continue;
          }
          throw error;
        }
      }
      throw new Error('BLE Direct command retry exhausted');
    });
  }

  openControllerControl(): Promise<Uint8Array> {
    return this.enqueue(async () => {
      const response = await this.exchange(
        Bbp2MessageKind.ControllerControlOpen,
        0,
        encodeControllerControlOpenBody(),
        Bbp2MessageKind.ControllerControlChallenge,
        Bbp2FrameFlag.IsResponse,
      );
      return decodeControllerControlChallengeBody(response.body);
    });
  }

  applyControllerMutation(
    exactGrant: Uint8Array,
    controllerSecret: Uint8Array,
  ): Promise<ControllerMutationReceipt> {
    return this.enqueue(async () => {
      const response = await this.exchange(
        Bbp2MessageKind.ControllerMutation,
        0,
        encodeControllerMutationBody(exactGrant, controllerSecret),
        Bbp2MessageKind.ControllerMutationReceipt,
        Bbp2FrameFlag.IsResponse,
      );
      return decodeControllerMutationReceipt(response.body);
    });
  }

  replacePresenceKey(
    accessEpoch: number,
    expectedVersion: number,
    presenceKeyVersion: number,
    presenceKey: Uint8Array,
  ): Promise<PresenceKeyReceipt> {
    return this.enqueue(async () => {
      const response = await this.exchange(
        Bbp2MessageKind.PresenceKeyMutation,
        0,
        encodePresenceKeyMutation({
          accessEpoch,
          expectedVersion,
          presenceKeyVersion,
          presenceKey,
        }),
        Bbp2MessageKind.PresenceKeyReceipt,
        Bbp2FrameFlag.IsResponse,
      );
      const receipt = decodePresenceKeyReceipt(response.body);
      if (receipt.accessEpoch !== accessEpoch
        || receipt.expectedVersion !== expectedVersion
        || receipt.presenceKeyVersion !== presenceKeyVersion
        || !(await verifyPresenceKeyReceipt(this.crypto, presenceKey, receipt))) {
        throw new Error('BLE_PRESENCE_RECEIPT_MISMATCH');
      }
      return receipt;
    });
  }

  async close(): Promise<void> {
    if (!this.closePromise) {
      this.fail(new Error('BLE Direct session closed'), false);
    }
    await this.closePromise;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
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
        if (attempt === 0 && error instanceof BleDirectProtocolError
          && error.code === Bbp2ErrorCode.ManifestConflict) {
          this.store.invalidate(this.logicalDeviceId);
          continue;
        }
        throw error;
      }
    }
  }

  private async synchronizeManifest(): Promise<void> {
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
      const manifest = applied.manifest!;
      await this.exchange(
        Bbp2MessageKind.ManifestAccept,
        Bbp2FrameFlag.AckRequired,
        encodeManifestAcceptBody(manifest.revision, hexToBytes(manifest.fingerprint)),
        Bbp2MessageKind.Ack,
        Bbp2FrameFlag.IsResponse,
      );
      this.store.markManifestAccepted(
        this.logicalDeviceId, manifest.revision, manifest.fingerprint,
      );
      return;
    }
    throw new Error('BLE Direct Manifest pagination exceeded the field limit');
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
        throw new Error('BLE Direct State pagination exceeded the Manifest field count');
      } catch (error) {
        if (restart === 0 && error instanceof BleDirectProtocolError
          && error.code === Bbp2ErrorCode.StateConflict) continue;
        throw error;
      }
    }
  }

  private exchange(
    kind: Bbp2MessageKind,
    flags: number,
    body: Uint8Array,
    responseKind: Bbp2MessageKind,
    responseFlags: number,
  ): Promise<Bbp2Frame> {
    this.assertReady();
    if (this.pending) return Promise.reject(new Error('BLE Direct request is already pending'));
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
      const send = (): void => {
        attempts += 1;
        const timeoutMs = attempts < maximumAttempts
          ? Math.min(BLE_DIRECT_RELIABLE_RETRY_MS, this.requestTimeoutMs)
          : this.requestTimeoutMs;
        pending.timer = setTimeout(() => {
          if (this.pending !== pending) return;
          if (attempts < maximumAttempts) {
            send();
            return;
          }
          const error = new Error('BLE Direct request timed out');
          this.pending = undefined;
          reject(error);
          this.fail(error);
        }, timeoutMs);
        void this.channel.send(frame).catch(error => {
          if (this.pending !== pending) return;
          if (pending.timer) clearTimeout(pending.timer);
          this.pending = undefined;
          const failure = asError(error, 'BLE Direct request send failed');
          reject(failure);
          this.fail(failure);
        });
      };
      this.pending = pending;
      send();
    });
  }

  private async receiveLoop(): Promise<void> {
    try {
      while (this.stateValue === 'ready') {
        await this.receive(await this.channel.receive());
      }
    } catch (error) {
      if (this.stateValue === 'ready') {
        this.fail(asError(error, 'BLE Direct inbound frame is invalid'));
      }
    }
  }

  private async receive(frame: Bbp2Frame): Promise<void> {
    if (frame.kind === Bbp2MessageKind.Patch || frame.kind === Bbp2MessageKind.Event) {
      await this.notification(frame);
      return;
    }
    const pending = this.pending;
    if (frame.kind === Bbp2MessageKind.Error) {
      if (frame.flags !== Bbp2FrameFlag.IsResponse || !pending) {
        throw new Error('BLE Direct Error does not match a request');
      }
      const body = decodeErrorBody(frame.body);
      if (body.relatedSequence !== pending.sequence) {
        throw new Error('BLE Direct Error sequence does not match the request');
      }
      this.settle(pending);
      pending.reject(new BleDirectProtocolError(
        body.errorCode as Bbp2ErrorCode, body.relatedSequence, body.stateRevision,
      ));
      return;
    }
    if (!pending || frame.kind !== pending.kind || frame.flags !== pending.flags) {
      throw new Error('BLE Direct response does not match the request');
    }
    if (frame.kind === Bbp2MessageKind.Ack) {
      if (decodeAckBody(frame.body).acknowledgedSequence !== pending.sequence) {
        throw new Error('BLE Direct Ack sequence does not match the request');
      }
    } else if (frame.sequence !== pending.sequence) {
      throw new Error('BLE Direct response sequence does not match the request');
    }
    this.settle(pending);
    pending.resolve(frame);
  }

  private async notification(frame: Bbp2Frame): Promise<void> {
    const allowed = Bbp2FrameFlag.IdMode
      | (frame.kind === Bbp2MessageKind.Patch ? Bbp2FrameFlag.AckRequired : 0);
    if (frame.sequence === 0 || (frame.flags & ~allowed) !== 0) {
      throw new Error('BLE Direct notification metadata is invalid');
    }
    const snapshot = this.store.snapshot(this.logicalDeviceId);
    if (!snapshot.manifestAccepted || !snapshot.manifest) {
      if ((frame.flags & Bbp2FrameFlag.AckRequired) !== 0) {
        throw new Error('BLE Direct reliable notification arrived before Manifest');
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
      if (this.stateValue === 'ready') this.emitError(asError(error, 'BLE Direct resync failed'));
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
    if (this.stateValue !== 'ready') throw new Error('BLE Direct session is closed');
  }

  private fail(error: Error, notify = true): void {
    if (this.stateValue === 'closed') return;
    this.stateValue = 'closed';
    const pending = this.pending;
    if (pending) {
      this.settle(pending);
      pending.reject(error);
    }
    this.store.resetSession();
    this.closePromise = this.channel.close().catch(() => undefined);
    if (notify) this.emitError(error);
  }

  private emitError(error: Error): void {
    for (const listener of this.errors) listener(error);
  }
}
