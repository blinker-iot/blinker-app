import type { PlatformCapabilities, ProvisioningDevice, WiFiProvPlugin } from 'capacitor-wifiprov';
import { decodeWiFiProvBase64 } from './capacitor-esp32-wifiprov.transport';
import { BlinkerConfigInfo, decodeBlinkerConfigInfo } from './esp32-wifiprov';
import { isolatedWiFiProvOwner } from './wifiprov-softap-stages';
import { supportsSystemConnectedReadOnly } from './wifiprov-system-connected';

export function supportsSystemConnectedConfigInfo(capabilities?: PlatformCapabilities): boolean {
  return supportsSystemConnectedReadOnly(capabilities)
    && capabilities?.softApSystemConnectedConfigInfoRead === true;
}

const unknown = () => Object.assign(Error('固定设备状态读取无法确认，会话须关闭，不会自动重试'),
  { code: 'PROVISIONING_RESULT_UNKNOWN' });

/** One fixed native read. Never delegates to sendCustomData or an identity coordinator. */
export async function readSystemConnectedConfigInfo(
  client: Pick<WiFiProvPlugin, 'readBlinkerConfigInfo'>,
  capabilities: PlatformCapabilities | undefined,
  device: ProvisioningDevice,
  assertCurrent: () => void,
): Promise<BlinkerConfigInfo> {
  const packet = await readSystemConnectedConfigInfoPacket(client, capabilities, device, assertCurrent);
  return packet.info ?? decodeBlinkerConfigInfo(packet.bytes);
}

/** Same one native call, including the original bytes for a transport/decoder caller. */
export async function readSystemConnectedConfigInfoPacket(
  client: Pick<WiFiProvPlugin, 'readBlinkerConfigInfo'>,
  capabilities: PlatformCapabilities | undefined,
  device: ProvisioningDevice,
  assertCurrent: () => void,
): Promise<{ bytes: Uint8Array; info?: BlinkerConfigInfo }> {
  assertCurrent();
  if (!supportsSystemConnectedConfigInfo(capabilities) || typeof client.readBlinkerConfigInfo !== 'function') {
    throw Object.assign(Error('当前原生插件不支持固定设备状态读取'),
      { code: 'WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED' });
  }
  const expected = isolatedWiFiProvOwner(device);
  if (device.connected !== true) throw Object.assign(Error('当前热点会话尚未连接'), { code: 'WIFIPROV_NOT_CONNECTED' });
  const response = await client.readBlinkerConfigInfo(); // No caller-provided endpoint, bytes or owner.
  assertCurrent(); // Retired account/generation can never receive the old observation.
  let bytes: Uint8Array;
  try {
    if (!response || typeof response !== 'object' || Object.keys(response).length !== 2
      || Object.keys(response).some(key => key !== 'base64' && key !== 'localOwner')
      || typeof response.base64 !== 'string' || ![4, 32].includes(response.base64.length)) throw unknown();
    const observed = isolatedWiFiProvOwner({ transport: 'softap', security: 1, localOwner: response.localOwner });
    if (observed.session !== expected.session) throw unknown();
    bytes = decodeWiFiProvBase64(response.base64);
    if (bytes[0] !== 2 || bytes[1] !== 1) throw unknown();
    if (bytes.length === 3) {
      if (bytes[2] < 1 || bytes[2] > 8) throw unknown();
    } else if (bytes.length !== 24 || bytes[2] !== 0 || (bytes[3] & ~7) !== 0) throw unknown();
  } catch { throw unknown(); }
  // Preserve the existing decoder's explicit nonzero device status, not an empty success.
  if (bytes.length === 3) return { bytes };
  const info = decodeBlinkerConfigInfo(bytes);
  if (!info.deviceInstanceId.some(Boolean) || info.hasAccessState !== (info.accessEpoch > 0)) throw unknown();
  return { bytes, info };
}
