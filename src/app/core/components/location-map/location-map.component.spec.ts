import { ChangeDetectorRef, ElementRef, NgZone, SimpleChange } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { ActiveThirdPartyService, GeolocationServiceProvider, ThirdPartyServicesService } from '../../services/third-party-services.service';
import { LocationMapComponent } from './location-map.component';

vi.mock('@ionic/angular/standalone', () => ({ NavController: class {} }));

describe('LocationMapComponent controlled manual selection', () => {
  const mounted: { component: LocationMapComponent; element: HTMLElement }[] = [];
  const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
      constructor(public callback: ResizeObserverCallback) { observers.push(this); }
    });
  });
  afterEach(() => {
    mounted.forEach(({ component, element }) => { component.ngOnDestroy(); element.remove(); });
    mounted.length = 0; observers.length = 0; vi.useRealTimers(); vi.unstubAllGlobals();
  });

  function fixture(service: ActiveThirdPartyService<GeolocationServiceProvider> | null = { provider: 'geoapify', key: 'unit-key' }) {
    const getService = vi.fn(() => service), navigateForward = vi.fn().mockResolvedValue(true);
    const component = new LocationMapComponent(
      { getActiveGeolocationService: getService } as unknown as ThirdPartyServicesService,
      { navigateForward } as unknown as NavController,
      { run: callback => callback(), runOutsideAngular: callback => callback() } as unknown as NgZone,
      { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
    const element = document.createElement('div'); document.body.append(element);
    Object.defineProperties(element, { clientWidth: { value: 360 }, clientHeight: { value: 440 } });
    element.getBoundingClientRect = () => ({ width: 360, height: 440 } as DOMRect);
    Object.assign(component, { container: new ElementRef(element) });
    const changed = vi.fn(); component.pointChange.subscribe(changed);
    mounted.push({ component, element });
    const map = () => Reflect.get(component, 'map') as L.Map | null;
    const marker = () => Reflect.get(component, 'marker') as L.Marker | null;
    const tiles = () => Reflect.get(component, 'layers') as L.TileLayer[];
    return { component, element, changed, getService, navigateForward, map, marker, tiles };
  }

  it('shows a default public map without requiring an API key or emitting a position', () => {
    const f = fixture(null); f.component.ngAfterViewInit();
    expect(f.component.providerName).toBe('OpenStreetMap'); expect(f.map()).not.toBeNull(); expect(f.changed).not.toHaveBeenCalled();
    f.component.openMapSettings(); expect(f.navigateForward).toHaveBeenCalledWith('/third-party-services');
  });

  it('shows a world overview with no marker or invented initial device position', () => {
    const f = fixture(); f.component.ngAfterViewInit();
    expect(f.map()).not.toBeNull(); expect(f.marker()).toBeNull();
    expect(f.component.point).toBeNull(); expect(f.changed).not.toHaveBeenCalled();
  });

  it('zooms to the first valid controlled point and preserves user zoom for later point updates', () => {
    const f = fixture(); f.component.ngAfterViewInit();
    f.component.point = { longitude: 120, latitude: 30 };
    f.component.ngOnChanges({ point: new SimpleChange(null, f.component.point, false) });
    expect(f.map()!.getZoom()).toBe(15); expect(f.map()!.getCenter()).toEqual(L.latLng(30, 120));
    f.map()!.setZoom(8); f.component.point = { longitude: 121, latitude: 31 };
    f.component.ngOnChanges({ point: new SimpleChange(null, f.component.point, false) });
    expect(f.map()!.getZoom()).toBe(8); expect(f.marker()!.getLatLng()).toEqual(L.latLng(31, 121));
    expect(f.changed).not.toHaveBeenCalled();
  });

  it('renders explicit zero and refuses click/drag changes in read-only mode', () => {
    const f = fixture(); f.component.point = { longitude: 0, latitude: 0 }; f.component.ngAfterViewInit();
    expect(f.marker()!.getLatLng()).toEqual(L.latLng(0, 0)); expect(f.marker()!.dragging!.enabled()).toBe(false);
    f.map()!.fire('click', { latlng: L.latLng(30, 120) }); f.marker()!.fire('dragend');
    expect(f.changed).not.toHaveBeenCalled();
  });

  it('emits only editable valid WGS84 candidates and never mutates or saves the input', () => {
    const f = fixture(); f.component.point = { longitude: 0, latitude: 0 }; f.component.editable = true;
    f.component.name = '<img src=x onerror=alert(1)>'; f.component.ngAfterViewInit();
    f.map()!.fire('click', { latlng: L.latLng(30, 120) });
    expect(f.changed).toHaveBeenCalledWith({ longitude: 120, latitude: 30 });
    expect(f.component.point).toEqual({ longitude: 0, latitude: 0 });
    f.map()!.fire('click', { latlng: L.latLng(30, 181) }); expect(f.changed).toHaveBeenCalledTimes(1);
    f.marker()!.setLatLng([31, 121]).fire('dragend');
    expect(f.changed).toHaveBeenLastCalledWith({ longitude: 121, latitude: 31 });
    const content = f.marker()!.getTooltip()!.getContent() as HTMLElement;
    expect(content.textContent).toBe(f.component.name); expect(content.querySelector('img')).toBeNull();
  });

  it('updates controlled inputs without emitting and removes invalid markers instead of coercing', () => {
    const f = fixture(); f.component.point = { longitude: 0, latitude: 0 }; f.component.editable = true;
    f.component.ngAfterViewInit(); f.component.point = { longitude: 120, latitude: 30 }; f.component.editable = false;
    f.component.ngOnChanges({ point: new SimpleChange(null, f.component.point, false), editable: new SimpleChange(true, false, false) });
    expect(f.marker()!.getLatLng()).toEqual(L.latLng(30, 120)); expect(f.marker()!.dragging!.enabled()).toBe(false);
    f.component.point = { longitude: Number.NaN, latitude: 0 };
    f.component.ngOnChanges({ point: new SimpleChange(null, f.component.point, false) });
    expect(f.marker()).toBeNull(); expect(f.changed).not.toHaveBeenCalled();
  });

  it('suspends resources while cached/inactive, ignores stale tiles and re-reads settings on resume', () => {
    const f = fixture(); f.component.editable = true; f.component.ngAfterViewInit();
    const oldTiles = f.tiles(), oldMap = f.map()!;
    f.component.active = false; f.component.ngOnChanges({ active: new SimpleChange(true, false, false) });
    expect(f.map()).toBeNull(); expect(f.component.mapState).toBe('inactive'); expect(observers[0].disconnect).toHaveBeenCalledOnce();
    oldTiles[0].fire('tileload'); oldMap.fire('click', { latlng: L.latLng(30, 120) });
    expect(f.component.mapState).toBe('inactive'); expect(f.changed).not.toHaveBeenCalled();
    f.getService.mockReturnValue({ provider: 'locationIq', key: 'other-unit-key' });
    f.component.active = true; f.component.ngOnChanges({ active: new SimpleChange(false, true, false) });
    expect(f.component.providerName).toBe('LocationIQ'); expect(f.getService).toHaveBeenCalledTimes(2);
    oldTiles[0].fire('tileload'); expect(f.component.mapState).toBe('loading');
    f.tiles()[0].fire('tileload'); expect(f.component.mapState).toBe('ready');
  });

  it('bounds loading errors, keeps retry manual and supports returning from map settings', () => {
    const f = fixture(); f.component.ngAfterViewInit();
    f.tiles()[0].fire('tileerror').fire('tileerror'); expect(f.component.mapState).toBe('loading');
    f.tiles()[0].fire('tileerror'); expect(f.component.mapState).toBe('error'); expect(f.getService).toHaveBeenCalledOnce();
    f.getService.mockReturnValue({ provider: 'geoapify', key: '' }); f.component.refresh();
    expect(f.component.mapState).toBe('missing-key'); expect(f.map()).toBeNull(); expect(f.changed).not.toHaveBeenCalled();
  });

  it('expires loading after a bounded deadline without retry or candidate emission', () => {
    vi.useFakeTimers(); const f = fixture(); f.component.ngAfterViewInit(); vi.advanceTimersByTime(12000);
    expect(f.component.mapState).toBe('error'); expect(f.getService).toHaveBeenCalledOnce(); expect(f.changed).not.toHaveBeenCalled();
  });

  it('waits for visible layout and invalidates resize without selecting or saving', () => {
    const f = fixture(); let width = 0;
    f.element.getBoundingClientRect = () => ({ width, height: 440 } as DOMRect);
    f.component.ngAfterViewInit(); expect(f.map()).toBeNull();
    width = 360; observers[0].callback([], {} as ResizeObserver); expect(f.map()).not.toBeNull();
    const invalidate = vi.spyOn(f.map()!, 'invalidateSize');
    window.dispatchEvent(new Event('resize')); expect(invalidate).toHaveBeenCalledOnce(); expect(f.changed).not.toHaveBeenCalled();
    f.component.ngOnDestroy(); window.dispatchEvent(new Event('resize')); expect(invalidate).toHaveBeenCalledOnce();
    expect(f.element.querySelector('.leaflet-pane')).toBeNull();
  });

  it('never treats a finished tile batch with zero successful tiles as ready', () => {
    const f = fixture(); f.component.ngAfterViewInit();
    f.tiles()[0].fire('load'); expect(f.component.mapState).toBe('loading');
    f.tiles()[0].fire('tileerror').fire('tileerror').fire('tileerror').fire('load');
    expect(f.component.mapState).toBe('error');
    f.tiles()[0].fire('tileload'); expect(f.component.mapState).toBe('ready');
  });
});
