import { HttpBackend, HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import {
  GeolocationServiceProvider,
  ThirdPartyServicesService,
} from './third-party-services.service';

export interface GeocodingRequestOptions {
  language?: string;
  limit?: number;
}

export interface GeocodingServiceResponse<T = unknown> {
  provider: GeolocationServiceProvider;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class GeocodingService {
  private readonly http: HttpClient;

  constructor(
    httpBackend: HttpBackend,
    private readonly serviceConfig: ThirdPartyServicesService
  ) {
    this.http = new HttpClient(httpBackend);
  }

  geocode<T = unknown>(
    address: string,
    options: GeocodingRequestOptions = {}
  ): Observable<GeocodingServiceResponse<T>> {
    const activeService = this.serviceConfig.getActiveGeolocationService();
    if (!activeService) {
      return throwError(
        () => new Error('当前地理信息服务未配置有效的 API Key')
      );
    }

    const query = address.trim();
    if (!query) {
      return throwError(() => new Error('地理信息查询地址不能为空'));
    }

    const limit = this.normalizeLimit(options.limit);
    const language = options.language?.trim();
    const { provider, key } = activeService;

    switch (provider) {
      case 'tianditu':
        return this.request<T>(
          provider,
          'https://api.tianditu.gov.cn/v2/search',
          new HttpParams()
            .set(
              'postStr',
              JSON.stringify({
                keyWord: query,
                level: 12,
                mapBound: '-180,-90,180,90',
                queryType: 1,
                start: 0,
                count: limit,
              })
            )
            .set('type', 'query')
            .set('tk', key)
        );

      case 'geoapify': {
        let params = new HttpParams()
          .set('text', query)
          .set('format', 'json')
          .set('limit', limit)
          .set('apiKey', key);
        if (language) params = params.set('lang', language);
        return this.request<T>(
          provider,
          'https://api.geoapify.com/v1/geocode/search',
          params
        );
      }

      case 'locationIq': {
        let params = new HttpParams()
          .set('key', key)
          .set('q', query)
          .set('format', 'json')
          .set('limit', limit)
          .set('addressdetails', '1')
          .set('normalizeaddress', '1');
        if (language) {
          params = params.set('accept-language', language);
        }
        return this.request<T>(
          provider,
          'https://us1.locationiq.com/v1/search',
          params
        );
      }
    }
  }

  validateCurrentService(): Observable<boolean> {
    return this.geocode<unknown>('北京市', { limit: 1 }).pipe(
      map(({ provider, data }) =>
        this.isValidationResponseSuccessful(provider, data)
      ),
      catchError(() => of(false))
    );
  }

  private request<T>(
    provider: GeolocationServiceProvider,
    url: string,
    params: HttpParams
  ): Observable<GeocodingServiceResponse<T>> {
    return this.http
      .get<T>(url, { params })
      .pipe(map((data) => ({ provider, data })));
  }

  private normalizeLimit(limit?: number): number {
    if (!Number.isFinite(limit)) return 5;
    return Math.min(20, Math.max(1, Math.trunc(limit as number)));
  }

  private isValidationResponseSuccessful(
    provider: GeolocationServiceProvider,
    data: unknown
  ): boolean {
    switch (provider) {
      case 'tianditu': {
        if (!this.isRecord(data)) return false;
        const status = this.isRecord(data['status']) ? data['status'] : null;
        if (status && status['infocode'] !== undefined) {
          return String(status['infocode']) === '1000';
        }
        return (
          data['count'] !== undefined ||
          data['resultType'] !== undefined ||
          Array.isArray(data['pois'])
        );
      }
      case 'geoapify':
        return this.isRecord(data) && Array.isArray(data['results']);
      case 'locationIq':
        return Array.isArray(data);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
