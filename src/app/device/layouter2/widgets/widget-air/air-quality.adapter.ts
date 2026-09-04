import type { WeatherServiceProvider } from 'src/app/core/services/third-party-services.service';

export type AirQualitySeverity =
  | 'good'
  | 'moderate'
  | 'unhealthy-sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous'
  | 'unknown';

/** The provider-specific index behind `aqi`; these values are not interchangeable. */
export type AirQualityScale =
  | 'cn-aqi'
  | 'openweather-1-5'
  | 'us-epa-1-6'
  | 'us-aqi';

export interface AirPollutant {
  id: string;
  label: string;
  value: number;
  displayValue: string;
  unit: string;
}

export interface AirQualitySnapshot {
  provider: WeatherServiceProvider;
  location: string;
  region: string;
  /** A value on `scale`, not a cross-provider normalized AQI. */
  aqi: number | null;
  aqiDisplay: string;
  scale: AirQualityScale;
  scaleLabel: string;
  quality: string;
  severity: AirQualitySeverity;
  primaryPollutant: string;
  healthAdvice: string;
  observedAt: Date | null;
  pollutants: AirPollutant[];
}

type JsonRecord = Record<string, unknown>;

interface AirAssessment {
  aqi: number | null;
  aqiDisplay: string;
  scale: AirQualityScale;
  scaleLabel: string;
  quality: string;
  severity: AirQualitySeverity;
  healthAdvice: string;
}

interface PollutantDefinition {
  id: string;
  label: string;
  keys: string[];
}

interface SnapshotOptions {
  provider: WeatherServiceProvider;
  scale: AirQualityScale;
  aqi: number | null;
  quality: string;
  location: string;
  region: string;
  primaryPollutant: string;
  observedAt: Date | null;
  pollutants: AirPollutant[];
}

const POLLUTANT_DEFINITIONS: readonly PollutantDefinition[] = [
  {
    id: 'pm2.5',
    label: 'PM2.5',
    keys: ['pm25', 'pm2_5', 'pm2p5', 'pm2.5'],
  },
  {
    id: 'pm10',
    label: 'PM10',
    keys: ['pm10'],
  },
  {
    id: 'pm1',
    label: 'PM1',
    keys: ['pm1', 'pm1_0'],
  },
  {
    id: 'so2',
    label: 'SO₂',
    keys: ['so2'],
  },
  {
    id: 'no2',
    label: 'NO₂',
    keys: ['no2'],
  },
  {
    id: 'co',
    label: 'CO',
    keys: ['co'],
  },
  {
    id: 'o3',
    label: 'O₃',
    keys: ['o3'],
  },
  {
    id: 'no',
    label: 'NO',
    keys: ['no'],
  },
  {
    id: 'nh3',
    label: 'NH₃',
    keys: ['nh3'],
  },
];

/** Converts a provider's current-air-quality response into a stable view model. */
export function normalizeAirQualityResponse(
  provider: WeatherServiceProvider,
  data: unknown,
): AirQualitySnapshot | null {
  switch (provider) {
    case 'seniverse':
      return normalizeSeniverseCurrent(data);
    case 'openWeather':
      return normalizeOpenWeatherCurrent(data);
    case 'weatherApi':
      return normalizeWeatherApiCurrent(data);
    case 'visualCrossing':
      return normalizeVisualCrossingCurrent(data);
  }
}

function normalizeSeniverseCurrent(data: unknown): AirQualitySnapshot | null {
  const root = asRecord(data);
  if (!root || !Array.isArray(root['results'])) return null;

  for (const result of records(root['results'])) {
    const air = asRecord(result['air']);
    const city = asRecord(air?.['city']);
    if (!city) continue;

    const locationData = asRecord(result['location']);
    const location = pickText(locationData, ['name']);
    const snapshot = createSnapshot({
      provider: 'seniverse',
      scale: 'cn-aqi',
      aqi: nonNegativeNumber(pickNumber(city, ['aqi'])),
      quality: meaningfulText(pickText(city, ['quality'])),
      location,
      region: pathRegion(
        pickText(locationData, ['path']),
        location,
        pickText(locationData, ['country']),
      ),
      primaryPollutant: normalizePrimaryPollutant(
        pickText(city, ['primary_pollutant', 'primaryPollutant']),
      ),
      observedAt: firstDate(city['last_update'], result['last_update']),
      pollutants: pollutantsFromRecord(city, 'mg/m³'),
    });
    if (snapshot) return snapshot;
  }
  return null;
}

