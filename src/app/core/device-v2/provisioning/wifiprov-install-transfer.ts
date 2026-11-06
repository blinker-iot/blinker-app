import type { DeviceKeyContext, DeviceKeyRevealData } from '../../model/response.model';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import { BleDirectCrypto, constantTimeEqual } from '../ble-direct/crypto';
import { allocationContext } from './wifiprov-allocation';

export const WIFI_PROV_INSTALL_CONTRACT = 'provisioning-install-v1';
const domain = 'blinker.provisioning-install-key.v1';
const text = new TextEncoder();
const info = text.encode(domain);
const locatorDomain = text.encode('blinker/device-key/locator/v1\0');
const invalid = () => Error('WIFIPROV_INSTALL_TRANSFER_INVALID');

function exact(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
    || fields.some(key => !Object.hasOwn(value, key))) throw invalid();
  return value as Record<string, unknown>;
}

function binary(value: unknown, size: number): Uint8Array {
  if (typeof value !== 'string') throw invalid();
  const bytes = base64UrlDecode(value, size);
  if (base64UrlEncode(bytes) !== value) throw invalid();
  return bytes;
}

/** The same WebCrypto primitives as BC-5, with an independent purpose and
 * transcript. The ephemeral private key never leaves WebCrypto. */
export async function openWiFiProvInstallTransfer(requestId: string, deviceInstanceId: string,
  create: (recipientPublicKey: string) => Promise<unknown>, crypto = new BleDirectCrypto()): Promise<DeviceKeyRevealData> {
  if (!/^wifiprov-[a-f0-9]{32}$/.test(requestId) || !binary(deviceInstanceId, 16).some(Boolean)) throw invalid();
  const recipient = await crypto.x25519();
  let sender: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array;
  let shared: Uint8Array, salt: Uint8Array, aes: Uint8Array, key: Uint8Array, locator: Uint8Array;
  try {
    const recipientPublicKey = base64UrlEncode(recipient.publicKey);
    const response = exact(await create(recipientPublicKey), ['device', 'replayed', 'installationTransfer']);
    const device = response['device'] as DeviceKeyContext & { state?: string; deviceType?: string };
    if (response['replayed'] !== false || device?.state !== 'active' || device.deviceType !== 'diy'
      || device.credentialVersion !== 1 || Object.hasOwn(device, 'deviceKey')) throw invalid();
    const context = allocationContext(device);
    const transfer = exact(response['installationTransfer'], ['contract', 'senderPublicKey', 'nonce', 'ciphertext']);
    if (transfer['contract'] !== 'provisioning-install-key-v1') throw invalid();
    sender = binary(transfer['senderPublicKey'], 32); nonce = binary(transfer['nonce'], 12);
    ciphertext = binary(transfer['ciphertext'], 48);
    aad = text.encode(JSON.stringify([domain, requestId, deviceInstanceId, context.logicalDeviceId,
      context.credentialVersion, context.locator, recipientPublicKey, transfer['senderPublicKey']]));
    try {
      shared = await recipient.sharedSecret(sender);
      salt = await crypto.sha256(aad);
      aes = await crypto.hkdf(salt, shared, info, 32);
      key = await crypto.aesGcmDecrypt(aes, nonce, aad, ciphertext);
      if (key.length !== 32 || !key.some(Boolean)) throw invalid();
      locator = await crypto.sha256(locatorDomain, key);
      if (!constantTimeEqual(locator.subarray(0, 16), binary(context.locator, 16))) throw invalid();
      return { ...context, deviceKey: base64UrlEncode(key) };
    } catch { throw invalid(); }
  } finally {
    for (const bytes of [recipient.publicKey, sender, nonce, ciphertext, aad, shared, salt, aes, key, locator]) bytes?.fill(0);
  }
}
