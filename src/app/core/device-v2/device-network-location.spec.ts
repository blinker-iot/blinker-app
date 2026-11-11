import { DeviceNetworkLocation, NETWORK_LOCATION_ATTRIBUTION, NETWORK_LOCATION_MAX_AGE_MS,
  networkLocationDeviceId, parseDeviceNetworkLocation } from './device-network-location';

const id = 'device_a';
function available(): DeviceNetworkLocation {
  return { logicalDeviceId: id, source: 'network-ip', status: 'available',
    region: { countryCode: 'CN', country: '中国', subdivision: '江苏省', city: '苏州市' },
    observedAt: 1000, queriedAt: 2000, dataVersion: '2026-10', attribution: NETWORK_LOCATION_ATTRIBUTION,
    coordinateSystem: null, coordinates: null };
}
const unknown = (): DeviceNetworkLocation => ({ ...available(), status: 'unknown', region: null,
  observedAt: null, dataVersion: null });

describe('Readonly device network-reference contract', () => {
  it('copies only the exact text projection and retains fixed attribution, never a map point', () => {
    const input = available(), result = parseDeviceNetworkLocation(input, id);
    expect(result).toEqual(input); expect(result).not.toBe(input); expect(result.region).not.toBe(input.region);
    expect(result.coordinates).toBeNull(); expect(result.coordinateSystem).toBeNull();
    expect(result.attribution).toBe(NETWORK_LOCATION_ATTRIBUTION);
    expect(Object.isFrozen(result.attribution)).toBe(true);
    expect(parseDeviceNetworkLocation({ ...input,
      region: { countryCode: 'CN', country: null, subdivision: null, city: null } }, id).status).toBe('available');
  });
  it('allows unknown with either no source or an authenticated origin without a city match', () => {
    expect(parseDeviceNetworkLocation(unknown(), id)).toEqual(unknown());
    const noMatch = { ...available(), status: 'unknown', region: null };
    expect(parseDeviceNetworkLocation(noMatch, id)).toEqual(noMatch);
  });
  it.each([
    null, [], {}, { ...available(), logicalDeviceId: 'other' }, { ...available(), source: 'device-gnss' },
    { ...available(), status: 'ready' }, { ...available(), rawIp: '8.8.8.8' },
    { ...available(), sessionId: 'private-session' }, { ...available(), coordinateSystem: 'WGS84' },
    { ...available(), coordinates: { latitude: 0, longitude: 0 } },
    { ...available(), status: 'unknown' }, { ...available(), region: null },
    { ...available(), region: { countryCode: null, country: null, subdivision: null, city: null } },
    { ...available(), region: { ...available().region, countryCode: 'cn' } },
    { ...available(), region: { ...available().region, city: ' city ' } },
    { ...available(), region: { ...available().region, city: 'city\u0085' } },
    { ...available(), region: { ...available().region, city: 'x'.repeat(129) } },
    { ...available(), region: { ...available().region, city: '😀'.repeat(97) } },
    { ...available(), region: { ...available().region, longitude: 1 } },
    { ...available(), queriedAt: 0 }, { ...available(), queriedAt: 1.5 },
    { ...available(), observedAt: 2001 }, { ...available(), observedAt: null },
    { ...available(), queriedAt: 1000 + NETWORK_LOCATION_MAX_AGE_MS },
    { ...unknown(), dataVersion: '2026-10' }, { ...unknown(), observedAt: 1000 },
    { ...available(), dataVersion: '2026-13' }, { ...available(), dataVersion: null },
    { ...available(), attribution: { ...NETWORK_LOCATION_ATTRIBUTION, url: 'https://example.com' } },
    { ...available(), attribution: { ...NETWORK_LOCATION_ATTRIBUTION, text: 'Unreviewed provider' } },
    { ...available(), attribution: { ...NETWORK_LOCATION_ATTRIBUTION, license: 'Other' } },
    { ...available(), attribution: { ...NETWORK_LOCATION_ATTRIBUTION, token: 'private' } },
  ])('rejects identity, privacy, source/time, region or attribution contract deviations %#', value => {
    expect(() => parseDeviceNetworkLocation(value, id)).toThrow('DEVICE_V2_NETWORK_LOCATION_RESPONSE_INVALID');
  });
  it('rejects oversized or cyclic responses without leaking their values in the error', () => {
    expect(() => parseDeviceNetworkLocation({ ...available(), extra: 'private'.repeat(2000) }, id))
      .toThrow('DEVICE_V2_NETWORK_LOCATION_RESPONSE_INVALID');
    const cyclic: any = available(); cyclic.extra = cyclic;
    expect(() => parseDeviceNetworkLocation(cyclic, id)).toThrow('DEVICE_V2_NETWORK_LOCATION_RESPONSE_INVALID');
  });
  it.each(['', ' a', 'a/b', 'a?ip=x', 'x'.repeat(129), 'a\n'])('rejects non-route device identifiers %j', value => {
    expect(() => networkLocationDeviceId(value)).toThrow();
  });
});
