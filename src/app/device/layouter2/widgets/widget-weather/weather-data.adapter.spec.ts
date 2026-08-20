import type { WeatherServiceProvider } from 'src/app/core/services/third-party-services.service';
import {
  normalizeWeatherResponse,
  type WeatherMetric,
} from './weather-data.adapter';

describe('normalizeWeatherResponse', () => {
  it('normalizes a full Seniverse payload and retains numeric zeroes', () => {
    const snapshot = normalizeWeatherResponse('seniverse', {
      results: [
        {
          location: {
            name: '西雅图',
            country: '美国',
            path: '西雅图,华盛顿州,美国',
          },
          now: {
            text: '晴',
            code: '1',
            temperature: '14',
            feels_like: '13.5',
            temperature_min: '10',
            temperature_max: '17',
            pressure: '1018',
            humidity: '76',
            visibility: '16.09',
            wind_direction: '西北',
            wind_direction_degree: '340',
            wind_speed: '8.05',
            wind_gust: '12',
            wind_scale: '2',
            clouds: '0',
            precipitation: '0',
            dew_point: '-12',
            uv: '0',
            snow_depth: '0',
            solar_radiation: '155.4',
            air_quality: {
              aqi: '42',
              pm2_5: '0',
              pm10: '18.2',
            },
          },
          last_update: '2026-08-20T22:45:00-07:00',
        },
      ],
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot).toMatchObject({
      provider: 'seniverse',
      location: '西雅图',
      region: '华盛顿州 · 美国',
      temperature: '14',
      condition: '晴',
      icon: 'fa-light fa-moon-stars',
      isDay: false,
    });
    expect(snapshot?.observedAt?.toISOString()).toBe('2026-08-21T05:45:00.000Z');

    const metrics = byId(snapshot?.metrics ?? []);
    expect(metrics['feels-like']).toMatchObject({ value: '13.5', unit: '°C' });
    expect(metrics['wind-direction']).toMatchObject({
      value: '西北 340°',
      unit: '',
      icon: 'fa-light fa-compass',
    });
    expect(metrics['cloud-cover']).toMatchObject({ value: '0', unit: '%' });
    expect(metrics['precipitation']).toMatchObject({ value: '0', unit: 'mm' });
    expect(metrics['uv-index']).toMatchObject({ value: '0', unit: '' });
    expect(metrics['pm2.5']).toMatchObject({ value: '0', unit: 'μg/m³' });
    expect(metrics['solar-radiation']).toMatchObject({
      value: '155.4',
      unit: 'W/m²',
    });
  });

  it('normalizes OpenWeather values and converts wind and visibility to display units', () => {
    const snapshot = normalizeWeatherResponse('openWeather', {
      coord: { lon: 121.47, lat: 31.23 },
      weather: [
        { id: 500, main: 'Rain', description: '小雨', icon: '10d' },
      ],
      main: {
        temp: 18.25,
        feels_like: 17.4,
        temp_min: 0,
        temp_max: 20.1,
        pressure: 1015,
        humidity: 64,
        sea_level: 1016,
        grnd_level: 1002,
      },
      visibility: 0,
      wind: { speed: 2, deg: 225, gust: 3.5 },
      rain: { '1h': 0 },
      snow: { '1h': 1.25 },
      clouds: { all: 0 },
      uvi: 0,
      dt: 1_776_643_200,
      timezone: 28_800,
      sys: {
        country: 'CN',
        sunrise: 1_776_621_600,
        sunset: 1_776_664_800,
      },
      name: '上海',
      cod: 200,
    });

    expect(snapshot).toMatchObject({
      provider: 'openWeather',
      location: '上海',
      region: 'CN',
      temperature: '18.3',
      condition: '小雨',
      icon: 'fa-light fa-cloud-rain',
      isDay: true,
    });
    expect(snapshot?.observedAt).toEqual(new Date(1_776_643_200_000));

    const metrics = byId(snapshot?.metrics ?? []);
    expect(metrics['temp-min']).toMatchObject({ value: '0', unit: '°C' });
    expect(metrics['wind-speed']).toMatchObject({ value: '7.2', unit: 'km/h' });
    expect(metrics['wind-gust']).toMatchObject({ value: '12.6', unit: 'km/h' });
    expect(metrics['wind-direction'].value).toBe('西南 225°');
    expect(metrics['visibility']).toMatchObject({ value: '0', unit: 'km' });
    expect(metrics['cloud-cover'].value).toBe('0');
    expect(metrics['precipitation'].value).toBe('0');
    expect(metrics['snow']).toMatchObject({ value: '1.25', unit: 'mm' });
    expect(metrics['uv-index'].value).toBe('0');
  });

  it('normalizes WeatherAPI and falls back from imperial-only fields', () => {
    const snapshot = normalizeWeatherResponse('weatherApi', {
      location: {
        name: 'London',
        region: 'City of London',
        country: 'United Kingdom',
      },
      current: {
        last_updated_epoch: 1_613_896_210,
        temp_f: 68,
        feelslike_f: 66.2,
        is_day: 0,
        condition: {
          text: 'Partly cloudy',
          icon: '//cdn.weatherapi.com/weather/64x64/night/116.png',
          code: 1003,
        },
        wind_mph: 10,
        wind_degree: 247,
        wind_dir: 'WSW',
        gust_mph: 0,
        pressure_in: 30,
        precip_in: 0,
        humidity: 82,
        cloud: 75,
        vis_miles: 6.21371,
        uv: 0,
        dewpoint_f: 50,
        windchill_f: 64.4,
        heatindex_f: 69.8,
        wetbulb_f: 59,
        short_rad: 0,
        diff_rad: 10,
        dni: 20,
        gti: 30,
        air_quality: {
          co: 230.3,
          no2: 13.5,
          o3: 54.3,
          so2: 7.9,
          pm2_5: 8.6,
          pm10: 11.3,
          'us-epa-index': 1,
          'gb-defra-index': 0,
        },
      },
    });

    expect(snapshot).toMatchObject({
      provider: 'weatherApi',
      location: 'London',
      region: 'City of London · United Kingdom',
      temperature: '20',
      condition: 'Partly cloudy',
      icon: 'fa-light fa-cloud-moon',
      isDay: false,
    });
    expect(snapshot?.observedAt).toEqual(new Date(1_613_896_210_000));

    const metrics = byId(snapshot?.metrics ?? []);
    expect(metrics['feels-like']).toMatchObject({ value: '19', unit: '°C' });
    expect(metrics['wind-speed']).toMatchObject({ value: '16.1', unit: 'km/h' });
    expect(metrics['wind-direction'].value).toBe('西西南 247°');
    expect(metrics['wind-gust'].value).toBe('0');
    expect(metrics['pressure']).toMatchObject({ value: '1015.9', unit: 'hPa' });
    expect(metrics['visibility']).toMatchObject({ value: '10', unit: 'km' });
    expect(metrics['precipitation']).toMatchObject({ value: '0', unit: 'mm' });
    expect(metrics['dew-point'].value).toBe('10');
    expect(metrics['aqi-us'].value).toBe('1');
    expect(metrics['aqi-uk'].value).toBe('0');
    expect(metrics['pm2.5']).toMatchObject({ value: '8.6', unit: 'μg/m³' });
    expect(metrics['solar-radiation']).toMatchObject({ value: '0', unit: 'W/m²' });
  });

  it('normalizes comprehensive Visual Crossing current conditions', () => {
    const snapshot = normalizeWeatherResponse('visualCrossing', {
      resolvedAddress: 'Paris, Île-de-France, France',
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: 'Europe/Paris',
      currentConditions: {
        datetime: '14:00:00',
        datetimeEpoch: 1_776_650_400,
        temp: 21.25,
        feelslike: 21.1,
        tempmin: 0,
        tempmax: 23,
        humidity: 0,
        dew: -2.5,
        windspeed: 12.2,
        winddir: 0,
        windgust: 0,
        precip: 0,
        precipprob: 0,
        snow: 0,
        snowdepth: 2.35,
        pressure: 1012.6,
        visibility: 15.4,
        cloudcover: 0,
        solarradiation: 510,
        solarenergy: 1.84,
        uvindex: 5,
        severerisk: 0,
        conditions: 'Clear',
        icon: 'clear-day',
        aqius: 0,
        aqieur: 2,
        pm1: 3.2,
        pm2p5: 4.6,
        pm10: 8.1,
        o3: 21,
      },
    });

    expect(snapshot).toMatchObject({
      provider: 'visualCrossing',
      location: 'Paris',
      region: 'Île-de-France · France',
      temperature: '21.3',
      condition: 'Clear',
      icon: 'fa-light fa-sun-bright',
      isDay: true,
    });
    expect(snapshot?.observedAt).toEqual(new Date(1_776_650_400_000));

    const metrics = byId(snapshot?.metrics ?? []);
    expect(metrics['humidity'].value).toBe('0');
    expect(metrics['wind-direction'].value).toBe('北 0°');
    expect(metrics['wind-gust'].value).toBe('0');
    expect(metrics['precip-probability'].value).toBe('0');
    expect(metrics['snow-depth']).toMatchObject({ value: '2.35', unit: 'cm' });
    expect(metrics['solar-energy']).toMatchObject({ value: '1.8', unit: 'MJ/m²' });
    expect(metrics['severe-risk'].value).toBe('0');
    expect(metrics['aqi-us'].value).toBe('0');
    expect(metrics['aqi-eu'].value).toBe('2');
    expect(metrics['pm1'].value).toBe('3.2');
  });

  it('filters null, undefined, empty and NaN metrics while retaining zero', () => {
    const snapshot = normalizeWeatherResponse('visualCrossing', {
      currentConditions: {
        temp: 0,
        feelslike: null,
        humidity: 0,
        pressure: 'NaN',
        visibility: undefined,
        windspeed: '',
        cloudcover: Number.NaN,
        conditions: 'Clear',
        icon: 'clear-day',
      },
      latitude: 0,
      longitude: 0,
    });

    expect(snapshot?.temperature).toBe('0');
    expect(snapshot?.location).toBe('0, 0');
    expect(snapshot?.metrics).toEqual([
      {
        id: 'humidity',
        label: '相对湿度',
        value: '0',
        unit: '%',
        icon: 'fa-light fa-droplet-percent',
      },
    ]);
  });

  it.each([
    ['seniverse', null],
    ['seniverse', { results: [] }],
    ['seniverse', { results: [{ now: null }] }],
    ['seniverse', { results: [{ now: {} }] }],
    ['openWeather', { cod: 401, message: 'Invalid API key' }],
    ['openWeather', { weather: [] }],
    ['openWeather', { main: {} }],
    ['weatherApi', { error: { code: 1006 } }],
    ['weatherApi', { current: [] }],
    ['weatherApi', { current: {} }],
    ['visualCrossing', {}],
    ['visualCrossing', { currentConditions: [] }],
    ['visualCrossing', { currentConditions: {} }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null for an unrecognized %s payload',
    (provider, payload) => {
      expect(normalizeWeatherResponse(provider, payload)).toBeNull();
    },
  );
});

function byId(metrics: WeatherMetric[]): Record<string, WeatherMetric> {
  return Object.fromEntries(metrics.map((metric) => [metric.id, metric]));
}
