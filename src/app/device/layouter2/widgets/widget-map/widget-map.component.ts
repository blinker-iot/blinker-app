import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
import { NavController } from '@ionic/angular/standalone';
import * as L from 'leaflet';
import {
  ActiveThirdPartyService,
  GeolocationServiceProvider,
  ThirdPartyServicesService,
} from 'src/app/core/services/third-party-services.service';
import { Layouter2Widget } from '../config';

type MapState = 'loading' | 'ready' | 'missing-key' | 'error';

const MAP_PROVIDER_NAMES: Record<GeolocationServiceProvider, string> = {
  tianditu: '天地图',
  geoapify: 'Geoapify',
  locationIq: 'LocationIQ',
};

@Component({
  selector: 'widget-map',
  templateUrl: './widget-map.component.html',
  styleUrls: ['./widget-map.component.scss'],
})
export class WidgetMapComponent
  implements Layouter2Widget, OnInit, AfterViewInit, OnDestroy
{
  mymap: L.Map | null = null;
  mapState: MapState = 'loading';
  mapProviderName = '';
  mapErrorMessage = '';

  @Input() device;
  @Input() widget;

  private activeMapService: ActiveThirdPartyService<GeolocationServiceProvider> | null =
    null;
  private initTimer: number | null = null;
  private loadingDeadlineTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  get key() {
    return this.widget.key;
  }

  get longitude() {
    if (typeof this.device.config.position == 'undefined') return 104.07;
    return this.device.config.position.location[0];
  }

  get latitude() {
    if (typeof this.device.config.position == 'undefined') return 30.67;
    return this.device.config.position.location[1];
  }

  get address() {
    if (typeof this.device.config.position == 'undefined') return '';
    return this.device.config.position.address;
  }

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey];
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey];
    return '';
  }

  _lstyle;
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle;
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined') return this._lstyle;
    if (typeof this.widget.lstyle != 'undefined') return this.widget.lstyle;
    return 0;
  }

  @ViewChild('widgetmap', { read: ElementRef, static: true }) map: ElementRef;

  constructor(
    private actionSheetController: ActionSheetController,
    private thirdPartyServices: ThirdPartyServicesService,
    private ngZone: NgZone,
    private changeDetectorRef: ChangeDetectorRef,
    private navController: NavController
  ) {}

  openThirdPartyServices(): void {
    void this.navController.navigateForward('/third-party-services');
  }

  ngOnInit() {
    this.activeMapService =
      this.thirdPartyServices.getActiveGeolocationService();
    if (!this.activeMapService) {
      this.updateMapState('missing-key');
      return;
    }

    this.mapProviderName = MAP_PROVIDER_NAMES[this.activeMapService.provider];
  }

  ngAfterViewInit() {
    if (!this.activeMapService) return;

    this.loadingDeadlineTimer = window.setTimeout(() => {
      if (this.destroyed || this.mapState !== 'loading') return;
      this.updateMapState(
        'error',
        this.mymap
          ? '地图瓦片加载超时，请检查网络、API Key 和服务权限'
          : '地图容器初始化失败，请重新打开设备页面'
      );
    }, 12000);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.initializeOrResizeMap();
      });
      this.resizeObserver.observe(this.map.nativeElement);
    }

    this.initTimer = window.setTimeout(() => {
      this.initializeOrResizeMap();
    }, 100);
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (this.initTimer !== null) window.clearTimeout(this.initTimer);
    this.clearLoadingDeadline();
    this.resizeObserver?.disconnect();
    this.mymap?.remove();
    this.mymap = null;
  }

  private initializeOrResizeMap(): void {
    if (this.destroyed) return;

    const { width, height } = this.map.nativeElement.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    if (this.mymap) {
      this.mymap.invalidateSize({ animate: false, pan: false });
      return;
    }

    void this.initMap();
  }

  async initMap(): Promise<void> {
    if (!this.activeMapService || this.destroyed || this.mymap) return;

    this.mymap = L.map(this.map.nativeElement, {
      center: [this.latitude, this.longitude],
      zoom: 10,
      attributionControl: true,
    });

    try {
      this.addMapLayer(this.activeMapService);
      if (this.destroyed || !this.mymap) return;

      const markerIcon = L.icon({
        iconUrl: 'img/map/marker.png',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -34],
        className: 'mapicon',
      });
      const marker = L.marker([this.latitude, this.longitude], {
        icon: markerIcon,
      }).addTo(this.mymap);
      const popupContent = document.createElement('span');
      popupContent.textContent = this.device.config.customName;
      marker.bindPopup(popupContent);
    } catch {
      this.mymap?.remove();
      this.mymap = null;
      this.updateMapState('error', '地图初始化失败，请重新打开设备页面');
    }
  }

  private watchTileLoading(baseLayer: L.TileLayer): void {
    let tileErrorCount = 0;
    const markReady = () => {
      if (this.destroyed) return;
      this.clearLoadingDeadline();
      this.updateMapState('ready');
    };

    baseLayer.once('tileload', markReady);
    baseLayer.once('load', markReady);
    baseLayer.on('tileerror', () => {
      tileErrorCount += 1;
      if (tileErrorCount < 3 || this.mapState === 'ready') return;

      this.clearLoadingDeadline();
      this.updateMapState(
        'error',
        this.activeMapService?.provider === 'tianditu'
          ? '天地图瓦片请求被拒绝，请检查 Key 是否已开通地图服务及应用域名权限'
          : '地图瓦片加载失败，请检查 API Key、服务权限和网络连接'
      );
    });
  }

  private addMapLayer(
    service: ActiveThirdPartyService<GeolocationServiceProvider>
  ): L.TileLayer {
    if (!this.mymap) throw new Error('地图尚未初始化');

    const key = encodeURIComponent(service.key);
    switch (service.provider) {
      case 'tianditu': {
        const commonOptions: L.TileLayerOptions = {
          subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
          minZoom: 1,
          maxZoom: 18,
          attribution: '&copy; 天地图',
        };
        const baseLayer = L.tileLayer(
          `https://t{s}.tianditu.gov.cn/vec_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=vec&style=default&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=${key}`,
          commonOptions
        );
        this.watchTileLoading(baseLayer);
        baseLayer.addTo(this.mymap);
        L.tileLayer(
          `https://t{s}.tianditu.gov.cn/cva_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=cva&style=default&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=${key}`,
          { ...commonOptions, attribution: '' }
        ).addTo(this.mymap);
        return baseLayer;
      }
      case 'geoapify': {
        const tileSuffix = L.Browser.retina ? '@2x.png' : '.png';
        const baseLayer = L.tileLayer(
          `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}${tileSuffix}?apiKey=${key}`,
          {
            maxZoom: 20,
            attribution:
              'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | &copy; OpenMapTiles &copy; OpenStreetMap contributors',
          }
        );
        this.watchTileLoading(baseLayer);
        return baseLayer.addTo(this.mymap);
      }
      case 'locationIq': {
        const baseLayer = L.tileLayer(
          `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${key}`,
          {
            subdomains: ['a', 'b', 'c'],
            maxZoom: 18,
            attribution:
              '&copy; <a href="https://locationiq.com/" target="_blank">LocationIQ</a> &copy; OpenStreetMap contributors',
          }
        );
        this.watchTileLoading(baseLayer);
        return baseLayer.addTo(this.mymap);
      }
    }
  }

  private clearLoadingDeadline(): void {
    if (this.loadingDeadlineTimer === null) return;
    window.clearTimeout(this.loadingDeadlineTimer);
    this.loadingDeadlineTimer = null;
  }

  private updateMapState(state: MapState, errorMessage = ''): void {
    if (this.destroyed) return;

    this.ngZone.run(() => {
      this.mapState = state;
      this.mapErrorMessage = errorMessage;
      this.changeDetectorRef.markForCheck();
    });
  }

  loadRoutingData() {
    if (!this.mymap) return;
    (L as any).Routing.control({
      waypoints: [L.latLng(57.74, 11.94), L.latLng(57.6792, 11.949)],
    }).addTo(this.mymap);
  }

  async gotoNav() {
    const actionSheet = await this.actionSheetController.create({
      buttons: [
        {
          text: '高德地图',
          handler: () => {
            window.open(
              `androidamap://viewMap?sourceApplication=iot.diandeng.tech&lat=${this.latitude}&lon=${this.longitude}&poiname=${this.device.config.customName}&dev=0`
            );
          },
        },
        {
          text: '百度地图',
          handler: () => {
            window.open(
              `bdapp://map/marker?location=${this.latitude},${this.longitude}&title=${this.device.config.customName}&coord_type=wgs84&src=iot.diandeng.tech`
            );
          },
        },
      ],
    });
    await actionSheet.present();
  }
}
