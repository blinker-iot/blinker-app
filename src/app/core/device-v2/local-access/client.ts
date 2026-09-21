import { decodeLocalAccessChallenge, sameLocalAccessBytes } from '../../protocol/device-v2/local-access';
import { BleDirectCrypto } from '../ble-direct/crypto';
import { HttpLocalAccessApi, LocalAccessRequest } from './api';
import { createLocalAccessRecords, LocalAccessRecords } from './records';

// The platform owns one physical binary WebSocket and its bounded RX/TX.
// No redirects/text/compression; receive <= 420 bytes, no unlimited inbox.
// Abort/close must discard queued messages and stop pending native operations.
// This port deliberately does not select an IP, relax WebView security or own
// account MQTT. Its owner must close it on page/account/network-generation exit.
export interface LocalAccessMessageLink {
  receive(signal: AbortSignal): Promise<Uint8Array>;
  send(message: Uint8Array, signal: AbortSignal): Promise<void>;
  close(): void | Promise<void>;
}

export type SelfLocalAccessRequest = Omit<LocalAccessRequest, 'exactChallenge'>;
// A snapshot of the accepted grant, published only after the recipient proof.
// It is neither a durable capability nor permission to reopen a closed lane.
export interface LocalAccessAuthorization { readonly permissions: number; }
const MAX_FRAME = 400;
const HANDSHAKE_MS = 15000;

// One self session. The HTTP API verifies the exact grant; the MCU remains the
// authoritative permission/deadline checker. The injected record strategy is
// mode-bound; neither strategy owns another socket, queue or BBP session.
export class LocalAccessClient {
  readonly maxFrameSize = MAX_FRAME;
  private readonly lifetime = new AbortController();
  private records?: LocalAccessRecords;
  private state: 'new' | 'opening' | 'ready' | 'closed' = 'new';
  private timer?: ReturnType<typeof setTimeout>;
  private removeAbort?: () => void;
  private sending = false;
  private receiving = false;
  private expiresAt = 0;
  private closePromise?: Promise<void>;
  private terminalFailure?: { error: unknown };

  constructor(private readonly link: LocalAccessMessageLink,
    private readonly api: Pick<HttpLocalAccessApi, 'issue'>,
    private readonly crypto = new BleDirectCrypto(),
    private readonly now = () => performance.now()) {}

  async open(input: SelfLocalAccessRequest, signal: AbortSignal): Promise<LocalAccessAuthorization> {
    if (this.state !== 'new') throw new Error('LOCAL_ACCESS_STATE');
    this.state = 'opening';
    this.expiresAt = this.now() + HANDSHAKE_MS;
    const close = () => this.close();
    signal.addEventListener('abort', close, { once: true });
    this.removeAbort = () => signal.removeEventListener('abort', close);
    this.timer = setTimeout(close, HANDSHAKE_MS);
    let material: Awaited<ReturnType<HttpLocalAccessApi['issue']>> | undefined;
    try {
      if (signal.aborted) this.close();
      this.active();
      if (input.targetLogicalDeviceId !== '' || input.accessEpoch !== 0 || input.topologyVersion !== 0)
        throw new Error('LOCAL_ACCESS_SELF_REQUIRED');
      const request = { ...input, callerSessionId: input.callerSessionId.slice(),
        requestId: input.requestId.slice(), targetDeviceInstanceId: input.targetDeviceInstanceId.slice() };
      const exactChallenge = await this.receiveBounded(96);
      const challenge = decodeLocalAccessChallenge(exactChallenge);
      if (!sameLocalAccessBytes(challenge.recipientDeviceInstanceId, request.targetDeviceInstanceId))
        throw new Error('LOCAL_ACCESS_DEVICE_MISMATCH');
      if ((request.securityProfile !== 1 && request.securityProfile !== 2)
        || challenge.securityProfile !== request.securityProfile) throw new Error('LOCAL_ACCESS_PROFILE_MISMATCH');
      // Conservative client expiry, not a claim about MCU reception time.
      const requestedAt = this.now();
      material = await this.api.issue({ ...request, exactChallenge }, this.lifetime.signal);
      this.active();
      if (material.grant.securityProfile !== request.securityProfile) throw new Error('LOCAL_ACCESS_PROFILE_MISMATCH');
      await this.link.send(material.exactGrant, this.lifetime.signal);
      this.active();
      this.records = createLocalAccessRecords(request.securityProfile, this.crypto);
      const validForMillis = material.validForMillis;
      const permissions = material.grant.permissions;
      if (!Number.isInteger(validForMillis) || validForMillis <= 0 || validForMillis > request.lifetimeMillis)
        throw new Error('LOCAL_ACCESS_EXPIRED');
      const first = await this.records.start(material.sessionKey, material.grant.authenticator, () => this.active());
      material.clear(); material = undefined;
      try { this.active(); await this.link.send(first, this.lifetime.signal); }
      finally { first.fill(0); }
      this.active();
      await this.records.finish(await this.receiveBounded(this.records.responseSize));
      this.active();
      const remaining = validForMillis - (this.now() - requestedAt);
      if (remaining <= 0) throw new Error('LOCAL_ACCESS_EXPIRED');
      clearTimeout(this.timer);
      this.timer = setTimeout(close, remaining);
      this.expiresAt = requestedAt + validForMillis;
      this.state = 'ready';
      // BBP Hello is initiated by the existing Session owner after open resolves.
      return Object.freeze({ permissions });
    } catch (error) {
      this.fail(error);
    } finally {
      material?.clear();
    }
  }

