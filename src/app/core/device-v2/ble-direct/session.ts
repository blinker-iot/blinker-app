import { Bbp2FrameFlag, Bbp2MessageKind } from '../../protocol/device-v2';
import { DirectDeviceSession } from '../../protocol/device-v2/direct-session';
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

// BLE-only credential/presence operations. Manifest, State, commands, reliable
// ACK/replay and cleanup are shared with the LAN self-device session.
export class BleDirectSession extends DirectDeviceSession {
  private readonly crypto = new BleDirectCrypto();

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
}
