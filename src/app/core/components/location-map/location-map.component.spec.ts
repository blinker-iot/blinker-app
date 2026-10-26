import { ChangeDetectorRef, ElementRef, NgZone, SimpleChange } from '@angular/core';
import * as L from 'leaflet';
import { BehaviorSubject, Subject } from 'rxjs';
import { createManagedMapLayers } from '../../maps/managed-grid-layer';
import { ManagedMapConfig, ManagedMapError, ManagedMapSession } from '../../maps/managed-map';
import { AppVisibilityService } from '../../services/app-visibility.service';
import { DataService } from '../../services/data.service';
import { MapTileClientService } from '../../services/map-tile-client.service';
import { LocationMapComponent } from './location-map.component';

const enabled: ManagedMapConfig = { enabled: true, provider: 'tianditu', version: 1,
  layers: ['base', 'annotation'], minZoom: 1, maxZoom: 18, tileSize: 256, crs: 'EPSG:3857',
  attribution: { text: '天地图', href: 'https://www.tianditu.gov.cn/' } };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('LocationMapComponent managed map and controlled selection', () => {
  const mounted: { component: LocationMapComponent; element: HTMLElement }[] = [];
  const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
      constructor(public callback: ResizeObserverCallback) { observers.push(this); }
    });
  });
  afterEach(() => {
    mounted.forEach(({ component, element }) => { component.ngOnDestroy(); element.remove(); });
    mounted.length = 0; observers.length = 0; vi.useRealTimers(); vi.unstubAllGlobals();
  });

  function fixture(configuration: ManagedMapConfig = enabled) {
    const visibility = { active: new BehaviorSubject(true) }, authChanged = new Subject<void>();
    let scopeCurrent = true;
    const sessions: ManagedMapSession[] = [];
    const tileFailures: ((error: ManagedMapError) => void)[] = [];
    const getTile = vi.fn((_layer: unknown, _coords: unknown, signal: AbortSignal) => new Promise<Blob>((_resolve, reject) => {
      tileFailures.push(reject);
      signal.addEventListener('abort', () => reject(new ManagedMapError('cancelled')), { once: true });
    }));
    const loadConfig = vi.fn((_signal: AbortSignal) => Promise.resolve(configuration));
    const createSession = vi.fn(() => {
      let open = true;
      const session: ManagedMapSession = { loadConfig,
        getTile, current: () => open && scopeCurrent,
        close: vi.fn(() => { open = false; }) };
      sessions.push(session); return session;
    });
    const component = new LocationMapComponent(
      { createSession } as unknown as MapTileClientService, visibility as AppVisibilityService,
      { authDataChanged: authChanged } as DataService,
      { run: callback => callback(), runOutsideAngular: callback => callback() } as NgZone,
      { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
    const element = document.createElement('div'); document.body.append(element);
    Object.defineProperties(element, { clientWidth: { value: 360 }, clientHeight: { value: 440 } });
    element.getBoundingClientRect = () => ({ width: 360, height: 440 } as DOMRect);
    Object.assign(component, { container: new ElementRef(element) });
    const changed = vi.fn(); component.pointChange.subscribe(changed);
    mounted.push({ component, element });
    return { component, element, changed, createSession, loadConfig, getTile, sessions, visibility, authChanged,
      invalidate: () => { scopeCurrent = false; },
      map: () => Reflect.get(component, 'map') as L.Map | null,
      marker: () => Reflect.get(component, 'marker') as L.Marker | null,
      tiles: () => Reflect.get(component, 'layers') as L.GridLayer[],
      owner: () => {
        const owner = Reflect.get(component, 'layerOwner') as ReturnType<typeof createManagedMapLayers>;
        if (owner && !vi.isMockFunction(owner.dispose)) vi.spyOn(owner, 'dispose');
        return owner;
      },
      failTile: async (error: ManagedMapError) => { tileFailures.at(-1)!(error); await flush(); },
      start: async () => { component.ngAfterViewInit(); await flush(); },
    };
  }

  it('loads only managed config with no Key settings, public fallback, marker or invented position', async () => {
    const f = fixture(); await f.start();
    expect(f.createSession).toHaveBeenCalledOnce(); expect(f.loadConfig).toHaveBeenCalledOnce();
    expect(f.component.providerName).toBe('天地图'); expect(f.map()).not.toBeNull();
    expect(f.marker()).toBeNull(); expect(f.component.point).toBeNull(); expect(f.changed).not.toHaveBeenCalled();
    expect(f.tiles()).toHaveLength(2);
  });

  it('keeps disabled managed service unavailable without choosing another provider', async () => {
    const f = fixture({ enabled: false }); await f.start();
    expect(f.component.mapState).toBe('unavailable'); expect(f.component.mapMessage).toBe('地图服务暂不可用');
    expect(f.map()).toBeNull(); expect(f.getTile).not.toHaveBeenCalled();
    expect(f.sessions[0].close).toHaveBeenCalledOnce(); expect(f.changed).not.toHaveBeenCalled();
  });

  it('preserves zero/read-only selection and controlled updates without changing the saved point', async () => {
    const f = fixture(); f.component.point = { longitude: 0, latitude: 0 }; await f.start();
    expect(f.marker()!.getLatLng()).toEqual(L.latLng(0, 0)); expect(f.marker()!.dragging!.enabled()).toBe(false);
    f.map()!.fire('click', { latlng: L.latLng(30, 120) }); f.marker()!.fire('dragend');
    expect(f.changed).not.toHaveBeenCalled();
    f.map()!.setZoom(8); f.component.point = { longitude: 121, latitude: 31 };
    f.component.ngOnChanges({ point: new SimpleChange(null, f.component.point, false) });
    expect(f.map()!.getZoom()).toBe(8); expect(f.marker()!.getLatLng()).toEqual(L.latLng(31, 121));
    f.component.point = { longitude: NaN, latitude: 0 };
    f.component.ngOnChanges({ point: new SimpleChange(null, f.component.point, false) });
    expect(f.marker()).toBeNull(); expect(f.changed).not.toHaveBeenCalled();
  });

  it('emits only editable WGS84 candidates and renders names as text, not HTML', async () => {
    const f = fixture(); f.component.point = { longitude: 0, latitude: 0 }; f.component.editable = true;
    f.component.name = '<img src=x onerror=alert(1)>'; await f.start();
    f.map()!.fire('click', { latlng: L.latLng(30, 120) });
    expect(f.changed).toHaveBeenCalledWith({ longitude: 120, latitude: 30 });
    expect(f.component.point).toEqual({ longitude: 0, latitude: 0 });
    f.map()!.fire('click', { latlng: L.latLng(30, 181) }); expect(f.changed).toHaveBeenCalledTimes(1);
    f.marker()!.setLatLng([31, 121]).fire('dragend');
    expect(f.changed).toHaveBeenLastCalledWith({ longitude: 121, latitude: 31 });
    const content = f.marker()!.getTooltip()!.getContent() as HTMLElement;
    expect(content.textContent).toBe(f.component.name); expect(content.querySelector('img')).toBeNull();
  });

  it('releases all owners on Ionic inactive and ignores stale events before a normal resume', async () => {
    const f = fixture(); f.component.editable = true; await f.start();
    const owner = f.owner(), tiles = f.tiles(), oldMap = f.map()!;
    f.component.active = false; f.component.ngOnChanges({ active: new SimpleChange(true, false, false) });
    expect(f.map()).toBeNull(); expect(f.component.mapState).toBe('inactive');
    expect(owner.dispose).toHaveBeenCalledOnce(); expect(f.sessions[0].close).toHaveBeenCalledOnce();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    tiles[0].fire('tileload'); oldMap.fire('click', { latlng: L.latLng(30, 120) });
    await f.failTile(new ManagedMapError('limit', 60));
    expect(f.component.mapState).toBe('inactive'); expect(f.changed).not.toHaveBeenCalled();
    f.component.active = true; f.component.ngOnChanges({ active: new SimpleChange(false, true, false) }); await flush();
    expect(f.createSession).toHaveBeenCalledTimes(2); expect(f.component.mapState).toBe('loading');
    tiles[0].fire('tileload'); expect(f.component.mapState).toBe('loading');
    f.tiles()[0].fire('tileload'); expect(f.component.mapState).toBe('ready');
  });

  it('uses existing foreground visibility for immediate release and normal fresh resume', async () => {
    const f = fixture(); await f.start(); const owner = f.owner();
    f.visibility.active.next(false);
    expect(owner.dispose).toHaveBeenCalledOnce(); expect(f.map()).toBeNull(); expect(f.component.mapState).toBe('inactive');
    f.visibility.active.next(true); await flush(); expect(f.createSession).toHaveBeenCalledTimes(2);
    expect(f.map()).not.toBeNull();
  });

  it.each(['auth', 'limit', 'forbidden', 'unavailable'] as const)(
    'keeps %s terminal across pause/resume until an explicit retry', async kind => {
      const f = fixture(); await f.start();
      await f.failTile(new ManagedMapError(kind, kind === 'limit' ? 90 : undefined));
      expect(f.component.mapState).toBe(kind); expect(f.map()).toBeNull();
      if (kind === 'limit') expect(f.component.retryHint).toBe('请约 2 分钟后手动重试');
      f.visibility.active.next(false); f.visibility.active.next(true); await flush();
      expect(f.component.mapState).toBe(kind); expect(f.createSession).toHaveBeenCalledOnce();
      f.component.refresh(); await flush(); expect(f.createSession).toHaveBeenCalledTimes(2);
    });

  it('does not reload on same-context auth updates; invalidation relinquishes the current owner', async () => {
    const f = fixture(); await f.start(); f.authChanged.next();
    expect(f.createSession).toHaveBeenCalledOnce(); expect(f.map()).not.toBeNull();
    const owner = f.owner(); f.invalidate(); f.authChanged.next();
    expect(owner.dispose).toHaveBeenCalledOnce(); expect(f.map()).toBeNull();
    expect(f.component.mapState).toBe('unavailable'); expect(f.createSession).toHaveBeenCalledOnce();
  });

  it('discards a late configuration after background without creating a retired map', async () => {
    const config = deferred<ManagedMapConfig>(), f = fixture(); f.loadConfig.mockReturnValue(config.promise);
    f.component.ngAfterViewInit(); const old = f.sessions[0];
    f.visibility.active.next(false); config.resolve(enabled); await flush();
    expect(f.map()).toBeNull(); expect(f.component.mapState).toBe('inactive'); expect(old.close).toHaveBeenCalledOnce();
    expect(f.getTile).not.toHaveBeenCalled();
  });

  it('retires a Ready map when the tile owner first notices a region/authority change without an auth event', async () => {
    const f = fixture(); await f.start(); f.tiles()[0].fire('tileload');
    expect(f.component.mapState).toBe('ready');
    const owner = f.owner(), layer = f.tiles()[0]; f.invalidate();
    layer.redraw(); await flush();
    expect(f.map()).toBeNull(); expect(owner.dispose).toHaveBeenCalledOnce();
    expect(f.component.mapState).toBe('unavailable'); expect(f.createSession).toHaveBeenCalledOnce();
  });

  it('bounds loading and releases the pending config instead of retrying it', async () => {
    vi.useFakeTimers(); const f = fixture();
    f.loadConfig.mockReturnValue(new Promise(() => {})); f.component.ngAfterViewInit();
    const signal = f.loadConfig.mock.calls[0][0]; vi.advanceTimersByTime(12000); await flush();
    expect(f.component.mapState).toBe('error'); expect(signal.aborted).toBe(true);
    expect(f.sessions[0].close).toHaveBeenCalledOnce(); vi.advanceTimersByTime(60000);
    expect(f.loadConfig).toHaveBeenCalledOnce(); expect(f.createSession).toHaveBeenCalledOnce();
  });

  it('waits for layout and does not recreate map requests for ordinary resize', async () => {
    const f = fixture(); let width = 0;
    f.element.getBoundingClientRect = () => ({ width, height: 440 } as DOMRect);
    await f.start(); expect(f.map()).toBeNull();
    width = 360; observers[0].callback([], {} as ResizeObserver); expect(f.map()).not.toBeNull();
    const invalidate = vi.spyOn(f.map()!, 'invalidateSize'); window.dispatchEvent(new Event('resize'));
    expect(invalidate).toHaveBeenCalledOnce(); expect(f.loadConfig).toHaveBeenCalledOnce();
    f.component.ngOnDestroy(); window.dispatchEvent(new Event('resize')); expect(invalidate).toHaveBeenCalledOnce();
    expect(f.element.querySelector('.leaflet-pane')).toBeNull();
  });

  it('needs a successful tile, not just an empty batch, and stops all listeners on destruction', async () => {
    const f = fixture(); await f.start(); f.tiles()[0].fire('load');
    expect(f.component.mapState).toBe('loading');
    f.tiles()[0].fire('tileload'); expect(f.component.mapState).toBe('ready');
    const owner = f.owner(); f.component.ngOnDestroy();
    expect(owner.dispose).toHaveBeenCalledOnce(); expect(f.authChanged.observed).toBe(false);
    expect(f.sessions[0].current()).toBe(false); expect(f.visibility.active.observed).toBe(false);
    f.visibility.active.next(false); f.visibility.active.next(true); expect(f.createSession).toHaveBeenCalledOnce();
  });
});
