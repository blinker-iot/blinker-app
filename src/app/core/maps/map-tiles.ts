import type { TileLayerOptions } from 'leaflet';
import type { ActiveThirdPartyService, GeolocationServiceProvider } from '../services/third-party-services.service';

export const MAP_PROVIDER_NAMES: Record<GeolocationServiceProvider, string> = {
  tianditu: '天地图', geoapify: 'Geoapify', locationIq: 'LocationIQ',
};

export interface MapTileConfiguration {
  name: string;
  layers: readonly { url: string; options: TileLayerOptions }[];
}

// Shared rendering configuration only. Keys come from the existing local
// service settings; no fallback provider, demo key or geolocation request.
export function mapTileConfiguration(
  service: ActiveThirdPartyService<GeolocationServiceProvider> | null,
  retina = false,
): MapTileConfiguration | null {
  if (!service || !Object.hasOwn(MAP_PROVIDER_NAMES, service.provider)
    || typeof service.key !== 'string' || !service.key.trim()) return null;
  const key = encodeURIComponent(service.key), name = MAP_PROVIDER_NAMES[service.provider];
  switch (service.provider) {
    case 'tianditu': {
      const options: TileLayerOptions = {
        subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], minZoom: 1, maxZoom: 18, attribution: '&copy; 天地图',
      };
      const tile = (layer: string) => `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=${layer}&style=default&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=${key}`;
      return { name, layers: [{ url: tile('vec'), options },
        { url: tile('cva'), options: { ...options, attribution: '' } }] };
    }
    case 'geoapify': return { name, layers: [{
      url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}${retina ? '@2x.png' : '.png'}?apiKey=${key}`,
      options: { maxZoom: 20, attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | &copy; OpenMapTiles &copy; OpenStreetMap contributors' },
    }] };
    case 'locationIq': return { name, layers: [{
      url: `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${key}`,
      options: { subdomains: ['a', 'b', 'c'], maxZoom: 18,
        attribution: '&copy; <a href="https://locationiq.com/" target="_blank">LocationIQ</a> &copy; OpenStreetMap contributors' },
    }] };
  }
}

// Only the dedicated location page opts into the public, best-effort base map.
// Existing custom-page widgets keep their original explicit-key requirement.
export function locationMapTileConfiguration(
  service: ActiveThirdPartyService<GeolocationServiceProvider> | null,
  retina = false,
): MapTileConfiguration | null {
  if (service) return mapTileConfiguration(service, retina);
  return { name: 'OpenStreetMap', layers: [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, noWrap: true, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0,
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
  }] };
}

/** Coordinates are always WGS84; this is not a GPS reading or saved record. */
export interface Wgs84MapPoint { longitude: number; latitude: number; }

export function validMapPoint(value: unknown): value is Wgs84MapPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Wgs84MapPoint;
  return typeof point.longitude === 'number' && Number.isFinite(point.longitude)
    && point.longitude >= -180 && point.longitude <= 180
    && typeof point.latitude === 'number' && Number.isFinite(point.latitude)
    && point.latitude >= -90 && point.latitude <= 90;
}
