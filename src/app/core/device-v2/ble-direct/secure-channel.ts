import {
  Bbp2Frame,
  Bbp2MessageKind,
  decodeFrame,
  encodeFrame,
} from '../../protocol/device-v2';
import { DirectSecureInitiator } from './crypto';
import { BleDirectRecordLink } from './transport';
import { DirectDeviceFrameChannel } from '../../protocol/device-v2/direct-session';

export class BleDirectSecureChannel implements DirectDeviceFrameChannel {
  private closed = false;
  private sendTail: Promise<void> = Promise.resolve();
  private sends = 0;
  private terminalFailure?: { error: unknown };
  private closePromise?: Promise<void>;

  constructor(
    readonly logicalDeviceId: string,
    private readonly link: BleDirectRecordLink,
    private readonly secure: DirectSecureInitiator,
    private readonly maxFrameSize: number,
    private sequence: number,
  ) {}

  createFrame(kind: Bbp2MessageKind, flags: number, body: Uint8Array): Bbp2Frame {
    this.sequence = this.sequence === 0xffff ? 1 : this.sequence + 1;
    return { kind, flags, sequence: this.sequence, body };
  }

  send(frame: Bbp2Frame): Promise<void> {
    this.assertOpen();
    if (this.sends >= 2) return Promise.reject(new Error('BLE_DIRECT_TX_CAPACITY'));
    this.sends++;
    const pending = this.sendTail.then(async () => {
      this.assertOpen();
      try {
        const encoded = encodeFrame(frame);
        if (encoded.length > this.maxFrameSize) throw new Error('BLE_DIRECT_FRAME_TOO_LARGE');
        const record = await this.secure.encrypt(encoded);
        this.assertOpen();
        await this.link.sendRecord(record);
      } catch (error) {
        return this.fail(error);
      }
    }).finally(() => { this.sends--; });
    this.sendTail = pending.catch(() => undefined);
    return pending;
  }

  async receive(): Promise<Bbp2Frame> {
    this.assertOpen();
    try {
      const encoded = await this.secure.decrypt(await this.link.receiveRecord(0));
      if (encoded.length > this.maxFrameSize) throw new Error('BLE_DIRECT_FRAME_TOO_LARGE');
      return decodeFrame(encoded);
    } catch (error) {
      return this.fail(error);
    }
  }

  close(): Promise<void> {
    if (!this.closePromise) {
      this.closed = true;
      this.secure.clear();
      // Native cancellation must not wait behind a stalled send. Any crypto
      // operation finishing later rechecks closed before writing its record.
      try { this.closePromise = Promise.resolve(this.link.disconnect()); }
      catch (error) { this.closePromise = Promise.reject(error); }
      void this.closePromise.catch(() => undefined);
    }
    return this.closePromise;
  }

  private assertOpen(): void {
    if (this.terminalFailure) throw this.terminalFailure.error;
    if (this.closed) throw new Error('BLE_DIRECT_SESSION_CLOSED');
  }

  private async fail(error: unknown): Promise<never> {
    // Disconnect also rejects an in-flight receive. Preserve the first cause
    // before cleanup so its DISCONNECTED cannot mask a send/crypto failure.
    this.terminalFailure ??= { error };
    // The failed operation retains its original cause, but close() must still
    // expose native cleanup failure instead of manufacturing a released link.
    await this.close().catch(() => undefined);
    throw this.terminalFailure.error;
  }
}