  async send(frame: Uint8Array): Promise<void> {
    this.ready();
    if (this.sending) throw new Error('LOCAL_ACCESS_WOULD_BLOCK');
    if (!(frame instanceof Uint8Array) || frame.length === 0 || frame.length > MAX_FRAME)
      throw new Error('LOCAL_ACCESS_FRAME_SIZE');
    this.sending = true;
    const plaintext = frame.slice();
    let record: Uint8Array | undefined;
    try {
      record = await this.records!.encode(plaintext);
      this.ready();
      await this.link.send(record, this.lifetime.signal);
      this.ready();
    } catch (error) {
      // Any uncertain write retires this connection, in either record mode;
      // never recreate encryption or reroute an Action automatically.
      this.fail(error);
    } finally {
      plaintext.fill(0); record?.fill(0); this.sending = false;
    }
  }

  async receive(): Promise<Uint8Array> {
    this.ready();
    if (this.receiving) throw new Error('LOCAL_ACCESS_WOULD_BLOCK');
    this.receiving = true;
    let plaintext: Uint8Array | undefined;
    try {
      plaintext = await this.records!.decode(await this.receiveBounded(MAX_FRAME + this.records!.overhead));
      this.ready();
      if (!plaintext.length || plaintext.length > MAX_FRAME) throw new Error('LOCAL_ACCESS_FRAME_SIZE');
      return plaintext;
    } catch (error) {
      plaintext?.fill(0); this.fail(error);
    } finally { this.receiving = false; }
  }

  close(): Promise<void> {
    if (this.state !== 'closed') {
      this.state = 'closed'; clearTimeout(this.timer); this.removeAbort?.(); this.removeAbort = undefined;
      this.lifetime.abort();
      try { this.closePromise = Promise.resolve(this.link.close()); }
      catch (error) { this.closePromise = Promise.reject(error); }
      // Cleanup must wipe keys even on native failure, but its owner must not
      // mistake a failed close for a released physical connection.
      void this.closePromise.catch(() => undefined);
    }
    // Repeatable: a pending crypto operation may finish after the first close.
    this.records?.clear();
    return this.closePromise ?? Promise.resolve();
  }

  private active(): void {
    if (this.terminalFailure) throw this.terminalFailure.error;
    // Timers may be suspended in a background WebView. Never rely on the
    // timeout callback alone when the next operation resumes.
    if (this.expiresAt !== 0 && this.now() >= this.expiresAt) this.close();
    this.lifetime.signal.throwIfAborted();
  }
  private ready(): void {
    this.active();
    if (this.state !== 'ready') throw new Error('LOCAL_ACCESS_NOT_READY');
  }
  private fail(error: unknown): never {
    // Closing aborts the concurrent receive. Do not let its generic closed
    // error replace the write/crypto failure that actually retired the lane.
    this.terminalFailure ??= { error };
    this.close();
    throw this.terminalFailure.error;
  }
  private async receiveBounded(maximum: number): Promise<Uint8Array> {
    const message = await this.link.receive(this.lifetime.signal);
    this.active();
    if (!(message instanceof Uint8Array) || message.length === 0 || message.length > maximum)
      throw new Error('LOCAL_ACCESS_MESSAGE_SIZE');
    return message;
  }
}
