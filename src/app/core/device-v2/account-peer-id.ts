import { bytesToHex, logicalDevicePeerId } from '../protocol/device-v2/codec';
import { isLogicalDeviceReferenceId } from '../protocol/device-v2/logical-device-reference';
import { base64UrlDecode } from './base64url';

export class DeviceV2AccountPeerCollisionError extends Error {
  constructor() { super('Device V2 account peer identity is ambiguous'); }
}

/** Account MQTT compatibility only. Keep the original card ID in every cache
 * and correlation. This encoder does not authorize a Direct/LAN credential. */
export function accountLogicalDevicePeerId(logicalDeviceId: string): Uint8Array {
  if (!isLogicalDeviceReferenceId(logicalDeviceId)) throw Error('Invalid account logical device identity');
  const peer = logicalDeviceId.startsWith('device_') && logicalDeviceId.length === 29
    ? base64UrlDecode(logicalDeviceId.slice(7), 16) : logicalDevicePeerId(logicalDeviceId);
  if (!peer.some(Boolean)) throw Error('Invalid account logical device identity');
  return peer;
}

export function accountInventoryPeers(logicalDeviceIds: readonly string[]): Map<string, string> {
  const peers = new Map<string, string>();
  for (const id of logicalDeviceIds) {
    const peer = bytesToHex(accountLogicalDevicePeerId(id)), existing = peers.get(peer);
    if (existing !== undefined && existing !== id) throw new DeviceV2AccountPeerCollisionError();
    peers.set(peer, id);
  }
  return peers;
}
