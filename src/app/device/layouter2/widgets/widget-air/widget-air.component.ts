import {
  ChangeDetectorRef,
  Component,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  WeatherCoordinates,
  WeatherService,
} from 'src/app/core/services/weather.service';
import {
  ActiveThirdPartyService,
  ThirdPartyServicesService,
  WeatherServiceProvider,
} from 'src/app/core/services/third-party-services.service';
import { Layouter2Widget } from '../config';
import {
  AirPollutant,
  AirQualitySnapshot,
  normalizeAirQualityResponse,
} from './air-quality.adapter';

type AirState =
  | 'loading'
  | 'ready'
  | 'missing-key'
  | 'missing-location'
  | 'error';
interface ResolvedAirLocation {
  coordinates: WeatherCoordinates;
  label: string;
}

interface PollutantPage {
  id: string;
  particles: PollutantDisplay[];
  pollutants: AirPollutant[];
}

type PollutantDisplay = Pick<
  AirPollutant,
  'id' | 'label' | 'displayValue' | 'unit'
>;

interface ParticleSlot {
  id: string;
  key: string;
  label: string;
  unit: string;
}

const AIR_PROVIDER_NAMES: Record<WeatherServiceProvider, string> = {
  seniverse: '心知天气',
  openWeather: 'OpenWeather',
  weatherApi: 'WeatherAPI',
  visualCrossing: 'Visual Crossing',
};

const AIR_LANGUAGE: Partial<Record<WeatherServiceProvider, string>> = {
  seniverse: 'zh-Hans',
  openWeather: 'zh_cn',
  weatherApi: 'zh',
};

const AIR_REFRESH_INTERVAL = 60 * 60 * 1000;
const AIR_RETRY_INTERVAL = 3 * 60 * 1000;
const CAROUSEL_INTERVAL = 6000;
const PARTICLE_SLOTS: readonly ParticleSlot[] = [
  { id: 'pm2.5', key: 'pm25', label: 'PM2.5', unit: 'μg/m³' },
  { id: 'pm10', key: 'pm10', label: 'PM10', unit: 'μg/m³' },
];
const DETAIL_POLLUTANT_ORDER = ['o3', 'no2', 'so2', 'co'] as const;
const POLLUTANT_ICONS: Readonly<Record<string, string>> = {
  pm25: 'fa-light fa-smog',
  pm10: 'fa-light fa-sun-dust',
  pm1: 'fa-light fa-smog',
  o3: 'fa-light fa-sun-haze',
  no2: 'fa-light fa-industry-windows',
  so2: 'fa-light fa-cloud',
  co: 'fa-light fa-wind',
  no: 'fa-light fa-flask',
  nh3: 'fa-light fa-flask',
};
const DEFAULT_POLLUTANT_ICON = 'fa-light fa-flask';

const AIR_DEMO: AirQualitySnapshot = {
  provider: 'seniverse',
  location: '杭州市',
  region: '浙江',
  aqi: 42,
  aqiDisplay: '42',
  scale: 'cn-aqi',
  scaleLabel: 'AQI',
  quality: '优',
  severity: 'good',
  healthAdvice: '空气质量令人满意，适合户外活动。',
  primaryPollutant: '',
  observedAt: new Date(),
  pollutants: [
    { id: 'pm2.5', label: 'PM2.5', value: 18, displayValue: '18', unit: 'μg/m³' },
    { id: 'pm10', label: 'PM10', value: 35, displayValue: '35', unit: 'μg/m³' },
    { id: 'o3', label: 'O₃', value: 72, displayValue: '72', unit: 'μg/m³' },
    { id: 'no2', label: 'NO₂', value: 24, displayValue: '24', unit: 'μg/m³' },
    { id: 'so2', label: 'SO₂', value: 7, displayValue: '7', unit: 'μg/m³' },
    { id: 'co', label: 'CO', value: 0.7, displayValue: '0.7', unit: 'mg/m³' },
  ],
};

@Component({
  // The layouter's existing public widget selectors intentionally omit app-.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'widget-air',
  templateUrl: './widget-air.component.html',
  styleUrls: ['./widget-air.component.scss'],
  imports: [RouterLink],
})
export class WidgetAirComponent implements Layouter2Widget, OnInit, OnDestroy {
  @Input() device;
  @Input() widget;
  @Input() isDemo = false;

