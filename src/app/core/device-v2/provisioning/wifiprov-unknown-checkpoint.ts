import type { DeviceKeyContext } from '../../model/response.model';

export const WIFI_PROV_UNKNOWN_TTL_MS = 24 * 60 * 60 * 1000;

/** A historical fact only. Never an owner/death proof or permission to resend. */
export interface WiFiProvUnknownCheckpoint {
  version: 1;
  status: 'unknown';
  attemptedAt: number;
  expiresAt: number;
}

export type WiFiProvUnknownAvailability = 'available' | 'expired' | 'clock-invalid';

export interface WiFiProvUnknownRecovery {
  requestId: string;
  name: string;
  context: DeviceKeyContext;
  deviceInstanceId: Uint8Array;
  checkpoint: WiFiProvUnknownCheckpoint;
  availability: WiFiProvUnknownAvailability;
}

const invalid = () => Object.assign(Error('WIFIPROV_UNKNOWN_CHECKPOINT_INVALID'),
  { code: 'WIFIPROV_UNKNOWN_CHECKPOINT_INVALID' });

export function createWiFiProvUnknownCheckpoint(attemptedAt: number): WiFiProvUnknownCheckpoint {
  return validateWiFiProvUnknownCheckpoint({ version: 1, status: 'unknown', attemptedAt,
    expiresAt: attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS });
}

export function validateWiFiProvUnknownCheckpoint(value: unknown): WiFiProvUnknownCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 4
    || Object.keys(value).some(key => !['version', 'status', 'attemptedAt', 'expiresAt'].includes(key))) throw invalid();
  const item = value as WiFiProvUnknownCheckpoint;
  if (item.version !== 1 || item.status !== 'unknown' || !Number.isSafeInteger(item.attemptedAt)
    || item.attemptedAt <= 0 || !Number.isSafeInteger(item.expiresAt)
    || item.expiresAt !== item.attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS) throw invalid();
  return { version: 1, status: 'unknown', attemptedAt: item.attemptedAt, expiresAt: item.expiresAt };
}

/** Clock rollback cannot extend a receipt's fixed recovery period. No cleanup side effect. */
export function wiFiProvUnknownAvailability(
  value: WiFiProvUnknownCheckpoint, now: number,
): WiFiProvUnknownAvailability {
  const item = validateWiFiProvUnknownCheckpoint(value);
  if (!Number.isSafeInteger(now) || now < item.attemptedAt) return 'clock-invalid';
  return now >= item.expiresAt ? 'expired' : 'available';
}
