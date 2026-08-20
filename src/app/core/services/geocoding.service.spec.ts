import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  EMPTY_GEOLOCATION_SERVICE_KEYS,
  GeolocationServiceProvider,
  ThirdPartyServicesService,
} from './third-party-services.service';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let config: ThirdPartyServicesService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        GeocodingService,
        ThirdPartyServicesService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(GeocodingService);
    config = TestBed.inject(ThirdPartyServicesService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('uses the selected Tianditu key', () => {
    selectProvider('tianditu');

    service.geocode('北京大学', { limit: 8 }).subscribe();

    const request = httpTesting.expectOne(
      (item) => item.url === 'https://api.tianditu.gov.cn/v2/search'
    );
    expect(request.request.params.get('tk')).toBe('test-key');
    expect(request.request.params.get('type')).toBe('query');
    expect(
      JSON.parse(request.request.params.get('postStr') ?? '{}')
    ).toMatchObject({ keyWord: '北京大学', count: 8 });
    request.flush({ pois: [] });
  });

  it('uses the selected Geoapify key', () => {
    selectProvider('geoapify');

    service.geocode('上海', { language: 'zh', limit: 3 }).subscribe();

    const request = httpTesting.expectOne(
      'https://api.geoapify.com/v1/geocode/search?text=%E4%B8%8A%E6%B5%B7&format=json&limit=3&apiKey=test-key&lang=zh'
    );
    request.flush({ results: [] });
  });

  it('uses the selected LocationIQ access token', () => {
    selectProvider('locationIq');

    service.geocode('Shanghai').subscribe();

    const request = httpTesting.expectOne(
      'https://us1.locationiq.com/v1/search?key=test-key&q=Shanghai&format=json&limit=5&addressdetails=1&normalizeaddress=1'
    );
    request.flush([]);
  });

  it('fails before making a request when the selected key is empty', () => {
    config.saveGeolocationServiceConfig({
      selectedProvider: 'tianditu',
      keys: {
        ...EMPTY_GEOLOCATION_SERVICE_KEYS,
        geoapify: 'unused-key',
      },
    });

    let message = '';
    service
      .geocode('Shanghai')
      .subscribe({ error: (error: Error) => (message = error.message) });

    expect(message).toContain('未配置有效的 API Key');
    httpTesting.expectNone(() => true);
  });

  it('validates a successful geocoding response', () => {
    selectProvider('geoapify');

    let isValid: boolean | undefined;
    service.validateCurrentService().subscribe((result) => (isValid = result));

    const request = httpTesting.expectOne(
      (item) =>
        item.url === 'https://api.geoapify.com/v1/geocode/search' &&
        item.params.get('text') === '北京市'
    );
    request.flush({ results: [] });

    expect(isValid).toBe(true);
  });

  it('reports validation failure for a rejected geocoding key', () => {
    selectProvider('geoapify');

    let isValid: boolean | undefined;
    service.validateCurrentService().subscribe((result) => (isValid = result));

    const request = httpTesting.expectOne(
      (item) =>
        item.url === 'https://api.geoapify.com/v1/geocode/search' &&
        item.params.get('text') === '北京市'
    );
    request.flush(
      { message: 'invalid API key' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(isValid).toBe(false);
  });

  function selectProvider(provider: GeolocationServiceProvider): void {
    config.saveGeolocationServiceConfig({
      selectedProvider: provider,
      keys: { ...EMPTY_GEOLOCATION_SERVICE_KEYS, [provider]: 'test-key' },
    });
  }
});
