import {
  HttpBackend,
  HttpClient,
  HttpParams,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  Observable,
  catchError,
  defer,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import {
  ThirdPartyServicesService,
  WeatherServiceProvider,
} from './third-party-services.service';

export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
}

export type WeatherLocation = string | WeatherCoordinates;
export type WeatherUnitSystem = 'metric' | 'imperial' | 'standard';

export interface WeatherRequestOptions {
  language?: string;
  unitSystem?: WeatherUnitSystem;
  includeAirQuality?: boolean;
}

export interface WeatherForecastRequestOptions extends WeatherRequestOptions {
  days?: number;
}

export interface WeatherHourlyForecastRequestOptions
  extends WeatherRequestOptions {
  hours?: number;
}

export type WeatherFeature =
  | 'forecast'
  | 'alerts'
  | 'air-quality';

export class WeatherFeatureUnsupportedError extends Error {
  readonly code = 'WEATHER_FEATURE_UNSUPPORTED';

  constructor(
    readonly provider: WeatherServiceProvider,
    readonly feature: WeatherFeature,
  ) {
    super(`${provider} does not support ${feature} with the configured API.`);
    this.name = 'WeatherFeatureUnsupportedError';
  }
}

export interface WeatherServiceResponse<T = unknown> {
  provider: WeatherServiceProvider;
  data: T;
}

interface WeatherCacheEntry {
  expiresAt: number;
  response$: Observable<WeatherServiceResponse<unknown>>;
}

type WeatherCacheResource =
  | 'current'
  | 'forecast'
  | 'hourly-forecast'
  | 'alerts'
  | 'air-current';

