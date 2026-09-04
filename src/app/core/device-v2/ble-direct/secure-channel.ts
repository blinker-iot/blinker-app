import {
  Bbp2Frame,
  Bbp2MessageKind,
  decodeFrame,
  encodeFrame,
} from '../../protocol/device-v2';
import { DirectSecureInitiator } from './crypto';
import { BleDirectRecordLink } from './transport';

export interface BleDirectFrameChannel {
  readonly logicalDeviceId: string;
  createFrame(kind: Bbp2MessageKind, flags: number, body: Uint8Array): Bbp2Frame;
  send(frame: Bbp2Frame): Promise<void>;
  receive(): Promise<Bbp2Frame>;
  close(): Promise<void>;
}

export class BleDirectSecureChannel implements BleDirectFrameChannel {
  private closed = false;
  private sendTail: Promise<void> = Promise.resolve();

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
    const pending = this.sendTail.then(async () => {
      this.assertOpen();
      try {
        const encoded = encodeFrame(frame);
        if (encoded.length > this.maxFrameSize) throw new Error('BLE_DIRECT_FRAME_TOO_LARGE');
        await this.link.sendRecord(await this.secure.encrypt(encoded));
      } catch (error) {
        return this.fail(error);
      }
    });
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

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.sendTail.catch(() => undefined);
    this.secure.clear();
    await this.link.disconnect();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('BLE_DIRECT_SESSION_CLOSED');
  }

  private async fail(error: unknown): Promise<never> {
    this.closed = true;
    this.secure.clear();
    await this.link.disconnect().catch(() => undefined);
    throw error;
  }
}
