import type { WeatherServiceProvider } from 'src/app/core/services/third-party-services.service';

export interface WeatherMetric {
  id: string;
  label: string;
  value: string;
  unit: string;
  icon: string;
}

export interface WeatherSnapshot {
  provider: WeatherServiceProvider;
  location: string;
  region: string;
  temperature: string;
  condition: string;
  icon: string;
  isDay: boolean;
  observedAt: Date | null;
  metrics: WeatherMetric[];
}

type JsonRecord = Record<string, unknown>;

const METRIC_ICONS = {
  temperature: 'fa-light fa-temperature-half',
  temperatureLow: 'fa-light fa-temperature-low',
  temperatureHigh: 'fa-light fa-temperature-high',
  humidity: 'fa-light fa-droplet-percent',
  wind: 'fa-light fa-wind',
  direction: 'fa-light fa-compass',
  pressure: 'fa-light fa-gauge-high',
  visibility: 'fa-light fa-eye',
  cloud: 'fa-light fa-cloud',
  rain: 'fa-light fa-cloud-rain',
  snow: 'fa-light fa-snowflake',
  dew: 'fa-light fa-droplet',
  sun: 'fa-light fa-sun-bright',
  air: 'fa-light fa-lungs',
  particles: 'fa-light fa-smog',
  gas: 'fa-light fa-flask',
  solar: 'fa-light fa-solar-panel',
  warning: 'fa-light fa-triangle-exclamation',
} as const;

const WEATHER_ICONS = {
  clearDay: 'fa-light fa-sun-bright',
  clearNight: 'fa-light fa-moon-stars',
  partlyCloudyDay: 'fa-light fa-cloud-sun',
  partlyCloudyNight: 'fa-light fa-cloud-moon',
  cloudy: 'fa-light fa-cloud',
  rain: 'fa-light fa-cloud-rain',
  showers: 'fa-light fa-cloud-showers-heavy',
  thunder: 'fa-light fa-cloud-bolt',
  snow: 'fa-light fa-snowflake',
  fog: 'fa-light fa-smog',
  wind: 'fa-light fa-wind',
} as const;

/**
 * Converts each supported provider's current-weather payload into a stable,
 * metric-first view model. Unknown optional fields are ignored, while a root
 * object that does not match the provider's documented shape returns null.
 */
export function normalizeWeatherResponse(
  provider: WeatherServiceProvider,
  data: unknown,
): WeatherSnapshot | null {
  switch (provider) {
    case 'seniverse':
      return normalizeSeniverse(data);
    case 'openWeather':
      return normalizeOpenWeather(data);
    case 'weatherApi':
      return normalizeWeatherApi(data);
    case 'visualCrossing':
      return normalizeVisualCrossing(data);
  }
}

