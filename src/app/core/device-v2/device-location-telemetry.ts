import type { Wgs84MapPoint } from '../maps/map-tiles';
import { locationDeviceId } from './device-location';

export const DEVICE_LOCATION_FRESH_MS = 90000;
export const DEVICE_LOCATION_LEASE_MS = 30000;

export interface DeviceLocationTelemetryCapability {
  codec: 'device-gnss-v1';
  endpointId: number;
  manifestFingerprint: string;
}
export interface DeviceLocationTelemetrySample {
  latitudeE7: number;
  longitudeE7: number;
  horizontalAccuracyCm: number | null;
  capturedAtUtcMillis: number | null;
  timeQuality: 0 | 1;
  ageMillisAtReceipt: number;
  receivedAt: number;
}
export interface DeviceLocationTelemetryLatest {
  logicalDeviceId: string;
  capability: DeviceLocationTelemetryCapability | null;
  source: 'device-gnss';
  coordinateSystem: 'WGS84';
  sample: DeviceLocationTelemetrySample | null;
  ageMillis: number | null;
  fresh: boolean;
}
export type DeviceLocationTelemetryLeaseControl =
  | { operation: 'open'; leaseId: string; intervalMs: number }
  | { operation: 'renew' | 'close'; leaseId: string };
export interface DeviceLocationTelemetryLease {
  logicalDeviceId: string;
  leaseId: string;
  phase: 'active' | 'closed';
  /** Accepted demand cadence, not effective device sampling or an ACK. */
  intervalMs: number;
  expiresAt: number;
  leaseMs: 30000 | 0;
}

function invalid(): never { throw Error('DEVICE_V2_LOCATION_TELEMETRY_RESPONSE_INVALID'); }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) invalid();
  return record;
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
function bounded(value: unknown, maximumBytes: number): void {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > maximumBytes) invalid();
  } catch { invalid(); }
}

export function parseDeviceLocationTelemetryLatest(value: unknown, id: string): DeviceLocationTelemetryLatest {
  locationDeviceId(id); bounded(value, 16 * 1024);
  const record = exact(value, ['logicalDeviceId', 'capability', 'source', 'coordinateSystem', 'sample', 'ageMillis', 'fresh']);
  if (record['logicalDeviceId'] !== id || record['source'] !== 'device-gnss'
    || record['coordinateSystem'] !== 'WGS84' || typeof record['fresh'] !== 'boolean') invalid();
  let capability: DeviceLocationTelemetryCapability | null = null;
  if (record['capability'] !== null) {
    const item = exact(record['capability'], ['codec', 'endpointId', 'manifestFingerprint']);
    if (item['codec'] !== 'device-gnss-v1' || !integer(item['endpointId'], 1, 256)
      || typeof item['manifestFingerprint'] !== 'string' || !/^[a-f0-9]{64}$/.test(item['manifestFingerprint'])) invalid();
    capability = { codec: 'device-gnss-v1', endpointId: item['endpointId'], manifestFingerprint: item['manifestFingerprint'] };
  }
  let sample: DeviceLocationTelemetrySample | null = null;
  const age = record['ageMillis'];
  if (record['sample'] === null) {
    if (age !== null || record['fresh']) invalid();
  } else {
    if (capability === null) invalid();
    const point = exact(record['sample'], ['latitudeE7', 'longitudeE7', 'horizontalAccuracyCm',
      'capturedAtUtcMillis', 'timeQuality', 'ageMillisAtReceipt', 'receivedAt']);
    if (!integer(point['latitudeE7'], -900000000, 900000000)
      || !integer(point['longitudeE7'], -1800000000, 1800000000)
      || (point['horizontalAccuracyCm'] !== null && !integer(point['horizontalAccuracyCm'], 0, 0xffffffff))
      || (point['timeQuality'] !== 0 && point['timeQuality'] !== 1)
      || (point['timeQuality'] === 0 ? point['capturedAtUtcMillis'] !== null
        : !integer(point['capturedAtUtcMillis'], 946684800000, 4102444799999))
      || !integer(point['ageMillisAtReceipt'], 0, 0x7fffffff) || !integer(point['receivedAt'], 1)) invalid();
    if (age === null ? record['fresh'] : !integer(age, point['ageMillisAtReceipt'])
      || (record['fresh'] && age > DEVICE_LOCATION_FRESH_MS)) invalid();
    sample = { latitudeE7: point['latitudeE7'], longitudeE7: point['longitudeE7'],
      horizontalAccuracyCm: point['horizontalAccuracyCm'] as number | null,
      capturedAtUtcMillis: point['capturedAtUtcMillis'] as number | null, timeQuality: point['timeQuality'],
      ageMillisAtReceipt: point['ageMillisAtReceipt'], receivedAt: point['receivedAt'] };
  }
  return { logicalDeviceId: id, capability, source: 'device-gnss', coordinateSystem: 'WGS84',
    sample, ageMillis: age as number | null, fresh: record['fresh'] };
}

