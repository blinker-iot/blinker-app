import { Bbp2Frame, Bbp2FrameFlag, Bbp2MessageKind, DeviceV2Store, decodeFrame, encodeFrame, isLogicalDeviceId } from '../../protocol/device-v2';
import { DirectDeviceFrameChannel, DirectDeviceSession } from '../../protocol/device-v2/direct-session';
import { decodeDirectDeviceHelloBody, encodeDirectAppHelloBody } from '../../protocol/device-v2/direct-hello';
import { LocalAccessClient, SelfLocalAccessRequest } from './client';

type SecureClient = Pick<LocalAccessClient, 'maxFrameSize' | 'open' | 'send' | 'receive' | 'close'>;

// Adapts authenticated LAN bytes, not account Route/Delivery envelopes. Only
// one request and one ACK/time response may await TX; the byte client remains
// single-flight. This owns no MQTT, discovery, credentials or route selection.
class LocalDeviceFrameChannel implements DirectDeviceFrameChannel {
  private sequence = 0;
  private closed = false;
  private sends = 0;
  private sendTail: Promise<void> = Promise.resolve();
  private terminalFailure?: { error: unknown };
  private closePromise?: Promise<void>;
  maxFrameSize: number;
  private readonly onAbort = () => { void this.close(); };

  constructor(readonly logicalDeviceId: string, private readonly client: SecureClient,
    private readonly signal: AbortSignal) {
    this.maxFrameSize = Math.min(400, client.maxFrameSize);
    signal.addEventListener('abort', this.onAbort, { once: true });
  }

  createFrame(kind: Bbp2MessageKind, flags: number, body: Uint8Array): Bbp2Frame {
    this.assertOpen();
    this.sequence = this.sequence === 0xffff ? 1 : this.sequence + 1;
    return { kind, flags, sequence: this.sequence, body };
  }

  send(frame: Bbp2Frame): Promise<void> {
    this.assertOpen();
    if (this.sends >= 2) return Promise.reject(new Error('LOCAL_ACCESS_TX_CAPACITY'));
    const encoded = encodeFrame(frame);
    if (encoded.length > this.maxFrameSize) {
      encoded.fill(0);
      return this.fail(new Error('LOCAL_ACCESS_FRAME_TOO_LARGE'));
    }
    this.sends++;
    const pending = this.sendTail.then(async () => {
      this.assertOpen();
      await this.client.send(encoded);
      this.assertOpen();
    }).catch(error => this.fail(error)).finally(() => { encoded.fill(0); this.sends--; });
    this.sendTail = pending.catch(() => undefined);
    return pending;
  }

  async receive(): Promise<Bbp2Frame> {
    this.assertOpen();
    let encoded: Uint8Array | undefined;
    try {
      encoded = await this.client.receive();
      this.assertOpen();
      if (encoded.length > this.maxFrameSize) throw new Error('LOCAL_ACCESS_FRAME_TOO_LARGE');
      return decodeFrame(encoded);
    } catch (error) { return this.fail(error); }
    finally { encoded?.fill(0); }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.signal.removeEventListener('abort', this.onAbort);
    // Abort the carrier now; never wait behind a stalled send/receive.
    try { this.closePromise = Promise.resolve(this.client.close()); }
    catch (error) { this.closePromise = Promise.reject(error); }
    void this.closePromise.catch(() => undefined);
    return this.closePromise;
  }

  assertOpen(): void {
    if (this.terminalFailure) throw this.terminalFailure.error;
    this.signal.throwIfAborted();
    if (this.closed) throw new Error('LOCAL_ACCESS_SESSION_CLOSED');
  }

  private async fail(error: unknown): Promise<never> {
    this.terminalFailure ??= { error };
    await this.close().catch(() => undefined);
    throw this.terminalFailure.error;
  }
}

// Returns only after authenticated Hello + verified Manifest + fresh State.
// The caller must keep cloud ready during this preparation and check its own
// account/page generation before promoting the result to the preferred route.
export async function openLocalDeviceSession(client: SecureClient, input: SelfLocalAccessRequest,
  signal: AbortSignal, store = new DeviceV2Store()): Promise<DirectDeviceSession> {
  const request = { ...input };
  const channel = new LocalDeviceFrameChannel(request.recipientLogicalDeviceId, client, signal);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let session: DirectDeviceSession | undefined;
  try {
    channel.assertOpen();
    if (!isLogicalDeviceId(request.recipientLogicalDeviceId)) throw new Error('LOCAL_ACCESS_IDENTITY_INVALID');
    const authorization = await client.open(request, signal);
    channel.assertOpen();
    deadline = setTimeout(() => { void channel.close(); }, 15000);
    const hello = channel.createFrame(Bbp2MessageKind.Hello, 0,
      encodeDirectAppHelloBody('transport', channel.maxFrameSize, true));
    await channel.send(hello);
    const response = await channel.receive();
    if (response.kind !== Bbp2MessageKind.Hello || response.flags !== Bbp2FrameFlag.IsResponse
      || response.sequence !== hello.sequence) throw new Error('LOCAL_ACCESS_HELLO_MISMATCH');
    const peer = decodeDirectDeviceHelloBody(response.body, 'transport');
    channel.maxFrameSize = Math.min(channel.maxFrameSize, peer.maxFrameSize, peer.maxReassemblySize);
    session = new DirectDeviceSession(channel, store, 6000, {
      permissions: authorization.permissions, features: peer.features, maxFrameSize: channel.maxFrameSize,
    });
    await session.synchronize();
    channel.assertOpen();
    return session;
  } catch (error) {
    await (session ? session.close() : channel.close());
    throw error;
  } finally { if (deadline) clearTimeout(deadline); }
}