function normalizeSeniverse(data: unknown): WeatherSnapshot | null {
  const root = asRecord(data);
  const result = firstArrayRecord(root?.['results']);
  const now = asRecord(result?.['now']);
  if (!root || !result || !now) return null;
  const temperature = pickNumber(now, ['temperature', 'temp']);
  if (temperature === null) return null;

  const locationData = asRecord(result['location']);
  const location = pickText(locationData, ['name']);
  const region = pathRegion(
    pickText(locationData, ['path']),
    location,
    pickText(locationData, ['country']),
  );
  const observedAt = parseDate(result['last_update']);
  const condition = pickText(now, ['text', 'condition']);
  const conditionCode = pickNumber(now, ['code']);
  const isDay = inferSeniverseDay(conditionCode, result['last_update']);
  const metrics: WeatherMetric[] = [];

  addNumberMetric(metrics, 'feels-like', '体感温度', pickNumber(now, ['feels_like', 'feelslike']), '°C', METRIC_ICONS.temperature);
  addNumberMetric(metrics, 'temp-min', '最低温度', pickNumber(now, ['temperature_min', 'temp_min', 'low']), '°C', METRIC_ICONS.temperatureLow);
  addNumberMetric(metrics, 'temp-max', '最高温度', pickNumber(now, ['temperature_max', 'temp_max', 'high']), '°C', METRIC_ICONS.temperatureHigh);
  addNumberMetric(metrics, 'humidity', '相对湿度', pickNumber(now, ['humidity']), '%', METRIC_ICONS.humidity);
  addNumberMetric(metrics, 'wind-speed', '风速', pickNumber(now, ['wind_speed']), 'km/h', METRIC_ICONS.wind);
  addWindDirection(metrics, pickText(now, ['wind_direction']), pickNumber(now, ['wind_direction_degree']));
  addNumberMetric(metrics, 'wind-gust', '阵风', pickNumber(now, ['wind_gust', 'gust']), 'km/h', METRIC_ICONS.wind);
  addTextMetric(metrics, 'wind-scale', '风力等级', pickText(now, ['wind_scale']), '级', METRIC_ICONS.wind);
  addNumberMetric(metrics, 'pressure', '气压', pickNumber(now, ['pressure']), 'hPa', METRIC_ICONS.pressure);
  addNumberMetric(metrics, 'visibility', '能见度', pickNumber(now, ['visibility']), 'km', METRIC_ICONS.visibility);
  addNumberMetric(metrics, 'cloud-cover', '云量', pickNumber(now, ['clouds', 'cloud']), '%', METRIC_ICONS.cloud);
  addNumberMetric(metrics, 'precipitation', '降水量', pickNumber(now, ['precipitation', 'precip', 'rainfall']), 'mm', METRIC_ICONS.rain, 2);
  addNumberMetric(metrics, 'dew-point', '露点', pickNumber(now, ['dew_point', 'dew']), '°C', METRIC_ICONS.dew);
  addNumberMetric(metrics, 'uv-index', '紫外线指数', pickNumber(now, ['uv', 'uv_index']), '', METRIC_ICONS.sun);
  addNumberMetric(metrics, 'snow', '降雪量', pickNumber(now, ['snow']), 'mm', METRIC_ICONS.snow, 2);
  addNumberMetric(metrics, 'snow-depth', '积雪深度', pickNumber(now, ['snow_depth']), 'cm', METRIC_ICONS.snow, 2);
  addNumberMetric(metrics, 'solar-radiation', '太阳辐射', pickNumber(now, ['solar_radiation', 'solarradiation']), 'W/m²', METRIC_ICONS.solar);
  addNumberMetric(metrics, 'solar-energy', '太阳能量', pickNumber(now, ['solar_energy', 'solarenergy']), 'MJ/m²', METRIC_ICONS.solar);

  const airQuality =
    asRecord(now['air_quality']) ??
    asRecord(now['airQuality']) ??
    asRecord(result['air_quality']);
  addAirQualityMetrics(metrics, airQuality);
  addNumberMetric(metrics, 'aqi', '空气质量指数', pickNumber(now, ['aqi']), '', METRIC_ICONS.air);

  return {
    provider: 'seniverse',
    location,
    region,
    temperature: formatOptionalNumber(temperature),
    condition,
    icon: seniverseWeatherIcon(conditionCode, condition, isDay),
    isDay,
    observedAt,
    metrics,
  };
}

