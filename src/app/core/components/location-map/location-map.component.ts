import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input,
  NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { createManagedMapLayers } from '../../maps/managed-grid-layer';
import { ManagedMapEnabledConfig, ManagedMapError, ManagedMapSession, managedMapError } from '../../maps/managed-map';
import { validMapPoint, Wgs84MapPoint } from '../../maps/map-tiles';
import { AppVisibilityService } from '../../services/app-visibility.service';
import { DataService } from '../../services/data.service';
import { MapTileClientService } from '../../services/map-tile-client.service';

export type { Wgs84MapPoint } from '../../maps/map-tiles';
type MapState = 'loading' | 'ready' | 'error' | 'inactive' | 'auth' | 'limit' | 'unavailable' | 'forbidden';

@Component({
  selector: 'app-location-map', standalone: true,
  templateUrl: './location-map.component.html', styleUrls: ['./location-map.component.scss'],
})
export class LocationMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() point: Wgs84MapPoint | null = null;
  @Input() name = '';
  @Input() editable = false;
  @Input() active = true;
  @Output() readonly pointChange = new EventEmitter<Wgs84MapPoint>();
  @ViewChild('mapContainer', { static: true }) private container!: ElementRef<HTMLElement>;

  mapState: MapState = 'loading';
  providerName = '';
  get hasPoint(): boolean { return validMapPoint(this.point); }
  get mapMessage(): string {
    switch (this.mapState) {
      case 'auth': return '请重新登录后查看地图';
      case 'limit': return '地图访问已达限额';
      case 'unavailable': return '地图服务暂不可用';
      case 'forbidden': return '当前账号暂不可用地图';
      default: return this.failure?.kind === 'busy' ? '地图加载繁忙，请稍后重试' : '地图暂时无法加载';
    }
  }
  get retryHint(): string {
    if (this.mapState !== 'limit') return '';
    const seconds = this.failure?.retryAfterSeconds;
    if (!seconds || seconds < 60) return '请稍后手动重试';
    return `请约 ${Math.ceil(seconds / (seconds < 3600 ? 60 : 3600))} ${seconds < 3600 ? '分钟' : '小时'}后手动重试`;
  }

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private layers: L.GridLayer[] = [];
  private configuration: ManagedMapEnabledConfig | null = null;
  private layerOwner: ReturnType<typeof createManagedMapLayers> | null = null;
  private session: ManagedMapSession | null = null;
  private loadController: AbortController | null = null;
  private generation = 0;
  private failure: ManagedMapError | null = null;
  private readonly subscriptions = new Subscription();
  private resizeObserver: ResizeObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private viewReady = false;
  private destroyed = false;
  private readonly resize = () => this.initializeOrResize();

  constructor(private readonly client: MapTileClientService,
    private readonly visibility: AppVisibilityService, data: DataService,
    private readonly zone: NgZone, private readonly changeDetector: ChangeDetectorRef) {
    this.subscriptions.add(visibility.active.subscribe(() => this.synchronizeActivity()));
    this.subscriptions.add(data.authDataChanged.subscribe(() => {
      if (this.session && !this.session.current()) this.showFailure(new ManagedMapError('unavailable'));
    }));
  }

  ngAfterViewInit(): void { this.viewReady = true; this.synchronizeActivity(); }
  ngOnChanges(changes: SimpleChanges): void {
    if (this.destroyed) return;
    if (!this.viewReady) { this.mapState = this.available ? 'loading' : 'inactive'; return; }
    if (changes['active']) { this.synchronizeActivity(); return; }
    if (changes['point'] || changes['name'] || changes['editable']) this.updateMarker();
  }
  ngOnDestroy(): void { this.destroyed = true; this.subscriptions.unsubscribe(); this.releaseMap(); }

  /** The sole retry entry is a deliberate user action, never an error timer. */
  refresh(): void {
    if (!this.viewReady || this.destroyed) return;
    this.releaseMap();
    if (!this.available) { this.setState('inactive'); return; }
    this.failure = null; this.providerName = '';
    this.setState('loading');
    const generation = this.generation, controller = this.loadController = new AbortController();
    try {
      const session = this.session = this.client.createSession();
      this.timer = setTimeout(() => {
        if (this.owns(generation, session)) this.showFailure(new ManagedMapError('timeout'));
      }, 12000);
      void session.loadConfig(controller.signal).then(configuration => {
        if (!this.owns(generation, session)) return;
        if (!session.current()) { this.showFailure(new ManagedMapError('unavailable')); return; }
        if (!configuration.enabled) { this.showFailure(new ManagedMapError('unavailable')); return; }
        this.configuration = configuration; this.providerName = '天地图';
        this.zone.runOutsideAngular(() => {
          if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.resize);
            this.resizeObserver.observe(this.container.nativeElement);
          }
          window.addEventListener('resize', this.resize);
          this.initializeOrResize();
        });
      }).catch(error => {
        if (this.owns(generation, session)) this.showFailure(managedMapError(error));
      });
    } catch (error) { this.showFailure(managedMapError(error)); }
  }

  private get available(): boolean { return this.active && this.visibility.active.value && !this.destroyed; }
  private owns(generation: number, session: ManagedMapSession): boolean {
    return this.available && generation === this.generation && session === this.session;
  }
  private sessionCurrent(generation: number, session: ManagedMapSession): boolean {
    if (!this.owns(generation, session)) return false;
    if (session.current()) return true;
    // A changed service region/authority may be noticed first by Leaflet,
    // without an auth event. Retire it after createTile returns, not mid-add.
    queueMicrotask(() => {
      if (this.owns(generation, session)) this.showFailure(new ManagedMapError('unavailable'));
    });
    return false;
  }
  private synchronizeActivity(): void {
    if (!this.viewReady || this.destroyed) return;
    if (!this.available) { this.releaseMap(); this.setState('inactive'); }
    // Returning from pause is a fresh visible session, not a retry of failure.
    // An earlier failure stays terminal until the user explicitly retries.
    else if (this.failure) this.setFailureState();
    else if (!this.session) this.refresh();
  }
  private setFailureState(): void {
    const kind = this.failure?.kind;
    this.setState(kind === 'auth' || kind === 'limit' || kind === 'unavailable' || kind === 'forbidden' ? kind : 'error');
  }
  private showFailure(error: ManagedMapError): void {
    if (this.destroyed) return;
    this.failure = error;
    this.releaseMap();
    if (this.available) this.setFailureState(); else this.setState('inactive');
  }

  private initializeOrResize(): void {
    if (!this.available || !this.configuration || !this.session) return;
    if (!this.session.current()) { this.showFailure(new ManagedMapError('unavailable')); return; }
    const element = this.container.nativeElement, rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (this.map) { this.map.invalidateSize({ animate: false, pan: false }); return; }
    try {
      this.map = L.map(element, { zoomControl: false, attributionControl: true });
      L.control.zoom({ position: 'topright' }).addTo(this.map);
      if (this.hasPoint) this.map.setView([this.point!.latitude, this.point!.longitude], 15);
      else this.map.fitWorld({ animate: false }); // Overview, never a fabricated device position.
      this.map.on('click', this.selectPoint);
      const generation = this.generation, session = this.session;
      this.layerOwner = createManagedMapLayers({
        getTile: (layer, coords, signal) => session.getTile(layer, coords, signal),
        current: () => this.sessionCurrent(generation, session),
        onError: error => { if (this.owns(generation, session)) this.showFailure(error); },
      });
      this.layers = this.layerOwner.layers;
      for (const [index, layer] of this.layers.entries()) {
        if (index === 0) {
          const ready = () => { if (this.sessionCurrent(generation, session) && this.map?.hasLayer(layer)) this.setState('ready'); };
          layer.once('tileload', ready);
        }
        layer.addTo(this.map);
      }
      this.updateMarker();
    } catch { this.showFailure(new ManagedMapError('unavailable')); }
  }

  private readonly selectPoint = (event: L.LeafletMouseEvent): void => {
    const candidate = { longitude: event.latlng.lng, latitude: event.latlng.lat };
    this.emitPoint(candidate);
  };
  private emitPoint(candidate: Wgs84MapPoint): void {
    if (!this.available || !this.session?.current() || !this.editable || !validMapPoint(candidate)) return;
    this.zone.run(() => this.pointChange.emit({ ...candidate }));
  }
  private updateMarker(): void {
    if (!this.map || !this.available || !this.session?.current()) return;
    if (!this.hasPoint) {
      this.marker?.off().remove(); this.marker = null;
      this.map.fitWorld({ animate: false }); return;
    }
    const latlng: L.LatLngTuple = [this.point!.latitude, this.point!.longitude];
    const firstPoint = !this.marker;
    if (!this.marker) {
      const marker = L.marker(latlng, { draggable: this.editable, title: this.name || '选择的位置',
        icon: L.divIcon({ className: 'blinker-location-pin', html: '<span></span>', iconSize: [30, 38], iconAnchor: [15, 36] }) });
      marker.on('dragend', () => {
        if (this.marker !== marker) return;
        const point = marker.getLatLng();
        this.emitPoint({ longitude: point.lng, latitude: point.lat });
      });
      this.marker = marker.addTo(this.map);
    } else this.marker.setLatLng(latlng);
    if (this.editable) this.marker.dragging?.enable(); else this.marker.dragging?.disable();
    const label = document.createElement('span'); label.textContent = this.name || '选择的位置';
    this.marker.unbindTooltip().bindTooltip(label, { direction: 'top', offset: L.point(0, -30) });
    if (firstPoint) this.map.setView(latlng, 15, { animate: false });
    else this.map.panTo(latlng, { animate: false });
  }
  private setState(state: MapState): void {
    if (this.destroyed) return;
    if (state !== 'loading' && this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.zone.run(() => { this.mapState = state; this.changeDetector.markForCheck(); });
  }
  private releaseMap(): void {
    this.generation++;
    this.loadController?.abort(); this.loadController = null;
    const session = this.session; this.session = null; session?.close();
    const owner = this.layerOwner; this.layerOwner = null; owner?.dispose();
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    window.removeEventListener('resize', this.resize);
    this.layers.forEach(layer => layer.off()); this.layers = [];
    this.marker?.off(); this.marker = null;
    this.map?.off().remove(); this.map = null;
    this.configuration = null;
  }
}
