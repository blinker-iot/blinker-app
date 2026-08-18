import {
  HttpBackend,
  HttpClient,
  HttpParams,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
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
}

export interface WeatherServiceResponse<T = unknown> {
  provider: WeatherServiceProvider;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  private readonly http: HttpClient;

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
        return this.request<T>(
          provider,
          'https://api.seniverse.com/v3/weather/now.json',
          this.withLanguage(
            new HttpParams()
              .set('key', key)
              .set(
                'location',
                this.formatLocation(location, 'latitude-colon-longitude'),
              )
              .set('unit', options.unitSystem === 'imperial' ? 'f' : 'c'),
            options.language,
            'language',
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

        return this.request<T>(
          provider,
          'https://api.openweathermap.org/data/2.5/weather',
          params,
        );
      }

      case 'weatherApi':
        return this.request<T>(
          provider,
          'https://api.weatherapi.com/v1/current.json',
          this.withLanguage(
            new HttpParams()
              .set('key', key)
              .set('q', this.formatLocation(location, 'latitude-longitude')),
            options.language,
            'lang',
          ),
        );

      case 'visualCrossing':
        return this.request<T>(
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
        );
    }
  }

  validateCurrentService(): Observable<boolean> {
    return this.getCurrentWeather<Record<string, unknown>>({
      latitude: 39.9042,
      longitude: 116.4074,
    }).pipe(
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
        return Array.isArray(data['results']);
      case 'openWeather':
        return String(data['cod']) === '200' || this.isRecord(data['main']);
      case 'weatherApi':
        return this.isRecord(data['current']);
      case 'visualCrossing':
        return this.isRecord(data['currentConditions']);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