function normalizeOpenWeather(data: unknown): WeatherSnapshot | null {
  const root = asRecord(data);
  const main = asRecord(root?.['main']);
  if (!root || !main) return null;
  const temperature = pickNumber(main, ['temp']);
  if (temperature === null) return null;

  const weather = firstArrayRecord(root['weather']);
  const system = asRecord(root['sys']);
  const wind = asRecord(root['wind']);
  const clouds = asRecord(root['clouds']);
  const rain = asRecord(root['rain']);
  const snow = asRecord(root['snow']);
  const condition = pickText(weather, ['description', 'main']);
  const providerIcon = pickText(weather, ['icon']);
  const observedAt = parseDate(root['dt']);
  const isDay = inferOpenWeatherDay(
    providerIcon,
    pickNumber(root, ['dt']),
    pickNumber(root, ['timezone']),
    pickNumber(system, ['sunrise']),
    pickNumber(system, ['sunset']),
  );
  const metrics: WeatherMetric[] = [];

  addNumberMetric(metrics, 'feels-like', '体感温度', pickNumber(main, ['feels_like']), '°C', METRIC_ICONS.temperature);
  addNumberMetric(metrics, 'temp-min', '最低温度', pickNumber(main, ['temp_min']), '°C', METRIC_ICONS.temperatureLow);
  addNumberMetric(metrics, 'temp-max', '最高温度', pickNumber(main, ['temp_max']), '°C', METRIC_ICONS.temperatureHigh);
  addNumberMetric(metrics, 'humidity', '相对湿度', pickNumber(main, ['humidity']), '%', METRIC_ICONS.humidity);
  addNumberMetric(metrics, 'wind-speed', '风速', convert(pickNumber(wind, ['speed']), metresPerSecondToKilometresPerHour), 'km/h', METRIC_ICONS.wind);
  addWindDirection(metrics, '', pickNumber(wind, ['deg']));
  addNumberMetric(metrics, 'wind-gust', '阵风', convert(pickNumber(wind, ['gust']), metresPerSecondToKilometresPerHour), 'km/h', METRIC_ICONS.wind);
  addNumberMetric(metrics, 'pressure', '气压', pickNumber(main, ['pressure']), 'hPa', METRIC_ICONS.pressure);
  addNumberMetric(metrics, 'sea-level-pressure', '海平面气压', pickNumber(main, ['sea_level']), 'hPa', METRIC_ICONS.pressure);
  addNumberMetric(metrics, 'ground-level-pressure', '地面气压', pickNumber(main, ['grnd_level']), 'hPa', METRIC_ICONS.pressure);
  addNumberMetric(metrics, 'visibility', '能见度', convert(pickNumber(root, ['visibility']), metresToKilometres), 'km', METRIC_ICONS.visibility);
  addNumberMetric(metrics, 'cloud-cover', '云量', pickNumber(clouds, ['all']), '%', METRIC_ICONS.cloud);
  addNumberMetric(metrics, 'precipitation', '降水量', firstNumber(pickNumber(rain, ['1h']), pickNumber(rain, ['3h'])), 'mm', METRIC_ICONS.rain, 2);
  addNumberMetric(metrics, 'snow', '降雪量', firstNumber(pickNumber(snow, ['1h']), pickNumber(snow, ['3h'])), 'mm', METRIC_ICONS.snow, 2);
  addNumberMetric(metrics, 'dew-point', '露点', firstNumber(pickNumber(main, ['dew_point']), pickNumber(root, ['dew_point'])), '°C', METRIC_ICONS.dew);
  addNumberMetric(metrics, 'uv-index', '紫外线指数', pickNumber(root, ['uvi', 'uv']), '', METRIC_ICONS.sun);
  addNumberMetric(metrics, 'solar-radiation', '太阳辐射', pickNumber(root, ['solar_radiation', 'solarradiation']), 'W/m²', METRIC_ICONS.solar);
  addAirQualityMetrics(metrics, asRecord(root['air_quality']));

  return {
    provider: 'openWeather',
    location: pickText(root, ['name']),
    region: pickText(system, ['country']),
    temperature: formatOptionalNumber(temperature),
    condition,
    icon: openWeatherIcon(providerIcon, condition, isDay),
    isDay,
    observedAt,
    metrics,
  };
}