export function deviceLocationTelemetryLeaseControl(value: unknown): DeviceLocationTelemetryLeaseControl {
  try {
    const raw = value as Record<string, unknown> | null;
    const operation = raw?.['operation'];
    const record = exact(value, operation === 'open' ? ['operation', 'leaseId', 'intervalMs'] : ['operation', 'leaseId']);
    if (typeof operation !== 'string' || !['open', 'renew', 'close'].includes(operation) || typeof record['leaseId'] !== 'string'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(record['leaseId'])) invalid();
    if (operation === 'open') {
      if (!integer(record['intervalMs'], 1000, 5000)) invalid();
      return { operation, leaseId: record['leaseId'], intervalMs: record['intervalMs'] };
    }
    return { operation: operation as 'renew' | 'close', leaseId: record['leaseId'] };
  } catch { throw Error('DEVICE_V2_LOCATION_TELEMETRY_REQUEST_INVALID'); }
}

export function parseDeviceLocationTelemetryLease(value: unknown, id: string,
  command: DeviceLocationTelemetryLeaseControl): DeviceLocationTelemetryLease {
  locationDeviceId(id); bounded(value, 1024);
  const input = deviceLocationTelemetryLeaseControl(command);
  const record = exact(value, ['logicalDeviceId', 'leaseId', 'phase', 'intervalMs', 'expiresAt', 'leaseMs']);
  const closed = input.operation === 'close';
  if (record['logicalDeviceId'] !== id || record['leaseId'] !== input.leaseId
    || record['phase'] !== (closed ? 'closed' : 'active') || !integer(record['intervalMs'], 1000, 5000)
    || (input.operation === 'open' && record['intervalMs'] < input.intervalMs)
    || !integer(record['expiresAt'], 1) || record['leaseMs'] !== (closed ? 0 : DEVICE_LOCATION_LEASE_MS)) invalid();
  return { logicalDeviceId: id, leaseId: input.leaseId, phase: closed ? 'closed' : 'active',
    intervalMs: record['intervalMs'], expiresAt: record['expiresAt'], leaseMs: closed ? 0 : DEVICE_LOCATION_LEASE_MS };
}

export function locationTelemetryMapPoint(detail: DeviceLocationTelemetryLatest): Wgs84MapPoint | null {
  return detail.sample === null ? null : {
    longitude: detail.sample.longitudeE7 / 1e7, latitude: detail.sample.latitudeE7 / 1e7,
  };
}

/** Elapsed time can only age a server result; it cannot make a fenced point fresh. */
export function locationTelemetryFreshness(detail: DeviceLocationTelemetryLatest, elapsedMs: number) {
  const ageMillis = detail.ageMillis === null || !Number.isFinite(elapsedMs) || elapsedMs < 0 ? null
    : Math.min(Number.MAX_SAFE_INTEGER, detail.ageMillis + elapsedMs);
  return { ageMillis, fresh: detail.fresh && detail.sample !== null && ageMillis !== null
    && ageMillis <= DEVICE_LOCATION_FRESH_MS };
}