  airState: AirState = 'loading';
  snapshot: AirQualitySnapshot | null = null;
  particlePollutants: PollutantDisplay[] = [];
  pollutantPages: AirPollutant[][] = [];
  displayPages: PollutantPage[] = [];
  providerName = '';
  errorMessage = '';
  locationHint = '';
  pageIndex = 0;
  refreshing = false;
  stale = false;

  private requestedStyle;
  private airRequests: Subscription | null = null;
  private refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private carouselTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private requestSequence = 0;
  private destroyed = false;
  private fallbackLocation: ResolvedAirLocation | null = null;
  private pointerStart: { x: number; y: number } | null = null;
  private ignoreCarouselClickUntil = 0;

  @Input()
  set lstyle(value) {
    this.requestedStyle = value;
    this.rebuildDisplayPages();
  }

  get lstyle() {
    if (typeof this.requestedStyle !== 'undefined') return this.requestedStyle;
    return this.widget?.lstyle ?? 0;
  }

  get key(): string {
    return this.widget?.key ?? 'air';
  }

  get updatedText(): string {
    const observedAt = this.snapshot?.observedAt;
    if (!observedAt || Number.isNaN(observedAt.getTime())) return '实时数据';
    const minutes = Math.max(
      0,
      Math.floor((Date.now() - observedAt.getTime()) / 60000)
    );
    if (minutes < 1) return '刚刚更新';
    if (minutes < 60) return `${minutes} 分钟前`;
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(observedAt);
  }

  constructor(
    private readonly weatherService: WeatherService,
    private readonly thirdPartyServices: ThirdPartyServicesService,
    private readonly ngZone: NgZone,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.isDemo) {
      this.providerName = '空气质量预览';
      this.snapshot = {
        ...AIR_DEMO,
        observedAt: new Date(),
        pollutants: AIR_DEMO.pollutants.map((pollutant) => ({ ...pollutant })),
      };
      this.airState = 'ready';
      this.rebuildDisplayPages();
      return;
    }
    this.refresh(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.requestSequence += 1;
    this.airRequests?.unsubscribe();
    this.clearRefreshTimer();
    this.clearCarouselTimer();
  }

  refresh(showLoading = true): void {
    if (this.destroyed || this.isDemo) return;
    const requestId = ++this.requestSequence;
    this.airRequests?.unsubscribe();
    this.airRequests = null;
    this.clearRefreshTimer();

    const activeService = this.thirdPartyServices.getActiveWeatherService();
    if (!activeService) {
      this.clearAirData();
      this.providerName = '';
      this.refreshing = false;
      this.stale = false;
      this.setState('missing-key');
      return;
    }

    this.providerName = AIR_PROVIDER_NAMES[activeService.provider];
    this.errorMessage = '';
    if (showLoading) this.stale = false;
    if (this.snapshot) {
      this.refreshing = true;
      this.setState('ready');
      this.rebuildDisplayPages();
    } else {
      this.refreshing = false;
      this.setState('loading');
    }
    void this.loadAir(activeService, requestId);
  }

  nextPage(manual = true): void {
    if (this.displayPages.length < 2) return;
    this.pageIndex = (this.pageIndex + 1) % this.displayPages.length;
    if (manual) this.restartCarousel();
  }

  previousPage(): void {
    if (this.displayPages.length < 2) return;
    this.pageIndex =
      (this.pageIndex - 1 + this.displayPages.length) % this.displayPages.length;
    this.restartCarousel();
  }

  showPage(index: number): void {
    if (index < 0 || index >= this.displayPages.length) return;
    this.pageIndex = index;
    this.restartCarousel();
  }

  onCarouselKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextPage();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previousPage();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.nextPage();
    }
  }

  onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.pointerStart || !event.isPrimary) return;
    const deltaX = event.clientX - this.pointerStart.x;
    const deltaY = event.clientY - this.pointerStart.y;
    this.pointerStart = null;
    if (Math.abs(deltaX) < 28 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return;
    }
    this.ignoreCarouselClickUntil = Date.now() + 400;
    deltaX < 0 ? this.nextPage() : this.previousPage();
  }

  onPointerCancel(): void {
    this.pointerStart = null;
  }

  advanceFromClick(): void {
    if (Date.now() < this.ignoreCarouselClickUntil) return;
    this.nextPage();
  }

  pageLabel(index: number): string {
    return `显示第 ${index + 1} 页：污染物实况`;
  }

  pollutantIcon(id: string): string {
    return (
      POLLUTANT_ICONS[this.normalizePollutantKey(id)] ??
      DEFAULT_POLLUTANT_ICON
    );
  }

  private async loadAir(
    activeService: ActiveThirdPartyService<WeatherServiceProvider>,
    requestId: number
  ): Promise<void> {
    let location: ResolvedAirLocation;
    try {
      location = await this.resolveLocation();
    } catch {
      if (!this.isCurrentRequest(requestId)) return;
      this.updateView(() => {
        this.refreshing = false;
        if (this.snapshot) {
          this.stale = true;
          this.errorMessage = '无法更新位置，正在显示上次数据';
          this.setState('ready');
          this.rebuildDisplayPages();
        } else {
          this.clearAirData();
          this.locationHint = '';
          this.setState('missing-location');
        }
        this.scheduleRefresh(AIR_RETRY_INTERVAL);
      });
      return;
    }

    if (!this.isCurrentRequest(requestId)) return;
    this.updateView(() => { this.locationHint = location.label; });
    const requests = new Subscription();
    this.airRequests = requests;
    const commonOptions = { language: AIR_LANGUAGE[activeService.provider] };

    requests.add(
      this.weatherService
        .getAirQuality<Record<string, unknown>>(location.coordinates, commonOptions)
        .subscribe({
          next: ({ provider, data }) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              let normalized: AirQualitySnapshot | null;
              try {
                normalized = normalizeAirQualityResponse(provider, data);
              } catch {
                normalized = null;
              }
              if (!normalized) {
                this.handleCurrentError(new Error('空气质量数据解析失败'));
                this.scheduleRefresh(AIR_RETRY_INTERVAL);
              } else {
                this.snapshot = {
                  ...normalized,
                  location: normalized.location || location.label,
                };
                this.providerName = AIR_PROVIDER_NAMES[provider];
                this.refreshing = false;
                this.stale = false;
                this.errorMessage = '';
                this.setState('ready');
                this.rebuildDisplayPages();
                this.scheduleRefresh(AIR_REFRESH_INTERVAL);
              }
            });
          },
          error: (error: unknown) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              this.handleCurrentError(error);
              this.scheduleRefresh(AIR_RETRY_INTERVAL);
            });
          },
        })
    );
  }

  private handleCurrentError(error: unknown): void {
    this.refreshing = false;
    this.errorMessage = this.describeError(error);
    if (this.snapshot) {
      this.stale = true;
      this.setState('ready');
      this.rebuildDisplayPages();
      return;
    }
    this.setState('error');
    this.clearCarouselTimer();
  }

  private async resolveLocation(): Promise<ResolvedAirLocation> {
    const configured = this.getConfiguredLocation();
    if (configured) return configured;
    if (this.fallbackLocation) return this.fallbackLocation;
    this.fallbackLocation = await this.getBrowserLocation();
    return this.fallbackLocation;
  }

  private getConfiguredLocation(): ResolvedAirLocation | null {
    const rawLocation = this.device?.config?.position?.location;
    if (!Array.isArray(rawLocation) || rawLocation.length < 2) return null;
    const longitude = Number(rawLocation[0]);
    const latitude = Number(rawLocation[1]);
    if (
      !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
    ) {
      return null;
    }
    const address = this.cleanText(this.device?.config?.position?.address);
    const deviceName = this.cleanText(this.device?.config?.customName);
    return {
      coordinates: { latitude, longitude },
      label: address || deviceName || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    };
  }

  private getBrowserLocation(): Promise<ResolvedAirLocation> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.reject(new Error('Geolocation is unavailable'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const deadline = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Geolocation timed out'));
      }, 12000);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(deadline);
          resolve({
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            label: '当前位置',
          });
        },
        () => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(deadline);
          reject(new Error('Geolocation permission denied'));
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10000 }
      );
    });
  }

  private rebuildDisplayPages(): void {
    const activePage = this.displayPages[this.pageIndex];
    const activeId = activePage?.id;
    if (!this.snapshot) {
      this.particlePollutants = [];
      this.pollutantPages = [];
      this.displayPages = [];
      this.pageIndex = 0;
      this.clearCarouselTimer();
      return;
    }

    const pages: PollutantPage[] = [];
    const pollutants = this.snapshot.pollutants;
    this.particlePollutants = PARTICLE_SLOTS.map((slot) =>
      pollutants.find((pollutant) =>
        this.matchesPollutant(pollutant, slot.key)
      ) ?? {
        id: slot.id,
        label: slot.label,
        displayValue: '--',
        unit: slot.unit,
      }
    );
    const detailPollutants = pollutants
      .filter((pollutant) => !this.isParticlePollutant(pollutant))
      .sort(
        (left, right) =>
          this.detailPollutantRank(left) - this.detailPollutantRank(right)
      );
    this.pollutantPages = this.chunk(detailPollutants, 4);
    if (!this.pollutantPages.length) this.pollutantPages = [[]];
    this.pollutantPages.forEach((pollutants, index) => {
      pages.push({
        id: `current-${index}`,
        particles: this.particlePollutants,
        pollutants,
      });
    });

    this.displayPages = pages;
    const nextIndex = activeId
      ? this.displayPages.findIndex((page) => page.id === activeId)
      : -1;
    this.pageIndex = nextIndex >= 0
      ? nextIndex
      : Math.min(this.pageIndex, this.displayPages.length - 1);
    this.restartCarousel();
  }

  private restartCarousel(): void {
    this.clearCarouselTimer();
    if (
      this.destroyed || this.isDemo ||
      this.displayPages.length < 2 || this.prefersReducedMotion()
    ) return;
    this.carouselTimer = globalThis.setInterval(() => {
      this.updateView(() => this.nextPage(false));
    }, CAROUSEL_INTERVAL);
  }

  private scheduleRefresh(delay: number): void {
    this.clearRefreshTimer();
    if (this.destroyed || this.isDemo) return;
    this.refreshTimer = globalThis.setTimeout(() => {
      this.ngZone.run(() => this.refresh(false));
    }, delay);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer === null) return;
    globalThis.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private clearCarouselTimer(): void {
    if (this.carouselTimer === null) return;
    globalThis.clearInterval(this.carouselTimer);
    this.carouselTimer = null;
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private setState(state: AirState): void {
    this.airState = state;
    if (state !== 'ready') this.clearCarouselTimer();
  }

  private isCurrentRequest(requestId: number): boolean {
    return !this.destroyed && requestId === this.requestSequence;
  }

  private updateView(update: () => void): void {
    if (this.destroyed) return;
    this.ngZone.run(() => {
      if (this.destroyed) return;
      update();
      this.changeDetectorRef.markForCheck();
    });
  }

  private describeError(error: unknown): string {
    const candidate = error as {
      status?: number;
      error?: { error?: { message?: string }; message?: string };
      message?: string;
    };
    const status = Number(candidate?.status);
    if (status === 401 || status === 403) {
      return 'API Key 无效，或尚未开通空气质量服务';
    }
    if (status === 429) return '空气质量服务请求过于频繁，请稍后再试';
    if (status === 0) return '无法连接空气质量服务，请检查网络或跨域设置';
    const providerMessage =
      candidate?.error?.error?.message || candidate?.error?.message;
    if (providerMessage) return providerMessage;
    if (candidate?.message?.includes('解析失败')) return candidate.message;
    if (candidate?.message?.includes('API Key')) return candidate.message;
    return '空气质量数据加载失败，请稍后重试';
  }

  private clearAirData(): void {
    this.snapshot = null;
    this.particlePollutants = [];
    this.pollutantPages = [];
    this.displayPages = [];
    this.pageIndex = 0;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private isParticlePollutant(pollutant: AirPollutant): boolean {
    return (
      this.matchesPollutant(pollutant, 'pm25') ||
      this.matchesPollutant(pollutant, 'pm10')
    );
  }

  private matchesPollutant(pollutant: AirPollutant, key: string): boolean {
    return (
      this.normalizePollutantKey(pollutant.id) === key ||
      this.normalizePollutantKey(pollutant.label) === key
    );
  }

  private detailPollutantRank(pollutant: AirPollutant): number {
    const id = this.normalizePollutantKey(pollutant.id);
    const label = this.normalizePollutantKey(pollutant.label);
    const rank = DETAIL_POLLUTANT_ORDER.findIndex(
      (key) => key === id || key === label
    );
    return rank < 0 ? DETAIL_POLLUTANT_ORDER.length : rank;
  }

  private normalizePollutantKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private cleanText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
