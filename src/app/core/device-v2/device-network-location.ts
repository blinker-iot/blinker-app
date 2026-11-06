import { locationDeviceId } from './device-location';

export const NETWORK_LOCATION_MAX_AGE_MS = 10 * 60 * 1000;
export const NETWORK_LOCATION_ATTRIBUTION = Object.freeze({
  text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com', license: 'CC BY 4.0',
} as const);

export interface DeviceNetworkRegion {
  countryCode: string | null;
  country: string | null;
  subdivision: string | null;
  city: string | null;
}
/** A server-authenticated network reference, never a map point or installation location. */
export interface DeviceNetworkLocation {
  logicalDeviceId: string;
  source: 'network-ip';
  status: 'available' | 'unknown';
  region: DeviceNetworkRegion | null;
  observedAt: number | null;
  queriedAt: number;
  dataVersion: string | null;
  attribution: typeof NETWORK_LOCATION_ATTRIBUTION;
  coordinateSystem: null;
  coordinates: null;
}

function invalid(): never { throw Error('DEVICE_V2_NETWORK_LOCATION_RESPONSE_INVALID'); }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) invalid();
  return record;
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function networkLocationDeviceId(id: string): string {
  locationDeviceId(id);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) invalid();
  return id;
}
function region(value: unknown): DeviceNetworkRegion | null {
  if (value === null) return null;
  const record = exact(value, ['countryCode', 'country', 'subdivision', 'city']);
  if (record['countryCode'] !== null && (typeof record['countryCode'] !== 'string'
    || !/^[A-Z]{2}$/.test(record['countryCode']))) invalid();
  for (const name of ['country', 'subdivision', 'city']) {
    const text = record[name];
    if (text !== null && (typeof text !== 'string' || !text || text !== text.trim()
      || text.length > 128 || new TextEncoder().encode(text).length > 384 || /[\x00-\x1f\x7f-\x9f]/.test(text))) invalid();
  }
  if (Object.values(record).every(item => item === null)) invalid();
  return { countryCode: record['countryCode'] as string | null, country: record['country'] as string | null,
    subdivision: record['subdivision'] as string | null, city: record['city'] as string | null };
}

export function parseDeviceNetworkLocation(value: unknown, id: string): DeviceNetworkLocation {
  networkLocationDeviceId(id);
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > 8 * 1024) invalid();
  } catch { invalid(); }
  const record = exact(value, ['logicalDeviceId', 'source', 'status', 'region', 'observedAt', 'queriedAt',
    'dataVersion', 'attribution', 'coordinateSystem', 'coordinates']);
  if (record['logicalDeviceId'] !== id || record['source'] !== 'network-ip'
    || !['available', 'unknown'].includes(record['status'] as string)
    || record['coordinateSystem'] !== null || record['coordinates'] !== null || !positive(record['queriedAt'])) invalid();
  const place = region(record['region']);
  if ((record['status'] === 'available') !== (place !== null)) invalid();
  const observedAt = record['observedAt'], version = record['dataVersion'];
  if (observedAt === null) {
    if (version !== null || place !== null) invalid();
  } else if (!positive(observedAt) || observedAt > record['queriedAt']
    || record['queriedAt'] - observedAt >= NETWORK_LOCATION_MAX_AGE_MS
    || typeof version !== 'string' || !/^20\d\d-(0[1-9]|1[0-2])$/.test(version)) invalid();
  const attribution = exact(record['attribution'], ['text', 'url', 'license']);
  for (const name of ['text', 'url', 'license'] as const) {
    if (attribution[name] !== NETWORK_LOCATION_ATTRIBUTION[name]) invalid();
  }
  return { logicalDeviceId: id, source: 'network-ip', status: record['status'] as 'available' | 'unknown',
    region: place, observedAt: observedAt as number | null, queriedAt: record['queriedAt'], dataVersion: version as string | null,
    attribution: NETWORK_LOCATION_ATTRIBUTION, coordinateSystem: null, coordinates: null };
}
