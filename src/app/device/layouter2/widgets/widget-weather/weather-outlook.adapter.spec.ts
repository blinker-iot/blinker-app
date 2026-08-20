import type { WeatherServiceProvider } from 'src/app/core/services/third-party-services.service';
import {
  normalizeWeatherAlerts,
  normalizeWeatherForecast,
  normalizeWeatherHourlyForecast,
} from './weather-outlook.adapter';

describe('normalizeWeatherHourlyForecast', () => {
  const now = new Date('2026-08-20T00:00:00.000Z');

  it('normalizes, sorts and limits Seniverse hours while retaining zero values', () => {
    const forecast = normalizeWeatherHourlyForecast(
      'seniverse',
      {
        results: [
          {
            hourly: [
              {
                time: '2026-08-20T04:00:00Z',
                text: 'Cloudy',
                temperature: '24',
              },
              {
                time: '2026-08-20T00:00:00Z',
                text: 'Current slot',
                temperature: '20',
              },
              null,
              {
                time: '2026-08-20T02:00:00Z',
                text: 'Rain',
                temperature: '22',
              },
              {
                time: '2026-08-20T01:00:00Z',
                text: 'Clear',
                code: '0',
                temperature: '0',
                feels_like: '0',
                precip_probability: '0',
                precipitation: '0',
                humidity: '0',
                wind_direction: 'N',
                wind_direction_degree: '0',
                wind_speed: '0',
              },
              {
                time: '2026-08-20T03:00:00Z',
                text: 'Showers',
                temperature: '23',
              },
            ],
          },
        ],
      },
      now,
    );

    expect(forecast?.map((hour) => hour.time.toISOString())).toEqual([
      '2026-08-20T01:00:00.000Z',
      '2026-08-20T02:00:00.000Z',
      '2026-08-20T03:00:00.000Z',
    ]);
    expect(forecast?.[0]).toMatchObject({
      temperature: 0,
      feelsLike: 0,
      condition: 'Clear',
      precipitationProbability: 0,
      precipitation: 0,
      humidity: 0,
      windDirection: 'N 0°',
      windSpeed: 0,
      icon: 'fa-light fa-moon-stars',
    });
    expect(forecast?.[0].id).toMatch(/^seniverse-/);
  });

  it('normalizes OpenWeather One Call 4 data records', () => {
    const forecast = normalizeWeatherHourlyForecast(
      'openWeather',
      {
        data: [
          {
            id: 'one-call-hour',
            dt: Date.parse('2026-08-20T01:00:00Z') / 1000,
            temp: 0,
            feels_like: 0,
            humidity: 0,
            pop: 0,
            rain: { '1h': 0 },
            snow: { '1h': 0 },
            wind_speed: 0,
            wind_deg: 0,
            weather: [{ description: 'clear sky', icon: '01n' }],
          },
        ],
      },
      now,
    );

    expect(forecast).toEqual([
      {
        id: 'one-call-hour',
        time: new Date('2026-08-20T01:00:00.000Z'),
        temperature: 0,
        feelsLike: 0,
        condition: 'clear sky',
        precipitationProbability: 0,
        precipitation: 0,
        humidity: 0,
        windDirection: '0°',
        windSpeed: 0,
        icon: 'fa-light fa-moon-stars',
      },
    ]);
  });

  it('normalizes OpenWeather list records and converts provider units', () => {
    const forecast = normalizeWeatherHourlyForecast(
      'openWeather',
      {
        list: [
          {
            dt: Date.parse('2026-08-20T03:00:00Z') / 1000,
            main: { temp: 18, feels_like: 17, humidity: 70 },
            weather: [{ main: 'Rain', icon: '10d' }],
            wind: { speed: 2, deg: 90 },
            pop: 0.75,
            rain: { '3h': 2 },
            snow: { '3h': 1 },
          },
        ],
      },
      now,
      1,
    );

    expect(forecast?.[0]).toMatchObject({
      time: new Date('2026-08-20T03:00:00.000Z'),
      temperature: 18,
      feelsLike: 17,
      condition: 'Rain',
      precipitationProbability: 75,
      precipitation: 3,
      humidity: 70,
      windDirection: '90°',
      windSpeed: 7.2,
      icon: 'fa-light fa-cloud-rain',
    });
  });

  it('flattens WeatherAPI forecast days and uses imperial fallbacks', () => {
    const forecast = normalizeWeatherHourlyForecast(
      'weatherApi',
      {
        forecast: {
          forecastday: [
            { hour: [] },
            {
              hour: [
                {
                  time_epoch: Date.parse('2026-08-20T01:00:00Z') / 1000,
                  temp_f: 32,
                  feelslike_f: 14,
                  chance_of_rain: 0,
                  chance_of_snow: 80,
                  precip_in: 0,
                  humidity: 0,
                  wind_mph: 10,
                  wind_degree: 0,
                  wind_dir: 'N',
                  is_day: 0,
                  condition: { text: 'Clear', code: 1000 },
                },
              ],
            },
          ],
        },
      },
      now,
    );

    expect(forecast?.[0]).toMatchObject({
      time: new Date('2026-08-20T01:00:00.000Z'),
      temperature: 0,
      feelsLike: -10,
      condition: 'Clear',
      precipitationProbability: 80,
      precipitation: 0,
      humidity: 0,
      windDirection: 'N 0°',
      windSpeed: 16.09344,
      icon: 'fa-light fa-moon-stars',
    });
  });

  it('combines Visual Crossing day/hour times with the provider offset', () => {
    const forecast = normalizeWeatherHourlyForecast(
      'visualCrossing',
      {
        tzoffset: 8,
        days: [
          {
            datetime: '2026-08-21',
            hours: [
              {
                datetime: '09:00:00',
                temp: 0,
                feelslike: 0,
                conditions: 'Clear',
                precipprob: 0,
                precip: 0,
                humidity: 0,
                winddir: 0,
                windspeed: 0,
                icon: 'clear-day',
              },
            ],
          },
        ],
      },
      new Date('2026-08-21T00:00:00Z'),
    );

    expect(forecast?.[0]).toMatchObject({
      time: new Date('2026-08-21T01:00:00.000Z'),
      temperature: 0,
      feelsLike: 0,
      condition: 'Clear',
      precipitationProbability: 0,
      precipitation: 0,
      humidity: 0,
      windDirection: '0°',
      windSpeed: 0,
      icon: 'fa-light fa-sun-bright',
    });
  });

  it('uses stable IDs for identical records regardless of source ordering', () => {
    const first = {
      dt: Date.parse('2026-08-20T01:00:00Z') / 1000,
      temp: 20,
    };
    const second = {
      dt: Date.parse('2026-08-20T02:00:00Z') / 1000,
      temp: 21,
    };

    const forward = normalizeWeatherHourlyForecast(
      'openWeather',
      { hourly: [first, second] },
      now,
    );
    const reversed = normalizeWeatherHourlyForecast(
      'openWeather',
      { hourly: [second, first] },
      now,
    );

    expect(forward?.map((hour) => hour.id)).toEqual(
      reversed?.map((hour) => hour.id),
    );
  });

  it.each([
    ['seniverse', null],
    ['seniverse', { results: {} }],
    ['seniverse', { results: [{}] }],
    ['openWeather', {}],
    ['openWeather', { data: null, hourly: {}, list: null }],
    ['weatherApi', { forecast: { forecastday: null } }],
    ['weatherApi', { forecast: { forecastday: [{}] } }],
    ['visualCrossing', { days: {} }],
    ['visualCrossing', { days: [{}] }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null for an invalid %s hourly forecast structure',
    (provider, payload) => {
      expect(normalizeWeatherHourlyForecast(provider, payload, now)).toBeNull();
    },
  );

  it.each([
    ['seniverse', { results: [{ hourly: [null, {}, { time: 'bad' }] }] }],
    ['openWeather', { data: [null, {}, { dt: 'bad' }] }],
    [
      'weatherApi',
      { forecast: { forecastday: [{ hour: [null, {}, { time: 'bad' }] }] } },
    ],
    [
      'visualCrossing',
      { days: [{ datetime: '2026-08-20', hours: [null, {}, { datetime: 'bad' }] }] },
    ],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null when a %s hourly array contains only malformed records',
    (provider, payload) => {
      expect(normalizeWeatherHourlyForecast(provider, payload, now)).toBeNull();
    },
  );

  it.each([
    ['seniverse', { results: [] }],
    ['seniverse', { results: [{ hourly: [] }] }],
    ['openWeather', { data: [] }],
    ['weatherApi', { forecast: { forecastday: [] } }],
    ['weatherApi', { forecast: { forecastday: [{ hour: [] }] } }],
    ['visualCrossing', { days: [] }],
    ['visualCrossing', { days: [{ hours: [] }] }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'keeps a structurally valid empty %s hourly forecast empty',
    (provider, payload) => {
      expect(normalizeWeatherHourlyForecast(provider, payload, now)).toEqual([]);
    },
  );

  it('returns an empty array when usable records are not strictly in the future', () => {
    expect(
      normalizeWeatherHourlyForecast(
        'openWeather',
        {
          hourly: [
            { dt: Date.parse('2026-08-19T23:00:00Z') / 1000, temp: 19 },
            { dt: Date.parse('2026-08-20T00:00:00Z') / 1000, temp: 20 },
          ],
        },
        now,
      ),
    ).toEqual([]);
  });

  it('honors an explicit zero limit', () => {
    expect(
      normalizeWeatherHourlyForecast(
        'openWeather',
        {
          hourly: [
            { dt: Date.parse('2026-08-20T01:00:00Z') / 1000, temp: 20 },
          ],
        },
        now,
        0,
      ),
    ).toEqual([]);
  });
});

describe('normalizeWeatherForecast', () => {
  it('normalizes Seniverse daily forecasts and retains zero values', () => {
    const forecast = normalizeWeatherForecast('seniverse', {
      results: [
        {
          daily: [
            {
              date: '2026-08-20',
              text_day: '晴',
              code_day: '0',
              text_night: '多云',
              code_night: '4',
              high: '0',
              low: '-5',
              precip: '0',
              rainfall: '0.0',
              humidity: '0',
              wind_direction: '北',
              wind_direction_degree: '0',
              wind_speed: '0',
              wind_scale: '0',
            },
          ],
        },
      ],
    });

    expect(forecast).toHaveLength(1);
    expect(forecast?.[0]).toMatchObject({
      date: new Date(2026, 7, 20),
      conditionDay: '晴',
      conditionNight: '多云',
      high: 0,
      low: -5,
      precipitationProbability: 0,
      precipitation: 0,
      humidity: 0,
      windDirection: '北 0°',
      windSpeed: 0,
      windScale: '0',
      icon: 'fa-light fa-sun-bright',
    });
    expect(forecast?.[0].id).toMatch(/^seniverse-/);
  });

  it('groups OpenWeather 3-hour forecasts by local day', () => {
    const forecast = normalizeWeatherForecast('openWeather', {
      city: { timezone: 28_800 },
      list: [
        {
          dt: 1_777_000_000,
          dt_txt: '2026-04-24 12:00:00',
          main: { temp_min: 0, temp_max: 18, humidity: 0 },
          weather: [{ description: '多云', icon: '03d' }],
          wind: { speed: 2, deg: 90 },
          pop: 0,
          rain: { '3h': 0 },
        },
        {
          dt: 1_777_032_400,
          dt_txt: '2026-04-24 21:00:00',
          main: { temp_min: 8, temp_max: 12, humidity: 80 },
          weather: [{ description: '小雨', icon: '10n' }],
          wind: { speed: 3, deg: 180 },
          pop: 0.75,
          rain: { '3h': 2 },
        },
      ],
    });

    expect(forecast).toHaveLength(1);
    expect(forecast?.[0]).toMatchObject({
      conditionDay: '多云',
      conditionNight: '小雨',
      high: 18,
      low: 0,
      precipitationProbability: 75,
      precipitation: 2,
      humidity: 40,
      windDirection: '180°',
      windSpeed: 10.8,
      icon: 'fa-light fa-cloud',
    });
  });

  it('uses the OpenWeather city timezone when grouping records across UTC midnight', () => {
    const forecast = normalizeWeatherForecast('openWeather', {
      city: { timezone: 28_800 },
      list: [
        {
          dt: Date.UTC(2026, 7, 20, 20) / 1000,
          dt_txt: '2026-08-20 20:00:00',
          main: { temp: 24, humidity: 80 },
          weather: [{ description: '多云', icon: '03n' }],
          wind: { speed: 1 },
        },
        {
          dt: Date.UTC(2026, 7, 21, 4) / 1000,
          dt_txt: '2026-08-21 04:00:00',
          main: { temp: 30, humidity: 60 },
          weather: [{ description: '晴', icon: '01d' }],
          wind: { speed: 2 },
        },
      ],
    });

    expect(forecast).toHaveLength(1);
    expect(forecast?.[0].date).toEqual(new Date(2026, 7, 21));
  });

  it('normalizes an OpenWeather One Call daily forecast', () => {
    const forecast = normalizeWeatherForecast('openWeather', {
      daily: [
        {
          dt: 0,
          temp: { min: 0, max: 12 },
          humidity: 0,
          wind_speed: 0,
          wind_deg: 0,
          pop: 0,
          rain: 0,
          snow: 0,
          weather: [{ main: 'Clear', description: 'clear sky', icon: '01d' }],
        },
      ],
    });

    expect(forecast?.[0]).toMatchObject({
      date: new Date(0),
      high: 12,
      low: 0,
      precipitationProbability: 0,
      precipitation: 0,
      humidity: 0,
      windDirection: '0°',
      windSpeed: 0,
      icon: 'fa-light fa-sun-bright',
    });
  });

  it('normalizes WeatherAPI forecast days with metric fallbacks', () => {
    const forecast = normalizeWeatherForecast('weatherApi', {
      forecast: {
        forecastday: [
          {
            date_epoch: 0,
            day: {
              maxtemp_f: 32,
              mintemp_f: 14,
              totalprecip_in: 0,
              daily_chance_of_rain: 0,
              daily_chance_of_snow: 80,
              avghumidity: 0,
              maxwind_mph: 10,
              condition: { text: 'Sunny', code: 1000 },
            },
            hour: [
              {
                time: '1970-01-01 23:00',
                is_day: 0,
                wind_mph: 0,
                wind_degree: 0,
                wind_dir: 'N',
                condition: { text: 'Clear', code: 1000 },
              },
            ],
          },
        ],
      },
    });

    expect(forecast?.[0]).toMatchObject({
      date: new Date(0),
      conditionDay: 'Sunny',
      conditionNight: 'Clear',
      high: 0,
      low: -10,
      precipitationProbability: 80,
      precipitation: 0,
      humidity: 0,
      windDirection: 'N 0°',
      windSpeed: 16.09344,
      icon: 'fa-light fa-sun-bright',
    });
  });

  it('normalizes Visual Crossing forecast days', () => {
    const forecast = normalizeWeatherForecast('visualCrossing', {
      days: [
        {
          datetime: '2026-08-21',
          tempmax: 30,
          tempmin: 0,
          precipprob: 0,
          precip: 0,
          humidity: 0,
          winddir: 0,
          windspeed: 0,
          conditions: 'Partially cloudy',
          icon: 'partly-cloudy-day',
          hours: [
            {
              datetime: '23:00:00',
              conditions: 'Clear',
              icon: 'clear-night',
            },
          ],
        },
      ],
    });

    expect(forecast?.[0]).toMatchObject({
      date: new Date(2026, 7, 21),
      conditionDay: 'Partially cloudy',
      conditionNight: 'Clear',
      high: 30,
      low: 0,
      precipitationProbability: 0,
      precipitation: 0,
      humidity: 0,
      windDirection: '0°',
      windSpeed: 0,
      icon: 'fa-light fa-cloud-sun',
    });
  });

  it.each([
    ['seniverse', null],
    ['seniverse', { results: [] }],
    ['openWeather', {}],
    ['openWeather', { list: null }],
    ['weatherApi', { forecast: { forecastday: null } }],
    ['visualCrossing', { days: {} }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null for an invalid %s forecast root',
    (provider, payload) => {
      expect(normalizeWeatherForecast(provider, payload)).toBeNull();
    },
  );

  it.each([
    ['seniverse', { results: [{ daily: [{}] }] }],
    ['seniverse', { results: [{ daily: [null] }] }],
    ['openWeather', { list: [{}] }],
    ['openWeather', { list: [null] }],
    ['weatherApi', { forecast: { forecastday: [{}] } }],
    ['weatherApi', { forecast: { forecastday: [null] } }],
    ['visualCrossing', { days: [{}] }],
    ['visualCrossing', { days: [null] }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null when a %s forecast array contains only malformed days',
    (provider, payload) => {
      expect(normalizeWeatherForecast(provider, payload)).toBeNull();
    },
  );

  it.each([
    ['seniverse', { results: [{ daily: [] }] }],
    ['openWeather', { list: [] }],
    ['weatherApi', { forecast: { forecastday: [] } }],
    ['visualCrossing', { days: [] }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'keeps a structurally valid empty %s forecast array empty',
    (provider, payload) => {
      expect(normalizeWeatherForecast(provider, payload)).toEqual([]);
    },
  );

  it('filters malformed forecast entries when usable days remain', () => {
    const forecast = normalizeWeatherForecast('seniverse', {
      results: [
        {
          daily: [
            null,
            {},
            { date: '2026-08-20', text_day: '晴', high: '28' },
          ],
        },
      ],
    });

    expect(forecast).toHaveLength(1);
    expect(forecast?.[0]).toMatchObject({
      date: new Date(2026, 7, 20),
      conditionDay: '晴',
      high: 28,
    });
  });
});

describe('normalizeWeatherAlerts', () => {
  it('normalizes Seniverse alarms and infers a color severity', () => {
    const alerts = normalizeWeatherAlerts('seniverse', {
      results: [
        {
          location: { name: '乐山' },
          alarms: [
            {
              title: '乐山市气象台发布大雾橙色预警',
              type: '大雾',
              level: '橙色',
              status: '预警中',
              description: '能见度将低于 200 米。',
              pub_date: '2026-08-20T07:02:00+08:00',
            },
          ],
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts?.[0]).toMatchObject({
      title: '乐山市气象台发布大雾橙色预警',
      type: '大雾',
      level: '橙色',
      severity: 'orange',
      status: '预警中',
      areas: ['乐山'],
      publishedAt: new Date('2026-08-19T23:02:00.000Z'),
      effectiveAt: null,
      expiresAt: null,
    });
    expect(alerts?.[0].id).toMatch(/^seniverse-/);
  });

  it('normalizes OpenWeather One Call alerts and epoch zero', () => {
    const alerts = normalizeWeatherAlerts('openWeather', {
      lat: 0,
      lon: 0,
      alerts: [
        {
          sender_name: 'National Weather Service',
          event: 'Coastal Flood Warning',
          start: 0,
          end: 3_600,
          severity: 'Severe',
          description: 'Flooding is expected.',
          tags: ['Flood'],
        },
      ],
    });

    expect(alerts?.[0]).toMatchObject({
      title: 'Coastal Flood Warning',
      type: 'Coastal Flood Warning',
      severity: 'severe',
      description: 'Flooding is expected.',
      effectiveAt: new Date(0),
      expiresAt: new Date(3_600_000),
      source: 'National Weather Service',
      areas: [],
    });
  });

  it('normalizes WeatherAPI alerts, areas and instructions', () => {
    const alerts = normalizeWeatherAlerts('weatherApi', {
      alerts: {
        alert: [
          {
            headline: 'Extreme heat warning',
            msgtype: 'Alert',
            severity: 'Extreme',
            urgency: 'Immediate',
            areas: 'Area A; Area B；Area C',
            event: 'Excessive Heat Warning',
            effective: '2026-08-20T10:00:00+08:00',
            expires: 'not-a-date',
            desc: 'Dangerously hot conditions.',
            instruction: 'Stay indoors.',
          },
        ],
      },
    });

    expect(alerts?.[0]).toMatchObject({
      title: 'Extreme heat warning',
      type: 'Excessive Heat Warning',
      level: 'Immediate',
      severity: 'extreme',
      status: 'Alert',
      areas: ['Area A', 'Area B', 'Area C'],
      effectiveAt: new Date('2026-08-20T02:00:00.000Z'),
      expiresAt: null,
      instruction: 'Stay indoors.',
    });
  });

  it('accepts WeatherAPI camel-case message types and maps white alerts', () => {
    const alerts = normalizeWeatherAlerts('weatherApi', {
      alerts: {
        alert: [
          {
            headline: '台风白色预警',
            event: '台风',
            level: '白色',
            msgType: 'Alert',
          },
        ],
      },
    });

    expect(alerts?.[0]).toMatchObject({
      status: 'Alert',
      severity: 'minor',
    });
  });

  it('normalizes Visual Crossing alerts and keeps explicit IDs', () => {
    const alerts = normalizeWeatherAlerts('visualCrossing', {
      alerts: [
        {
          id: 'alert-0',
          event: 'Yellow Wind Advisory',
          headline: 'Yellow Wind Advisory remains in force',
          onset: 0,
          ends: 3_600_000,
          description: 'Strong winds.',
        },
      ],
    });

    expect(alerts?.[0]).toMatchObject({
      id: 'alert-0',
      title: 'Yellow Wind Advisory remains in force',
      type: 'Yellow Wind Advisory',
      severity: 'yellow',
      effectiveAt: new Date(0),
      expiresAt: new Date(3_600_000_000),
      description: 'Strong winds.',
    });
  });

  it.each([
    ['seniverse', { results: [] }],
    ['seniverse', { results: [{ alarms: [] }] }],
    ['openWeather', { lat: 0, lon: 0 }],
    ['weatherApi', { alerts: { alert: [] } }],
    ['visualCrossing', { alerts: [] }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns an empty array for a valid %s response without alerts',
    (provider, payload) => {
      expect(normalizeWeatherAlerts(provider, payload)).toEqual([]);
    },
  );

  it.each([
    ['seniverse', {}],
    ['openWeather', {}],
    ['openWeather', { alerts: {} }],
    ['weatherApi', { alerts: [] }],
    ['visualCrossing', {}],
    ['visualCrossing', { alerts: {} }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null for an invalid %s alert root',
    (provider, payload) => {
      expect(normalizeWeatherAlerts(provider, payload)).toBeNull();
    },
  );

  it.each([
    ['seniverse', { results: [{ alarms: [{}] }] }],
    ['seniverse', { results: [{ alarms: [null] }] }],
    ['openWeather', { lat: 0, lon: 0, alerts: [{}] }],
    ['openWeather', { lat: 0, lon: 0, alerts: [null] }],
    ['weatherApi', { alerts: { alert: [{}] } }],
    ['weatherApi', { alerts: { alert: [null] } }],
    ['weatherApi', { alerts: { alert: [{ msgType: 'Alert' }] } }],
    ['visualCrossing', { alerts: [{}] }],
    ['visualCrossing', { alerts: [null] }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null when a %s alert array contains only malformed alerts',
    (provider, payload) => {
      expect(normalizeWeatherAlerts(provider, payload)).toBeNull();
    },
  );

  it('filters malformed alert entries when a usable alert remains', () => {
    const alerts = normalizeWeatherAlerts('weatherApi', {
      alerts: {
        alert: [null, {}, { headline: '暴雨预警', event: '暴雨' }],
      },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts?.[0]).toMatchObject({
      title: '暴雨预警',
      type: '暴雨',
    });
  });
});
