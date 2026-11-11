import { Bbp2FrameFlag, Bbp2MessageKind } from '../../protocol/device-v2';
import { BleDirectSecureChannel } from './secure-channel';
import { BleDirectSession } from './session';

/** Purpose-only exchange; no reliable flag, resend, install or ordinary control. */
export class InitialCloudNetworkRecoverySession extends BleDirectSession {
  private used = false;
  constructor(channel: BleDirectSecureChannel) { super(channel); }

  requestNetworkHandoff(body: Uint8Array): Promise<Uint8Array> {
    if (this.used) return Promise.reject(Error('INITIAL_CLOUD_NETWORK_ATTEMPT_CONSUMED'));
    this.used = true;
    return this.enqueue(async () => (await this.exchange(Bbp2MessageKind.InitialCloudNetworkHandoff,
      0, body, Bbp2MessageKind.InitialCloudNetworkAccepted, Bbp2FrameFlag.IsResponse)).body);
  }
}
