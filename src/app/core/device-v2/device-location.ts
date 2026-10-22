export interface ManualDeviceLocation {
  longitude: number;
  latitude: number;
  coordinateSystem: 'WGS84';
  source: 'manual';
}
export interface DeviceLocationRecord {
  logicalDeviceId: string;
  revision: number;
  location: ManualDeviceLocation | null;
  updatedAt: number | null;
}
export interface DeviceLocationInput {
  expectedRevision: number;
  location: ManualDeviceLocation | null;
}

function invalid(): never { throw Error('DEVICE_V2_LOCATION_RESPONSE_INVALID'); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) invalid();
  return record;
}
export function locationDeviceId(value: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim()
    || new TextEncoder().encode(value).length > 128 || /[\x00-\x1f\x7f]/.test(value)) invalid();
  return value;
}
function revision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 0x7fffffff) invalid();
}
export function parseManualDeviceLocation(value: unknown): ManualDeviceLocation | null {
  if (value === null) return null;
  const record = object(value, ['longitude', 'latitude', 'coordinateSystem', 'source']);
  const longitude = record['longitude'], latitude = record['latitude'];
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || record['coordinateSystem'] !== 'WGS84' || record['source'] !== 'manual') invalid();
  return { longitude, latitude, coordinateSystem: 'WGS84', source: 'manual' };
}
export function parseDeviceLocationRecord(value: unknown, id: string): DeviceLocationRecord {
  locationDeviceId(id);
  const record = object(value, ['logicalDeviceId', 'revision', 'location', 'updatedAt']);
  if (record['logicalDeviceId'] !== id) invalid();
  revision(record['revision']);
  const location = parseManualDeviceLocation(record['location']);
  const updatedAt = record['updatedAt'];
  if (record['revision'] === 0 ? location !== null || updatedAt !== null
    : !Number.isSafeInteger(updatedAt) || Number(updatedAt) <= 0) invalid();
  return { logicalDeviceId: id, revision: record['revision'], location, updatedAt: updatedAt as number | null };
}
export function deviceLocationInput(value: unknown): DeviceLocationInput {
  const record = object(value, ['expectedRevision', 'location']);
  revision(record['expectedRevision']);
  if (record['expectedRevision'] >= 0x7fffffff) invalid();
  return { expectedRevision: record['expectedRevision'], location: parseManualDeviceLocation(record['location']) };
}
export function manualLocationDraft(longitude: string, latitude: string): ManualDeviceLocation | null {
  // Empty input is not zero; only explicit finite decimal values can be saved.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(longitude.trim())
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(latitude.trim())) return null;
  try { return parseManualDeviceLocation({ longitude: Number(longitude), latitude: Number(latitude),
    coordinateSystem: 'WGS84', source: 'manual' }); }
  catch { return null; }
}