const WEATHER_CACHE_TTL = 60 * 60 * 1000;
const WEATHER_ALERT_CACHE_TTL = 5 * 60 * 1000;
const WEATHER_HOURLY_FORECAST_CACHE_TTL = 5 * 60 * 1000;
const WEATHER_CACHE_COORDINATE_PRECISION = 4;
const DEFAULT_FORECAST_DAYS = 3;
const DEFAULT_HOURLY_FORECAST_HOURS = 3;
const VISUAL_CROSSING_AIR_QUALITY_ELEMENTS = [
  'datetime',
  'pm1',
  'pm2p5',
  'pm10',
  'o3',
  'no2',
  'so2',
  'co',
  'aqius',
  'aqieur',
].join(',');

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  private readonly http: HttpClient;
  private readonly weatherCache = new Map<string, WeatherCacheEntry>();

  constructor(
    httpBackend: HttpBackend,
    private readonly serviceConfig: ThirdPartyServicesService,
  ) {
    this.http = new HttpClient(httpBackend);
  }

  getCurrentWeather<T = unknown>(
    location: WeatherLocation,
    options: WeatherRequestOptions = {},
  ): Observable<WeatherServiceResponse<T>> {
    return this.getCurrentWeatherInternal<T>(location, options, true);
  }

  getAirQuality<T = unknown>(
    location: WeatherLocation,
    options: WeatherRequestOptions = {},
  ): Observable<WeatherServiceResponse<T>> {
    const activeService = this.serviceConfig.getActiveWeatherService();
    if (!activeService) {
      return throwError(
        () => new Error('当前天气服务未配置有效的 API Key'),
      );
    }

    if (!this.isValidLocation(location)) {
      return throwError(() => new Error('空气质量查询位置不能为空'));
    }

    const { provider, key } = activeService;
    switch (provider) {
      case 'seniverse':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.seniverse.com/v3/air/now.json',
              this.withLanguage(
                new HttpParams()
                  .set('key', key)
                  .set(
                    'location',
                    this.formatLocation(
                      location,
                      'latitude-colon-longitude',
                    ),
                  )
                  .set('scope', 'city'),
                options.language,
                'language',
              ),
            ),
          'air-current',
        );

      case 'openWeather': {
        if (!this.isCoordinates(location)) {
          return this.airQualityCoordinatesRequired(provider);
        }

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.openweathermap.org/data/2.5/air_pollution',
              new HttpParams()
                .set('appid', key)
                .set('lat', String(location.latitude))
                .set('lon', String(location.longitude)),
            ),
          'air-current',
        );
      }

      case 'weatherApi': {
        let params = new HttpParams()
          .set('key', key)
          .set('q', this.formatLocation(location, 'latitude-longitude'))
          .set('aqi', 'yes');
        params = this.withLanguage(params, options.language, 'lang');

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.weatherapi.com/v1/current.json',
              params,
            ),
          'air-current',
        );
      }

      case 'visualCrossing':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
                this.formatLocation(location, 'latitude-longitude'),
              )}`,
              new HttpParams()
                .set('key', key)
                .set('unitGroup', 'metric')
                .set('include', 'current')
                .set('elements', VISUAL_CROSSING_AIR_QUALITY_ELEMENTS)
                .set('contentType', 'json'),
            ),
          'air-current',
        );
    }
  }

  getWeatherForecast<T = unknown>(
    location: WeatherLocation,
    options: WeatherForecastRequestOptions = {},
  ): Observable<WeatherServiceResponse<T>> {
    const activeService = this.serviceConfig.getActiveWeatherService();
    if (!activeService) {
      return throwError(
        () => new Error('当前天气服务未配置有效的 API Key'),
      );
    }

    if (!this.isValidLocation(location)) {
      return throwError(() => new Error('天气查询位置不能为空'));
    }

    const { provider, key } = activeService;
    const days = this.normalizeForecastDays(provider, options.days);
    const cacheVariant = `days:${days}`;

    switch (provider) {
      case 'seniverse':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.seniverse.com/v3/weather/daily.json',
              this.withLanguage(
                new HttpParams()
                  .set('key', key)
                  .set(
                    'location',
                    this.formatLocation(
                      location,
                      'latitude-colon-longitude',
                    ),
                  )
                  .set(
                    'unit',
                    options.unitSystem === 'imperial' ? 'f' : 'c',
                  )
                  .set('start', '0')
                  .set('days', String(days)),
                options.language,
                'language',
              ),
            ),
          'forecast',
          WEATHER_CACHE_TTL,
          cacheVariant,
        );

      case 'openWeather': {
        let params = new HttpParams()
          .set('appid', key)
          .set('units', options.unitSystem ?? 'metric')
          .set('cnt', String(days * 8));
        params = this.withLanguage(params, options.language, 'lang');
        params = this.isCoordinates(location)
          ? params
              .set('lat', String(location.latitude))
              .set('lon', String(location.longitude))
          : params.set('q', location.trim());

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.openweathermap.org/data/2.5/forecast',
              params,
            ),
          'forecast',
          WEATHER_CACHE_TTL,
          cacheVariant,
        );
      }

      case 'weatherApi': {
        let params = new HttpParams()
          .set('key', key)
          .set('q', this.formatLocation(location, 'latitude-longitude'))
          .set('days', String(days));
        params = this.withLanguage(params, options.language, 'lang');
        if (options.includeAirQuality) params = params.set('aqi', 'yes');

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.weatherapi.com/v1/forecast.json',
              params,
            ),
          'forecast',
          WEATHER_CACHE_TTL,
          cacheVariant,
        );
      }

      case 'visualCrossing':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
                this.formatLocation(location, 'latitude-longitude'),
              )}/next${days}days`,
              new HttpParams()
                .set('key', key)
                .set(
                  'unitGroup',
                  options.unitSystem === 'imperial' ? 'us' : 'metric',
                )
                .set('include', 'days')
                .set('contentType', 'json'),
            ),
          'forecast',
          WEATHER_CACHE_TTL,
          cacheVariant,
        );
    }
  }

  getHourlyWeatherForecast<T = unknown>(
    location: WeatherLocation,
    options: WeatherHourlyForecastRequestOptions = {},
  ): Observable<WeatherServiceResponse<T>> {
    const activeService = this.serviceConfig.getActiveWeatherService();
    if (!activeService) {
      return throwError(
        () => new Error('当前天气服务未配置有效的 API Key'),
      );
    }

    if (!this.isValidLocation(location)) {
      return throwError(() => new Error('天气查询位置不能为空'));
    }

    const { provider, key } = activeService;
    const hours = this.normalizeHourlyForecastHours(provider, options.hours);
    const cacheVariant = `hours:${hours}`;

    switch (provider) {
      case 'seniverse':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.seniverse.com/v3/weather/hourly.json',
              this.withLanguage(
                new HttpParams()
                  .set('key', key)
                  .set(
                    'location',
                    this.formatLocation(
                      location,
                      'latitude-colon-longitude',
                    ),
                  )
                  .set(
                    'unit',
                    options.unitSystem === 'imperial' ? 'f' : 'c',
                  )
                  .set('start', '1')
                  // Keep one rollover slot so a five-minute cache entry still
                  // contains three future hours when the clock crosses an hour.
                  .set('hours', String(Math.min(24, hours + 1))),
                options.language,
                'language',
              ),
            ),
          'hourly-forecast',
          WEATHER_HOURLY_FORECAST_CACHE_TTL,
          cacheVariant,
        );

      case 'openWeather': {
        if (!this.isCoordinates(location)) {
          return this.hourlyForecastCoordinatesRequired(provider);
        }

        let params = new HttpParams()
          .set('lat', String(location.latitude))
          .set('lon', String(location.longitude))
          .set('units', options.unitSystem ?? 'metric');
        params = this.withLanguage(params, options.language, 'lang');
        params = params.set('appid', key);

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.openweathermap.org/data/4.0/onecall/timeline/1h',
              params,
            ),
          'hourly-forecast',
          WEATHER_HOURLY_FORECAST_CACHE_TTL,
          cacheVariant,
        );
      }

      case 'weatherApi': {
        let params = new HttpParams()
          .set('key', key)
          .set('q', this.formatLocation(location, 'latitude-longitude'))
          .set('days', '2');
        params = this.withLanguage(params, options.language, 'lang');
        if (options.includeAirQuality) params = params.set('aqi', 'yes');

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.weatherapi.com/v1/forecast.json',
              params,
            ),
          'hourly-forecast',
          WEATHER_HOURLY_FORECAST_CACHE_TTL,
          cacheVariant,
        );
      }

      case 'visualCrossing':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
                this.formatLocation(location, 'latitude-longitude'),
              )}/today/tomorrow`,
              new HttpParams()
                .set('key', key)
                .set(
                  'unitGroup',
                  options.unitSystem === 'imperial' ? 'us' : 'metric',
                )
                .set('include', 'hours')
                .set('contentType', 'json'),
            ),
          'hourly-forecast',
          WEATHER_HOURLY_FORECAST_CACHE_TTL,
          cacheVariant,
        );
    }
  }

  getWeatherAlerts<T = unknown>(
    location: WeatherLocation,
    options: WeatherRequestOptions = {},
  ): Observable<WeatherServiceResponse<T>> {
    const activeService = this.serviceConfig.getActiveWeatherService();
    if (!activeService) {
      return throwError(
        () => new Error('当前天气服务未配置有效的 API Key'),
      );
    }

    if (!this.isValidLocation(location)) {
      return throwError(() => new Error('天气查询位置不能为空'));
    }

    const { provider, key } = activeService;
    switch (provider) {
      case 'seniverse':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.seniverse.com/v3/weather/alarm.json',
              new HttpParams()
                .set('key', key)
                .set(
                  'location',
                  this.formatLocation(
                    location,
                    'latitude-colon-longitude',
                  ),
                ),
            ),
          'alerts',
          WEATHER_ALERT_CACHE_TTL,
        );

      case 'openWeather':
        return throwError(
          () => new WeatherFeatureUnsupportedError(provider, 'alerts'),
        );

      case 'weatherApi': {
        let params = new HttpParams()
          .set('key', key)
          .set('q', this.formatLocation(location, 'latitude-longitude'));
        params = this.withLanguage(params, options.language, 'lang');

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              'https://api.weatherapi.com/v1/alerts.json',
              params,
            ),
          'alerts',
          WEATHER_ALERT_CACHE_TTL,
        );
      }

      case 'visualCrossing':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          true,
          () =>
            this.request<T>(
              provider,
              `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
                this.formatLocation(location, 'latitude-longitude'),
              )}/today`,
              new HttpParams()
                .set('key', key)
                .set(
                  'unitGroup',
                  options.unitSystem === 'imperial' ? 'us' : 'metric',
                )
                .set('include', 'alerts')
                .set('contentType', 'json'),
            ),
          'alerts',
          WEATHER_ALERT_CACHE_TTL,
        );
    }
  }

  private getCurrentWeatherInternal<T = unknown>(
    location: WeatherLocation,
    options: WeatherRequestOptions,
    useCache: boolean,
  ): Observable<WeatherServiceResponse<T>> {
    const activeService = this.serviceConfig.getActiveWeatherService();
    if (!activeService) {
      return throwError(
        () => new Error('当前天气服务未配置有效的 API Key'),
      );
    }

    if (!this.isValidLocation(location)) {
      return throwError(() => new Error('天气查询位置不能为空'));
    }

    const { provider, key } = activeService;
    switch (provider) {
      case 'seniverse':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          useCache,
          () =>
            this.request<T>(
              provider,
              'https://api.seniverse.com/v3/weather/now.json',
              this.withLanguage(
                new HttpParams()
                  .set('key', key)
                  .set(
                    'location',
                    this.formatLocation(
                      location,
                      'latitude-colon-longitude',
                    ),
                  )
                  .set(
                    'unit',
                    options.unitSystem === 'imperial' ? 'f' : 'c',
                  ),
                options.language,
                'language',
              ),
            ),
        );

      case 'openWeather': {
        let params = new HttpParams()
          .set('appid', key)
          .set('units', options.unitSystem ?? 'metric');
        params = this.withLanguage(params, options.language, 'lang');
        params = this.isCoordinates(location)
          ? params
              .set('lat', String(location.latitude))
              .set('lon', String(location.longitude))
          : params.set('q', location.trim());

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          useCache,
          () =>
            this.request<T>(
              provider,
              'https://api.openweathermap.org/data/2.5/weather',
              params,
            ),
        );
      }

      case 'weatherApi': {
        let params = new HttpParams()
          .set('key', key)
          .set('q', this.formatLocation(location, 'latitude-longitude'));
        params = this.withLanguage(params, options.language, 'lang');
        if (options.includeAirQuality) params = params.set('aqi', 'yes');

        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          useCache,
          () =>
            this.request<T>(
              provider,
              'https://api.weatherapi.com/v1/current.json',
              params,
            ),
        );
      }

      case 'visualCrossing':
        return this.requestWithCoordinateCache<T>(
          provider,
          key,
          location,
          options,
          useCache,
          () =>
            this.request<T>(
              provider,
              `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
                this.formatLocation(location, 'latitude-longitude'),
              )}/today`,
              new HttpParams()
                .set('key', key)
                .set(
                  'unitGroup',
                  options.unitSystem === 'imperial' ? 'us' : 'metric',
                )
                .set('include', 'current')
                .set('contentType', 'json'),
            ),
        );
    }
  }

  validateCurrentService(): Observable<boolean> {
    return this.getCurrentWeatherInternal<Record<string, unknown>>(
      {
        latitude: 39.9042,
        longitude: 116.4074,
      },
      {},
      false,
    ).pipe(
      map(({ provider, data }) =>
        this.isValidationResponseSuccessful(provider, data),
      ),
      catchError(() => of(false)),
    );
  }

  private request<T>(
    provider: WeatherServiceProvider,
    url: string,
    params: HttpParams,
  ): Observable<WeatherServiceResponse<T>> {
    return this.http
      .get<T>(url, { params })
      .pipe(map((data) => ({ provider, data })));
  }

  private requestWithCoordinateCache<T>(
    provider: WeatherServiceProvider,
    apiKey: string,
    location: WeatherLocation,
    options: WeatherRequestOptions,
    useCache: boolean,
    requestFactory: () => Observable<WeatherServiceResponse<T>>,
    resource: WeatherCacheResource = 'current',
    cacheTtl = WEATHER_CACHE_TTL,
    requestVariant = '',
  ): Observable<WeatherServiceResponse<T>> {
    if (!useCache || !this.isCoordinates(location)) return requestFactory();

    const now = Date.now();
    this.removeExpiredCacheEntries(now);

    const cacheKey = this.createCacheKey(
      provider,
      apiKey,
      location,
      options,
      resource,
      requestVariant,
    );
    const cached = this.weatherCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.response$ as Observable<WeatherServiceResponse<T>>;
    }

    let cacheEntry!: WeatherCacheEntry;
    const response$ = defer(requestFactory).pipe(
      tap((response) => {
        if (this.weatherCache.get(cacheKey) !== cacheEntry) return;

        if (
          this.isResponseCacheable(resource, response.provider, response.data)
        ) {
          cacheEntry.expiresAt = Date.now() + cacheTtl;
        } else {
          this.weatherCache.delete(cacheKey);
        }
      }),
      catchError((error: unknown) => {
        if (this.weatherCache.get(cacheKey) === cacheEntry) {
          this.weatherCache.delete(cacheKey);
        }
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    cacheEntry = {
      expiresAt: now + cacheTtl,
      response$: response$ as Observable<WeatherServiceResponse<unknown>>,
    };
    this.weatherCache.set(cacheKey, cacheEntry);
    return response$;
  }

  private createCacheKey(
    provider: WeatherServiceProvider,
    apiKey: string,
    location: WeatherCoordinates,
    options: WeatherRequestOptions,
    resource: WeatherCacheResource,
    requestVariant: string,
  ): string {
    return JSON.stringify([
      resource,
      requestVariant,
      provider,
      apiKey,
      this.normalizeCacheCoordinate(location.latitude),
      this.normalizeCacheCoordinate(location.longitude),
      options.unitSystem ?? 'metric',
      options.language?.trim() ?? '',
      options.includeAirQuality === true,
    ]);
  }

  private normalizeCacheCoordinate(value: number): number {
    const normalized = Number(
      value.toFixed(WEATHER_CACHE_COORDINATE_PRECISION),
    );
    return Object.is(normalized, -0) ? 0 : normalized;
  }

  private removeExpiredCacheEntries(now: number): void {
    for (const [cacheKey, entry] of this.weatherCache) {
      if (now >= entry.expiresAt) this.weatherCache.delete(cacheKey);
    }
  }

  private normalizeForecastDays(
    provider: WeatherServiceProvider,
    requestedDays: number | undefined,
  ): number {
    const days = Number.isFinite(requestedDays)
      ? Math.trunc(requestedDays as number)
      : DEFAULT_FORECAST_DAYS;
    const maximumDays =
      provider === 'weatherApi' ? 14 : provider === 'openWeather' ? 5 : 15;
    return Math.min(maximumDays, Math.max(1, days));
  }

  private normalizeHourlyForecastHours(
    provider: WeatherServiceProvider,
    requestedHours: number | undefined,
  ): number {
    const hours = Number.isFinite(requestedHours)
      ? Math.trunc(requestedHours as number)
      : DEFAULT_HOURLY_FORECAST_HOURS;
    const maximumHours =
      provider === 'openWeather'
        ? 20
        : provider === 'seniverse'
          ? 24
          : 48;
    return Math.min(maximumHours, Math.max(1, hours));
  }

  private hourlyForecastCoordinatesRequired<T>(
    provider: WeatherServiceProvider,
  ): Observable<WeatherServiceResponse<T>> {
    return throwError(
      () =>
        new Error(
          `${provider} 小时预报接口需要使用经纬度查询位置`,
        ),
    );
  }

  private airQualityCoordinatesRequired<T>(
    provider: WeatherServiceProvider,
  ): Observable<WeatherServiceResponse<T>> {
    return throwError(
      () =>
        new Error(
          `${provider} air-quality 接口需要使用经纬度查询位置`,
        ),
    );
  }

  private withLanguage(
    params: HttpParams,
    language: string | undefined,
    parameterName: 'lang' | 'language',
  ): HttpParams {
    const normalizedLanguage = language?.trim();
    return normalizedLanguage
      ? params.set(parameterName, normalizedLanguage)
      : params;
  }

  private formatLocation(
    location: WeatherLocation,
    format:
      | 'latitude-longitude'
      | 'latitude-colon-longitude',
  ): string {
    if (!this.isCoordinates(location)) return location.trim();

    if (format === 'latitude-colon-longitude') {
      return `${location.latitude}:${location.longitude}`;
    }
    return `${location.latitude},${location.longitude}`;
  }

  private isCoordinates(location: WeatherLocation): location is WeatherCoordinates {
    return (
      typeof location !== 'string' &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude)
    );
  }

  private isValidLocation(location: WeatherLocation): boolean {
    return typeof location === 'string'
      ? Boolean(location.trim())
      : this.isCoordinates(location);
  }

  private isValidationResponseSuccessful(
    provider: WeatherServiceProvider,
    data: unknown,
  ): boolean {
    if (!this.isRecord(data)) return false;

    switch (provider) {
      case 'seniverse':
        return this.hasNestedFiniteNumber(
          data['results'],
          'now',
          ['temperature', 'temp'],
        );
      case 'openWeather': {
        const current = data['main'];
        return this.isRecord(current) && this.hasFiniteNumber(current, ['temp']);
      }
      case 'weatherApi': {
        const current = data['current'];
        return (
          this.isRecord(current) &&
          this.hasFiniteNumber(current, ['temp_c', 'temp_f'])
        );
      }
      case 'visualCrossing': {
        const current = data['currentConditions'];
        return this.isRecord(current) && this.hasFiniteNumber(current, ['temp']);
      }
    }
  }

  private isResponseCacheable(
    resource: WeatherCacheResource,
    provider: WeatherServiceProvider,
    data: unknown,
  ): boolean {
    if (resource === 'current') {
      return this.isValidationResponseSuccessful(provider, data);
    }
    if (resource === 'air-current') {
      return this.isAirQualityResponseCacheable(provider, data);
    }
    if (!this.isRecord(data)) return false;

    if (resource === 'hourly-forecast') {
      return this.isHourlyForecastResponseCacheable(provider, data);
    }

    if (resource === 'forecast') {
      switch (provider) {
        case 'seniverse':
          return this.hasNestedUsableForecastArray(
            data['results'],
            'daily',
            provider,
          );
        case 'openWeather':
          return this.hasUsableForecastArray(data['list'], provider);
        case 'weatherApi': {
          const forecast = data['forecast'];
          return (
            this.isRecord(forecast) &&
            this.hasUsableForecastArray(forecast['forecastday'], provider)
          );
        }
        case 'visualCrossing':
          return this.hasUsableForecastArray(data['days'], provider);
      }
    }
    switch (provider) {
      case 'seniverse':
        return this.isSeniverseAlertResponseCacheable(data['results']);
      case 'openWeather':
        return this.isAlertArrayCacheable(data['alerts']);
      case 'weatherApi': {
        const alerts = data['alerts'];
        return (
          this.isRecord(alerts) &&
          this.isAlertArrayCacheable(alerts['alert'])
        );
      }
      case 'visualCrossing':
        return this.isAlertArrayCacheable(data['alerts']);
    }
  }

  private isHourlyForecastResponseCacheable(
    provider: WeatherServiceProvider,
    data: Record<string, unknown>,
  ): boolean {
    switch (provider) {
      case 'seniverse':
        return this.hasNestedUsableHourlyForecastArray(
          data['results'],
          'hourly',
          provider,
        );

      case 'openWeather':
        return this.hasUsableHourlyForecastArray(data['data'], provider);

      case 'weatherApi': {
        const forecast = data['forecast'];
        if (!this.isRecord(forecast)) return false;
        return this.hasNestedUsableHourlyForecastArray(
          forecast['forecastday'],
          'hour',
          provider,
        );
      }

      case 'visualCrossing':
        return this.hasNestedUsableHourlyForecastArray(
          data['days'],
          'hours',
          provider,
        );
    }
  }

  private isAirQualityResponseCacheable(
    provider: WeatherServiceProvider,
    data: unknown,
  ): boolean {
    if (!this.isRecord(data)) return false;

    switch (provider) {
      case 'seniverse': {
        const results = data['results'];
        return (
          Array.isArray(results) &&
          results.some((result) => {
            if (!this.isRecord(result)) return false;
            const air = result['air'];
            if (!this.isRecord(air)) return false;
            return this.isUsableAirQualityRecord(provider, air['city']);
          })
        );
      }

      case 'openWeather': {
        const list = data['list'];
        return (
          Array.isArray(list) &&
          list.some((item) =>
            this.isUsableAirQualityRecord(provider, item),
          )
        );
      }

      case 'weatherApi': {
        const current = data['current'];
        return (
          this.isRecord(current) &&
          this.isUsableAirQualityRecord(provider, current['air_quality'])
        );
      }

      case 'visualCrossing':
        return this.isUsableAirQualityRecord(
          provider,
          data['currentConditions'],
        );
    }
  }

  private isUsableAirQualityRecord(
    provider: WeatherServiceProvider,
    value: unknown,
  ): boolean {
    if (!this.isRecord(value)) return false;

    switch (provider) {
      case 'seniverse':
        return (
          this.hasFiniteNumber(value, [
            'aqi',
            'pm25',
            'pm10',
            'so2',
            'no2',
            'co',
            'o3',
          ]) ||
          this.hasNonEmptyValue(value, ['quality', 'primary_pollutant'])
        );

      case 'openWeather': {
        const main = value['main'];
        const components = value['components'];
        return (
          (this.isRecord(main) && this.hasOpenWeatherAirQualityIndex(main)) ||
          (this.isRecord(components) &&
            this.hasFiniteNumber(components, [
              'co',
              'no',
              'no2',
              'o3',
              'so2',
              'pm2_5',
              'pm10',
              'nh3',
            ]))
        );
      }

      case 'weatherApi':
        return this.hasFiniteNumber(value, [
          'co',
          'no2',
          'o3',
          'so2',
          'pm2_5',
          'pm10',
          'us-epa-index',
          'gb-defra-index',
        ]);

      case 'visualCrossing':
        return this.hasFiniteNumber(value, [
          'aqius',
          'aqieur',
          'pm1',
          'pm2p5',
          'pm10',
          'o3',
          'no2',
          'so2',
          'co',
        ]);
    }
  }

  private hasOpenWeatherAirQualityIndex(
    value: Record<string, unknown>,
  ): boolean {
    const candidate = value['aqi'];
    if (
      typeof candidate !== 'number' &&
      (typeof candidate !== 'string' || !candidate.trim())
    ) {
      return false;
    }
    const aqi = Number(candidate);
    return Number.isInteger(aqi) && aqi >= 1 && aqi <= 5;
  }

  private hasNestedFiniteNumber(
    value: unknown,
    property: string,
    numberProperties: string[],
  ): boolean {
    return (
      Array.isArray(value) &&
      value.some(
        (item) => {
          if (!this.isRecord(item)) return false;
          const nested = item[property];
          return (
            this.isRecord(nested) &&
            this.hasFiniteNumber(nested, numberProperties)
          );
        },
      )
    );
  }

  private hasFiniteNumber(
    value: Record<string, unknown>,
    properties: string[],
  ): boolean {
    return properties.some((property) => {
      const candidate = value[property];
      if (
        typeof candidate !== 'number' &&
        (typeof candidate !== 'string' || !candidate.trim())
      ) {
        return false;
      }
      return Number.isFinite(Number(candidate));
    });
  }

  private hasNestedUsableHourlyForecastArray(
    value: unknown,
    property: string,
    provider: WeatherServiceProvider,
  ): boolean {
    return (
      Array.isArray(value) &&
      value.some(
        (item) =>
          this.isRecord(item) &&
          this.hasUsableHourlyForecastArray(item[property], provider),
      )
    );
  }

  private hasUsableHourlyForecastArray(
    value: unknown,
    provider: WeatherServiceProvider,
  ): boolean {
    return (
      Array.isArray(value) &&
      value.some((item) =>
        this.isUsableHourlyForecastRecord(provider, item),
      )
    );
  }

  private isUsableHourlyForecastRecord(
    provider: WeatherServiceProvider,
    value: unknown,
  ): boolean {
    if (!this.isRecord(value)) return false;

    switch (provider) {
      case 'seniverse':
        return (
          this.hasHourlyTimeValue(value, ['time', 'datetime']) &&
          (this.hasFiniteNumber(value, [
            'code',
            'temperature',
            'temperature_from',
            'temperature_to',
            'humidity',
            'precip',
            'rainfall',
            'wind_direction_degree',
            'wind_speed',
          ]) ||
            this.hasNonEmptyValue(value, [
              'text',
              'wind_direction',
              'wind_scale',
            ]))
        );

      case 'openWeather': {
        const wind = this.isRecord(value['wind']) ? value['wind'] : null;
        const rain = this.isRecord(value['rain']) ? value['rain'] : null;
        const snow = this.isRecord(value['snow']) ? value['snow'] : null;
        return (
          this.hasHourlyTimeValue(value, ['dt', 'datetime']) &&
          (this.hasFiniteNumber(value, [
            'temp',
            'feels_like',
            'pressure',
            'humidity',
            'dew_point',
            'uvi',
            'clouds',
            'visibility',
            'wind_speed',
            'wind_deg',
            'wind_gust',
            'pop',
          ]) ||
            (wind !== null &&
              this.hasFiniteNumber(wind, ['speed', 'deg', 'gust'])) ||
            (rain !== null && this.hasFiniteNumber(rain, ['1h'])) ||
            (snow !== null && this.hasFiniteNumber(snow, ['1h'])) ||
            this.hasUsableWeatherCondition(value['weather']))
        );
      }

      case 'weatherApi': {
        const condition = this.isRecord(value['condition'])
          ? value['condition']
          : null;
        return (
          this.hasHourlyTimeValue(value, ['time_epoch', 'time']) &&
          (this.hasFiniteNumber(value, [
            'temp_c',
            'temp_f',
            'feelslike_c',
            'feelslike_f',
            'wind_mph',
            'wind_kph',
            'wind_degree',
            'pressure_mb',
            'pressure_in',
            'precip_mm',
            'precip_in',
            'humidity',
            'cloud',
            'will_it_rain',
            'chance_of_rain',
            'will_it_snow',
            'chance_of_snow',
            'vis_km',
            'vis_miles',
            'gust_mph',
            'gust_kph',
            'uv',
          ]) ||
            this.hasNonEmptyValue(value, ['wind_dir']) ||
            (condition !== null &&
              (this.hasNonEmptyValue(condition, ['text', 'icon']) ||
                this.hasFiniteNumber(condition, ['code']))))
        );
      }

      case 'visualCrossing':
        return (
          this.hasHourlyTimeValue(value, ['datetimeEpoch', 'datetime']) &&
          (this.hasFiniteNumber(value, [
            'temp',
            'feelslike',
            'humidity',
            'dew',
            'precip',
            'precipprob',
            'snow',
            'snowdepth',
            'windgust',
            'windspeed',
            'winddir',
            'pressure',
            'visibility',
            'cloudcover',
            'solarradiation',
            'solarenergy',
            'uvindex',
          ]) ||
            this.hasNonEmptyValue(value, [
              'conditions',
              'description',
              'icon',
            ]))
        );
    }
  }

  private hasUsableWeatherCondition(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.some(
        (condition) =>
          this.isRecord(condition) &&
          (this.hasNonEmptyValue(condition, [
            'main',
            'description',
            'icon',
          ]) ||
            this.hasFiniteNumber(condition, ['id'])),
      )
    );
  }

  private hasHourlyTimeValue(
    value: Record<string, unknown>,
    properties: string[],
  ): boolean {
    if (this.hasDateValue(value, properties)) return true;

    return properties.some((property) => {
      const candidate = value[property];
      if (typeof candidate !== 'string') return false;
      const clock = candidate.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!clock) return false;
      const hour = Number(clock[1]);
      const minute = Number(clock[2]);
      const second = clock[3] === undefined ? 0 : Number(clock[3]);
      return hour <= 23 && minute <= 59 && second <= 59;
    });
  }

  private hasNestedUsableForecastArray(
    value: unknown,
    property: string,
    provider: WeatherServiceProvider,
  ): boolean {
    return (
      Array.isArray(value) &&
      value.some(
        (item) => {
          return (
            this.isRecord(item) &&
            this.hasUsableForecastArray(item[property], provider)
          );
        },
      )
    );
  }

  private hasUsableForecastArray(
    value: unknown,
    provider: WeatherServiceProvider,
  ): boolean {
    return (
      Array.isArray(value) &&
      value.some((item) => this.isUsableForecastRecord(provider, item))
    );
  }

  private isUsableForecastRecord(
    provider: WeatherServiceProvider,
    value: unknown,
  ): boolean {
    if (!this.isRecord(value)) return false;

    switch (provider) {
      case 'seniverse':
        return (
          this.hasDateValue(value, ['date']) &&
          (this.hasFiniteNumber(value, [
            'code_day',
            'code_night',
            'high',
            'low',
            'precip',
            'rainfall',
            'humidity',
            'wind_direction_degree',
            'wind_speed',
          ]) ||
            this.hasNonEmptyValue(value, [
              'text_day',
              'text_night',
              'wind_direction',
              'wind_scale',
            ]))
        );

      case 'openWeather': {
        const main = this.isRecord(value['main']) ? value['main'] : null;
        const temperature = this.isRecord(value['temp'])
          ? value['temp']
          : null;
        const wind = this.isRecord(value['wind']) ? value['wind'] : null;
        const rain = this.isRecord(value['rain']) ? value['rain'] : null;
        const snow = this.isRecord(value['snow']) ? value['snow'] : null;
        const weather = value['weather'];
        return (
          this.hasDateValue(value, ['dt', 'dt_txt', 'date', 'datetime']) &&
          ((main !== null &&
            this.hasFiniteNumber(main, [
              'temp',
              'temp_min',
              'temp_max',
              'humidity',
            ])) ||
            (temperature !== null &&
              this.hasFiniteNumber(temperature, ['min', 'max', 'day', 'night'])) ||
            this.hasFiniteNumber(value, [
              'temp_min',
              'temp_max',
              'humidity',
              'pop',
              'rain',
              'snow',
              'wind_speed',
              'wind_deg',
            ]) ||
            (wind !== null &&
              this.hasFiniteNumber(wind, ['speed', 'deg', 'gust'])) ||
            (rain !== null && this.hasFiniteNumber(rain, ['1h', '3h'])) ||
            (snow !== null && this.hasFiniteNumber(snow, ['1h', '3h'])) ||
            (Array.isArray(weather) &&
              weather.some(
                (item) =>
                  this.isRecord(item) &&
                  (this.hasNonEmptyValue(item, [
                    'main',
                    'description',
                    'icon',
                  ]) ||
                    this.hasFiniteNumber(item, ['id'])),
              )))
        );
      }

      case 'weatherApi': {
        const day = this.isRecord(value['day']) ? value['day'] : null;
        const condition = this.isRecord(day?.['condition'])
          ? day['condition']
          : null;
        return (
          this.hasDateValue(value, ['date', 'date_epoch']) &&
          ((day !== null &&
            this.hasFiniteNumber(day, [
              'maxtemp_c',
              'maxtemp_f',
              'mintemp_c',
              'mintemp_f',
              'totalprecip_mm',
              'totalprecip_in',
              'daily_chance_of_rain',
              'daily_chance_of_snow',
              'avghumidity',
              'maxwind_kph',
              'maxwind_mph',
            ])) ||
            (condition !== null &&
              (this.hasNonEmptyValue(condition, ['text']) ||
                this.hasFiniteNumber(condition, ['code']))) ||
            (Array.isArray(value['hour']) &&
              value['hour'].some((item) => {
                if (!this.isRecord(item)) return false;
                const hourCondition = this.isRecord(item['condition'])
                  ? item['condition']
                  : null;
                return (
                  this.hasFiniteNumber(item, [
                    'wind_kph',
                    'wind_mph',
                    'wind_degree',
                  ]) ||
                  this.hasNonEmptyValue(item, ['wind_dir']) ||
                  (hourCondition !== null &&
                    (this.hasNonEmptyValue(hourCondition, ['text']) ||
                      this.hasFiniteNumber(hourCondition, ['code'])))
                );
              })))
        );
      }

      case 'visualCrossing':
        return (
          this.hasDateValue(value, ['datetime', 'datetimeEpoch']) &&
          (this.hasFiniteNumber(value, [
            'tempmax',
            'tempmin',
            'precipprob',
            'precip',
            'humidity',
            'winddir',
            'windspeed',
          ]) ||
            this.hasNonEmptyValue(value, [
              'conditions',
              'description',
              'icon',
              'wind_direction',
              'wind_scale',
            ]))
        );
    }
  }

  private isSeniverseAlertResponseCacheable(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return true;

    let hasAlarmArray = false;
    let rawAlarmCount = 0;
    for (const result of value) {
      if (!this.isRecord(result) || !Array.isArray(result['alarms'])) continue;
      hasAlarmArray = true;
      rawAlarmCount += result['alarms'].length;
      if (result['alarms'].some((alarm) => this.isUsableAlertRecord(alarm))) {
        return true;
      }
    }
    return hasAlarmArray && rawAlarmCount === 0;
  }

  private isAlertArrayCacheable(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      (value.length === 0 ||
        value.some((alert) => this.isUsableAlertRecord(alert)))
    );
  }

  private isUsableAlertRecord(value: unknown): boolean {
    return (
      this.isRecord(value) &&
      this.hasNonEmptyValue(value, [
        'title',
        'headline',
        'event',
        'type',
        'description',
        'desc',
        'note',
        'instruction',
        'advice',
        'recommendation',
      ])
    );
  }

  private hasDateValue(
    value: Record<string, unknown>,
    properties: string[],
  ): boolean {
    return properties.some((property) => {
      const candidate = value[property];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        const milliseconds = Math.abs(candidate) < 1_000_000_000_000
          ? candidate * 1000
          : candidate;
        return Number.isFinite(new Date(milliseconds).getTime());
      }
      if (typeof candidate !== 'string' || !candidate.trim()) return false;
      const text = candidate.trim();
      const calendarDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (calendarDate) {
        const year = Number(calendarDate[1]);
        const month = Number(calendarDate[2]) - 1;
        const day = Number(calendarDate[3]);
        const date = new Date(Date.UTC(year, month, day));
        return (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month &&
          date.getUTCDate() === day
        );
      }
      if (/^-?\d+(?:\.\d+)?$/.test(text)) {
        const numeric = Number(text);
        const milliseconds = Math.abs(numeric) < 1_000_000_000_000
          ? numeric * 1000
          : numeric;
        return Number.isFinite(new Date(milliseconds).getTime());
      }
      return Number.isFinite(Date.parse(text));
    });
  }

  private hasNonEmptyValue(
    value: Record<string, unknown>,
    properties: string[],
  ): boolean {
    return properties.some((property) => {
      const candidate = value[property];
      return (
        (typeof candidate === 'string' && Boolean(candidate.trim())) ||
        (typeof candidate === 'number' && Number.isFinite(candidate))
      );
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
