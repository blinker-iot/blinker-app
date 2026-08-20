import {
  ChangeDetectorRef,
  Component,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
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
  WeatherMetric,
  WeatherSnapshot,
  normalizeWeatherResponse,
} from './weather-data.adapter';
import {
  WeatherAlert,
  WeatherForecastHour,
  normalizeWeatherAlerts,
  normalizeWeatherHourlyForecast,
} from './weather-outlook.adapter';

type WeatherState =
  | 'loading'
  | 'ready'
  | 'missing-key'
  | 'missing-location'
  | 'error';
type WeatherSection = 'current' | 'forecast';
type WeatherSectionState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unsupported'
  | 'error';

interface ResolvedWeatherLocation {
  coordinates: WeatherCoordinates;
  label: string;
}

interface WeatherPageBase {
  id: string;
  section: WeatherSection;
}

interface WeatherMetricPage extends WeatherPageBase {
  kind: 'metrics';
  metrics: WeatherMetric[];
}

interface WeatherForecastPage extends WeatherPageBase {
  kind: 'forecast';
  hours: WeatherForecastHour[];
}

interface WeatherSectionStatusPage extends WeatherPageBase {
  kind: 'section-status';
  state: Exclude<WeatherSectionState, 'idle' | 'ready'>;
  title: string;
  message: string;
  icon: string;
}

type WeatherDisplayPage =
  | WeatherMetricPage
  | WeatherForecastPage
  | WeatherSectionStatusPage;

const WEATHER_PROVIDER_NAMES: Record<WeatherServiceProvider, string> = {
  seniverse: '心知天气',
  openWeather: 'OpenWeather',
  weatherApi: 'WeatherAPI',
  visualCrossing: 'Visual Crossing',
};

const WEATHER_LANGUAGE: Partial<Record<WeatherServiceProvider, string>> = {
  seniverse: 'zh-Hans',
  openWeather: 'zh_cn',
  weatherApi: 'zh',
};

// Alerts can change within minutes. Current conditions and forecasts still use
// the WeatherService coordinate cache during these five-minute refreshes.
const WEATHER_REFRESH_INTERVAL = 5 * 60 * 1000;
const WEATHER_RETRY_INTERVAL = 3 * 60 * 1000;
const CAROUSEL_INTERVAL = 15_000;
const FORECAST_HOURS = 3;
const METRICS_PER_PAGE = 6;
const FORECAST_HOURS_PER_PAGE = 3;

const WEATHER_DEMO: WeatherSnapshot = {
  provider: 'seniverse',
  location: '杭州市',
  region: '浙江',
  temperature: '26',
  condition: '多云',
  icon: 'fa-light fa-cloud-sun',
  isDay: true,
  observedAt: new Date(),
  metrics: [
    { id: 'feels-like', label: '体感', value: '27', unit: '°C', icon: 'fa-light fa-temperature-half' },
    { id: 'humidity', label: '湿度', value: '68', unit: '%', icon: 'fa-light fa-droplet' },
    { id: 'wind', label: '东南风', value: '12.6', unit: 'km/h', icon: 'fa-light fa-wind' },
    { id: 'pressure', label: '气压', value: '1012', unit: 'hPa', icon: 'fa-light fa-gauge-high' },
    { id: 'visibility', label: '能见度', value: '10', unit: 'km', icon: 'fa-light fa-eye' },
    { id: 'precipitation', label: '降水', value: '0.2', unit: 'mm', icon: 'fa-light fa-cloud-rain' },
    { id: 'cloud', label: '云量', value: '72', unit: '%', icon: 'fa-light fa-clouds' },
    { id: 'uv', label: '紫外线', value: '3', unit: '', icon: 'fa-light fa-sun' },
  ],
};

const WEATHER_DEMO_FORECAST: WeatherForecastHour[] = [
  {
    id: 'demo-hour-1', time: new Date(Date.now() + 60 * 60 * 1000),
    temperature: 27, feelsLike: 28, condition: '多云',
    precipitationProbability: 20, precipitation: 0,
    humidity: 68, windSpeed: 10, windDirection: '东南风',
    icon: 'fa-light fa-cloud-sun',
  },
  {
    id: 'demo-hour-2', time: new Date(Date.now() + 2 * 60 * 60 * 1000),
    temperature: 26, feelsLike: 27, condition: '阵雨',
    precipitationProbability: 65, precipitation: 1.2, humidity: 74,
    windSpeed: 12, windDirection: '东风',
    icon: 'fa-light fa-cloud-rain',
  },
  {
    id: 'demo-hour-3', time: new Date(Date.now() + 3 * 60 * 60 * 1000),
    temperature: 25, feelsLike: 26, condition: '小雨',
    precipitationProbability: 55, precipitation: 0.6, humidity: 76,
    windSpeed: 9, windDirection: '东北风',
    icon: 'fa-light fa-cloud-showers-heavy',
  },
];

