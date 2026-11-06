import type { DeviceV2ReceivedDevice } from '../../../core/model/response.model';
import { logicalDevicePeerId } from '../../../core/protocol/device-v2';

/** The last complete received projection, never a total derived from lazy owner rows. */
export function profileReceivedDeviceCount(
  received: readonly DeviceV2ReceivedDevice[] | undefined,
  available: boolean,
): number | null {
  if (!available || !Array.isArray(received)) return null;
  const ids = new Set<string>();
  for (const device of received) {
    if (device?.share?.state === 'revoked') continue;
    if (device?.share?.state !== 'active') return null;
    try { logicalDevicePeerId(device.logicalDeviceId); }
    catch { return null; }
    ids.add(device.logicalDeviceId);
  }
  return ids.size;
}
