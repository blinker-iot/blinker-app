import {
  BBP2_HEADER_BYTES,
  Bbp2Frame,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  decodeFrame,
  encodeFrame,
} from '../../protocol/device-v2';
import { DirectSecureInitiator } from './crypto';
import { BleDirectRecordLink } from './transport';
import { DirectDeviceFrameChannel } from '../../protocol/device-v2/direct-session';
import { INITIAL_CLOUD_KEY_ACK_SIZE } from './cloud-registration-wire';
import { INITIAL_CLOUD_NETWORK_BODY_SIZE } from './initial-cloud-network-wire';

export type InitialCloudWrite = Bbp2MessageKind.InitialCloudKeyInstall | Bbp2MessageKind.InitialCloudWifiHandoff
  | Bbp2MessageKind.InitialCloudNetworkHandoff;
export type InitialCloudPurpose = 'key-registration' | 'installed-key-network';

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
    private readonly checkInitialCloudWrite?: (kind: InitialCloudWrite) => void,
    private readonly initialCloudPurpose: InitialCloudPurpose = 'key-registration',
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
        const kind = frame.kind;
        const installation = kind === Bbp2MessageKind.InitialCloudKeyInstall;
        const handoff = kind === Bbp2MessageKind.InitialCloudWifiHandoff;
        const network = kind === Bbp2MessageKind.InitialCloudNetworkHandoff;
        if (this.checkInitialCloudWrite) {
          const allowed = this.initialCloudPurpose === 'installed-key-network' ? network : installation || handoff;
          if (!allowed || frame.flags !== 0 || frame.sequence === 0)
            throw Error(this.initialCloudPurpose === 'installed-key-network'
              ? 'INITIAL_CLOUD_NETWORK_FRAME_INVALID' : 'CLOUD_REGISTRATION_FRAME_INVALID');
        } else if (installation || handoff || network || kind === Bbp2MessageKind.InitialCloudKeyReceipt
          || kind === Bbp2MessageKind.InitialCloudNetworkAccepted) {
          throw Error('CLOUD_REGISTRATION_PURPOSE_REQUIRED');
        }
        const encoded = encodeFrame(frame);
        if (installation) frame.body.fill(0); // One-shot owner transfers the plaintext body.
        let record: Uint8Array;
        try {
          if (encoded.length > this.maxFrameSize) throw new Error('BLE_DIRECT_FRAME_TOO_LARGE');
          record = await this.secure.encrypt(encoded);
        } finally {
          if (installation) encoded.fill(0);
        }
        this.assertOpen();
        if (installation || handoff || network) this.checkInitialCloudWrite!(kind);
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
      const frame = decodeFrame(encoded);
      if (this.checkInitialCloudWrite) {
        // Stop normal Direct notifications here, before the generic session
        // can emit an automatic TimeResponse or reliable acknowledgement.
        const network = this.initialCloudPurpose === 'installed-key-network';
        const kind = network ? Bbp2MessageKind.InitialCloudNetworkAccepted : Bbp2MessageKind.InitialCloudKeyReceipt;
        const size = network ? INITIAL_CLOUD_NETWORK_BODY_SIZE : INITIAL_CLOUD_KEY_ACK_SIZE;
        if (frame.kind !== kind || frame.flags !== Bbp2FrameFlag.IsResponse
          || frame.sequence === 0 || encoded[5] !== BBP2_HEADER_BYTES
          || encoded.length !== BBP2_HEADER_BYTES + size) throw Error(network
            ? 'INITIAL_CLOUD_NETWORK_ACK_INVALID' : 'CLOUD_REGISTRATION_ACK_INVALID');
      } else if (frame.kind === Bbp2MessageKind.InitialCloudKeyReceipt || frame.kind === Bbp2MessageKind.InitialCloudKeyInstall
        || frame.kind === Bbp2MessageKind.InitialCloudWifiHandoff || frame.kind === Bbp2MessageKind.InitialCloudNetworkHandoff
        || frame.kind === Bbp2MessageKind.InitialCloudNetworkAccepted) {
        throw Error('CLOUD_REGISTRATION_PURPOSE_REQUIRED');
      }
      return frame;
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