function normalizeWeatherApi(data: unknown): WeatherSnapshot | null {
  const root = asRecord(data);
  const current = asRecord(root?.['current']);
  if (!root || !current) return null;

  const locationData = asRecord(root['location']);
  const conditionData = asRecord(current['condition']);
  const condition = pickText(conditionData, ['text']);
  const conditionCode = pickNumber(conditionData, ['code']);
  const explicitDay = pickNumber(current, ['is_day']);
  const providerIcon = pickText(conditionData, ['icon']);
  const isDay = inferDay(explicitDay, providerIcon, null, true);
  const observedAt = firstDate(
    current['last_updated_epoch'],
    current['last_updated'],
  );
  const metrics: WeatherMetric[] = [];

  const temperature = metricTemperature(current, 'temp_c', 'temp_f');
  if (temperature === null) return null;
  addNumberMetric(metrics, 'feels-like', '体感温度', metricTemperature(current, 'feelslike_c', 'feelslike_f'), '°C', METRIC_ICONS.temperature);
  addNumberMetric(metrics, 'temp-min', '最低温度', metricTemperature(current, 'temp_min_c', 'temp_min_f'), '°C', METRIC_ICONS.temperatureLow);
  addNumberMetric(metrics, 'temp-max', '最高温度', metricTemperature(current, 'temp_max_c', 'temp_max_f'), '°C', METRIC_ICONS.temperatureHigh);
  addNumberMetric(metrics, 'humidity', '相对湿度', pickNumber(current, ['humidity']), '%', METRIC_ICONS.humidity);
  addNumberMetric(metrics, 'wind-speed', '风速', metricSpeed(current, 'wind_kph', 'wind_mph'), 'km/h', METRIC_ICONS.wind);
  addWindDirection(metrics, pickText(current, ['wind_dir']), pickNumber(current, ['wind_degree']));
  addNumberMetric(metrics, 'wind-gust', '阵风', metricSpeed(current, 'gust_kph', 'gust_mph'), 'km/h', METRIC_ICONS.wind);
  addNumberMetric(metrics, 'wind-100m', '100 米风速', metricSpeed(current, 'wind100_kph', 'wind100_mph'), 'km/h', METRIC_ICONS.wind);
  addNumberMetric(metrics, 'pressure', '气压', firstNumber(pickNumber(current, ['pressure_mb']), convert(pickNumber(current, ['pressure_in']), inchesMercuryToHectopascals)), 'hPa', METRIC_ICONS.pressure);
  addNumberMetric(metrics, 'visibility', '能见度', firstNumber(pickNumber(current, ['vis_km']), convert(pickNumber(current, ['vis_miles']), milesToKilometres)), 'km', METRIC_ICONS.visibility);
  addNumberMetric(metrics, 'cloud-cover', '云量', pickNumber(current, ['cloud']), '%', METRIC_ICONS.cloud);
  addNumberMetric(metrics, 'precipitation', '降水量', firstNumber(pickNumber(current, ['precip_mm']), convert(pickNumber(current, ['precip_in']), inchesToMillimetres)), 'mm', METRIC_ICONS.rain, 2);
  addNumberMetric(metrics, 'dew-point', '露点', metricTemperature(current, 'dewpoint_c', 'dewpoint_f'), '°C', METRIC_ICONS.dew);
  addNumberMetric(metrics, 'uv-index', '紫外线指数', pickNumber(current, ['uv']), '', METRIC_ICONS.sun);
  addNumberMetric(metrics, 'wind-chill', '风寒温度', metricTemperature(current, 'windchill_c', 'windchill_f'), '°C', METRIC_ICONS.temperature);
  addNumberMetric(metrics, 'heat-index', '体感热度', metricTemperature(current, 'heatindex_c', 'heatindex_f'), '°C', METRIC_ICONS.temperatureHigh);
  addNumberMetric(metrics, 'wet-bulb', '湿球温度', metricTemperature(current, 'wetbulb_c', 'wetbulb_f'), '°C', METRIC_ICONS.temperature);
  addNumberMetric(metrics, 'solar-radiation', '短波辐射', pickNumber(current, ['short_rad']), 'W/m²', METRIC_ICONS.solar);
  addNumberMetric(metrics, 'diffuse-radiation', '散射辐射', pickNumber(current, ['diff_rad']), 'W/m²', METRIC_ICONS.solar);
  addNumberMetric(metrics, 'direct-radiation', '直接辐射', pickNumber(current, ['dni']), 'W/m²', METRIC_ICONS.solar);
  addNumberMetric(metrics, 'tilted-radiation', '倾斜面辐射', pickNumber(current, ['gti']), 'W/m²', METRIC_ICONS.solar);
  addAirQualityMetrics(metrics, asRecord(current['air_quality']));

  return {
    provider: 'weatherApi',
    location: pickText(locationData, ['name']),
    region: joinDistinct([
      pickText(locationData, ['region']),
      pickText(locationData, ['country']),
    ]),
    temperature: formatOptionalNumber(temperature),
    condition,
    icon: weatherApiIcon(conditionCode, condition, isDay),
    isDay,
    observedAt,
    metrics,
  };
}

