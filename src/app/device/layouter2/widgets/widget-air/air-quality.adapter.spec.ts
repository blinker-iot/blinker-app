import type { WeatherServiceProvider } from 'src/app/core/services/third-party-services.service';
import {
  normalizeAirQualityResponse,
  type AirPollutant,
  type AirQualitySeverity,
} from './air-quality.adapter';

describe('normalizeAirQualityResponse', () => {
  it('normalizes the documented Seniverse city payload and preserves zeroes', () => {
    const snapshot = normalizeAirQualityResponse('seniverse', {
      results: [
        {
          location: {
            name: '上海',
            path: '上海,上海,中国',
            country: '中国',
          },
          air: {
            city: {
              aqi: '0',
              pm25: '0',
              pm10: '18',
              so2: '3',
              no2: '20',
              co: '0.62',
              o3: '45',
              primary_pollutant: 'pm25',
              quality: '优',
              last_update: '2026-08-20T13:00:00+08:00',
            },
          },
        },
      ],
    });

    expect(snapshot).toMatchObject({
      provider: 'seniverse',
      location: '上海',
      region: '上海 · 中国',
      aqi: 0,
      aqiDisplay: '0',
      scale: 'cn-aqi',
      scaleLabel: '中国 AQI',
      quality: '优',
      severity: 'good',
      primaryPollutant: 'PM2.5',
      observedAt: new Date('2026-08-20T05:00:00.000Z'),
    });
    expect(snapshot?.pollutants).toHaveLength(6);
    expect(snapshot?.pollutants.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'pm2.5', label: 'PM2.5' },
      { id: 'pm10', label: 'PM10' },
      { id: 'so2', label: 'SO₂' },
      { id: 'no2', label: 'NO₂' },
      { id: 'co', label: 'CO' },
      { id: 'o3', label: 'O₃' },
    ]);
    expect(snapshot?.pollutants.every((pollutant) => !('icon' in pollutant))).toBe(
      true
    );
    expect(byId(snapshot?.pollutants ?? [])['pm2.5']).toMatchObject({
      value: 0,
      displayValue: '0',
      unit: 'μg/m³',
    });
    expect(byId(snapshot?.pollutants ?? [])['co']).toMatchObject({
      value: 0.62,
      displayValue: '0.62',
      unit: 'mg/m³',
    });
  });

  it('uses Seniverse quality text when AQI is absent', () => {
    const snapshot = seniverseCurrent({ quality: '重度污染' });

    expect(snapshot).toMatchObject({
      aqi: null,
      aqiDisplay: '--',
      quality: '重度污染',
      severity: 'very-unhealthy',
    });
    expect(snapshot?.healthAdvice).toContain('避免户外活动');
  });

  it.each([
    ['优', 'good'],
    ['良', 'moderate'],
  ] as Array<[string, AirQualitySeverity]>) (
    'classifies quality-only Seniverse text “%s” without ASCII word boundaries',
    (quality, severity) => {
      expect(seniverseCurrent({ quality })).toMatchObject({
        aqi: null,
        quality,
        severity,
      });
    },
  );

  it('normalizes multiple Seniverse primary pollutants without duplicates', () => {
    const snapshot = seniverseCurrent({
      aqi: 120,
      primary_pollutant: 'PM2_5，o3/pm2.5',
    });

    expect(snapshot?.primaryPollutant).toBe('PM2.5、O₃');
  });

  it('falls back to the Seniverse result update timestamp', () => {
    const snapshot = normalizeAirQualityResponse('seniverse', {
      results: [
        {
          air: { city: { aqi: 42 } },
          last_update: '2026-08-20T01:02:03Z',
        },
      ],
    });

    expect(snapshot?.observedAt).toEqual(new Date('2026-08-20T01:02:03Z'));
  });

  it('normalizes OpenWeather current data without relabeling its 1–5 scale', () => {
    const snapshot = normalizeAirQualityResponse('openWeather', {
      coord: { lat: 31.2304, lon: 121.4737 },
      list: [
        {
          dt: 0,
          main: { aqi: 3 },
          components: {
            co: 201.94,
            no: 0,
            no2: 0.77,
            o3: 68.66,
            so2: 0.64,
            pm2_5: 6.2,
            pm10: 7.8,
            nh3: 0.12,
          },
        },
      ],
    });

    expect(snapshot).toMatchObject({
      location: '31.2304, 121.4737',
      aqi: 3,
      aqiDisplay: '3/5',
      scale: 'openweather-1-5',
      quality: '一般',
      severity: 'unhealthy-sensitive',
      observedAt: new Date(0),
    });
    expect(snapshot?.pollutants).toHaveLength(8);
    expect(byId(snapshot?.pollutants ?? [])['co'].unit).toBe('μg/m³');
    expect(byId(snapshot?.pollutants ?? [])['no'].value).toBe(0);
  });

  it.each([
    [1, 'good', '优'],
    [2, 'moderate', '尚可'],
    [3, 'unhealthy-sensitive', '一般'],
    [4, 'unhealthy', '较差'],
    [5, 'very-unhealthy', '很差'],
  ] as Array<[number, AirQualitySeverity, string]>) (
    'maps OpenWeather category %s on its own scale',
    (aqi, severity, quality) => {
      const snapshot = openWeatherCurrent(aqi);

      expect(snapshot).toMatchObject({
        aqi,
        aqiDisplay: `${aqi}/5`,
        severity,
        quality,
      });
    },
  );

  it('rejects an out-of-range OpenWeather category when no pollutant data exists', () => {
    expect(openWeatherCurrent(6, undefined)).toBeNull();
  });

  it('retains usable OpenWeather pollutants when its category is malformed', () => {
    const snapshot = openWeatherCurrent(2.5, { pm2_5: 0 });

    expect(snapshot).toMatchObject({
      aqi: null,
      aqiDisplay: '--',
      severity: 'unknown',
    });
    expect(snapshot?.pollutants[0].value).toBe(0);
  });

  it('filters negative OpenWeather concentrations while retaining zero', () => {
    const snapshot = openWeatherCurrent(1, { pm2_5: -1, pm10: 0 });

    expect(snapshot?.pollutants.map((item) => item.id)).toEqual(['pm10']);
  });

  it('skips malformed OpenWeather list entries when a usable one remains', () => {
    const snapshot = normalizeAirQualityResponse('openWeather', {
      list: [null, [], {}, { main: { aqi: 2 }, components: {} }],
    });

    expect(snapshot?.aqi).toBe(2);
  });

  it('normalizes WeatherAPI location, EPA category and pollutants', () => {
    const snapshot = normalizeAirQualityResponse('weatherApi', {
      location: {
        name: 'London',
        region: 'City of London',
        country: 'United Kingdom',
      },
      current: {
        last_updated_epoch: 0,
        air_quality: {
          co: 230.3,
          no2: 13.5,
          o3: 54.3,
          so2: 7.9,
          pm2_5: 8.6,
          pm10: 11.3,
          'us-epa-index': 2,
          'gb-defra-index': 1,
        },
      },
    });

    expect(snapshot).toMatchObject({
      location: 'London',
      region: 'City of London · United Kingdom',
      aqi: 2,
      aqiDisplay: '2/6',
      scale: 'us-epa-1-6',
      scaleLabel: '美国 EPA 指数（1–6）',
      quality: '中等',
      severity: 'moderate',
      observedAt: new Date(0),
    });
    expect(snapshot?.pollutants).toHaveLength(6);
  });

  it.each([
    [1, 'good'],
    [2, 'moderate'],
    [3, 'unhealthy-sensitive'],
    [4, 'unhealthy'],
    [5, 'very-unhealthy'],
    [6, 'hazardous'],
  ] as Array<[number, AirQualitySeverity]>) (
    'maps WeatherAPI US EPA category %s without treating it as numeric US AQI',
    (index, severity) => {
      const snapshot = weatherApiCurrent(index);

      expect(snapshot).toMatchObject({
        aqi: index,
        aqiDisplay: `${index}/6`,
        scale: 'us-epa-1-6',
        severity,
      });
    },
  );

  it.each([0, 7, 2.5])(
    'rejects malformed WeatherAPI category %s',
    (index) => {
      expect(weatherApiCurrent(index)).toBeNull();
    },
  );

  it('normalizes Visual Crossing US AQI and resolved address', () => {
    const snapshot = normalizeAirQualityResponse('visualCrossing', {
      resolvedAddress: 'Paris, Île-de-France, France',
      currentConditions: {
        datetimeEpoch: 0,
        aqius: 151,
        aqieur: 3,
        pm1: 0,
        pm2p5: 12.34,
        pm10: 18,
        co: 201,
      },
    });

    expect(snapshot).toMatchObject({
      location: 'Paris',
      region: 'Île-de-France · France',
      aqi: 151,
      aqiDisplay: '151',
      scale: 'us-aqi',
      scaleLabel: '美国 AQI',
      quality: '中度污染',
      severity: 'unhealthy',
      observedAt: new Date(0),
    });
    expect(byId(snapshot?.pollutants ?? [])['pm1'].value).toBe(0);
  });

  it.each([
    [0, 'good'],
    [51, 'moderate'],
    [101, 'unhealthy-sensitive'],
    [151, 'unhealthy'],
    [201, 'very-unhealthy'],
    [301, 'hazardous'],
  ] as Array<[number, AirQualitySeverity]>) (
    'classifies Visual Crossing US AQI %s with numeric AQI thresholds',
    (aqi, severity) => {
      const snapshot = visualCrossingCurrent(aqi);
      expect(snapshot).toMatchObject({ aqi, severity });
    },
  );

  it('does not mislabel Visual Crossing European AQI as US AQI', () => {
    const snapshot = normalizeAirQualityResponse('visualCrossing', {
      currentConditions: { aqieur: 4 },
    });

    expect(snapshot).toBeNull();
  });

  it('keeps zero-valued Visual Crossing coordinates and pollution', () => {
    const snapshot = normalizeAirQualityResponse('visualCrossing', {
      latitude: 0,
      longitude: 0,
      currentConditions: { aqius: 0, pm2p5: 0 },
    });

    expect(snapshot).toMatchObject({ location: '0, 0', aqi: 0 });
    expect(snapshot?.pollutants[0].value).toBe(0);
  });

  it.each([
    ['seniverse', null],
    ['seniverse', { results: [{ air: { city: [] } }] }],
    ['seniverse', { results: [{ air: { city: { quality: 123 } } }] }],
    ['openWeather', { list: null }],
    ['openWeather', { list: [null, {}] }],
    ['weatherApi', { current: { air_quality: [] } }],
    ['weatherApi', { current: { air_quality: {} } }],
    ['visualCrossing', { currentConditions: [] }],
    ['visualCrossing', { currentConditions: {} }],
  ] as Array<[WeatherServiceProvider, unknown]>) (
    'returns null for a malformed or empty %s current payload',
    (provider, payload) => {
      expect(normalizeAirQualityResponse(provider, payload)).toBeNull();
    },
  );
});


function byId(pollutants: AirPollutant[]): Record<string, AirPollutant> {
  return Object.fromEntries(pollutants.map((pollutant) => [pollutant.id, pollutant]));
}

function seniverseCurrent(city: Record<string, unknown>) {
  return normalizeAirQualityResponse('seniverse', {
    results: [{ air: { city } }],
  });
}

function openWeatherCurrent(
  aqi: number,
  components?: Record<string, unknown>,
) {
  return normalizeAirQualityResponse('openWeather', {
    list: [{ main: { aqi }, ...(components === undefined ? {} : { components }) }],
  });
}

function weatherApiCurrent(index: number) {
  return normalizeAirQualityResponse('weatherApi', {
    current: { air_quality: { 'us-epa-index': index } },
  });
}

function visualCrossingCurrent(aqi: number) {
  return normalizeAirQualityResponse('visualCrossing', {
    currentConditions: { aqius: aqi },
  });
}
