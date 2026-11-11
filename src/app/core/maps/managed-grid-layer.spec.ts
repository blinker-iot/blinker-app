import * as L from 'leaflet';
import { createManagedMapLayers } from './managed-grid-layer';
import { MANAGED_MAP_LIMITS, ManagedMapError, ManagedMapLayer, ManagedTileCoordinates } from './managed-map';

describe('managed GridLayer shared bounded tile owner', () => {
  const owners: { dispose(): void }[] = [];
  let createUrl: ReturnType<typeof vi.fn>, revokeUrl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers(); let sequence = 0;
    createUrl = vi.fn(() => `blob:managed-test-${++sequence}`); revokeUrl = vi.fn();
    const OriginalURL = URL;
    class TestURL extends OriginalURL {}
    Object.defineProperties(TestURL, {
      createObjectURL: { value: createUrl }, revokeObjectURL: { value: revokeUrl },
    });
    vi.stubGlobal('URL', TestURL);
  });
  afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
  const blob = (size = 20, type = 'image/png') => new Blob([new Uint8Array(size)], { type });
  function fixture(limits: Parameters<typeof createManagedMapLayers>[1] = {}) {
    let current = true;
    const pending: { layer: ManagedMapLayer; coords: ManagedTileCoordinates; signal: AbortSignal;
      resolve(value: Blob): void; reject(error: unknown): void }[] = [];
    const getTile = vi.fn((layer: ManagedMapLayer, coords: ManagedTileCoordinates, signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => pending.push({ layer, coords, signal, resolve, reject })));
    const onError = vi.fn(), owner = createManagedMapLayers({ getTile, current: () => current, onError }, limits);
    owners.push(owner);
    const make = (layer = 0, x = 0) => {
      const done = vi.fn();
      const image = (owner.layers[layer] as unknown as { createTile(coords: L.Coords, done: L.DoneCallback): HTMLImageElement })
        .createTile({ z: 18, x, y: 0 } as L.Coords, done);
      return { image, done };
    };
    const loaded = (image: HTMLImageElement, width = 256, height = 256) => {
      Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
      image.dispatchEvent(new Event('load'));
    };
    return { ...owner, getTile, onError, pending, make, loaded, stale() { current = false; } };
  }

  it('uses real asynchronous GridLayers with fixed safe attribution and viewport-only options', () => {
    const f = fixture();
    expect(f.layers).toHaveLength(2);
    for (const layer of f.layers) {
      expect(layer).toBeInstanceOf(L.GridLayer);
      expect(Reflect.get(layer, 'createTile').length).toBe(2);
      expect(layer.options).toMatchObject({ tileSize: 256, minZoom: 1, maxZoom: 18,
        noWrap: true, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0 });
    }
    expect(f.layers[0].options.attribution).toContain('https://www.tianditu.gov.cn/');
    expect(f.layers[0].options.attribution).toContain('rel="noopener noreferrer"');
    expect(f.layers[1].options.attribution).toBe('');
    f.make(); expect(f.getTile).not.toHaveBeenCalled();
  });

  it('shares 4 active and 64 queued jobs between base and annotation, including image decoding', async () => {
    const f = fixture(), tiles = Array.from({ length: 68 }, (_, index) => f.make(index % 2, index));
    await flush(); expect(f.getTile).toHaveBeenCalledTimes(4); expect(f.onError).not.toHaveBeenCalled();
    expect(f.pending.map(job => job.layer)).toEqual(['base', 'annotation', 'base', 'annotation']);
    f.pending[0].resolve(blob()); await flush(); expect(f.getTile).toHaveBeenCalledTimes(4);
    f.loaded(tiles[0].image); await flush(); expect(f.getTile).toHaveBeenCalledTimes(5);
    expect(tiles[0].done).toHaveBeenCalledOnce();
  });

  it('queue overflow stops the whole owner once without starting more transport requests', async () => {
    const f = fixture(); Array.from({ length: 68 }, (_, index) => f.make(index % 2, index)); await flush();
    f.make(1, 68); Array.from({ length: 20 }, (_, index) => f.make(0, index));
    await flush(); expect(f.getTile).toHaveBeenCalledTimes(4); expect(vi.getTimerCount()).toBe(0);
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'busy' }));
    expect(f.pending.every(job => job.signal.aborted)).toBe(true);
    f.make(); f.pending.forEach(job => job.resolve(blob())); await flush();
    expect(f.getTile).toHaveBeenCalledTimes(4); expect(createUrl).not.toHaveBeenCalled();
  });

  it('the one job deadline includes time queued and image loading rather than restarting at dispatch', async () => {
    const f = fixture({ active: 1, deadlineMs: 100 }), first = f.make(), second = f.make(1);
    await flush(); vi.advanceTimersByTime(90); f.pending[0].resolve(blob()); await flush(); f.loaded(first.image); await flush();
    expect(f.getTile).toHaveBeenCalledTimes(2); vi.advanceTimersByTime(10); await flush();
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'timeout' }));
    expect(second.done).toHaveBeenCalledOnce(); expect(f.pending[1].signal.aborted).toBe(true);
    f.pending[1].resolve(blob()); await flush(); expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it('tile unload cancels requests but keeps their slot owned until the actual promise settles', async () => {
    const f = fixture({ active: 1 }), first = f.make(), next = f.make(1); await flush();
    f.layers[0].fire('tileunload', { tile: first.image }); await flush();
    expect(f.pending[0].signal.aborted).toBe(true); expect(f.getTile).toHaveBeenCalledOnce();
    f.pending[0].resolve(blob()); await flush(); expect(f.getTile).toHaveBeenCalledTimes(2);
    expect(createUrl).not.toHaveBeenCalled(); expect(first.done).not.toHaveBeenCalled(); expect(next.image.hasAttribute('src')).toBe(false);
    expect(f.onError).not.toHaveBeenCalled();
  });

  it('queued unload cancels its timer without consuming a request, while painted unload revokes its URL', async () => {
    const f = fixture({ active: 1 }), first = f.make(), queued = f.make(1); await flush();
    f.layers[1].fire('tileunload', { tile: queued.image }); f.pending[0].resolve(blob()); await flush();
    f.loaded(first.image); expect(f.getTile).toHaveBeenCalledOnce();
    f.layers[0].fire('tileunload', { tile: first.image });
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:managed-test-1');
    expect(first.image.hasAttribute('src')).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('live ObjectURL cap is shared across layers and enforced before creating another URL', async () => {
    const f = fixture({ active: 1, urls: 2 });
    for (let index = 0; index < 3; index++) {
      const tile = f.make(index % 2, index); await flush(); f.pending[index].resolve(blob()); await flush();
      if (index < 2) f.loaded(tile.image);
    }
    expect(createUrl).toHaveBeenCalledTimes(2); expect(revokeUrl).toHaveBeenCalledTimes(2);
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'busy' }));
  });

  it('aggregate live Blob bytes are bounded independently of URL count', async () => {
    const f = fixture({ active: 1, bytes: 100 }), first = f.make(); await flush();
    f.pending[0].resolve(blob(60)); await flush(); f.loaded(first.image);
    f.make(1); await flush(); f.pending[1].resolve(blob(60)); await flush();
    expect(createUrl).toHaveBeenCalledOnce(); expect(revokeUrl).toHaveBeenCalledOnce();
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'busy' }));
  });

  it('rejects untrusted Blob MIME, empty data and the fixed per-tile byte cap before ObjectURL creation', async () => {
    for (const value of [blob(20, 'image/svg+xml'), blob(20, 'text/html'), blob(0), blob(MANAGED_MAP_LIMITS.tileBytes + 1)]) {
      const f = fixture(); f.make(); await flush(); f.pending[0].resolve(value); await flush();
      expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'invalid' }));
    }
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('requires decoded natural dimensions of 256×256 and reports completion at most once', async () => {
    const f = fixture(), tile = f.make(); await flush(); f.pending[0].resolve(blob()); await flush();
    const loaded = tile.image.onload!, failed = tile.image.onerror!;
    f.loaded(tile.image, 512, 256); loaded.call(tile.image, new Event('load')); failed.call(tile.image, new Event('error'));
    expect(tile.done).toHaveBeenCalledOnce(); expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'invalid' }));
    expect(revokeUrl).toHaveBeenCalledOnce(); expect(tile.image.hasAttribute('src')).toBe(false);
  });

  it('successful duplicate events cannot complete twice, retry or turn an already painted tile into an error', async () => {
    const f = fixture(), tile = f.make(); await flush(); f.pending[0].resolve(blob(20, 'image/jpeg')); await flush();
    const loaded = tile.image.onload!, failed = tile.image.onerror!;
    f.loaded(tile.image); loaded.call(tile.image, new Event('load')); failed.call(tile.image, new Event('error'));
    expect(tile.done).toHaveBeenCalledExactlyOnceWith(undefined, tile.image);
    expect(f.onError).not.toHaveBeenCalled(); expect(f.getTile).toHaveBeenCalledOnce();
  });

  it('scope invalidation drops late results without writing DOM, creating URLs or reporting account-change errors', async () => {
    const f = fixture(), tile = f.make(); await flush(); f.stale(); f.pending[0].resolve(blob()); await flush();
    expect(createUrl).not.toHaveBeenCalled(); expect(tile.image.hasAttribute('src')).toBe(false);
    expect(tile.done).not.toHaveBeenCalled(); expect(f.onError).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('dispose is independent of tile events and suppresses late promises and captured image callbacks', async () => {
    const f = fixture(), first = f.make(), second = f.make(1); await flush(); f.pending[0].resolve(blob()); await flush();
    const loaded = first.image.onload!; f.dispose(); f.dispose(); f.pending[1].resolve(blob()); await flush();
    loaded.call(first.image, new Event('load'));
    expect(createUrl).toHaveBeenCalledOnce(); expect(revokeUrl).toHaveBeenCalledOnce();
    expect(first.done).not.toHaveBeenCalled(); expect(second.done).not.toHaveBeenCalled(); expect(f.onError).not.toHaveBeenCalled();
    expect(f.pending.every(job => job.signal.aborted)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });

  it('onRemove cleans up even when the component called off() first, without Leaflet private methods', async () => {
    const f = fixture(), tile = f.make(); await flush(); f.pending[0].resolve(blob()); await flush();
    const removed = vi.spyOn(L.GridLayer.prototype, 'onRemove').mockReturnThis();
    f.layers.forEach(layer => layer.off()); f.layers[0].onRemove({} as L.Map);
    expect(removed).toHaveBeenCalledOnce(); expect(revokeUrl).toHaveBeenCalledOnce();
    expect(tile.image.hasAttribute('src')).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('one terminal auth or limit error stops both layers and never automatically reissues requests', async () => {
    for (const error of [new ManagedMapError('auth'), new ManagedMapError('limit', 60)]) {
      const f = fixture(); Array.from({ length: 8 }, (_, index) => f.make(index % 2, index)); await flush();
      f.pending[0].reject(error); await flush(); f.pending[1].reject(new Error('private URL/token')); await flush();
      f.make(1); vi.advanceTimersByTime(12000); await flush();
      expect(f.onError).toHaveBeenCalledExactlyOnceWith(error); expect(f.getTile).toHaveBeenCalledTimes(4);
      expect(f.pending.every(job => job.signal.aborted)).toBe(true);
    }
  });

  it('image load remains inside the same deadline, releases its URL and never accepts a late successful event', async () => {
    const f = fixture({ deadlineMs: 20 }), tile = f.make(); await flush(); f.pending[0].resolve(blob()); await flush();
    const loaded = tile.image.onload!; vi.advanceTimersByTime(20); loaded.call(tile.image, new Event('load'));
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'timeout' }));
    expect(tile.done).toHaveBeenCalledOnce(); expect(revokeUrl).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