function normalizeVisualCrossing(data: unknown): WeatherSnapshot | null {
  const root = asRecord(data);
  const current = asRecord(root?.['currentConditions']);
  if (!root || !current) return null;
  const temperature = pickNumber(current, ['temp']);
  if (temperature === null) return null;

  const resolvedLocation = splitResolvedLocation(
    pickText(root, ['resolvedAddress', 'address']),
  );
  const providerIcon = pickText(current, ['icon']);
  const condition = pickText(current, ['conditions', 'description']);
  const isDay = inferDay(current['isday'], providerIcon, current['datetime'], true);
  const observedAt = firstDate(current['datetimeEpoch'], current['datetime']);
  const metrics: WeatherMetric[] = [];

  addNumberMetric(metrics, 'feels-like', '体感温度', pickNumber(current, ['feelslike']), '°C', METRIC_ICONS.temperature);
  addNumberMetric(metrics, 'temp-min', '最低温度', pickNumber(current, ['tempmin']), '°C', METRIC_ICONS.temperatureLow);
  addNumberMetric(metrics, 'temp-max', '最高温度', pickNumber(current, ['tempmax']), '°C', METRIC_ICONS.temperatureHigh);
  addNumberMetric(metrics, 'humidity', '相对湿度', pickNumber(current, ['humidity']), '%', METRIC_ICONS.humidity);
  addNumberMetric(metrics, 'wind-speed', '风速', pickNumber(current, ['windspeed']), 'km/h', METRIC_ICONS.wind);
  addWindDirection(metrics, '', pickNumber(current, ['winddir']));
  addNumberMetric(metrics, 'wind-gust', '阵风', pickNumber(current, ['windgust']), 'km/h', METRIC_ICONS.wind);
  addNumberMetric(metrics, 'pressure', '气压', pickNumber(current, ['pressure']), 'hPa', METRIC_ICONS.pressure);
  addNumberMetric(metrics, 'visibility', '能见度', pickNumber(current, ['visibility']), 'km', METRIC_ICONS.visibility);
  addNumberMetric(metrics, 'cloud-cover', '云量', pickNumber(current, ['cloudcover']), '%', METRIC_ICONS.cloud);
  addNumberMetric(metrics, 'precipitation', '降水量', pickNumber(current, ['precip']), 'mm', METRIC_ICONS.rain, 2);
  addNumberMetric(metrics, 'precip-probability', '降水概率', pickNumber(current, ['precipprob']), '%', METRIC_ICONS.rain);
  addNumberMetric(metrics, 'dew-point', '露点', pickNumber(current, ['dew']), '°C', METRIC_ICONS.dew);
  addNumberMetric(metrics, 'uv-index', '紫外线指数', pickNumber(current, ['uvindex']), '', METRIC_ICONS.sun);
  addNumberMetric(metrics, 'snow', '降雪量', pickNumber(current, ['snow']), 'cm', METRIC_ICONS.snow, 2);
  addNumberMetric(metrics, 'snow-depth', '积雪深度', pickNumber(current, ['snowdepth']), 'cm', METRIC_ICONS.snow, 2);
  addNumberMetric(metrics, 'solar-radiation', '太阳辐射', pickNumber(current, ['solarradiation']), 'W/m²', METRIC_ICONS.solar);
  addNumberMetric(metrics, 'solar-energy', '太阳能量', pickNumber(current, ['solarenergy']), 'MJ/m²', METRIC_ICONS.solar);
  addNumberMetric(metrics, 'severe-risk', '强天气风险', pickNumber(current, ['severerisk']), '%', METRIC_ICONS.warning);
  addNumberMetric(metrics, 'wet-bulb', '湿球温度', pickNumber(current, ['tempwet', 'wetbulb']), '°C', METRIC_ICONS.temperature);
  addAirQualityMetrics(metrics, current);

  const coordinateFallback = coordinateLabel(
    pickNumber(root, ['latitude']),
    pickNumber(root, ['longitude']),
  );

  return {
    provider: 'visualCrossing',
    location: resolvedLocation.location || coordinateFallback,
    region: resolvedLocation.region,
    temperature: formatOptionalNumber(temperature),
    condition,
    icon: visualCrossingIcon(providerIcon, condition, isDay),
    isDay,
    observedAt,
    metrics,
  };
}

function addAirQualityMetrics(
  metrics: WeatherMetric[],
  airQuality: JsonRecord | null,
): void {
  if (!airQuality) return;

  addNumberMetric(metrics, 'aqi', '空气质量指数', pickNumber(airQuality, ['aqi']), '', METRIC_ICONS.air);
  addNumberMetric(metrics, 'aqi-us', '美国 AQI', pickNumber(airQuality, ['us-epa-index', 'us_epa_index', 'aqius']), '', METRIC_ICONS.air);
  addNumberMetric(metrics, 'aqi-uk', '英国空气指数', pickNumber(airQuality, ['gb-defra-index', 'gb_defra_index']), '', METRIC_ICONS.air);
  addNumberMetric(metrics, 'aqi-eu', '欧洲空气指数', pickNumber(airQuality, ['aqieur']), '', METRIC_ICONS.air);
  addNumberMetric(metrics, 'pm1', 'PM1', pickNumber(airQuality, ['pm1', 'pm1_0']), 'μg/m³', METRIC_ICONS.particles);
  addNumberMetric(metrics, 'pm2.5', 'PM2.5', pickNumber(airQuality, ['pm2_5', 'pm2p5', 'pm25']), 'μg/m³', METRIC_ICONS.particles);
  addNumberMetric(metrics, 'pm10', 'PM10', pickNumber(airQuality, ['pm10']), 'μg/m³', METRIC_ICONS.particles);
  addNumberMetric(metrics, 'co', '一氧化碳', pickNumber(airQuality, ['co']), 'μg/m³', METRIC_ICONS.gas);
  addNumberMetric(metrics, 'no2', '二氧化氮', pickNumber(airQuality, ['no2']), 'μg/m³', METRIC_ICONS.gas);
  addNumberMetric(metrics, 'o3', '臭氧', pickNumber(airQuality, ['o3']), 'μg/m³', METRIC_ICONS.gas);
  addNumberMetric(metrics, 'so2', '二氧化硫', pickNumber(airQuality, ['so2']), 'μg/m³', METRIC_ICONS.gas);
}

