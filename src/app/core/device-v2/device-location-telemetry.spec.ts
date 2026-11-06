import { deviceLocationTelemetryLeaseControl, locationTelemetryFreshness, locationTelemetryMapPoint,
  parseDeviceLocationTelemetryLatest, parseDeviceLocationTelemetryLease } from './device-location-telemetry';

const id = 'device_a', nonce = '3a8a013e-e225-4ff6-8fc4-6bbd1953b432';
const capability = { codec: 'device-gnss-v1', endpointId: 3, manifestFingerprint: 'a'.repeat(64) };
const empty = { logicalDeviceId: id, capability: null, source: 'device-gnss', coordinateSystem: 'WGS84',
  sample: null, ageMillis: null, fresh: false };
const sample = { latitudeE7: 0, longitudeE7: -10000000, horizontalAccuracyCm: null,
  capturedAtUtcMillis: null, timeQuality: 0, ageMillisAtReceipt: 12, receivedAt: 2000 };
const latest = { ...empty, capability, sample, ageMillis: 15, fresh: true };
const open = { operation: 'open' as const, leaseId: nonce, intervalMs: 1000 };
const lease = { logicalDeviceId: id, leaseId: nonce, phase: 'active', intervalMs: 1000, expiresAt: 30001, leaseMs: 30000 };

describe('Private device-location telemetry contracts', () => {
  it('accepts capability-null and capable no-fix projections without manufacturing a point', () => {
    expect(parseDeviceLocationTelemetryLatest(empty, id)).toEqual(empty);
    const noFix = parseDeviceLocationTelemetryLatest({ ...empty, capability }, id);
    expect(noFix.sample).toBeNull(); expect(locationTelemetryMapPoint(noFix)).toBeNull();
  });
  it('preserves unknown accuracy and capture UTC separately from server receipt time', () => {
    const point = parseDeviceLocationTelemetryLatest(latest, id);
    expect(point.sample).toEqual(sample);
    expect(point.source).toBe('device-gnss'); expect(point.coordinateSystem).toBe('WGS84');
    expect(locationTelemetryMapPoint(point)).toEqual({ longitude: -1, latitude: 0 });
    expect(parseDeviceLocationTelemetryLatest({ ...latest, sample: { ...sample, timeQuality: 1,
      capturedAtUtcMillis: 1735689600000, horizontalAccuracyCm: 150 } }, id).sample?.capturedAtUtcMillis).toBe(1735689600000);
  });
  it.each([
    { ...latest, logicalDeviceId: 'other' }, { ...latest, source: 'manual' },
    { ...latest, coordinateSystem: 'GCJ02' }, { ...latest, extra: true },
    { ...latest, capability: null }, { ...latest, capability: { ...capability, endpointId: 257 } },
    { ...latest, capability: { ...capability, manifestFingerprint: 'A'.repeat(64) } },
    { ...latest, sample: { ...sample, latitudeE7: 900000001 } },
    { ...latest, sample: { ...sample, longitudeE7: 1.5 } },
    { ...latest, sample: { ...sample, horizontalAccuracyCm: -1 } },
    { ...latest, sample: { ...sample, capturedAtUtcMillis: 2000 } },
    { ...latest, sample: { ...sample, timeQuality: 1 } },
    { ...latest, sample: { ...sample, timeQuality: 2 } },
    { ...latest, sample: { ...sample, receivedAt: 0 } },
    { ...latest, sample: { ...sample, extra: 'x'.repeat(17000) } },
    { ...latest, ageMillis: 11 }, { ...latest, ageMillis: null }, { ...latest, ageMillis: 90001 },
    { ...empty, fresh: true }, { ...empty, ageMillis: 0 },
  ])('rejects a mismatched, unbounded or false-fresh latest projection', value => {
    expect(() => parseDeviceLocationTelemetryLatest(value, id)).toThrow('DEVICE_V2_LOCATION_TELEMETRY_RESPONSE_INVALID');
  });
  it('never upgrades disconnected/expired results or reconstructs UTC to calculate freshness', () => {
    const point = parseDeviceLocationTelemetryLatest(latest, id);
    expect(locationTelemetryFreshness(point, 89985)).toEqual({ ageMillis: 90000, fresh: true });
    expect(locationTelemetryFreshness(point, 89986).fresh).toBe(false);
    expect(locationTelemetryFreshness({ ...point, fresh: false }, 0).fresh).toBe(false);
    expect(locationTelemetryFreshness(point, -1)).toEqual({ ageMillis: null, fresh: false });
    expect(locationTelemetryFreshness(point, Infinity)).toEqual({ ageMillis: null, fresh: false });
    expect(parseDeviceLocationTelemetryLatest({ ...latest, ageMillis: null, fresh: false }, id).fresh).toBe(false);
  });
  it('requires exact UUIDv4 one-shot lease bodies with interval only on open', () => {
    expect(deviceLocationTelemetryLeaseControl(open)).toEqual(open);
    for (const operation of ['renew', 'close'] as const) {
      expect(deviceLocationTelemetryLeaseControl({ operation, leaseId: nonce })).toEqual({ operation, leaseId: nonce });
    }
    for (const value of [{ ...open, intervalMs: 999 }, { ...open, intervalMs: 5001 },
      { ...open, intervalMs: 1000.5 }, { ...open, leaseId: nonce.toUpperCase() },
      { ...open, leaseId: nonce.replace('-4', '-3') }, { ...open, automaticRetry: true },
      { operation: 'renew', leaseId: nonce, intervalMs: 1000 }, { operation: 'close' },
      { operation: { toString: () => 'renew' }, leaseId: nonce }]) {
      expect(() => deviceLocationTelemetryLeaseControl(value)).toThrow('DEVICE_V2_LOCATION_TELEMETRY_REQUEST_INVALID');
    }
  });
  it('accepts demand floor adjustment, not an effective-cadence or ACK claim', () => {
    expect(parseDeviceLocationTelemetryLease({ ...lease, intervalMs: 2000 }, id, open).intervalMs).toBe(2000);
    const closed = { ...lease, phase: 'closed', leaseMs: 0 };
    expect(parseDeviceLocationTelemetryLease(closed, id, { operation: 'close', leaseId: nonce }).phase).toBe('closed');
  });
  it.each([
    { ...lease, logicalDeviceId: 'other' }, { ...lease, leaseId: '4a8a013e-e225-4ff6-8fc4-6bbd1953b432' },
    { ...lease, phase: 'closed' }, { ...lease, intervalMs: 5001 }, { ...lease, leaseMs: 29999 },
    { ...lease, expiresAt: 0 }, { ...lease, actualIntervalMs: 1000 },
  ])('rejects wrong identity, phase, TTL or enlarged lease contracts', value => {
    expect(() => parseDeviceLocationTelemetryLease(value, id, open)).toThrow('DEVICE_V2_LOCATION_TELEMETRY_RESPONSE_INVALID');
  });
  it('does not accept a faster-than-requested demand', () => {
    expect(() => parseDeviceLocationTelemetryLease(lease, id, { ...open, intervalMs: 2000 })).toThrow();
  });
});
