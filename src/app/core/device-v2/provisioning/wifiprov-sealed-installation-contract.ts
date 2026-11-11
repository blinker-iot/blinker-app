import type { DeviceKeyContext } from '../../model/response.model';
import { bytesToHex } from '../../protocol/device-v2/codec';
import { base64UrlDecode } from '../base64url';
import { BleDirectCrypto } from '../ble-direct/crypto';
import { allocationContext } from './wifiprov-allocation';

export const WIFI_PROV_INSTALL_REQUEST_ID = /^wifiprov-[a-f0-9]{32}$/;
export const WIFI_PROV_INSTALL_NAME_DIGEST = /^[a-f0-9]{64}$/;
export type WiFiProvInstallRegion = 'China' | 'Global' | 'Development';
export type WiFiProvInstallPhase = 'prepared' | 'create-dispatched' | 'card-confirmed' | 'bootstrap-dispatched'
  | 'bootstrap-accepted' | 'wifi-dispatched' | 'wifi-confirmed';

export interface WiFiProvSealedInstallation {
  readonly version: 1;
  readonly deviceInstanceId: string;
  readonly requestId: string;
  readonly nameDigest: string;
  readonly phase: WiFiProvInstallPhase;
  readonly recipientPublicKey?: string;
  readonly context?: DeviceKeyContext;
}

export interface WiFiProvInstallationStatusRequest {
  readonly requestId: string;
  readonly deviceInstanceId: string;
  readonly recipientPublicKey: string;
  readonly nameDigest: string;
}

export type WiFiProvInstallationStatus = { readonly state: 'absent' | 'unavailable' }
  | { readonly state: 'created'; readonly device: DeviceKeyContext };

const invalid = () => Error('WIFIPROV_SEALED_INSTALLATION_INVALID');
const phases: WiFiProvInstallPhase[] = ['prepared', 'create-dispatched', 'card-confirmed', 'bootstrap-dispatched',
  'bootstrap-accepted', 'wifi-dispatched', 'wifi-confirmed'];

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key))) throw invalid();
  return value as Record<string, unknown>;
}

export function sealedInstallationId(value: unknown, size: number): string {
  if (typeof value !== 'string' || value.length !== Math.ceil(size * 8 / 6)) throw invalid();
  base64UrlDecode(value, size).fill(0);
  return value;
}

function matchingText(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw invalid();
  return value;
}

export function sealedInstallationContext(value: unknown): DeviceKeyContext {
  const fields = exact(value, ['logicalDeviceId', 'credentialVersion', 'locator']);
  if (typeof fields['logicalDeviceId'] !== 'string' || !fields['logicalDeviceId'].startsWith('device_') || fields['credentialVersion'] !== 1) throw invalid();
  return Object.freeze(allocationContext({ logicalDeviceId: fields['logicalDeviceId'], credentialVersion: 1,
    locator: sealedInstallationId(fields['locator'], 16) }));
}

export function validateSealedInstallation(value: unknown): WiFiProvSealedInstallation {
  const phase = (value as { phase?: WiFiProvInstallPhase } | null)?.phase;
  if (!phase || !phases.includes(phase)) throw invalid();
  const hasRecipient = phase !== 'prepared', hasContext = hasRecipient && phase !== 'create-dispatched';
  const fields = exact(value, ['version', 'deviceInstanceId', 'requestId', 'nameDigest', 'phase',
    ...(hasRecipient ? ['recipientPublicKey'] : []), ...(hasContext ? ['context'] : [])]);
  if (fields['version'] !== 1) throw invalid();
  return Object.freeze({ version: 1, deviceInstanceId: sealedInstallationId(fields['deviceInstanceId'], 16),
    requestId: matchingText(fields['requestId'], WIFI_PROV_INSTALL_REQUEST_ID),
    nameDigest: matchingText(fields['nameDigest'], WIFI_PROV_INSTALL_NAME_DIGEST), phase,
    ...(hasRecipient ? { recipientPublicKey: sealedInstallationId(fields['recipientPublicKey'], 32) } : {}),
    ...(hasContext ? { context: sealedInstallationContext(fields['context']) } : {}) });
}

export function validateInstallationStatusRequest(value: unknown): WiFiProvInstallationStatusRequest {
  const fields = exact(value, ['requestId', 'deviceInstanceId', 'recipientPublicKey', 'nameDigest']);
  return { requestId: matchingText(fields['requestId'], WIFI_PROV_INSTALL_REQUEST_ID),
    deviceInstanceId: sealedInstallationId(fields['deviceInstanceId'], 16), recipientPublicKey: sealedInstallationId(fields['recipientPublicKey'], 32),
    nameDigest: matchingText(fields['nameDigest'], WIFI_PROV_INSTALL_NAME_DIGEST) };
}

export function validateInstallationStatus(value: unknown): WiFiProvInstallationStatus {
  const state = (value as { state?: unknown } | null)?.state;
  if (state === 'absent' || state === 'unavailable') { exact(value, ['state']); return { state }; }
  if (state !== 'created') throw invalid();
  return { state, device: sealedInstallationContext(exact(value, ['state', 'device'])['device']) };
}

export function normalizeSealedInstallationName(name: string): string {
  const result = typeof name === 'string' ? name.trim() : '';
  if (!result || result.includes('\0') || result.length > 128 || new TextEncoder().encode(result).length > 256) throw invalid();
  return result;
}

export async function sealedInstallationNameDigest(normalized: string): Promise<string> {
  if (normalizeSealedInstallationName(normalized) !== normalized) throw invalid();
  const value = await new BleDirectCrypto().sha256(new TextEncoder().encode(normalized));
  try { return bytesToHex(value); } finally { value.fill(0); }
}
