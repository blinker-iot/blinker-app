export type ManagedMapLayer = 'base' | 'annotation';
export interface ManagedTileCoordinates { z: number; x: number; y: number; }
export type ManagedMapErrorKind = 'auth' | 'forbidden' | 'limit' | 'unavailable'
  | 'invalid' | 'cancelled' | 'timeout' | 'busy';

/** No upstream message, URL, credentials or cause crosses this boundary. */
export class ManagedMapError extends Error {
  constructor(readonly kind: ManagedMapErrorKind, readonly retryAfterSeconds?: number) {
    super('Managed map request failed');
    this.name = 'ManagedMapError';
  }
}

export interface ManagedMapEnabledConfig {
  enabled: true;
  provider: 'tianditu';
  version: 1;
  layers: readonly ManagedMapLayer[];
  tileSize: 256;
  minZoom: 1;
  maxZoom: 18;
  crs: 'EPSG:3857';
  attribution: { text: '天地图'; href: 'https://www.tianditu.gov.cn/'; };
}
export type ManagedMapConfig = { enabled: false } | ManagedMapEnabledConfig;

export interface ManagedMapSession {
  loadConfig(signal: AbortSignal): Promise<ManagedMapConfig>;
  getTile(layer: ManagedMapLayer, coords: ManagedTileCoordinates, signal: AbortSignal): Promise<Blob>;
  current(): boolean;
  close(): void;
}

export interface ManagedMapTransport {
  getTile(layer: ManagedMapLayer, coords: ManagedTileCoordinates, signal: AbortSignal): Promise<Blob>;
  current(): boolean;
  onError(error: ManagedMapError): void;
}

export const MANAGED_MAP_LIMITS = Object.freeze({ active: 4, queued: 64, urls: 96,
  bytes: 16 * 1024 * 1024, tileBytes: 512 * 1024, deadlineMs: 12000 });

export function validManagedTile(layer: unknown, coords: ManagedTileCoordinates): boolean {
  return (layer === 'base' || layer === 'annotation') && !!coords
    && Number.isInteger(coords.z) && coords.z >= 1 && coords.z <= 18
    && Number.isInteger(coords.x) && Number.isInteger(coords.y)
    && coords.x >= 0 && coords.y >= 0 && coords.x < 2 ** coords.z && coords.y < 2 ** coords.z;
}

export function managedMapError(error: unknown): ManagedMapError {
  if (error instanceof ManagedMapError) return error;
  const aborted = !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
  return new ManagedMapError(aborted ? 'cancelled' : 'unavailable');
}

export function parseManagedMapConfig(value: unknown): ManagedMapConfig {
  const object = (input: unknown): input is Record<string, unknown> =>
    !!input && typeof input === 'object' && !Array.isArray(input);
  const invalid = () => { throw new ManagedMapError('invalid'); };
  if (!object(value)) return invalid();
  if (value['enabled'] === false && Object.keys(value).length === 1) return { enabled: false };
  const keys = ['enabled', 'provider', 'version', 'layers', 'tileSize', 'minZoom', 'maxZoom', 'crs', 'attribution'];
  const attribution = value['attribution'];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))
    || value['enabled'] !== true || value['provider'] !== 'tianditu' || value['version'] !== 1
    || value['tileSize'] !== 256 || value['minZoom'] !== 1 || value['maxZoom'] !== 18
    || value['crs'] !== 'EPSG:3857' || !Array.isArray(value['layers'])
    || value['layers'].length !== 2 || value['layers'][0] !== 'base' || value['layers'][1] !== 'annotation'
    || !object(attribution) || Object.keys(attribution).length !== 2
    || attribution['text'] !== '天地图' || attribution['href'] !== 'https://www.tianditu.gov.cn/') return invalid();
  return { enabled: true, provider: 'tianditu', version: 1, layers: ['base', 'annotation'],
    tileSize: 256, minZoom: 1, maxZoom: 18, crs: 'EPSG:3857',
    attribution: { text: '天地图', href: 'https://www.tianditu.gov.cn/' } };
}
