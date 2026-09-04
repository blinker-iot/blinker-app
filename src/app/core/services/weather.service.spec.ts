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
import {
  WeatherFeatureUnsupportedError,
  WeatherService,
} from './weather.service';

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
    vi.restoreAllMocks();
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

  it('can request WeatherAPI air-quality fields for rich weather widgets', () => {
    selectProvider('weatherApi');

    service
      .getCurrentWeather('Beijing', {
        language: 'zh',
        includeAirQuality: true,
      })
      .subscribe();

    const request = httpTesting.expectOne(
      'https://api.weatherapi.com/v1/current.json?key=test-key&q=Beijing&lang=zh&aqi=yes',
    );
    request.flush({ current: { air_quality: {} } });
  });

  it('requests only current Visual Crossing conditions', () => {
    selectProvider('visualCrossing');

    service.getCurrentWeather('Beijing, China').subscribe();

    const request = httpTesting.expectOne(
      'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Beijing%2C%20China/today?key=test-key&unitGroup=metric&include=current&contentType=json',
    );
    request.flush({ currentConditions: {} });
  });

  it('requests a Seniverse daily forecast with the requested day count', () => {
    selectProvider('seniverse');

    service
      .getWeatherForecast(
        { latitude: 39.9, longitude: 116.4 },
        { language: 'zh-Hans', days: 3 },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.seniverse.com/v3/weather/daily.json?key=test-key&location=39.9:116.4&unit=c&start=0&days=3&language=zh-Hans',
      )
      .flush({
        results: [
          { daily: [{ date: '2026-08-20', text_day: '晴', high: '28' }] },
        ],
      });
  });

  it('requests OpenWeather forecast slots for the requested day count', () => {
    selectProvider('openWeather');

    service
      .getWeatherForecast(
        { latitude: 39.9, longitude: 116.4 },
        { days: 3 },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.openweathermap.org/data/2.5/forecast?appid=test-key&units=metric&cnt=24&lat=39.9&lon=116.4',
      )
      .flush({ cod: '200', list: [{ dt: 1, main: { temp: 25 } }] });
  });

  it('requests WeatherAPI forecast data and rich optional fields', () => {
    selectProvider('weatherApi');

    service
      .getWeatherForecast(
        { latitude: 39.9, longitude: 116.4 },
        { days: 7, language: 'zh', includeAirQuality: true },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.weatherapi.com/v1/forecast.json?key=test-key&q=39.9,116.4&days=7&lang=zh&aqi=yes',
      )
      .flush({
        forecast: {
          forecastday: [{ date: '2026-08-20', day: { maxtemp_c: 28 } }],
        },
      });
  });

  it('requests Visual Crossing daily forecast data', () => {
    selectProvider('visualCrossing');

    service
      .getWeatherForecast('Beijing, China', {
        days: 5,
        unitSystem: 'imperial',
      })
      .subscribe();

    httpTesting
      .expectOne(
        'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Beijing%2C%20China/next5days?key=test-key&unitGroup=us&include=days&contentType=json',
      )
      .flush({ days: [{ datetime: '2026-08-20', tempmax: 82 }] });
  });

  it('requests a rollover slot for the next three Seniverse hours', () => {
    selectProvider('seniverse');

    service
      .getHourlyWeatherForecast(
        { latitude: 39.9, longitude: 116.4 },
        { language: 'zh-Hans' },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.seniverse.com/v3/weather/hourly.json?key=test-key&location=39.9:116.4&unit=c&start=1&hours=4&language=zh-Hans',
      )
      .flush(SENIVERSE_HOURLY_FORECAST_RESPONSE);
  });

  it('requests the OpenWeather One Call 4.0 one-hour timeline', () => {
    selectProvider('openWeather');

    service
      .getHourlyWeatherForecast(
        { latitude: 39.9, longitude: 116.4 },
        { hours: 3, language: 'zh_cn', unitSystem: 'imperial' },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.openweathermap.org/data/4.0/onecall/timeline/1h?lat=39.9&lon=116.4&units=imperial&lang=zh_cn&appid=test-key',
      )
      .flush(OPEN_WEATHER_HOURLY_FORECAST_RESPONSE);
  });

  it('requires coordinates for OpenWeather hourly forecasts', () => {
    selectProvider('openWeather');
    const errors: Error[] = [];

    service
      .getHourlyWeatherForecast('Beijing')
      .subscribe({ error: (error: Error) => errors.push(error) });

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('经纬度');
    httpTesting.expectNone(() => true);
  });

  it('requests two WeatherAPI forecast days for cross-midnight hours', () => {
    selectProvider('weatherApi');

    service
      .getHourlyWeatherForecast(
        { latitude: 39.9, longitude: 116.4 },
        { hours: 3, language: 'zh', includeAirQuality: true },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.weatherapi.com/v1/forecast.json?key=test-key&q=39.9,116.4&days=2&lang=zh&aqi=yes',
      )
      .flush(WEATHER_API_HOURLY_FORECAST_RESPONSE);
  });

  it('requests today and tomorrow Visual Crossing hours', () => {
    selectProvider('visualCrossing');

    service
      .getHourlyWeatherForecast('Beijing, China', {
        hours: 3,
        unitSystem: 'imperial',
      })
      .subscribe();

    httpTesting
      .expectOne(
        'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Beijing%2C%20China/today/tomorrow?key=test-key&unitGroup=us&include=hours&contentType=json',
      )
      .flush(VISUAL_CROSSING_HOURLY_FORECAST_RESPONSE);
  });

  it('requests Seniverse weather alerts', () => {
    selectProvider('seniverse');

    service
      .getWeatherAlerts(
        { latitude: 39.9, longitude: 116.4 },
        { language: 'zh-Hans' },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.seniverse.com/v3/weather/alarm.json?key=test-key&location=39.9:116.4',
      )
      .flush({ results: [{ alarms: [] }] });
  });

  it('requests WeatherAPI alerts', () => {
    selectProvider('weatherApi');

    service.getWeatherAlerts('Beijing', { language: 'zh' }).subscribe();

    httpTesting
      .expectOne(
        'https://api.weatherapi.com/v1/alerts.json?key=test-key&q=Beijing&lang=zh',
      )
      .flush({ alerts: { alert: [] } });
  });

  it('requests Visual Crossing alerts', () => {
    selectProvider('visualCrossing');

    service
      .getWeatherAlerts({ latitude: 39.9, longitude: 116.4 })
      .subscribe();

    httpTesting
      .expectOne(
        'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/39.9%2C116.4/today?key=test-key&unitGroup=metric&include=alerts&contentType=json',
      )
      .flush({ alerts: [] });
  });

  it('reports OpenWeather alerts as unsupported without making a request', () => {
    selectProvider('openWeather');
    let receivedError: unknown;

    service
      .getWeatherAlerts({ latitude: 39.9, longitude: 116.4 })
      .subscribe({ error: (error: unknown) => (receivedError = error) });

    expect(receivedError).toBeInstanceOf(WeatherFeatureUnsupportedError);
    expect((receivedError as WeatherFeatureUnsupportedError).code).toBe(
      'WEATHER_FEATURE_UNSUPPORTED',
    );
    httpTesting.expectNone(() => true);
  });

  it('requests city-level Seniverse air quality data', () => {
    selectProvider('seniverse');

    service
      .getAirQuality(
        { latitude: 39.9, longitude: 116.4 },
        { language: 'zh-Hans' },
      )
      .subscribe();

    httpTesting
      .expectOne(
        'https://api.seniverse.com/v3/air/now.json?key=test-key&location=39.9:116.4&scope=city&language=zh-Hans',
      )
      .flush(SENIVERSE_AIR_CURRENT_RESPONSE);
  });

  it('requests OpenWeather current air pollution by coordinates', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getAirQuality(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_AIR_CURRENT_URL)
      .flush(OPEN_WEATHER_AIR_CURRENT_RESPONSE);
  });

  it('requires coordinates for OpenWeather air pollution requests', () => {
    selectProvider('openWeather');
    const errors: Error[] = [];

    service
      .getAirQuality('Beijing')
      .subscribe({ error: (error: Error) => errors.push(error) });

    expect(errors).toHaveLength(1);
    expect(errors.every((error) => error.message.includes('经纬度'))).toBe(
      true,
    );
    httpTesting.expectNone(() => true);
  });

  it('requests WeatherAPI current air-quality fields', () => {
    selectProvider('weatherApi');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service
      .getAirQuality(coordinates, { language: 'zh' })
      .subscribe();
    httpTesting
      .expectOne(
        'https://api.weatherapi.com/v1/current.json?key=test-key&q=39.9,116.4&aqi=yes&lang=zh',
      )
      .flush(WEATHER_API_AIR_CURRENT_RESPONSE);
  });

  it('requests only Visual Crossing air-quality elements', () => {
    selectProvider('visualCrossing');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getAirQuality(coordinates).subscribe();
    httpTesting
      .expectOne(VISUAL_CROSSING_AIR_CURRENT_URL)
      .flush(VISUAL_CROSSING_AIR_CURRENT_RESPONSE);
  });

  it('reuses coordinate weather data for one hour', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };
    const results: unknown[] = [];

    service
      .getCurrentWeather(coordinates)
      .subscribe((response) => results.push(response));

    const request = httpTesting.expectOne(OPEN_WEATHER_COORDINATE_URL);
    request.flush(OPEN_WEATHER_RESPONSE);

    service
      .getCurrentWeather(coordinates)
      .subscribe((response) => results.push(response));

    httpTesting.expectNone(OPEN_WEATHER_COORDINATE_URL);
    expect(results).toHaveLength(2);
    expect(results[1]).toBe(results[0]);
  });

  it('keeps current conditions and forecasts in separate cache namespaces', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);

    service.getWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_FORECAST_URL)
      .flush(OPEN_WEATHER_FORECAST_RESPONSE);

    service.getCurrentWeather(coordinates).subscribe();
    service.getWeatherForecast(coordinates).subscribe();
    httpTesting.expectNone(() => true);
  });

  it('keeps forecast day counts in separate coordinate cache entries', () => {
    selectProvider('seniverse');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getWeatherForecast(coordinates, { days: 2 }).subscribe();
    httpTesting
      .expectOne(
        'https://api.seniverse.com/v3/weather/daily.json?key=test-key&location=39.9:116.4&unit=c&start=0&days=2',
      )
      .flush(SENIVERSE_FORECAST_RESPONSE);

    service.getWeatherForecast(coordinates, { days: 3 }).subscribe();
    httpTesting
      .expectOne(
        'https://api.seniverse.com/v3/weather/daily.json?key=test-key&location=39.9:116.4&unit=c&start=0&days=3',
      )
      .flush(SENIVERSE_FORECAST_RESPONSE);
  });

  it('reuses an empty alert result for five minutes and then refreshes it', () => {
    const now = 1_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    selectProvider('seniverse');
    const coordinates = { latitude: 39.9, longitude: 116.4 };
    const alertUrl =
      'https://api.seniverse.com/v3/weather/alarm.json?key=test-key&location=39.9:116.4';

    service.getWeatherAlerts(coordinates).subscribe();
    httpTesting.expectOne(alertUrl).flush({ results: [] });

    dateNow.mockReturnValue(now + 5 * 60 * 1000 - 1);
    service.getWeatherAlerts(coordinates).subscribe();
    httpTesting.expectNone(alertUrl);

    dateNow.mockReturnValue(now + 5 * 60 * 1000);
    service.getWeatherAlerts(coordinates).subscribe();
    httpTesting.expectOne(alertUrl).flush({ results: [] });
  });

  it('reuses forecast results for one hour', () => {
    const now = 1_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_FORECAST_URL)
      .flush(OPEN_WEATHER_FORECAST_RESPONSE);

    dateNow.mockReturnValue(now + 60 * 60 * 1000 - 1);
    service.getWeatherForecast(coordinates).subscribe();
    httpTesting.expectNone(OPEN_WEATHER_FORECAST_URL);

    dateNow.mockReturnValue(now + 60 * 60 * 1000);
    service.getWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_FORECAST_URL)
      .flush(OPEN_WEATHER_FORECAST_RESPONSE);
  });

  it('keeps daily and hourly forecasts in separate cache namespaces', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_FORECAST_URL)
      .flush(OPEN_WEATHER_FORECAST_RESPONSE);

    service.getHourlyWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_HOURLY_FORECAST_URL)
      .flush(OPEN_WEATHER_HOURLY_FORECAST_RESPONSE);

    service.getWeatherForecast(coordinates).subscribe();
    service.getHourlyWeatherForecast(coordinates).subscribe();
    httpTesting.expectNone(() => true);
  });

  it('keeps requested hourly counts in separate cache entries', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getHourlyWeatherForecast(coordinates, { hours: 3 }).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_HOURLY_FORECAST_URL)
      .flush(OPEN_WEATHER_HOURLY_FORECAST_RESPONSE);

    service.getHourlyWeatherForecast(coordinates, { hours: 4 }).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_HOURLY_FORECAST_URL)
      .flush(OPEN_WEATHER_HOURLY_FORECAST_RESPONSE);
  });

  it('reuses hourly forecasts for five minutes and then refreshes them', () => {
    const now = 1_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getHourlyWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_HOURLY_FORECAST_URL)
      .flush(OPEN_WEATHER_HOURLY_FORECAST_RESPONSE);

    dateNow.mockReturnValue(now + 5 * 60 * 1000 - 1);
    service.getHourlyWeatherForecast(coordinates).subscribe();
    httpTesting.expectNone(OPEN_WEATHER_HOURLY_FORECAST_URL);

    dateNow.mockReturnValue(now + 5 * 60 * 1000);
    service.getHourlyWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_HOURLY_FORECAST_URL)
      .flush(OPEN_WEATHER_HOURLY_FORECAST_RESPONSE);
  });

  it('reuses current air quality for one hour and then refreshes it', () => {
    const now = 1_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getAirQuality(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_AIR_CURRENT_URL)
      .flush(OPEN_WEATHER_AIR_CURRENT_RESPONSE);

    dateNow.mockReturnValue(now + 60 * 60 * 1000 - 1);
    service.getAirQuality(coordinates).subscribe();
    httpTesting.expectNone(OPEN_WEATHER_AIR_CURRENT_URL);

    dateNow.mockReturnValue(now + 60 * 60 * 1000);
    service.getAirQuality(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_AIR_CURRENT_URL)
      .flush(OPEN_WEATHER_AIR_CURRENT_RESPONSE);
  });

  it('keeps weather and current air caches independent', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);

    service.getAirQuality(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_AIR_CURRENT_URL)
      .flush(OPEN_WEATHER_AIR_CURRENT_RESPONSE);

    service.getCurrentWeather(coordinates).subscribe();
    service.getAirQuality(coordinates).subscribe();
    httpTesting.expectNone(() => true);
  });

  it('coalesces concurrent requests for the same coordinates', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };
    const results: unknown[] = [];
    const first$ = service.getCurrentWeather(coordinates);
    const second$ = service.getCurrentWeather(coordinates);

    first$.subscribe((response) => results.push(response));
    second$.subscribe((response) => results.push(response));

    const requests = httpTesting.match(OPEN_WEATHER_COORDINATE_URL);
    expect(requests).toHaveLength(1);
    requests[0].flush(OPEN_WEATHER_RESPONSE);
    expect(results).toHaveLength(2);
  });

  it('normalizes small coordinate jitter into the same cache entry', () => {
    selectProvider('openWeather');

    service
      .getCurrentWeather({ latitude: 39.90001, longitude: 116.40001 })
      .subscribe();
    httpTesting
      .expectOne(
        'https://api.openweathermap.org/data/2.5/weather?appid=test-key&units=metric&lat=39.90001&lon=116.40001',
      )
      .flush(OPEN_WEATHER_RESPONSE);

    service
      .getCurrentWeather({ latitude: 39.90004, longitude: 116.40004 })
      .subscribe();
    httpTesting.expectNone(() => true);
  });

  it('does not reuse coordinate cache after the API key changes', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);

    config.saveWeatherServiceConfig({
      selectedProvider: 'openWeather',
      keys: { ...EMPTY_WEATHER_SERVICE_KEYS, openWeather: 'rotated-key' },
    });
    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(
        'https://api.openweathermap.org/data/2.5/weather?appid=rotated-key&units=metric&lat=39.9&lon=116.4',
      )
      .flush(OPEN_WEATHER_RESPONSE);
  });

  it('requests fresh coordinate data after the one-hour TTL expires', () => {
    const now = 1_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);

    dateNow.mockReturnValue(now + 60 * 60 * 1000 - 1);
    service.getCurrentWeather(coordinates).subscribe();
    httpTesting.expectNone(OPEN_WEATHER_COORDINATE_URL);

    dateNow.mockReturnValue(now + 60 * 60 * 1000);
    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);
  });

  it('keeps different coordinates and request options in separate cache entries', () => {
    selectProvider('openWeather');

    service
      .getCurrentWeather({ latitude: 39.9, longitude: 116.4 })
      .subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);

    service
      .getCurrentWeather({ latitude: 31.2304, longitude: 121.4737 })
      .subscribe();
    httpTesting
      .expectOne(
        'https://api.openweathermap.org/data/2.5/weather?appid=test-key&units=metric&lat=31.2304&lon=121.4737',
      )
      .flush(OPEN_WEATHER_RESPONSE);

    service
      .getCurrentWeather(
        { latitude: 39.9, longitude: 116.4 },
        { language: 'zh_cn' },
      )
      .subscribe();
    httpTesting
      .expectOne(
        'https://api.openweathermap.org/data/2.5/weather?appid=test-key&units=metric&lang=zh_cn&lat=39.9&lon=116.4',
      )
      .flush(OPEN_WEATHER_RESPONSE);
  });

  it('does not cache failed coordinate requests', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getCurrentWeather(coordinates).subscribe({ error: () => undefined });
    httpTesting.expectOne(OPEN_WEATHER_COORDINATE_URL).flush(
      { message: 'temporarily unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_COORDINATE_URL)
      .flush(OPEN_WEATHER_RESPONSE);
  });

  it('does not cache failed current air-quality requests', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getAirQuality(coordinates).subscribe({ error: () => undefined });
    httpTesting.expectOne(OPEN_WEATHER_AIR_CURRENT_URL).flush(
      { message: 'temporarily unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    service.getAirQuality(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_AIR_CURRENT_URL)
      .flush(OPEN_WEATHER_AIR_CURRENT_RESPONSE);
  });

  it.each([
    [
      'seniverse',
      'https://api.seniverse.com/v3/air/now.json?key=test-key&location=39.9:116.4&scope=city',
      [
        { results: [{ air: { city: {} } }] },
        { results: [{ air: { city: null } }] },
      ],
      SENIVERSE_AIR_CURRENT_RESPONSE,
    ],
    [
      'openWeather',
      OPEN_WEATHER_AIR_CURRENT_URL,
      [
        { list: [{ main: { aqi: 6 }, components: {} }] },
        { list: [null] },
      ],
      OPEN_WEATHER_AIR_CURRENT_RESPONSE,
    ],
    [
      'weatherApi',
      'https://api.weatherapi.com/v1/current.json?key=test-key&q=39.9,116.4&aqi=yes',
      [
        { current: { air_quality: {} } },
        { current: { air_quality: null } },
      ],
      WEATHER_API_AIR_CURRENT_RESPONSE,
    ],
    [
      'visualCrossing',
      VISUAL_CROSSING_AIR_CURRENT_URL,
      [
        { currentConditions: { datetime: '12:00:00' } },
        { currentConditions: null },
      ],
      VISUAL_CROSSING_AIR_CURRENT_RESPONSE,
    ],
  ] as Array<[WeatherServiceProvider, string, object[], object]>) (
    'does not cache malformed %s current air-quality data',
    (provider, currentUrl, malformedResponses, validResponse) => {
      selectProvider(provider);
      const coordinates = { latitude: 39.9, longitude: 116.4 };

      for (const malformedResponse of malformedResponses) {
        service.getAirQuality(coordinates).subscribe();
        httpTesting.expectOne(currentUrl).flush(malformedResponse);
      }

      service.getAirQuality(coordinates).subscribe();
      httpTesting.expectOne(currentUrl).flush(validResponse);

      service.getAirQuality(coordinates).subscribe();
      httpTesting.expectNone(currentUrl);
    },
  );

  it.each([
    [
      'seniverse',
      'https://api.seniverse.com/v3/weather/hourly.json?key=test-key&location=39.9:116.4&unit=c&start=1&hours=4',
      [
        { results: [{ hourly: [{}] }] },
        { results: [{ hourly: [null] }] },
      ],
      SENIVERSE_HOURLY_FORECAST_RESPONSE,
    ],
    [
      'openWeather',
      OPEN_WEATHER_HOURLY_FORECAST_URL,
      [{ data: [{}] }, { data: [null] }],
      OPEN_WEATHER_HOURLY_FORECAST_RESPONSE,
    ],
    [
      'weatherApi',
      'https://api.weatherapi.com/v1/forecast.json?key=test-key&q=39.9,116.4&days=2',
      [
        { forecast: { forecastday: [{ hour: [{}] }] } },
        { forecast: { forecastday: [{ hour: [null] }] } },
      ],
      WEATHER_API_HOURLY_FORECAST_RESPONSE,
    ],
    [
      'visualCrossing',
      'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/39.9%2C116.4/today/tomorrow?key=test-key&unitGroup=metric&include=hours&contentType=json',
      [
        { days: [{ hours: [{}] }] },
        { days: [{ hours: [null] }] },
      ],
      VISUAL_CROSSING_HOURLY_FORECAST_RESPONSE,
    ],
  ] as Array<[WeatherServiceProvider, string, object[], object]>) (
    'does not cache malformed %s coordinate hourly forecast arrays',
    (provider, forecastUrl, malformedResponses, validResponse) => {
      selectProvider(provider);
      const coordinates = { latitude: 39.9, longitude: 116.4 };

      for (const malformedResponse of malformedResponses) {
        service.getHourlyWeatherForecast(coordinates).subscribe();
        httpTesting.expectOne(forecastUrl).flush(malformedResponse);
      }

      service.getHourlyWeatherForecast(coordinates).subscribe();
      httpTesting.expectOne(forecastUrl).flush(validResponse);

      service.getHourlyWeatherForecast(coordinates).subscribe();
      httpTesting.expectNone(forecastUrl);
    },
  );

  it.each([
    [
      'seniverse',
      'https://api.seniverse.com/v3/weather/daily.json?key=test-key&location=39.9:116.4&unit=c&start=0&days=3',
      [
        { results: [{ daily: [{}] }] },
        { results: [{ daily: [null] }] },
      ],
      SENIVERSE_FORECAST_RESPONSE,
    ],
    [
      'openWeather',
      OPEN_WEATHER_FORECAST_URL,
      [{ list: [{}] }, { list: [null] }],
      OPEN_WEATHER_FORECAST_RESPONSE,
    ],
    [
      'weatherApi',
      'https://api.weatherapi.com/v1/forecast.json?key=test-key&q=39.9,116.4&days=3',
      [
        { forecast: { forecastday: [{}] } },
        { forecast: { forecastday: [null] } },
      ],
      {
        forecast: {
          forecastday: [{ date: '2026-08-20', day: { maxtemp_c: 28 } }],
        },
      },
    ],
    [
      'visualCrossing',
      'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/39.9%2C116.4/next3days?key=test-key&unitGroup=metric&include=days&contentType=json',
      [{ days: [{}] }, { days: [null] }],
      { days: [{ datetime: '2026-08-20', tempmax: 28 }] },
    ],
  ] as Array<[WeatherServiceProvider, string, object[], object]>) (
    'does not cache malformed %s coordinate forecast arrays',
    (provider, forecastUrl, malformedResponses, validResponse) => {
      selectProvider(provider);
      const coordinates = { latitude: 39.9, longitude: 116.4 };

      for (const malformedResponse of malformedResponses) {
        service.getWeatherForecast(coordinates).subscribe();
        httpTesting.expectOne(forecastUrl).flush(malformedResponse);
      }

      service.getWeatherForecast(coordinates).subscribe();
      httpTesting.expectOne(forecastUrl).flush(validResponse);

      service.getWeatherForecast(coordinates).subscribe();
      httpTesting.expectNone(forecastUrl);
    },
  );

  it('does not cache an empty coordinate forecast response', () => {
    selectProvider('openWeather');
    const coordinates = { latitude: 39.9, longitude: 116.4 };

    service.getWeatherForecast(coordinates).subscribe();
    httpTesting.expectOne(OPEN_WEATHER_FORECAST_URL).flush({ list: [] });

    service.getWeatherForecast(coordinates).subscribe();
    httpTesting
      .expectOne(OPEN_WEATHER_FORECAST_URL)
      .flush(OPEN_WEATHER_FORECAST_RESPONSE);
  });

  it('does not cache malformed coordinate current-weather responses', () => {
    selectProvider('seniverse');
    const coordinates = { latitude: 39.9, longitude: 116.4 };
    const currentUrl =
      'https://api.seniverse.com/v3/weather/now.json?key=test-key&location=39.9:116.4&unit=c';

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting.expectOne(currentUrl).flush({ results: [{ now: {} }] });

    service.getCurrentWeather(coordinates).subscribe();
    httpTesting
      .expectOne(currentUrl)
      .flush({ results: [{ now: { temperature: '25' } }] });
  });

  it.each([
    [
      'seniverse',
      'https://api.seniverse.com/v3/weather/alarm.json?key=test-key&location=39.9:116.4',
      [
        { results: [{ alarms: [{}] }] },
        { results: [{ alarms: [null] }] },
      ],
      { results: [] },
    ],
    [
      'weatherApi',
      'https://api.weatherapi.com/v1/alerts.json?key=test-key&q=39.9,116.4',
      [
        { alerts: { alert: [{}] } },
        { alerts: { alert: [null] } },
        { alerts: { alert: [{ msgType: 'Alert' }] } },
      ],
      { alerts: { alert: [] } },
    ],
    [
      'visualCrossing',
      'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/39.9%2C116.4/today?key=test-key&unitGroup=metric&include=alerts&contentType=json',
      [{ alerts: [{}] }, { alerts: [null] }],
      { alerts: [] },
    ],
  ] as Array<[WeatherServiceProvider, string, object[], object]>) (
    'does not cache malformed %s alerts but caches a valid empty result',
    (provider, alertUrl, malformedResponses, emptyResponse) => {
      selectProvider(provider);
      const coordinates = { latitude: 39.9, longitude: 116.4 };

      for (const malformedResponse of malformedResponses) {
        service.getWeatherAlerts(coordinates).subscribe();
        httpTesting.expectOne(alertUrl).flush(malformedResponse);
      }

      service.getWeatherAlerts(coordinates).subscribe();
      httpTesting.expectOne(alertUrl).flush(emptyResponse);

      service.getWeatherAlerts(coordinates).subscribe();
      httpTesting.expectNone(alertUrl);
    },
  );

  it('does not cache string locations', () => {
    selectProvider('weatherApi');
    const url =
      'https://api.weatherapi.com/v1/current.json?key=test-key&q=Beijing';

    service.getCurrentWeather('Beijing').subscribe();
    httpTesting.expectOne(url).flush({ current: { temp_c: 25 } });

    service.getCurrentWeather('Beijing').subscribe();
    httpTesting.expectOne(url).flush({ current: { temp_c: 26 } });
  });

  it('always bypasses weather cache when validating the selected service', () => {
    selectProvider('weatherApi');
    const validationUrl =
      'https://api.weatherapi.com/v1/current.json?key=test-key&q=39.9042,116.4074';

    service.validateCurrentService().subscribe();
    httpTesting
      .expectOne(validationUrl)
      .flush({ current: { temp_c: 25 } });

    service.validateCurrentService().subscribe();
    httpTesting
      .expectOne(validationUrl)
      .flush({ current: { temp_c: 25 } });
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

const OPEN_WEATHER_COORDINATE_URL =
  'https://api.openweathermap.org/data/2.5/weather?appid=test-key&units=metric&lat=39.9&lon=116.4';

const OPEN_WEATHER_FORECAST_URL =
  'https://api.openweathermap.org/data/2.5/forecast?appid=test-key&units=metric&cnt=24&lat=39.9&lon=116.4';

const OPEN_WEATHER_RESPONSE = {
  cod: 200,
  main: { temp: 25 },
};

const OPEN_WEATHER_FORECAST_RESPONSE = {
  cod: '200',
  list: [{ dt: 1, main: { temp: 25 } }],
};

const OPEN_WEATHER_HOURLY_FORECAST_URL =
  'https://api.openweathermap.org/data/4.0/onecall/timeline/1h?lat=39.9&lon=116.4&units=metric&appid=test-key';

const OPEN_WEATHER_HOURLY_FORECAST_RESPONSE = {
  lat: 39.9,
  lon: 116.4,
  data: [
    {
      dt: 1_776_672_000,
      temp: 25,
      weather: [{ id: 800, main: 'Clear', icon: '01d' }],
    },
  ],
};

const SENIVERSE_HOURLY_FORECAST_RESPONSE = {
  results: [
    {
      hourly: [
        {
          time: '2026-08-20T13:00:00+08:00',
          text: 'Clear',
          code: '0',
          temperature: '25',
        },
      ],
    },
  ],
};

const WEATHER_API_HOURLY_FORECAST_RESPONSE = {
  forecast: {
    forecastday: [
      {
        date: '2026-08-20',
        hour: [
          {
            time_epoch: 1_776_672_000,
            time: '2026-08-20 23:00',
            temp_c: 25,
          },
        ],
      },
      {
        date: '2026-08-21',
        hour: [
          {
            time_epoch: 1_776_675_600,
            time: '2026-08-21 00:00',
            temp_c: 24,
          },
        ],
      },
    ],
  },
};

const VISUAL_CROSSING_HOURLY_FORECAST_RESPONSE = {
  days: [
    {
      datetime: '2026-08-20',
      hours: [
        {
          datetime: '13:00:00',
          datetimeEpoch: 1_776_672_000,
          temp: 25,
        },
      ],
    },
  ],
};

const SENIVERSE_FORECAST_RESPONSE = {
  results: [{ daily: [{ date: '2026-08-20', text_day: '晴' }] }],
};

const OPEN_WEATHER_AIR_CURRENT_URL =
  'https://api.openweathermap.org/data/2.5/air_pollution?appid=test-key&lat=39.9&lon=116.4';

const VISUAL_CROSSING_AIR_ELEMENTS =
  'datetime,pm1,pm2p5,pm10,o3,no2,so2,co,aqius,aqieur';

const VISUAL_CROSSING_AIR_CURRENT_URL =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/39.9%2C116.4' +
  `?key=test-key&unitGroup=metric&include=current&elements=${VISUAL_CROSSING_AIR_ELEMENTS}&contentType=json`;

const SENIVERSE_AIR_CURRENT_RESPONSE = {
  results: [
    {
      air: {
        city: {
          aqi: '42',
          pm25: '18',
          quality: '优',
        },
      },
    },
  ],
};

const OPEN_WEATHER_AIR_CURRENT_RESPONSE = {
  list: [
    {
      dt: 1_776_672_000,
      main: { aqi: 2 },
      components: { pm2_5: 18.2, pm10: 30.1 },
    },
  ],
};

const WEATHER_API_AIR_CURRENT_RESPONSE = {
  current: {
    air_quality: {
      pm2_5: 18.2,
      pm10: 30.1,
      'us-epa-index': 2,
    },
  },
};

const VISUAL_CROSSING_AIR_CURRENT_RESPONSE = {
  currentConditions: {
    datetime: '12:00:00',
    aqius: 42,
    pm2p5: 18.2,
  },
};
