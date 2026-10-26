import { mapTileConfiguration, validMapPoint } from './map-tiles';

describe('configured map tiles and WGS84 point boundary', () => {
  it('requires the selected provider key and never supplies a fallback', () => {
    expect(mapTileConfiguration(null)).toBeNull();
    expect(mapTileConfiguration({ provider: 'tianditu', key: '  ' })).toBeNull();
    expect(mapTileConfiguration({ provider: 'unknown' as 'tianditu', key: 'unit-key' })).toBeNull();
  });

  it('preserves the existing three provider URLs, options and encoded keys', () => {
    const tdt = mapTileConfiguration({ provider: 'tianditu', key: 'unit&key' })!;
    expect(tdt.name).toBe('天地图'); expect(tdt.layers).toHaveLength(2);
    expect(tdt.layers[0].url).toBe('https://t{s}.tianditu.gov.cn/vec_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=vec&style=default&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=unit%26key');
    expect(tdt.layers[1].url).toBe('https://t{s}.tianditu.gov.cn/cva_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=cva&style=default&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=unit%26key');
    expect(tdt.layers.every(layer => layer.url.startsWith('https://') && layer.url.endsWith('tk=unit%26key'))).toBe(true);
    expect(tdt.layers[0].options).toEqual({ subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      minZoom: 1, maxZoom: 18, attribution: '&copy; 天地图' });
    expect(tdt.layers[1].options).toEqual({ ...tdt.layers[0].options, attribution: '' });
    expect(mapTileConfiguration({ provider: 'geoapify', key: 'unit-key' })!.layers[0].url)
      .toBe('https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=unit-key');
    expect(mapTileConfiguration({ provider: 'geoapify', key: 'unit-key' }, true)!.layers[0].url)
      .toBe('https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}@2x.png?apiKey=unit-key');
    const iq = mapTileConfiguration({ provider: 'locationIq', key: 'unit-key' })!;
    expect(iq.layers).toHaveLength(1); expect(iq.layers[0].options.subdomains).toEqual(['a', 'b', 'c']);
    expect(iq.layers[0].url).toBe('https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=unit-key');
  });

  it('accepts explicit zero and bounds but never coerces empty or invalid coordinates', () => {
    for (const point of [{ longitude: 0, latitude: 0 }, { longitude: -180, latitude: -90 }, { longitude: 180, latitude: 90 }]) {
      expect(validMapPoint(point)).toBe(true);
    }
    for (const point of [null, [], {}, { longitude: '', latitude: 0 }, { longitude: '0', latitude: 0 },
      { longitude: NaN, latitude: 0 }, { longitude: 0, latitude: Infinity },
      { longitude: 181, latitude: 0 }, { longitude: 0, latitude: -91 }]) expect(validMapPoint(point)).toBe(false);
  });

});