function normalizeOpenWeatherCurrent(data: unknown): AirQualitySnapshot | null {
  const root = asRecord(data);
  if (!root || !Array.isArray(root['list'])) return null;

  for (const item of records(root['list'])) {
    const main = asRecord(item['main']);
    const components = asRecord(item['components']);
    const snapshot = createSnapshot({
      provider: 'openWeather',
      scale: 'openweather-1-5',
      aqi: categoryIndex(pickNumber(main, ['aqi']), 5),
      quality: '',
      location:
        pickText(root, ['name']) || coordinateLabel(asRecord(root['coord'])),
      region: '',
      primaryPollutant: '',
      observedAt: parseDate(item['dt']),
      pollutants: pollutantsFromRecord(components, 'μg/m³'),
    });
    if (snapshot) return snapshot;
  }
  return null;
}

function normalizeWeatherApiCurrent(data: unknown): AirQualitySnapshot | null {
  const root = asRecord(data);
  const current = asRecord(root?.['current']);
  const air = asRecord(current?.['air_quality']);
  if (!root || !current || !air) return null;

  const locationData = asRecord(root['location']);
  return createSnapshot({
    provider: 'weatherApi',
    scale: 'us-epa-1-6',
    aqi: categoryIndex(
      pickNumber(air, ['us-epa-index', 'us_epa_index']),
      6,
    ),
    quality: '',
    location: pickText(locationData, ['name']),
    region: joinDistinct([
      pickText(locationData, ['region']),
      pickText(locationData, ['country']),
    ]),
    primaryPollutant: '',
    observedAt: firstDate(current['last_updated_epoch'], current['last_updated']),
    pollutants: pollutantsFromRecord(air, 'μg/m³'),
  });
}

function normalizeVisualCrossingCurrent(
  data: unknown,
): AirQualitySnapshot | null {
  const root = asRecord(data);
  const current = asRecord(root?.['currentConditions']);
  if (!root || !current) return null;

  const resolvedLocation = splitResolvedLocation(
    pickText(root, ['resolvedAddress', 'address']),
  );
  return createSnapshot({
    provider: 'visualCrossing',
    scale: 'us-aqi',
    aqi: nonNegativeNumber(pickNumber(current, ['aqius'])),
    quality: meaningfulText(
      pickText(current, ['air_quality_description', 'airquality', 'quality']),
    ),
    location:
      resolvedLocation.location ||
      coordinateLabel({
        lat: root['latitude'],
        lon: root['longitude'],
      }),
    region: resolvedLocation.region,
    primaryPollutant: normalizePrimaryPollutant(
      pickText(current, ['primary_pollutant', 'primaryPollutant']),
    ),
    observedAt: firstDate(current['datetimeEpoch'], current['datetime']),
    pollutants: pollutantsFromRecord(current, 'μg/m³'),
  });
}

function createSnapshot(options: SnapshotOptions): AirQualitySnapshot | null {
  if (!hasAirData(options.aqi, options.quality, options.pollutants)) return null;
  const assessment = assessAirQuality(options.scale, options.aqi, options.quality);
  return {
    provider: options.provider,
    location: options.location,
    region: options.region,
    ...assessment,
    primaryPollutant: options.primaryPollutant,
    observedAt: options.observedAt,
    pollutants: options.pollutants,
  };
}