const WEATHER_DEMO_ALERTS: WeatherAlert[] = [
  {
    id: 'demo-alert', title: '雷电黄色预警', type: '雷电', level: '黄色',
    severity: 'yellow', status: '预警中',
    description: '预计未来六小时部分地区可能发生雷电活动，并伴有短时强降水。',
    publishedAt: new Date(), effectiveAt: null, expiresAt: null,
    source: '杭州市气象台', areas: ['杭州市'],
    instruction: '减少户外活动，远离高处、孤立树木和金属设施。',
  },
];

@Component({
  // The layouter's existing public widget selectors intentionally omit app-.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'widget-weather',
  templateUrl: './widget-weather.component.html',
  styleUrls: ['./widget-weather.component.scss'],
})
export class WidgetWeatherComponent
  implements Layouter2Widget, OnInit, OnDestroy
{
  @Input() device;
  @Input() widget;
  @Input() isDemo = false;

  weatherState: WeatherState = 'loading';
  forecastState: WeatherSectionState = 'idle';
  alertsState: WeatherSectionState = 'idle';
  snapshot: WeatherSnapshot | null = null;
  forecastHours: WeatherForecastHour[] = [];
  alerts: WeatherAlert[] = [];
  metricPages: WeatherMetric[][] = [];
  displayPages: WeatherDisplayPage[] = [];
  selectedAlert: WeatherAlert | null = null;
  providerName = '';
  errorMessage = '';
  forecastErrorMessage = '';
  alertsErrorMessage = '';
  locationHint = '';
  pageIndex = 0;
  refreshing = false;
  stale = false;

  private requestedStyle;
  private weatherRequests: Subscription | null = null;
  private refreshTimer: number | null = null;
  private carouselTimer: number | null = null;
  private requestSequence = 0;
  private destroyed = false;
  private fallbackLocation: ResolvedWeatherLocation | null = null;
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
    return this.widget?.key ?? 'weather';
  }

  get updatedText(): string {
    const observedAt = this.snapshot?.observedAt;
    if (!observedAt || Number.isNaN(observedAt.getTime())) return '实时数据';
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - observedAt.getTime()) / 60000)
    );
    if (elapsedMinutes < 1) return '刚刚更新';
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(observedAt);
  }

  constructor(
    private readonly weatherService: WeatherService,
    private readonly thirdPartyServices: ThirdPartyServicesService,
    private readonly ngZone: NgZone,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly navController: NavController
  ) {}

  openThirdPartyServices(): void {
    void this.navController.navigateForward('/third-party-services');
  }

  ngOnInit(): void {
    if (this.isDemo) {
      this.providerName = '天气预览';
      this.snapshot = {
        ...WEATHER_DEMO,
        metrics: WEATHER_DEMO.metrics.map((metric) => ({ ...metric })),
        observedAt: new Date(),
      };
      const demoNow = Date.now();
      this.forecastHours = WEATHER_DEMO_FORECAST.map((hour, index) => ({
        ...hour,
        time: new Date(demoNow + (index + 1) * 60 * 60 * 1000),
      }));
      this.alerts = WEATHER_DEMO_ALERTS.map((alert) => ({
        ...alert,
        areas: [...alert.areas],
      }));
      this.forecastState = 'ready';
      this.alertsState = 'ready';
      this.weatherState = 'ready';
      this.rebuildDisplayPages();
      return;
    }
    this.refresh(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.requestSequence += 1;
    this.weatherRequests?.unsubscribe();
    this.clearRefreshTimer();
    this.clearCarouselTimer();
  }

  refresh(showLoading = true): void {
    if (this.destroyed || this.isDemo) return;
    const requestId = ++this.requestSequence;
    this.weatherRequests?.unsubscribe();
    this.weatherRequests = null;
    this.clearRefreshTimer();

    const activeService = this.thirdPartyServices.getActiveWeatherService();
    if (!activeService) {
      this.clearWeatherData();
      this.providerName = '';
      this.refreshing = false;
      this.stale = false;
      this.setState('missing-key');
      return;
    }

    this.providerName = WEATHER_PROVIDER_NAMES[activeService.provider];
    this.errorMessage = '';
    this.stale = false;
    this.prepareOutlookRefresh();
    if (showLoading || !this.snapshot) {
      this.setState('loading');
    } else {
      this.refreshing = true;
      this.rebuildDisplayPages();
    }
    void this.loadWeather(activeService, requestId, showLoading);
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

  openAlert(alert: WeatherAlert, event?: Event): void {
    event?.stopPropagation();
    this.selectedAlert = alert;
    this.clearCarouselTimer();
  }

  closeAlert(event?: Event): void {
    event?.stopPropagation();
    this.selectedAlert = null;
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
    if (this.selectedAlert || !event.isPrimary || event.button !== 0) return;
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
    if (this.selectedAlert || Date.now() < this.ignoreCarouselClickUntil) return;
    this.nextPage();
  }

  forecastTime(hour: WeatherForecastHour): string {
    if (!hour.time || Number.isNaN(hour.time.getTime())) return '预报';
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(hour.time);
  }

  forecastTemperature(hour: WeatherForecastHour): string {
    const temperature = this.displayNumber(hour.temperature);
    return temperature === '--' ? temperature : `${temperature}°`;
  }

  forecastCondition(hour: WeatherForecastHour): string {
    return hour.condition?.trim() || '天气预报';
  }

  forecastDetailLines(hour: WeatherForecastHour): string[] {
    const primaryDetails: string[] = [];
    if (hour.feelsLike !== null) {
      primaryDetails.push(`体感 ${this.displayNumber(hour.feelsLike)}°`);
    }
    if (hour.precipitationProbability !== null) {
      primaryDetails.push(`降水 ${this.displayNumber(hour.precipitationProbability)}%`);
    } else if (hour.precipitation !== null) {
      primaryDetails.push(`降水 ${this.displayNumber(hour.precipitation)} mm`);
    }

    const humidity = hour.humidity === null
      ? ''
      : `湿度 ${this.displayNumber(hour.humidity)}%`;
    const windSpeed = hour.windSpeed === null
      ? ''
      : `${this.displayNumber(hour.windSpeed)} km/h`;
    const wind = [hour.windDirection, windSpeed].filter(Boolean).join(' ');
    const lines = [primaryDetails.join(' · '), humidity, wind].filter(Boolean);
    return lines.length ? lines : ['暂无更多数据'];
  }

  forecastDetail(hour: WeatherForecastHour): string {
    return this.forecastDetailLines(hour).join(' · ');
  }

  alertMeta(alert: WeatherAlert): string {
    return [alert.type, alert.level, alert.status].filter(Boolean).join(' · ') || '气象预警';
  }

  alertTime(alert: WeatherAlert): string {
    const time = alert.publishedAt || alert.effectiveAt;
    return time ? this.formatDateTime(time) : '发布时间未知';
  }

  formatDateTime(time: Date | null): string {
    if (!time || Number.isNaN(time.getTime())) return '--';
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).format(time);
  }

  alertSeverityClass(alert: WeatherAlert): string {
    return `alert-${alert.severity || 'unknown'}`;
  }

  pageLabel(page: WeatherDisplayPage, index: number): string {
    const names: Record<WeatherSection, string> = {
      current: '实时气象', forecast: '天气预报',
    };
    return `显示第 ${index + 1} 页：${names[page.section]}`;
  }

  private async loadWeather(
    activeService: ActiveThirdPartyService<WeatherServiceProvider>,
    requestId: number,
    showLoading: boolean
  ): Promise<void> {
    let location: ResolvedWeatherLocation;
    try {
      location = await this.resolveLocation();
    } catch {
      if (!this.isCurrentRequest(requestId)) return;
      this.updateView(() => {
        this.refreshing = false;
        this.clearWeatherData();
        this.locationHint = '';
        this.setState('missing-location');
      });
      return;
    }

    if (!this.isCurrentRequest(requestId)) return;
    this.updateView(() => { this.locationHint = location.label; });
    const requests = new Subscription();
    this.weatherRequests = requests;
    const commonOptions = {
      unitSystem: 'metric' as const,
      language: WEATHER_LANGUAGE[activeService.provider],
    };

    requests.add(
      this.weatherService
        .getCurrentWeather<Record<string, unknown>>(location.coordinates, {
          ...commonOptions,
          includeAirQuality: true,
        })
        .subscribe({
          next: ({ provider, data }) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              let normalized: WeatherSnapshot | null;
              try {
                normalized = normalizeWeatherResponse(provider, data);
              } catch {
                this.handleLoadError(new Error('天气数据解析失败'), showLoading);
                return;
              }
              if (!normalized) {
                this.handleLoadError(
                  new Error('天气服务返回了无法识别的数据'), showLoading
                );
                return;
              }
              this.snapshot = {
                ...normalized,
                location: normalized.location || location.label,
              };
              this.providerName = WEATHER_PROVIDER_NAMES[provider];
              this.refreshing = false;
              this.stale = false;
              this.setState('ready');
              this.rebuildDisplayPages();
              this.scheduleRefresh(WEATHER_REFRESH_INTERVAL);
            });
          },
          error: (error: unknown) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => this.handleLoadError(error, showLoading));
          },
        })
    );

    requests.add(
      this.weatherService
        .getHourlyWeatherForecast<Record<string, unknown>>(location.coordinates, {
          ...commonOptions,
          hours: FORECAST_HOURS,
        })
        .subscribe({
          next: ({ provider, data }) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              try {
                const forecast = normalizeWeatherHourlyForecast(
                  provider,
                  data,
                  new Date(),
                  FORECAST_HOURS,
                );
                if (forecast === null) {
                  this.setForecastError('逐小时天气预报数据无法识别');
                } else {
                  this.forecastHours = forecast;
                  this.forecastState = this.forecastHours.length ? 'ready' : 'empty';
                  this.forecastErrorMessage = '';
                }
              } catch {
                this.setForecastError('逐小时天气预报数据解析失败');
              }
              this.rebuildDisplayPages();
            });
          },
          error: (error: unknown) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              this.forecastHours = [];
              const unsupported = this.isUnsupportedFeature(error);
              this.forecastState = unsupported ? 'unsupported' : 'error';
              this.forecastErrorMessage = unsupported
                ? '当前天气服务商不支持逐小时天气预报'
                : this.describeError(error);
              this.rebuildDisplayPages();
            });
          },
        })
    );

    requests.add(
      this.weatherService
        .getWeatherAlerts<Record<string, unknown>>(location.coordinates, commonOptions)
        .subscribe({
          next: ({ provider, data }) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              try {
                const alerts = normalizeWeatherAlerts(provider, data);
                if (alerts === null) {
                  this.setAlertsError('气象预警数据无法识别');
                } else {
                  this.alerts = alerts;
                  this.alertsState = alerts.length ? 'ready' : 'empty';
                  this.alertsErrorMessage = '';
                  this.reconcileSelectedAlert();
                }
              } catch {
                this.setAlertsError('气象预警数据解析失败');
              }
            });
          },
          error: (error: unknown) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.updateView(() => {
              this.alerts = [];
              const unsupported = this.isUnsupportedFeature(error);
              this.alertsState = unsupported ? 'unsupported' : 'error';
              this.alertsErrorMessage = unsupported
                ? '当前天气服务商不提供气象预警'
                : this.describeError(error);
              this.reconcileSelectedAlert();
            });
          },
        })
    );
  }

  private prepareOutlookRefresh(): void {
    if (!this.forecastHours.length) this.forecastState = 'loading';
    if (!this.alerts.length) this.alertsState = 'loading';
    this.forecastErrorMessage = '';
    this.alertsErrorMessage = '';
  }

  private handleLoadError(error: unknown, showLoading: boolean): void {
    this.refreshing = false;
    this.errorMessage = this.describeError(error);
    if (!showLoading && this.snapshot) {
      this.stale = true;
      this.setState('ready');
      this.rebuildDisplayPages();
    } else {
      this.snapshot = null;
      this.metricPages = [];
      this.displayPages = [];
      this.pageIndex = 0;
      this.setState('error');
    }
    this.scheduleRefresh(WEATHER_RETRY_INTERVAL);
  }

  private setForecastError(message: string): void {
    this.forecastHours = [];
    this.forecastState = 'error';
    this.forecastErrorMessage = message;
  }

  private setAlertsError(message: string): void {
    this.alerts = [];
    this.alertsState = 'error';
    this.alertsErrorMessage = message;
    this.reconcileSelectedAlert();
  }

  private async resolveLocation(): Promise<ResolvedWeatherLocation> {
    const configured = this.getConfiguredLocation();
    if (configured) return configured;
    if (this.fallbackLocation) return this.fallbackLocation;
    this.fallbackLocation = await this.getBrowserLocation();
    return this.fallbackLocation;
  }

  private getConfiguredLocation(): ResolvedWeatherLocation | null {
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

  private getBrowserLocation(): Promise<ResolvedWeatherLocation> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.reject(new Error('Geolocation is unavailable'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const deadline = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Geolocation timed out'));
      }, 12000);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(deadline);
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
          window.clearTimeout(deadline);
          reject(new Error('Geolocation permission denied'));
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10000 }
      );
    });
  }

  private rebuildDisplayPages(): void {
    const activePage = this.displayPages[this.pageIndex];
    const activeId = activePage?.id;
    const activeSection = activePage?.section;
    if (!this.snapshot) {
      this.metricPages = [];
      this.displayPages = [];
      this.pageIndex = 0;
      this.clearCarouselTimer();
      return;
    }

    const pages: WeatherDisplayPage[] = [];
    this.metricPages = this.chunk(this.snapshot.metrics, METRICS_PER_PAGE);
    if (!this.metricPages.length) this.metricPages = [[]];
    this.metricPages.forEach((metrics, index) => {
      pages.push({
        id: `current-${index}`, section: 'current', kind: 'metrics', metrics,
      });
    });

    if (this.forecastState === 'ready' && this.forecastHours.length) {
      this.chunk(this.forecastHours, FORECAST_HOURS_PER_PAGE).forEach((hours, index) => {
        pages.push({
          id: `forecast-${index}-${hours[0]?.id || 'hour'}`,
          section: 'forecast', kind: 'forecast', hours,
        });
      });
    } else {
      pages.push(this.createSectionStatusPage('forecast', this.forecastState));
    }

    this.displayPages = pages;
    let nextIndex = activeId
      ? this.displayPages.findIndex((page) => page.id === activeId)
      : -1;
    if (nextIndex < 0 && activeSection) {
      nextIndex = this.displayPages.findIndex((page) => page.section === activeSection);
    }
    this.pageIndex = nextIndex >= 0
      ? nextIndex
      : Math.min(this.pageIndex, this.displayPages.length - 1);
    this.restartCarousel();
  }

  private createSectionStatusPage(
    section: 'forecast',
    state: WeatherSectionState
  ): WeatherSectionStatusPage {
    const safeState: WeatherSectionStatusPage['state'] =
      state === 'idle' || state === 'ready' ? 'loading' : state;
    const content = {
      loading: ['正在加载天气预报', '获取未来 3 小时天气', 'fa-light fa-circle-notch fa-spin'],
      empty: ['暂无小时预报', '服务商未返回未来 3 小时数据', 'fa-light fa-calendar-cloud'],
      unsupported: ['暂不支持小时预报', this.forecastErrorMessage, 'fa-light fa-cloud-slash'],
      error: ['小时预报加载失败', this.forecastErrorMessage, 'fa-light fa-cloud-exclamation'],
    }[safeState];
    return {
      id: 'forecast-status', section, kind: 'section-status', state: safeState,
      title: content[0], message: content[1], icon: content[2],
    };
  }

  private restartCarousel(): void {
    this.clearCarouselTimer();
    if (
      this.destroyed || this.isDemo || this.selectedAlert ||
      this.displayPages.length < 2 || this.prefersReducedMotion()
    ) return;
    this.carouselTimer = window.setInterval(() => {
      this.updateView(() => this.nextPage(false));
    }, CAROUSEL_INTERVAL);
  }

  private scheduleRefresh(delay: number): void {
    this.clearRefreshTimer();
    if (this.destroyed || this.isDemo) return;
    this.refreshTimer = window.setTimeout(() => {
      this.ngZone.run(() => this.refresh(false));
    }, delay);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer === null) return;
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private clearCarouselTimer(): void {
    if (this.carouselTimer === null) return;
    window.clearInterval(this.carouselTimer);
    this.carouselTimer = null;
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private setState(state: WeatherState): void {
    this.weatherState = state;
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
      return 'API Key 无效，或尚未开通对应天气服务';
    }
    if (status === 429) return '天气服务请求过于频繁，请稍后再试';
    if (status === 0) return '无法连接天气服务，请检查网络或跨域设置';
    const providerMessage =
      candidate?.error?.error?.message || candidate?.error?.message;
    if (providerMessage) return providerMessage;
    if (candidate?.message?.includes('API Key')) return candidate.message;
    return '天气数据加载失败，请稍后重试';
  }

  private isUnsupportedFeature(error: unknown): boolean {
    return (error as { code?: string })?.code === 'WEATHER_FEATURE_UNSUPPORTED';
  }

  private reconcileSelectedAlert(): void {
    if (!this.selectedAlert) return;
    this.selectedAlert =
      this.alerts.find((alert) => alert.id === this.selectedAlert?.id) || null;
    if (!this.selectedAlert) this.restartCarousel();
  }

  private clearWeatherData(): void {
    this.snapshot = null;
    this.forecastHours = [];
    this.alerts = [];
    this.metricPages = [];
    this.displayPages = [];
    this.selectedAlert = null;
    this.forecastState = 'idle';
    this.alertsState = 'idle';
    this.pageIndex = 0;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private displayNumber(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '--';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  private cleanText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