function addNumberMetric(
  metrics: WeatherMetric[],
  id: string,
  label: string,
  value: number | null,
  unit: string,
  icon: string,
  maximumFractionDigits = 1,
): void {
  if (value === null || !Number.isFinite(value) || hasMetric(metrics, id)) return;
  metrics.push({
    id,
    label,
    value: formatNumber(value, maximumFractionDigits),
    unit,
    icon,
  });
}

function addTextMetric(
  metrics: WeatherMetric[],
  id: string,
  label: string,
  value: string,
  unit: string,
  icon: string,
): void {
  if (!value || hasMetric(metrics, id)) return;
  metrics.push({ id, label, value, unit, icon });
}

function addWindDirection(
  metrics: WeatherMetric[],
  direction: string,
  degrees: number | null,
): void {
  const normalizedDegrees = degrees === null ? null : normalizeDegrees(degrees);
  const translatedDirection = translateDirection(direction);
  const compass =
    translatedDirection ||
    (normalizedDegrees === null ? '' : compassDirection(normalizedDegrees));
  const degreeLabel =
    normalizedDegrees === null ? '' : `${formatNumber(normalizedDegrees, 0)}°`;
  addTextMetric(
    metrics,
    'wind-direction',
    '风向',
    [compass, degreeLabel].filter(Boolean).join(' '),
    '',
    METRIC_ICONS.direction,
  );
}

function hasMetric(metrics: WeatherMetric[], id: string): boolean {
  return metrics.some((metric) => metric.id === id);
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstArrayRecord(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = asRecord(item);
    if (record) return record;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(
  record: JsonRecord | null | undefined,
  keys: readonly string[],
): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = finiteNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function cleanText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function pickText(
  record: JsonRecord | null | undefined,
  keys: readonly string[],
): string {
  if (!record) return '';
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) return value;
  }
  return '';
}

function firstNumber(...values: Array<number | null>): number | null {
  return values.find((value): value is number => value !== null) ?? null;
}

function convert(
  value: number | null,
  converter: (source: number) => number,
): number | null {
  if (value === null) return null;
  const converted = converter(value);
  return Number.isFinite(converted) ? converted : null;
}

function metricTemperature(
  record: JsonRecord,
  celsiusKey: string,
  fahrenheitKey: string,
): number | null {
  return firstNumber(
    pickNumber(record, [celsiusKey]),
    convert(pickNumber(record, [fahrenheitKey]), fahrenheitToCelsius),
  );
}

function metricSpeed(
  record: JsonRecord,
  kilometresPerHourKey: string,
  milesPerHourKey: string,
): number | null {
  return firstNumber(
    pickNumber(record, [kilometresPerHourKey]),
    convert(pickNumber(record, [milesPerHourKey]), milesToKilometres),
  );
}

function fahrenheitToCelsius(value: number): number {
  return ((value - 32) * 5) / 9;
}

function milesToKilometres(value: number): number {
  return value * 1.609344;
}

function inchesToMillimetres(value: number): number {
  return value * 25.4;
}

function inchesMercuryToHectopascals(value: number): number {
  return value * 33.8638866667;
}

function metresToKilometres(value: number): number {
  return value / 1000;
}

