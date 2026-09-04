import { ChangeDetectorRef, NgZone } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import { Observable, Subject, of, throwError } from 'rxjs';
import { WeatherService } from 'src/app/core/services/weather.service';
import {
  ThirdPartyServicesService,
  WeatherServiceProvider,
} from 'src/app/core/services/third-party-services.service';
import { WidgetWeatherComponent } from './widget-weather.component';
import { WeatherForecastHour } from './weather-outlook.adapter';

vi.mock('@ionic/angular/standalone', () => ({
  NavController: class {},
}));

describe('WidgetWeatherComponent', () => {
  const components: WidgetWeatherComponent[] = [];

  afterEach(() => {
    components.forEach((component) => component.ngOnDestroy());
    components.length = 0;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function createComponent(
    provider: WeatherServiceProvider | null = 'openWeather',
    responses: {
      current?: unknown;
      hourlyForecast?: unknown;
      alerts?: unknown;
      hourlyForecastStream?: Observable<unknown>;
      alertsStream?: Observable<unknown>;
    } = {}
  ): {
    component: WidgetWeatherComponent;
    getCurrentWeather: ReturnType<typeof vi.fn>;
    getHourlyWeatherForecast: ReturnType<typeof vi.fn>;
    getWeatherAlerts: ReturnType<typeof vi.fn>;
    markForCheck: ReturnType<typeof vi.fn>;
  } {
    const responseProvider = provider ?? 'openWeather';
    const getCurrentWeather = vi.fn(() =>
      of({
        provider: responseProvider,
        data: responses.current ?? OPEN_WEATHER_RESPONSE,
      })
    );
    const getHourlyWeatherForecast = vi.fn(() =>
      responses.hourlyForecastStream ??
      of({
        provider: responseProvider,
        data:
          responses.hourlyForecast ?? createOpenWeatherHourlyForecast(3),
      })
    );
    const getWeatherAlerts = vi.fn(() =>
      responses.alertsStream ??
      of({
        provider: responseProvider,
        data: responses.alerts ?? OPEN_WEATHER_ALERTS,
      })
    );
    const weatherService = {
      getCurrentWeather,
      getHourlyWeatherForecast,
      getWeatherAlerts,
    } as unknown as WeatherService;
    const thirdPartyServices = {
      getActiveWeatherService: () =>
        provider ? { provider, key: 'configured-key' } : null,
    } as ThirdPartyServicesService;
    const ngZone = {
      run: vi.fn((callback: () => void) => callback()),
    } as unknown as NgZone;
    const markForCheck = vi.fn();
    const changeDetectorRef = { markForCheck } as unknown as ChangeDetectorRef;
    const navController = {
      navigateForward: vi.fn().mockResolvedValue(true),
    } as unknown as NavController;
    const component = new WidgetWeatherComponent(
      weatherService,
      thirdPartyServices,
      ngZone,
      changeDetectorRef,
      navController
    );
    component.device = {
      config: {
        customName: '阳台传感器',
        position: {
          location: [120.1551, 30.2741],
          address: '杭州市西湖区',
        },
      },
    };
    component.widget = { type: 'wea', key: 'weather', lstyle: 0, rows: 3 };
    components.push(component);
    return {
      component,
      getCurrentWeather,
      getHourlyWeatherForecast,
      getWeatherAlerts,
      markForCheck,
    };
  }

  it('requests current conditions, the next three hours and alerts for the same coordinates', async () => {
    const {
      component,
      getCurrentWeather,
      getHourlyWeatherForecast,
      getWeatherAlerts,
      markForCheck,
    } = createComponent();

    component.ngOnInit();
    await vi.waitFor(() => expect(component.weatherState).toBe('ready'));

    const coordinates = { latitude: 30.2741, longitude: 120.1551 };
    expect(getCurrentWeather).toHaveBeenCalledWith(coordinates, {
      unitSystem: 'metric',
      language: 'zh_cn',
      includeAirQuality: true,
    });
    expect(getHourlyWeatherForecast).toHaveBeenCalledWith(coordinates, {
      unitSystem: 'metric',
      language: 'zh_cn',
      hours: 3,
    });
    expect(getWeatherAlerts).toHaveBeenCalledWith(coordinates, {
      unitSystem: 'metric',
      language: 'zh_cn',
    });
    expect(component.snapshot?.location).toBe('杭州');
    expect(component.forecastState).toBe('ready');
    expect(component.forecastHours).toHaveLength(3);
    const forecastPages = component.displayPages.filter(
      (page) => page.kind === 'forecast'
    );
    expect(
      forecastPages.flatMap((page) => page.kind === 'forecast' ? page.hours : [])
    ).toHaveLength(3);
    expect(forecastPages).toHaveLength(1);
    expect(component.alertsState).toBe('ready');
    expect(component.providerName).toBe('OpenWeather');
    expect(markForCheck).toHaveBeenCalled();
  });

  it('shows a setup state without issuing requests when the key is missing', () => {
    const {
      component,
      getCurrentWeather,
      getHourlyWeatherForecast,
      getWeatherAlerts,
    } = createComponent(null);

    component.ngOnInit();

    expect(component.weatherState).toBe('missing-key');
    expect(getCurrentWeather).not.toHaveBeenCalled();
    expect(getHourlyWeatherForecast).not.toHaveBeenCalled();
    expect(getWeatherAlerts).not.toHaveBeenCalled();
  });

  it('uses a complete static three-hour preview without consuming any weather API', () => {
    const {
      component,
      getCurrentWeather,
      getHourlyWeatherForecast,
      getWeatherAlerts,
    } = createComponent();
    component.isDemo = true;

    component.ngOnInit();

    expect(component.weatherState).toBe('ready');
    expect(component.snapshot?.location).toBe('杭州市');
    expect(component.forecastHours).toHaveLength(3);
    expect(component.alerts).toHaveLength(1);
    expect(component.displayPages.some((page) => page.kind === 'forecast')).toBe(true);
    expect(component.displayPages.map((page) => page.kind)).not.toContain('alerts');
    expect(getCurrentWeather).not.toHaveBeenCalled();
    expect(getHourlyWeatherForecast).not.toHaveBeenCalled();
    expect(getWeatherAlerts).not.toHaveBeenCalled();
  });

  it('shows a location hint when neither device nor browser location is available', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success, error) => error(),
      },
    });
    const {
      component,
      getCurrentWeather,
      getHourlyWeatherForecast,
      getWeatherAlerts,
    } = createComponent();
    component.device = { config: {} };

    component.ngOnInit();
    await vi.waitFor(() =>
      expect(component.weatherState).toBe('missing-location')
    );

    expect(getCurrentWeather).not.toHaveBeenCalled();
    expect(getHourlyWeatherForecast).not.toHaveBeenCalled();
    expect(getWeatherAlerts).not.toHaveBeenCalled();
  });

  it('uses the tall page density without adding alerts to the right carousel', async () => {
    const hourlyForecast = createOpenWeatherHourlyForecast(8);
    const alerts = createOpenWeatherAlerts(3);
    const component = createComponent('openWeather', {
      hourlyForecast,
      alerts,
    }).component;
    component.lstyle = 0;
    component.ngOnInit();
    await vi.waitFor(() => expect(component.alertsState).toBe('ready'));

    expect(component.metricPages[0].length).toBeLessThanOrEqual(6);
    expect(component.forecastHours).toHaveLength(3);
    expect(
      component.displayPages.filter((page) => page.kind === 'forecast')
    ).toHaveLength(1);
    expect(component.alerts).toHaveLength(3);
    expect(component.displayPages.map((page) => page.kind)).not.toContain('alerts');
  });

  it('keeps current weather ready when hourly forecast and alerts fail independently', async () => {
    const { component, getHourlyWeatherForecast, getWeatherAlerts } =
      createComponent();
    getHourlyWeatherForecast.mockReturnValueOnce(
      throwError(() => ({ status: 500 }))
    );
    getWeatherAlerts.mockReturnValueOnce(
      throwError(() => ({ code: 'WEATHER_FEATURE_UNSUPPORTED' }))
    );

    component.ngOnInit();
    await vi.waitFor(() => expect(component.weatherState).toBe('ready'));

    expect(component.snapshot).not.toBeNull();
    expect(component.forecastState).toBe('error');
    expect(component.alertsState).toBe('unsupported');
    expect(component.displayPages.some(
      (page) => page.kind === 'section-status' && page.section === 'forecast'
    )).toBe(true);
    expect(component.displayPages.some((page) => page.id === 'alerts-status')).toBe(false);
  });

  it('treats an empty alerts response as a normal empty state', async () => {
    const { component } = createComponent('openWeather', {
      alerts: { lat: 30.2741, lon: 120.1551, alerts: [] },
    });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.alertsState).toBe('empty'));

    expect(component.weatherState).toBe('ready');
    expect(component.alerts).toEqual([]);
    expect(component.displayPages.some((page) => page.id === 'alerts-status')).toBe(false);
  });

  it('keeps alerts out of the right carousel when they arrive asynchronously', async () => {
    const hourlyForecastStream = new Subject<unknown>();
    const alertsStream = new Subject<unknown>();
    const { component } = createComponent('openWeather', {
      hourlyForecastStream,
      alertsStream,
    });
    component.ngOnInit();
    await vi.waitFor(() => expect(component.weatherState).toBe('ready'));
    const forecastStatusIndex = component.displayPages.findIndex(
      (page) => page.id === 'forecast-status'
    );
    component.showPage(forecastStatusIndex);
    const pageIdsBeforeAlerts = component.displayPages.map((page) => page.id);

    alertsStream.next({ provider: 'openWeather', data: OPEN_WEATHER_ALERTS });

    expect(component.alerts).toHaveLength(1);
    expect(component.displayPages.map((page) => page.id)).toEqual(pageIdsBeforeAlerts);
    expect(component.displayPages[component.pageIndex].id).toBe('forecast-status');

    hourlyForecastStream.next({
      provider: 'openWeather',
      data: createOpenWeatherHourlyForecast(3),
    });

    expect(component.displayPages[component.pageIndex].section).toBe('forecast');
  });

  it('keeps exactly the next three strictly future hours in chronological order', async () => {
    const requestedAt = Date.now();
    const hourlyForecast = createOpenWeatherHourlyForecast(5, requestedAt);
    hourlyForecast.data.push({
      ...hourlyForecast.data[0],
      dt: Math.floor(requestedAt / 1000),
      temp: 99,
    });
    hourlyForecast.data.reverse();
    const expectedTimes = hourlyForecast.data
      .map((hour) => hour.dt * 1000)
      .filter((time) => time > requestedAt)
      .sort((left, right) => left - right)
      .slice(0, 3);
    const { component } = createComponent('openWeather', { hourlyForecast });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.forecastState).toBe('ready'));

    const actualTimes = component.forecastHours.map((hour) =>
      hour.time.getTime()
    );
    expect(component.forecastHours).toHaveLength(3);
    expect(actualTimes.every((time) => time > requestedAt)).toBe(true);
    expect(actualTimes).toEqual(expectedTimes);
    const forecastPages = component.displayPages.filter(
      (page) => page.kind === 'forecast'
    );
    expect(
      forecastPages.flatMap((page) => page.kind === 'forecast' ? page.hours : [])
    ).toHaveLength(3);
    expect(forecastPages).toHaveLength(1);
  });

  it('formats hourly forecast values for display', () => {
    const { component } = createComponent();
    const hour: WeatherForecastHour = {
      id: 'formatter-hour',
      time: new Date(2030, 0, 2, 3, 4),
      temperature: 26.4,
      feelsLike: 27.1,
      condition: ' 小雨 ',
      precipitationProbability: 65,
      precipitation: 1.2,
      humidity: 74,
      windSpeed: 12.6,
      windDirection: '东风',
      icon: 'fa-light fa-cloud-rain',
    };

    expect(component.forecastTime(hour)).toBe('03:04');
    expect(component.forecastTemperature(hour)).toBe('26.4°');
    expect(component.forecastCondition(hour)).toBe('小雨');
    expect(component.forecastDetailLines(hour)).toEqual([
      '体感 27.1° · 降水 65%',
      '湿度 74%',
      '东风 12.6 km/h',
    ]);
    expect(component.forecastDetail(hour)).toBe(
      '体感 27.1° · 降水 65% · 湿度 74% · 东风 12.6 km/h'
    );
  });

  it('opens alert details and returns to the carousel after closing', async () => {
    const { component } = createComponent();
    component.ngOnInit();
    await vi.waitFor(() => expect(component.alerts.length).toBeGreaterThan(0));

    component.openAlert(component.alerts[0]);
    expect(component.selectedAlert?.title).toContain('雷电');
    component.closeAlert();
    expect(component.selectedAlert).toBeNull();
  });

  it('keeps existing data marked stale when a background current refresh fails', async () => {
    const { component, getCurrentWeather } = createComponent();
    component.ngOnInit();
    await vi.waitFor(() => expect(component.weatherState).toBe('ready'));
    getCurrentWeather.mockReturnValueOnce(throwError(() => ({ status: 429 })));

    component.refresh(false);
    await vi.waitFor(() => expect(component.stale).toBe(true));

    expect(component.weatherState).toBe('ready');
    expect(component.errorMessage).toContain('请求过于频繁');
    expect(component.snapshot).not.toBeNull();
  });

  it('leaves loading and shows an error for an unrecognized current payload', async () => {
    const { component } = createComponent('openWeather', { current: { cod: 200 } });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.weatherState).toBe('error'));

    expect(component.errorMessage).toContain('天气数据加载失败');
    expect(component.snapshot).toBeNull();
  });

  it('supports manual navigation across the right-side pages', async () => {
    const { component } = createComponent();
    component.ngOnInit();
    await vi.waitFor(() => expect(component.displayPages.length).toBeGreaterThan(1));

    component.nextPage();
    expect(component.pageIndex).toBe(1);
    component.previousPage();
    expect(component.pageIndex).toBe(0);
  });

  it('waits 15 seconds and resets the countdown after manual navigation', () => {
    vi.useFakeTimers();
    const { component } = createComponent();
    component.displayPages = [
      { id: 'current-0', section: 'current', kind: 'metrics', metrics: [] },
      { id: 'current-1', section: 'current', kind: 'metrics', metrics: [] },
    ];

    component['restartCarousel']();
    vi.advanceTimersByTime(14_999);
    expect(component.pageIndex).toBe(0);

    component.nextPage();
    expect(component.pageIndex).toBe(1);
    vi.advanceTimersByTime(14_999);
    expect(component.pageIndex).toBe(1);

    vi.advanceTimersByTime(1);
    expect(component.pageIndex).toBe(0);
  });
});