function assessAirQuality(
  scale: AirQualityScale,
  aqi: number | null,
  providedQuality: string,
): AirAssessment {
  const classified = classifyAirQuality(scale, aqi);
  const quality = providedQuality || classified.quality;
  const severity =
    aqi === null && providedQuality
      ? severityFromQuality(providedQuality)
      : classified.severity;
  return {
    aqi,
    aqiDisplay: formatAqi(scale, aqi),
    scale,
    scaleLabel: scaleLabel(scale),
    quality: quality || '未知',
    severity,
    healthAdvice: healthAdvice(severity),
  };
}

function classifyAirQuality(
  scale: AirQualityScale,
  aqi: number | null,
): { quality: string; severity: AirQualitySeverity } {
  if (aqi === null) return { quality: '未知', severity: 'unknown' };

  if (scale === 'openweather-1-5') {
    return (
      [
        { quality: '优', severity: 'good' },
        { quality: '尚可', severity: 'moderate' },
        { quality: '一般', severity: 'unhealthy-sensitive' },
        { quality: '较差', severity: 'unhealthy' },
        { quality: '很差', severity: 'very-unhealthy' },
      ] as const
    )[aqi - 1] ?? { quality: '未知', severity: 'unknown' };
  }

  if (scale === 'us-epa-1-6') {
    return (
      [
        { quality: '优', severity: 'good' },
        { quality: '中等', severity: 'moderate' },
        { quality: '敏感人群不健康', severity: 'unhealthy-sensitive' },
        { quality: '不健康', severity: 'unhealthy' },
        { quality: '非常不健康', severity: 'very-unhealthy' },
        { quality: '危险', severity: 'hazardous' },
      ] as const
    )[aqi - 1] ?? { quality: '未知', severity: 'unknown' };
  }

  if (aqi <= 50) return { quality: '优', severity: 'good' };
  if (aqi <= 100) return { quality: '良', severity: 'moderate' };
  if (aqi <= 150) {
    return { quality: '轻度污染', severity: 'unhealthy-sensitive' };
  }
  if (aqi <= 200) return { quality: '中度污染', severity: 'unhealthy' };
  if (aqi <= 300) {
    return { quality: '重度污染', severity: 'very-unhealthy' };
  }
  return { quality: '严重污染', severity: 'hazardous' };
}

function severityFromQuality(value: string): AirQualitySeverity {
  const normalized = value.toLowerCase();
  if (/严重污染|危险|hazardous|emergency/.test(normalized)) return 'hazardous';
  if (/重度污染|非常不健康|很差|very unhealthy|very poor/.test(normalized)) {
    return 'very-unhealthy';
  }
  if (/轻度污染|敏感人群|unhealthy for sensitive|一般/.test(normalized)) {
    return 'unhealthy-sensitive';
  }
  if (/中度污染|不健康|较差|\bunhealthy\b|\bpoor\b/.test(normalized)) {
    return 'unhealthy';
  }
  if (/中等|良|尚可|moderate|fair/.test(normalized)) return 'moderate';
  if (/优|优秀|excellent|\bgood\b/.test(normalized)) return 'good';
  return 'unknown';
}

function healthAdvice(severity: AirQualitySeverity): string {
  switch (severity) {
    case 'good':
      return '空气质量令人满意，适合正常户外活动。';
    case 'moderate':
      return '极少数敏感人群可酌情减少长时间户外活动。';
    case 'unhealthy-sensitive':
      return '儿童、老人及心肺疾病患者应减少长时间或高强度户外活动。';
    case 'unhealthy':
      return '建议减少户外活动，敏感人群尽量留在室内。';
    case 'very-unhealthy':
      return '建议避免户外活动，外出时做好防护。';
    case 'hazardous':
      return '建议所有人避免户外活动，并关注当地健康与应急提示。';
    case 'unknown':
      return '暂无足够数据判断健康影响。';
  }
}

function scaleLabel(scale: AirQualityScale): string {
  switch (scale) {
    case 'cn-aqi':
      return '中国 AQI';
    case 'openweather-1-5':
      return 'OpenWeather 指数（1–5）';
    case 'us-epa-1-6':
      return '美国 EPA 指数（1–6）';
    case 'us-aqi':
      return '美国 AQI';
  }
}