function metresPerSecondToKilometresPerHour(value: number): number {
  return value * 3.6;
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? '' : formatNumber(value);
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  const rounded = Number(value.toFixed(maximumFractionDigits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  const numericValue = finiteNumber(value);
  if (numericValue !== null) {
    const milliseconds =
      Math.abs(numericValue) < 100_000_000_000
        ? numericValue * 1000
        : numericValue;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const text = cleanText(value);
  if (!text || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function firstDate(...values: unknown[]): Date | null {
  for (const value of values) {
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

function splitResolvedLocation(value: string): {
  location: string;
  region: string;
} {
  const parts = value
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { location: value, region: '' };
  return {
    location: parts[0],
    region: joinDistinct(parts.slice(1)),
  };
}

function pathRegion(path: string, location: string, country: string): string {
  const parts = path
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index) => !(index === 0 && sameText(part, location)));
  if (parts.length > 0) return joinDistinct(parts);
  return sameText(country, location) ? '' : country;
}

function joinDistinct(values: string[]): string {
  const unique: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    if (!unique.some((item) => sameText(item, value))) unique.push(value);
  }
  return unique.join(' · ');
}

function sameText(left: string, right: string): boolean {
  return Boolean(left) && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function coordinateLabel(latitude: number | null, longitude: number | null): string {
  if (latitude === null || longitude === null) return '';
  return `${formatNumber(latitude, 4)}, ${formatNumber(longitude, 4)}`;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function compassDirection(degrees: number): string {
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return directions[Math.round(degrees / 45) % directions.length];
}

function translateDirection(direction: string): string {
  const normalized = direction.trim().toUpperCase();
  const names: Record<string, string> = {
    N: '北',
    NNE: '北东北',
    NE: '东北',
    ENE: '东东北',
    E: '东',
    ESE: '东东南',
    SE: '东南',
    SSE: '南东南',
    S: '南',
    SSW: '南西南',
    SW: '西南',
    WSW: '西西南',
    W: '西',
    WNW: '西西北',
    NW: '西北',
    NNW: '北西北',
  };
  return names[normalized] ?? direction.trim();
}

function inferSeniverseDay(code: number | null, timestamp: unknown): boolean {
  if (code !== null) {
    if ([1, 3, 6, 8].includes(code)) return false;
    if ([0, 2, 5, 7].includes(code)) return true;
  }
  return inferDay(null, '', timestamp, true);
}

function inferOpenWeatherDay(
  icon: string,
  observedEpoch: number | null,
  timezoneOffset: number | null,
  sunriseEpoch: number | null,
  sunsetEpoch: number | null,
): boolean {
  const iconDay = dayFromIcon(icon);
  if (iconDay !== null) return iconDay;
  if (
    observedEpoch !== null &&
    sunriseEpoch !== null &&
    sunsetEpoch !== null
  ) {
    return observedEpoch >= sunriseEpoch && observedEpoch < sunsetEpoch;
  }
  if (observedEpoch !== null) {
    const localHour = new Date(
      (observedEpoch + (timezoneOffset ?? 0)) * 1000,
    ).getUTCHours();
    return localHour >= 6 && localHour < 18;
  }
  return true;
}

function inferDay(
  explicit: unknown,
  icon: string,
  localTimestamp: unknown,
  fallback: boolean,
): boolean {
  if (typeof explicit === 'boolean') return explicit;
  const numeric = finiteNumber(explicit);
  if (numeric !== null) return numeric !== 0;
  const explicitText = cleanText(explicit).toLowerCase();
  if (['day', 'd', 'true'].includes(explicitText)) return true;
  if (['night', 'n', 'false'].includes(explicitText)) return false;

  const iconDay = dayFromIcon(icon);
  if (iconDay !== null) return iconDay;

  const timestampText = cleanText(localTimestamp);
  const hourMatch = timestampText.match(/(?:T|\s|^)(\d{1,2}):\d{2}/);
  if (hourMatch) {
    const hour = Number(hourMatch[1]);
    if (Number.isFinite(hour)) return hour >= 6 && hour < 18;
  }
  return fallback;
}

function dayFromIcon(icon: string): boolean | null {
  const normalized = icon.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('night') || /\d{2}n(?:\.|$)/.test(normalized)) {
    return false;
  }
  if (normalized.includes('day') || /\d{2}d(?:\.|$)/.test(normalized)) {
    return true;
  }
  return null;
}

export function seniverseWeatherIcon(
  code: number | null,
  condition: string,
  isDay: boolean,
): string {
  if (code !== null) {
    if ([0, 1].includes(code)) return clearIcon(isDay);
    if ([2, 3, 5, 6, 7, 8].includes(code)) return partlyCloudyIcon(isDay);
    if ([4, 9].includes(code)) return WEATHER_ICONS.cloudy;
    if ([10, 13, 14, 15, 16, 17, 18, 19].includes(code)) return WEATHER_ICONS.rain;
    if ([11, 12].includes(code)) return WEATHER_ICONS.thunder;
    if ([20, 21, 22, 23, 24, 25].includes(code)) return WEATHER_ICONS.snow;
    if ([26, 27, 28, 29, 30, 31].includes(code)) return WEATHER_ICONS.fog;
    if ([32, 33, 34, 35, 36].includes(code)) return WEATHER_ICONS.wind;
  }
  return weatherIconFromText(condition, isDay);
}

export function openWeatherIcon(
  providerIcon: string,
  condition: string,
  isDay: boolean,
): string {
  switch (providerIcon.slice(0, 2)) {
    case '01':
      return clearIcon(isDay);
    case '02':
      return partlyCloudyIcon(isDay);
    case '03':
    case '04':
      return WEATHER_ICONS.cloudy;
    case '09':
      return WEATHER_ICONS.showers;
    case '10':
      return WEATHER_ICONS.rain;
    case '11':
      return WEATHER_ICONS.thunder;
    case '13':
      return WEATHER_ICONS.snow;
    case '50':
      return WEATHER_ICONS.fog;
    default:
      return weatherIconFromText(condition, isDay);
  }
}

export function weatherApiIcon(
  code: number | null,
  condition: string,
  isDay: boolean,
): string {
  if (code !== null) {
    if (code === 1000) return clearIcon(isDay);
    if (code === 1003) return partlyCloudyIcon(isDay);
    if ([1006, 1009].includes(code)) return WEATHER_ICONS.cloudy;
    if ([1030, 1135, 1147].includes(code)) return WEATHER_ICONS.fog;
    if ([1087, 1273, 1276, 1279, 1282].includes(code)) {
      return WEATHER_ICONS.thunder;
    }
    if (
      [
        1066, 1069, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219,
        1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264,
      ].includes(code)
    ) {
      return WEATHER_ICONS.snow;
    }
    if (
      [
        1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189,
        1192, 1195, 1198, 1201, 1240, 1243, 1246,
      ].includes(code)
    ) {
      return WEATHER_ICONS.rain;
    }
  }
  return weatherIconFromText(condition, isDay);
}

export function visualCrossingIcon(
  providerIcon: string,
  condition: string,
  isDay: boolean,
): string {
  const normalized = providerIcon.toLowerCase();
  if (normalized === 'clear-day' || normalized === 'clear-night') {
    return clearIcon(isDay);
  }
  if (normalized.startsWith('partly-cloudy')) return partlyCloudyIcon(isDay);
  if (normalized.includes('thunder')) return WEATHER_ICONS.thunder;
  if (normalized.includes('snow') || normalized.includes('sleet')) return WEATHER_ICONS.snow;
  if (normalized.includes('rain') || normalized.includes('showers')) return WEATHER_ICONS.rain;
  if (normalized.includes('fog') || normalized.includes('mist')) return WEATHER_ICONS.fog;
  if (normalized.includes('wind')) return WEATHER_ICONS.wind;
  if (normalized.includes('cloud')) return WEATHER_ICONS.cloudy;
  return weatherIconFromText(condition, isDay);
}

function weatherIconFromText(condition: string, isDay: boolean): string {
  const normalized = condition.toLowerCase();
  if (/雷|thunder|lightning/.test(normalized)) return WEATHER_ICONS.thunder;
  if (/雪|冰雹|snow|sleet|hail|blizzard/.test(normalized)) return WEATHER_ICONS.snow;
  if (/阵雨|暴雨|shower|downpour/.test(normalized)) return WEATHER_ICONS.showers;
  if (/雨|drizzle|rain/.test(normalized)) return WEATHER_ICONS.rain;
  if (/雾|霾|沙|尘|烟|fog|mist|haze|smog|dust|smoke/.test(normalized)) return WEATHER_ICONS.fog;
  if (/台风|龙卷|飓风|大风|wind|tornado|hurricane/.test(normalized)) return WEATHER_ICONS.wind;
  if (/少云|多云|局部多云|partly|mostly cloudy|fair/.test(normalized)) return partlyCloudyIcon(isDay);
  if (/阴|云|overcast|cloud/.test(normalized)) return WEATHER_ICONS.cloudy;
  if (/晴|clear|sunny/.test(normalized)) return clearIcon(isDay);
  return partlyCloudyIcon(isDay);
}

function clearIcon(isDay: boolean): string {
  return isDay ? WEATHER_ICONS.clearDay : WEATHER_ICONS.clearNight;
}

function partlyCloudyIcon(isDay: boolean): string {
  return isDay
    ? WEATHER_ICONS.partlyCloudyDay
    : WEATHER_ICONS.partlyCloudyNight;
}
