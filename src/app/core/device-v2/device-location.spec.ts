import { deviceLocationInput, locationDeviceId, manualLocationDraft, parseDeviceLocationRecord } from './device-location';

const id = 'device_a';
const location = { longitude: 0, latitude: 0, coordinateSystem: 'WGS84', source: 'manual' };
describe('Manual device location strict wire contract', () => {
  it('accepts unset revision zero, recorded zero, boundary coordinates and explicit clear', () => {
    expect(parseDeviceLocationRecord({ logicalDeviceId: id, revision: 0, location: null, updatedAt: null }, id).location).toBeNull();
    for (const [longitude, latitude] of [[0, 0], [-180, -90], [180, 90]]) {
      const value = { ...location, longitude, latitude };
      expect(parseDeviceLocationRecord({ logicalDeviceId: id, revision: 1, location: value, updatedAt: 1 }, id).location).toEqual(value);
    }
    expect(deviceLocationInput({ expectedRevision: 1, location: null })).toEqual({ expectedRevision: 1, location: null });
  });
  it('rejects blank input instead of coercing it to zero while accepting an explicitly entered zero', () => {
    for (const [longitude, latitude] of [['', '0'], ['0', ' '], [' ', ' '], ['NaN', '1'], ['Infinity', '1'], ['0x10', '1'], ['181', '1'], ['1', '-91']]) {
      expect(manualLocationDraft(longitude, latitude)).toBeNull();
    }
    expect(manualLocationDraft('0', '0')).toEqual(location);
    expect(manualLocationDraft('-180', '90')).toEqual({ ...location, longitude: -180, latitude: 90 });
  });
  it('rejects coercible coordinates, extra fields, unknown source and coordinate system', () => {
    for (const value of [{ ...location, longitude: '' }, { ...location, latitude: null }, { ...location, longitude: true },
      { ...location, longitude: NaN }, { ...location, latitude: Infinity }, { ...location, extra: 1 },
      { ...location, source: 'ip' }, { ...location, coordinateSystem: 'GCJ02' }]) {
      expect(() => deviceLocationInput({ expectedRevision: 0, location: value })).toThrow('DEVICE_V2_LOCATION_RESPONSE_INVALID');
    }
    expect(() => deviceLocationInput({ expectedRevision: 0, location, localCache: true })).toThrow();
  });
  it('enforces exact record identity, revision lifecycle, positive safe timestamps and revision boundaries', () => {
    const record = { logicalDeviceId: id, revision: 1, location, updatedAt: 1 };
    for (const value of [{ ...record, logicalDeviceId: 'other' }, { ...record, extra: 1 },
      { ...record, revision: 0 }, { ...record, updatedAt: null }, { ...record, updatedAt: 0 },
      { ...record, updatedAt: Number.MAX_SAFE_INTEGER + 1 }, { ...record, revision: 0x80000000 }, { ...record, revision: '1' }]) {
      expect(() => parseDeviceLocationRecord(value, id)).toThrow();
    }
    expect(parseDeviceLocationRecord({ ...record, revision: 0x7fffffff }, id).revision).toBe(0x7fffffff);
    expect(deviceLocationInput({ expectedRevision: 0x7ffffffe, location }).expectedRevision).toBe(0x7ffffffe);
    expect(() => deviceLocationInput({ expectedRevision: 0x7fffffff, location })).toThrow();
    expect(() => deviceLocationInput({ expectedRevision: 0x80000000, location })).toThrow();
  });
  it('validates bounded trimmed identifiers without requiring a particular device prefix', () => {
    expect(locationDeviceId('custom-identity')).toBe('custom-identity');
    for (const value of ['', ' device_a', 'device_a ', 'device\n_a', 'device\u007f_a', 'a'.repeat(129)]) {
      expect(() => locationDeviceId(value)).toThrow();
    }
  });
});