function formatAqi(scale: AirQualityScale, aqi: number | null): string {
  if (aqi === null) return '--';
  const value = formatNumber(aqi);
  if (scale === 'openweather-1-5') return `${value}/5`;
  if (scale === 'us-epa-1-6') return `${value}/6`;
  return value;
}

function pollutantsFromRecord(
  record: JsonRecord | null,
  coUnit: string,
): AirPollutant[] {
  if (!record) return [];
  const pollutants: AirPollutant[] = [];
  for (const definition of POLLUTANT_DEFINITIONS) {
    const value = nonNegativeNumber(pickNumber(record, definition.keys));
    if (value === null) continue;
    pollutants.push(createPollutant(definition, value, coUnit));
  }
  return pollutants;
}

function createPollutant(
  definition: PollutantDefinition,
  value: number,
  coUnit: string,
): AirPollutant {
  return {
    id: definition.id,
    label: definition.label,
    value,
    displayValue: formatNumber(value),
    unit: definition.id === 'co' ? coUnit : 'μg/m³',
  };
}

function hasAirData(
  aqi: number | null,
  quality: string,
  pollutants: AirPollutant[],
): boolean {
  return aqi !== null || Boolean(quality) || pollutants.length > 0;
}

function categoryIndex(value: number | null, maximumValue: number): number | null {
  return value !== null &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maximumValue
    ? value
    : null;
}

function nonNegativeNumber(value: number | null): number | null {
  return value !== null && value >= 0 ? value : null;
}

function normalizePrimaryPollutant(value: string): string {
  const normalized = meaningfulText(value);
  if (!normalized) return '';
  return normalized
    .split(/[,，、/]+/)
    .map((item) => canonicalPollutantLabel(item))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .join('、');
}

function canonicalPollutantLabel(value: string): string {
  const cleaned = value.trim();
  const normalized = cleaned.toLowerCase().replace(/[_.\s-]/g, '');
  if (/^(?:pm)?25$|pm2?5/.test(normalized)) return 'PM2.5';
  if (/^(?:pm)?10$|pm10/.test(normalized)) return 'PM10';
  if (normalized === 'so2') return 'SO₂';
  if (normalized === 'no2') return 'NO₂';
  if (normalized === 'co') return 'CO';
  if (normalized === 'o3') return 'O₃';
  return cleaned;
}

function meaningfulText(value: string): string {
  const cleaned = value.trim();
  return !cleaned ||
    /^(?:-|--|n\/?a|nan|infinity|null|undefined|未知|暂无)$/i.test(cleaned) ||
    /^[+-]?\d+(?:\.\d+)?$/.test(cleaned)
    ? ''
    : cleaned;
}

function coordinateLabel(record: JsonRecord | null): string {
  const latitude = pickNumber(record, ['lat', 'latitude']);
  const longitude = pickNumber(record, ['lon', 'longitude']);
  if (latitude === null || longitude === null) return '';
  return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`;
}

function formatCoordinate(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
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
  return { location: parts[0], region: joinDistinct(parts.slice(1)) };
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
  return (
    Boolean(left) &&
    left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
  );
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function pickNumber(
  record: JsonRecord | null | undefined,
  keys: string[],
): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = finiteNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickText(
  record: JsonRecord | null | undefined,
  keys: string[],
): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function firstDate(...values: unknown[]): Date | null {
  for (const value of values) {
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  const calendarDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (calendarDate) {
    const year = Number(calendarDate[1]);
    const month = Number(calendarDate[2]) - 1;
    const day = Number(calendarDate[3]);
    const date = new Date(year, month, day);
    return date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
      ? date
      : null;
  }

  const numeric = finiteNumber(value);
  if (
    numeric !== null &&
    (typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(text))
  ) {
    const milliseconds =
      Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (!text || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

function formatNumber(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