const OPEN_WEATHER_RESPONSE = {
  weather: [{ id: 802, description: '多云', icon: '03d' }],
  main: {
    temp: 26.4,
    feels_like: 27.1,
    temp_min: 24,
    temp_max: 29,
    pressure: 1012,
    humidity: 68,
    sea_level: 1012,
    grnd_level: 1008,
  },
  visibility: 10000,
  wind: { speed: 3.5, deg: 135, gust: 5.2 },
  clouds: { all: 72 },
  rain: { '1h': 0.2 },
  dt: 1724112000,
  sys: { country: 'CN', sunrise: 1724100000, sunset: 1724147000 },
  name: '杭州',
  cod: 200,
};

const OPEN_WEATHER_ALERTS = createOpenWeatherAlerts(1);

function createOpenWeatherHourlyForecast(hours: number, now = Date.now()) {
  const firstFutureHour =
    Math.floor(now / (60 * 60 * 1000)) * 60 * 60 + 60 * 60;
  return {
    lat: 30.2741,
    lon: 120.1551,
    timezone_offset: 8 * 60 * 60,
    data: Array.from({ length: hours }, (_, index) => ({
      dt: firstFutureHour + index * 60 * 60,
      temp: 27 - index * 0.5,
      feels_like: 28 - index * 0.5,
      weather: [{
        description: index % 2 ? '小雨' : '多云',
        icon: index % 2 ? '10d' : '03d',
      }],
      pop: index % 2 ? 0.7 : 0.2,
      rain: { '1h': index % 2 ? 1.2 : 0 },
      humidity: 68 + index,
      wind_speed: 3.5,
      wind_deg: 135,
    })),
  };
}

function createOpenWeatherAlerts(count: number): unknown {
  return {
    lat: 30.2741,
    lon: 120.1551,
    alerts: Array.from({ length: count }, (_, index) => ({
      event: `雷电黄色预警 ${index + 1}`,
      sender_name: '杭州市气象台',
      start: 1724112000 + index * 3600,
      end: 1724133600 + index * 3600,
      description: '预计未来六小时可能发生雷电活动。',
      tags: ['Thunderstorm'],
    })),
  };
}
