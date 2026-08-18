import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  EMPTY_WEATHER_SERVICE_KEYS,
  ThirdPartyServicesService,
  WeatherServiceProvider,
} from './third-party-services.service';
import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let config: ThirdPartyServicesService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        ThirdPartyServicesService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(WeatherService);
    config = TestBed.inject(ThirdPartyServicesService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('formats coordinates and authentication for Seniverse', () => {
    selectProvider('seniverse');

    service
      .getCurrentWeather(
        { latitude: 39.9, longitude: 116.4 },
        { language: 'zh-Hans' },
      )
      .subscribe();

    const request = httpTesting.expectOne(
      'https://api.seniverse.com/v3/weather/now.json?key=test-key&location=39.9:116.4&unit=c&language=zh-Hans',
    );
    request.flush({ results: [] });
  });

  it('uses coordinates and metric units for OpenWeather', () => {
    selectProvider('openWeather');

    service
      .getCurrentWeather({ latitude: 39.9, longitude: 116.4 })
      .subscribe();

    const request = httpTesting.expectOne(
      'https://api.openweathermap.org/data/2.5/weather?appid=test-key&units=metric&lat=39.9&lon=116.4',
    );
    request.flush({ weather: [] });
  });

  it('uses the selected WeatherAPI key', () => {
    selectProvider('weatherApi');

    service.getCurrentWeather('Beijing').subscribe();

    const request = httpTesting.expectOne(
      'https://api.weatherapi.com/v1/current.json?key=test-key&q=Beijing',
    );
    request.flush({ current: {} });
  });

  it('requests only current Visual Crossing conditions', () => {
    selectProvider('visualCrossing');

    service.getCurrentWeather('Beijing, China').subscribe();

    const request = httpTesting.expectOne(
      'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Beijing%2C%20China/today?key=test-key&unitGroup=metric&include=current&contentType=json',
    );
    request.flush({ currentConditions: {} });
  });

  it('fails before making a request when the selected key is empty', () => {
    config.saveWeatherServiceConfig({
      selectedProvider: 'weatherApi',
      keys: { ...EMPTY_WEATHER_SERVICE_KEYS, seniverse: 'unused-key' },
    });

    let message = '';
    service
      .getCurrentWeather('Beijing')
      .subscribe({ error: (error: Error) => (message = error.message) });

    expect(message).toContain('未配置有效的 API Key');
    httpTesting.expectNone(() => true);
  });

  it('validates a successful current weather response', () => {
    selectProvider('weatherApi');

    let isValid: boolean | undefined;
    service
      .validateCurrentService()
      .subscribe((result) => (isValid = result));

    const request = httpTesting.expectOne(
      'https://api.weatherapi.com/v1/current.json?key=test-key&q=39.9042,116.4074',
    );
    request.flush({ current: { temp_c: 25 } });

    expect(isValid).toBe(true);
  });

  it('reports validation failure for an unsuccessful provider response', () => {
    selectProvider('openWeather');

    let isValid: boolean | undefined;
    service
      .validateCurrentService()
      .subscribe((result) => (isValid = result));

    const request = httpTesting.expectOne(
      'https://api.openweathermap.org/data/2.5/weather?appid=test-key&units=metric&lat=39.9042&lon=116.4074',
    );
    request.flush({ cod: 401, message: 'Invalid API key' });

    expect(isValid).toBe(false);
  });

  function selectProvider(provider: WeatherServiceProvider): void {
    config.saveWeatherServiceConfig({
      selectedProvider: provider,
      keys: { ...EMPTY_WEATHER_SERVICE_KEYS, [provider]: 'test-key' },
    });
  }
});
