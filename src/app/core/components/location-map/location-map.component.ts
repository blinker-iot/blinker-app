import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input,
  NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import { locationMapTileConfiguration, MapTileConfiguration, validMapPoint, Wgs84MapPoint } from '../../maps/map-tiles';
import { ThirdPartyServicesService } from '../../services/third-party-services.service';

export type { Wgs84MapPoint } from '../../maps/map-tiles';
type MapState = 'loading' | 'ready' | 'missing-key' | 'error' | 'inactive';

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

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private layers: L.TileLayer[] = [];
  private configuration: MapTileConfiguration | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private viewReady = false;
  private destroyed = false;
  private readonly resize = () => this.initializeOrResize();

  constructor(private readonly services: ThirdPartyServicesService,
    private readonly nav: NavController, private readonly zone: NgZone,
    private readonly changeDetector: ChangeDetectorRef) {}

  ngAfterViewInit(): void { this.viewReady = true; this.refresh(); }
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady || this.destroyed) return;
    if (changes['active']) { this.refresh(); return; }
    if (changes['point'] || changes['name'] || changes['editable']) this.updateMarker();
  }
  ngOnDestroy(): void { this.destroyed = true; this.releaseMap(); }

  /** Re-read local map settings after returning from the existing settings page. */
  refresh(): void {
    if (!this.viewReady || this.destroyed) return;
    this.releaseMap();
    if (!this.active) { this.setState('inactive'); return; }
    this.configuration = locationMapTileConfiguration(this.services.getActiveGeolocationService(), L.Browser.retina);
    this.providerName = this.configuration?.name ?? '';
    if (!this.configuration) { this.setState('missing-key'); return; }
    this.setState('loading');
    this.timer = setTimeout(() => { this.timer = null; this.setState('error'); }, 12000);
    this.zone.runOutsideAngular(() => {
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(this.container.nativeElement);
      }
      window.addEventListener('resize', this.resize);
      this.initializeOrResize();
    });
  }

  openMapSettings(): void { void this.nav.navigateForward('/third-party-services'); }

  private initializeOrResize(): void {
    if (this.destroyed || !this.active || !this.configuration) return;
    const element = this.container.nativeElement, rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (this.map) { this.map.invalidateSize({ animate: false, pan: false }); return; }
    try {
      this.map = L.map(element, { zoomControl: false, attributionControl: true });
      L.control.zoom({ position: 'topright' }).addTo(this.map);
      if (this.hasPoint) this.map.setView([this.point!.latitude, this.point!.longitude], 15);
      else this.map.fitWorld({ animate: false }); // Overview, never a fabricated device position.
      this.map.on('click', this.selectPoint);
      for (const [index, config] of this.configuration.layers.entries()) {
        const layer = L.tileLayer(config.url, config.options);
        if (index === 0) {
          let failures = 0;
          const ready = () => { if (this.map?.hasLayer(layer)) this.setState('ready'); };
          layer.once('tileload', ready);
          layer.on('tileerror', () => {
            if (++failures >= 3 && this.map?.hasLayer(layer) && this.mapState !== 'ready') this.setState('error');
          });
        }
        this.layers.push(layer); layer.addTo(this.map);
      }
      this.updateMarker();
    } catch { this.releaseMap(); this.setState('error'); }
  }

  private readonly selectPoint = (event: L.LeafletMouseEvent): void => {
    const candidate = { longitude: event.latlng.lng, latitude: event.latlng.lat };
    this.emitPoint(candidate);
  };
  private emitPoint(candidate: Wgs84MapPoint): void {
    if (this.destroyed || !this.active || !this.editable || !validMapPoint(candidate)) return;
    this.zone.run(() => this.pointChange.emit({ ...candidate }));
  }
  private updateMarker(): void {
    if (!this.map || !this.active) return;
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
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    window.removeEventListener('resize', this.resize);
    this.layers.forEach(layer => layer.off()); this.layers = [];
    this.marker?.off(); this.marker = null;
    this.map?.off().remove(); this.map = null;
    this.configuration = null;
  }
}
