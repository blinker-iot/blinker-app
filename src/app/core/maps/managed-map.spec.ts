import { ManagedMapError, managedMapError, parseManagedMapConfig, validManagedTile } from './managed-map';

const enabled = { enabled: true, provider: 'tianditu', version: 1, layers: ['base', 'annotation'],
  tileSize: 256, minZoom: 1, maxZoom: 18, crs: 'EPSG:3857',
  attribution: { text: '天地图', href: 'https://www.tianditu.gov.cn/' } };

describe('managed map public contract', () => {
  it('accepts only the fixed projection or explicit disabled service, never server URLs or HTML', () => {
    expect(parseManagedMapConfig({ enabled: false })).toEqual({ enabled: false });
    expect(parseManagedMapConfig(enabled)).toEqual(enabled);
    for (const value of [null, [], {}, { enabled: false, key: 'not-allowed' },
      ...[{ key: 'not-allowed' }, { url: 'https://foreign.invalid' }, { provider: 'other' },
        { version: 2 }, { minZoom: 0 }, { maxZoom: 30 }, { tileSize: 512 },
        { layers: ['annotation', 'base'] }, { layers: ['base'] },
        { attribution: { text: '<img onerror=alert(1)>', href: 'https://www.tianditu.gov.cn/' } },
        { attribution: { text: '天地图', href: 'javascript:alert(1)' } },
        { attribution: { text: '天地图', href: 'https://www.tianditu.gov.cn/', html: '<script>' } }]
        .map(patch => ({ ...enabled, ...patch }))]) {
      expect(() => parseManagedMapConfig(value)).toThrowError(ManagedMapError);
    }
  });
  it('accepts fixed coordinates and bounds without input coercion', () => {
    expect(validManagedTile('base', { z: 1, x: 0, y: 1 })).toBe(true);
    expect(validManagedTile('annotation', { z: 18, x: 262143, y: 262143 })).toBe(true);
    for (const [layer, coords] of [['other', { z: 1, x: 0, y: 0 }],
      ['base', { z: 0, x: 0, y: 0 }], ['base', { z: 19, x: 0, y: 0 }],
      ['base', { z: 1, x: 2, y: 0 }], ['base', { z: 1, x: -1, y: 0 }],
      ['base', { z: 1, x: 0, y: '0' }]]) {
      expect(validManagedTile(layer, coords as { z: number; x: number; y: number })).toBe(false);
    }
  });
  it('does not retain arbitrary upstream exceptions or URLs', () => {
    const safe = managedMapError(Error('https://private.invalid/?secret=not-for-ui'));
    expect(safe.kind).toBe('unavailable'); expect(safe.message).toBe('Managed map request failed');
    expect('cause' in safe).toBe(false);
    expect(managedMapError(new DOMException('hidden', 'AbortError')).kind).toBe('cancelled');
  });
});
