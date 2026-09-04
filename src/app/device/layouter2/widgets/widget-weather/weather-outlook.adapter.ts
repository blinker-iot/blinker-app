import type { WeatherServiceProvider } from 'src/app/core/services/third-party-services.service';
import {
  openWeatherIcon,
  seniverseWeatherIcon,
  visualCrossingIcon,
  weatherApiIcon,
} from './weather-data.adapter';

export interface WeatherForecastDay {
  id: string;
  date: Date | null;
  conditionDay: string;
  conditionNight: string;
  high: number | null;
  low: number | null;
  precipitationProbability: number | null;
  precipitation: number | null;
  humidity: number | null;
  windDirection: string;
  windSpeed: number | null;
  windScale: string;
  icon: string;
}

export interface WeatherForecastHour {
  id: string;
  time: Date;
  temperature: number | null;
  feelsLike: number | null;
  condition: string;
  precipitationProbability: number | null;
  precipitation: number | null;
  humidity: number | null;
  windDirection: string;
  windSpeed: number | null;
  icon: string;
}

export type WeatherAlertSeverity =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'blue'
  | 'extreme'
  | 'severe'
  | 'moderate'
  | 'minor'
  | 'unknown';

export interface WeatherAlert {
  id: string;
  title: string;
  type: string;
  level: string;
  severity: WeatherAlertSeverity;
  status: string;
  description: string;
  publishedAt: Date | null;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  source: string;
  areas: string[];
  instruction: string;
}

type JsonRecord = Record<string, unknown>;

interface WeatherForecastHourCandidate
  extends Omit<WeatherForecastHour, 'time'> {
  time: Date | null;
}

type WeatherForecastHourFields = Omit<WeatherForecastHour, 'id' | 'time'>;

interface OpenWeatherForecastGroup {
  key: string;
  records: JsonRecord[];
  timezone: number;
}

/** Converts a supported provider's forecast response into daily summaries. */
export function normalizeWeatherForecast(
  provider: WeatherServiceProvider,
  data: unknown,
): WeatherForecastDay[] | null {
  switch (provider) {
    case 'seniverse':
      return normalizeSeniverseForecast(data);
    case 'openWeather':
      return normalizeOpenWeatherForecast(data);
    case 'weatherApi':
      return normalizeWeatherApiForecast(data);
    case 'visualCrossing':
      return normalizeVisualCrossingForecast(data);
  }
}

/** Converts a supported provider's hourly response into the next forecast slots. */
export function normalizeWeatherHourlyForecast(
  provider: WeatherServiceProvider,
  data: unknown,
  now: Date = new Date(),
  limit = 3,
): WeatherForecastHour[] | null {
  switch (provider) {
    case 'seniverse':
      return normalizeSeniverseHourlyForecast(data, now, limit);
    case 'openWeather':
      return normalizeOpenWeatherHourlyForecast(data, now, limit);
    case 'weatherApi':
      return normalizeWeatherApiHourlyForecast(data, now, limit);
    case 'visualCrossing':
      return normalizeVisualCrossingHourlyForecast(data, now, limit);
  }
}

/** Converts a supported provider's active-alert response into one stable shape. */
export function normalizeWeatherAlerts(
  provider: WeatherServiceProvider,
  data: unknown,
): WeatherAlert[] | null {
  switch (provider) {
    case 'seniverse':
      return normalizeSeniverseAlerts(data);
    case 'openWeather':
      return normalizeOpenWeatherAlerts(data);
    case 'weatherApi':
      return normalizeWeatherApiAlerts(data);
    case 'visualCrossing':
      return normalizeVisualCrossingAlerts(data);
  }
}

function normalizeSeniverseHourlyForecast(
  data: unknown,
  now: Date,
  limit: number,
): WeatherForecastHour[] | null {
  const root = asRecord(data);
  const results = root?.['results'];
  if (!root || !Array.isArray(results)) return null;
  if (results.length === 0) return [];

  const source: unknown[] = [];
  let hasHourlyArray = false;
  for (const result of records(results)) {
    if (!Array.isArray(result['hourly'])) continue;
    hasHourlyArray = true;
    source.push(...result['hourly']);
  }
  if (!hasHourlyArray) return null;

  const normalized = records(source).map((hour, index) => {
    const timeValue = firstDefined(
      hour['time'],
      hour['datetime'],
      hour['timestamp'],
    );
    const time = firstDate(timeValue);
    const condition = pickText(hour, ['text', 'condition', 'weather']);
    const isDay = inferHourlyDay(
      pickNumber(hour, ['is_day', 'isDay']),
      '',
      timeValue,
      time,
    );

    return createForecastHour(
      'seniverse',
      hour,
      timeValue,
      index,
      time,
      {
        temperature: pickNumber(hour, ['temperature', 'temp']),
        feelsLike: pickNumber(hour, [
          'feels_like',
          'feelslike',
          'feelsLike',
          'apparent_temperature',
        ]),
        condition,
        precipitationProbability: pickNumber(hour, [
          'precip_probability',
          'precipitation_probability',
          'precipProbability',
        ]),
        precipitation: pickNumber(hour, [
          'precipitation',
          'rainfall',
          'precip',
        ]),
        humidity: pickNumber(hour, ['humidity']),
        windDirection: formatWindDirection(
          pickText(hour, ['wind_direction', 'windDirection']),
          pickNumber(hour, [
            'wind_direction_degree',
            'windDirectionDegree',
            'wind_degree',
          ]),
        ),
        windSpeed: pickNumber(hour, ['wind_speed', 'windSpeed']),
        icon: seniverseWeatherIcon(
          pickNumber(hour, ['code']),
          condition,
          isDay,
        ),
      },
    );
  });

  return finalizeForecastHours(source, normalized, now, limit);
}

function normalizeOpenWeatherHourlyForecast(
  data: unknown,
  now: Date,
  limit: number,
): WeatherForecastHour[] | null {
  const root = asRecord(data);
  if (!root) return null;

  const source = firstArray(root, ['data', 'hourly', 'list']);
  if (!source) return null;

  const normalized = records(source).map((hour, index) => {
    const main = asRecord(hour['main']);
    const weather = firstArrayRecord(hour['weather']);
    const wind = asRecord(hour['wind']);
    const rain = asRecord(hour['rain']);
    const snow = asRecord(hour['snow']);
    const timeValue = firstDefined(
      hour['dt'],
      hour['time'],
      hour['datetime'],
      hour['dt_txt'],
    );
    const time = parseOpenWeatherHourlyDate(hour);
    const condition = pickText(weather, ['description', 'main']);
    const providerIcon = pickText(weather, ['icon']);
    const isDay = inferHourlyDay(
      pickNumber(hour, ['is_day', 'isDay']),
      providerIcon,
      timeValue,
      time,
    );

    return createForecastHour(
      'openWeather',
      hour,
      timeValue,
      index,
      time,
      {
        temperature: firstNumber(
          pickNumber(hour, ['temp', 'temperature']),
          pickNumber(main, ['temp', 'temperature']),
        ),
        feelsLike: firstNumber(
          pickNumber(hour, ['feels_like', 'feelsLike']),
          pickNumber(main, ['feels_like', 'feelsLike']),
        ),
        condition,
        precipitationProbability: openWeatherProbability(
          pickNumber(hour, ['pop', 'precipitation_probability']),
        ),
        precipitation: firstNumber(
          sumOptional(
            firstNumber(
              pickNumber(rain, ['1h', '3h']),
              finiteNumber(hour['rain']),
            ),
            firstNumber(
              pickNumber(snow, ['1h', '3h']),
              finiteNumber(hour['snow']),
            ),
          ),
          pickNumber(hour, ['precipitation', 'precip']),
        ),
        humidity: firstNumber(
          pickNumber(hour, ['humidity']),
          pickNumber(main, ['humidity']),
        ),
        windDirection: formatWindDirection(
          firstText(
            pickText(hour, ['wind_direction', 'wind_dir']),
            pickText(wind, ['direction', 'dir']),
          ),
          firstNumber(
            pickNumber(hour, ['wind_deg', 'wind_degree']),
            pickNumber(wind, ['deg', 'degree']),
          ),
        ),
        windSpeed: convert(
          firstNumber(
            pickNumber(hour, ['wind_speed']),
            pickNumber(wind, ['speed']),
          ),
          metresPerSecondToKilometresPerHour,
        ),
        icon: openWeatherIcon(providerIcon, condition, isDay),
      },
    );
  });

  return finalizeForecastHours(source, normalized, now, limit);
}

function normalizeWeatherApiHourlyForecast(
  data: unknown,
  now: Date,
  limit: number,
): WeatherForecastHour[] | null {
  const root = asRecord(data);
  const forecast = asRecord(root?.['forecast']);
  const forecastDays = forecast?.['forecastday'];
  if (!root || !forecast || !Array.isArray(forecastDays)) return null;
  if (forecastDays.length === 0) return [];

  const source: unknown[] = [];
  let hasHourlyArray = false;
  for (const forecastDay of records(forecastDays)) {
    if (!Array.isArray(forecastDay['hour'])) continue;
    hasHourlyArray = true;
    source.push(...forecastDay['hour']);
  }
  if (!hasHourlyArray) return null;

  const normalized = records(source).map((hour, index) => {
    const conditionData = asRecord(hour['condition']);
    const timeValue = firstDefined(
      hour['time_epoch'],
      hour['time'],
      hour['datetime'],
    );
    const time = firstDate(hour['time_epoch'], hour['time'], hour['datetime']);
    const condition = pickText(conditionData, ['text']);
    const providerIcon = pickText(conditionData, ['icon']);
    const isDay = inferHourlyDay(
      pickNumber(hour, ['is_day', 'isDay']),
      providerIcon,
      timeValue,
      time,
    );

    return createForecastHour(
      'weatherApi',
      hour,
      timeValue,
      index,
      time,
      {
        temperature: metricTemperature(hour, 'temp_c', 'temp_f'),
        feelsLike: metricTemperature(hour, 'feelslike_c', 'feelslike_f'),
        condition,
        precipitationProbability: maximum([
          pickNumber(hour, ['chance_of_rain']),
          pickNumber(hour, ['chance_of_snow']),
        ]),
        precipitation: firstNumber(
          pickNumber(hour, ['precip_mm']),
          convert(pickNumber(hour, ['precip_in']), inchesToMillimetres),
        ),
        humidity: pickNumber(hour, ['humidity']),
        windDirection: formatWindDirection(
          pickText(hour, ['wind_dir', 'wind_direction']),
          pickNumber(hour, ['wind_degree', 'wind_direction_degree']),
        ),
        windSpeed: firstNumber(
          pickNumber(hour, ['wind_kph']),
          convert(pickNumber(hour, ['wind_mph']), milesToKilometres),
        ),
        icon: weatherApiIcon(
          pickNumber(conditionData, ['code']),
          condition,
          isDay,
        ),
      },
    );
  });

  return finalizeForecastHours(source, normalized, now, limit);
}

function normalizeVisualCrossingHourlyForecast(
  data: unknown,
  now: Date,
  limit: number,
): WeatherForecastHour[] | null {
  const root = asRecord(data);
  const days = root?.['days'];
  if (!root || !Array.isArray(days)) return null;
  if (days.length === 0) return [];

  const source: unknown[] = [];
  const normalized: WeatherForecastHourCandidate[] = [];
  let hasHourlyArray = false;
  for (const day of records(days)) {
    if (!Array.isArray(day['hours'])) continue;
    hasHourlyArray = true;
    for (const sourceHour of day['hours']) {
      source.push(sourceHour);
      const hour = asRecord(sourceHour);
      if (!hour) continue;

      const timeValue = firstDefined(
        hour['datetimeEpoch'],
        hour['time_epoch'],
        hour['datetime'],
        hour['time'],
      );
      const time = parseVisualCrossingHourlyDate(root, day, hour);
      const condition = pickText(hour, ['conditions', 'description', 'condition']);
      const providerIcon = pickText(hour, ['icon']);
      const isDay = inferHourlyDay(
        pickNumber(hour, ['is_day', 'isDay']),
        providerIcon,
        timeValue,
        time,
      );

      normalized.push(
        createForecastHour(
          'visualCrossing',
          hour,
          timeValue,
          normalized.length,
          time,
          {
            temperature: pickNumber(hour, ['temp', 'temperature']),
            feelsLike: pickNumber(hour, [
              'feelslike',
              'feels_like',
              'apparent_temperature',
            ]),
            condition,
            precipitationProbability: pickNumber(hour, [
              'precipprob',
              'precip_probability',
              'precipitation_probability',
            ]),
            precipitation: pickNumber(hour, ['precip', 'precipitation']),
            humidity: pickNumber(hour, ['humidity']),
            windDirection: formatWindDirection(
              pickText(hour, ['wind_direction', 'winddir_text']),
              pickNumber(hour, ['winddir', 'wind_direction_degree']),
            ),
            windSpeed: pickNumber(hour, ['windspeed', 'wind_speed']),
            icon: visualCrossingIcon(providerIcon, condition, isDay),
          },
        ),
      );
    }
  }
  if (!hasHourlyArray) return null;

  return finalizeForecastHours(source, normalized, now, limit);
}

function normalizeSeniverseForecast(data: unknown): WeatherForecastDay[] | null {
  const root = asRecord(data);
  const result = firstArrayRecord(root?.['results']);
  const daily = result?.['daily'];
  if (!root || !result || !Array.isArray(daily)) return null;

  const normalized = records(daily).map((day, index) => {
    const dateValue = day['date'];
    const conditionDay = pickText(day, ['text_day', 'textDay', 'condition_day']);
    const conditionNight = pickText(day, [
      'text_night',
      'textNight',
      'condition_night',
    ]);
    const windDirection = formatWindDirection(
      pickText(day, ['wind_direction', 'windDirection']),
      pickNumber(day, ['wind_direction_degree', 'windDirectionDegree']),
    );

    return {
      id: forecastId('seniverse', day, dateValue, index),
      date: parseForecastDate(dateValue),
      conditionDay,
      conditionNight,
      high: pickNumber(day, ['high', 'temperature_high', 'temp_max']),
      low: pickNumber(day, ['low', 'temperature_low', 'temp_min']),
      precipitationProbability: pickNumber(day, [
        'precip',
        'precip_probability',
        'precipitation_probability',
      ]),
      precipitation: pickNumber(day, [
        'rainfall',
        'precipitation',
        'precipitation_amount',
      ]),
      humidity: pickNumber(day, ['humidity']),
      windDirection,
      windSpeed: pickNumber(day, ['wind_speed', 'windSpeed']),
      windScale: pickText(day, ['wind_scale', 'windScale']),
      icon: seniverseWeatherIcon(
        pickNumber(day, ['code_day', 'codeDay']),
        conditionDay,
        true,
      ),
    };
  });
  return finalizeForecastDays(daily, normalized);
}

function normalizeOpenWeatherForecast(data: unknown): WeatherForecastDay[] | null {
  const root = asRecord(data);
  if (!root) return null;

  if (Array.isArray(root['daily'])) {
    const daily = root['daily'];
    const normalized = records(daily).map((day, index) =>
      normalizeOpenWeatherDaily(day, index),
    );
    return finalizeForecastDays(daily, normalized);
  }

  if (!Array.isArray(root['list'])) return null;
  const sourceList = root['list'];
  const list = records(sourceList);
  if (list.some((item) => asRecord(item['main']))) {
    const normalized = groupOpenWeatherForecasts(root, list).map((group, index) =>
      normalizeOpenWeatherGroup(group, index),
    );
    return finalizeForecastDays(sourceList, normalized);
  }

  const normalized = list.map((day, index) =>
    normalizeOpenWeatherDaily(day, index),
  );
  return finalizeForecastDays(sourceList, normalized);
}

function normalizeOpenWeatherDaily(
  day: JsonRecord,
  index: number,
): WeatherForecastDay {
  const temperature = asRecord(day['temp']);
  const weather = firstArrayRecord(day['weather']);
  const conditionDay = pickText(weather, ['description', 'main']);
  const providerIcon = pickText(weather, ['icon']);
  const dateValue = firstDefined(day['dt'], day['date'], day['datetime']);

  return {
    id: forecastId('openWeather', day, dateValue, index),
    date: parseForecastDate(dateValue),
    conditionDay,
    conditionNight: pickText(day, ['condition_night']) || conditionDay,
    high: firstNumber(
      pickNumber(temperature, ['max']),
      pickNumber(day, ['temp_max', 'max']),
    ),
    low: firstNumber(
      pickNumber(temperature, ['min']),
      pickNumber(day, ['temp_min', 'min']),
    ),
    precipitationProbability: openWeatherProbability(
      pickNumber(day, ['pop', 'precipitation_probability']),
    ),
    precipitation: sumOptional(
      pickNumber(day, ['rain']),
      pickNumber(day, ['snow']),
    ),
    humidity: pickNumber(day, ['humidity']),
    windDirection: formatWindDirection(
      pickText(day, ['wind_direction']),
      pickNumber(day, ['wind_deg', 'wind_direction']),
    ),
    windSpeed: convert(
      pickNumber(day, ['wind_speed', 'speed']),
      metresPerSecondToKilometresPerHour,
    ),
    windScale: pickText(day, ['wind_scale']),
    icon: openWeatherIcon(providerIcon, conditionDay, true),
  };
}

function groupOpenWeatherForecasts(
  root: JsonRecord,
  list: JsonRecord[],
): OpenWeatherForecastGroup[] {
  const timezone = firstNumber(
    pickNumber(asRecord(root['city']), ['timezone']),
    pickNumber(root, ['timezone_offset', 'timezone']),
  ) ?? 0;
  const groups = new Map<string, JsonRecord[]>();

  for (const item of list) {
    const key = openWeatherLocalDate(item, timezone);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return Array.from(groups, ([key, groupedRecords]) => ({
    key,
    records: groupedRecords,
    timezone,
  }));
}

function normalizeOpenWeatherGroup(
  group: OpenWeatherForecastGroup,
  index: number,
): WeatherForecastDay {
  const daytime = closestOpenWeatherRecord(
    group.records,
    12,
    group.timezone,
  );
  const nighttime = closestOpenWeatherRecord(
    group.records,
    23,
    group.timezone,
  );
  const weatherDay = firstArrayRecord(daytime?.['weather']);
  const weatherNight = firstArrayRecord(nighttime?.['weather']);
  const conditionDay = pickText(weatherDay, ['description', 'main']);
  const conditionNight = pickText(weatherNight, ['description', 'main']);
  const mainRecords = group.records
    .map((item) => asRecord(item['main']))
    .filter((item): item is JsonRecord => Boolean(item));
  const rain = sumNumbers(
    group.records.map((item) =>
      pickNumber(asRecord(item['rain']), ['3h', '1h']),
    ),
  );
  const snow = sumNumbers(
    group.records.map((item) =>
      pickNumber(asRecord(item['snow']), ['3h', '1h']),
    ),
  );
  const strongestWind = maximumRecord(
    group.records,
    (item) => pickNumber(asRecord(item['wind']), ['speed']),
  );
  const wind = asRecord(strongestWind?.['wind']);

  return {
    id: forecastId('openWeather', daytime ?? {}, group.key, index),
    date: parseForecastDate(group.key),
    conditionDay,
    conditionNight: conditionNight || conditionDay,
    high: maximum(mainRecords.map((item) => pickNumber(item, ['temp_max', 'temp']))),
    low: minimum(mainRecords.map((item) => pickNumber(item, ['temp_min', 'temp']))),
    precipitationProbability: maximum(
      group.records.map((item) =>
        openWeatherProbability(pickNumber(item, ['pop'])),
      ),
    ),
    precipitation: sumOptional(rain, snow),
    humidity: average(mainRecords.map((item) => pickNumber(item, ['humidity']))),
    windDirection: formatWindDirection(
      '',
      pickNumber(wind, ['deg']),
    ),
    windSpeed: convert(
      maximum(
        group.records.map((item) =>
          pickNumber(asRecord(item['wind']), ['speed']),
        ),
      ),
      metresPerSecondToKilometresPerHour,
    ),
    windScale: '',
    icon: openWeatherIcon(
      pickText(weatherDay, ['icon']),
      conditionDay,
      true,
    ),
  };
}

function normalizeWeatherApiForecast(data: unknown): WeatherForecastDay[] | null {
  const root = asRecord(data);
  const forecast = asRecord(root?.['forecast']);
  const forecastDays = forecast?.['forecastday'];
  if (!root || !forecast || !Array.isArray(forecastDays)) return null;

  const normalized = records(forecastDays).map((forecastDay, index) => {
    const day = asRecord(forecastDay['day']) ?? {};
    const condition = asRecord(day['condition']);
    const hours = records(forecastDay['hour']);
    const nightHour = findWeatherApiNightHour(hours);
    const nightCondition = asRecord(nightHour?.['condition']);
    const strongestWind = maximumRecord(hours, (hour) =>
      firstNumber(
        pickNumber(hour, ['wind_kph']),
        convert(pickNumber(hour, ['wind_mph']), milesToKilometres),
      ),
    );
    const conditionDay = pickText(condition, ['text']);
    const conditionNight = pickText(nightCondition, ['text']) || conditionDay;
    const dateValue = firstDefined(forecastDay['date'], forecastDay['date_epoch']);

    return {
      id: forecastId('weatherApi', forecastDay, dateValue, index),
      date: parseForecastDate(dateValue),
      conditionDay,
      conditionNight,
      high: metricTemperature(day, 'maxtemp_c', 'maxtemp_f'),
      low: metricTemperature(day, 'mintemp_c', 'mintemp_f'),
      precipitationProbability: maximum([
        pickNumber(day, ['daily_chance_of_rain']),
        pickNumber(day, ['daily_chance_of_snow']),
      ]),
      precipitation: firstNumber(
        pickNumber(day, ['totalprecip_mm']),
        convert(pickNumber(day, ['totalprecip_in']), inchesToMillimetres),
      ),
      humidity: pickNumber(day, ['avghumidity', 'humidity']),
      windDirection: formatWindDirection(
        pickText(strongestWind, ['wind_dir']),
        pickNumber(strongestWind, ['wind_degree']),
      ),
      windSpeed: firstNumber(
        pickNumber(day, ['maxwind_kph']),
        convert(pickNumber(day, ['maxwind_mph']), milesToKilometres),
      ),
      windScale: pickText(day, ['wind_scale']),
      icon: weatherApiIcon(
        pickNumber(condition, ['code']),
        conditionDay,
        true,
      ),
    };
  });
  return finalizeForecastDays(forecastDays, normalized);
}

function normalizeVisualCrossingForecast(
  data: unknown,
): WeatherForecastDay[] | null {
  const root = asRecord(data);
  if (!root || !Array.isArray(root['days'])) return null;

  const days = root['days'];
  const normalized = records(days).map((day, index) => {
    const hours = records(day['hours']);
    const night = closestVisualCrossingHour(hours, 23);
    const conditionDay = pickText(day, ['conditions', 'description']);
    const conditionNight =
      pickText(night, ['conditions', 'description']) || conditionDay;
    const dateValue = firstDefined(day['datetime'], day['datetimeEpoch']);

    return {
      id: forecastId('visualCrossing', day, dateValue, index),
      date: parseForecastDate(dateValue),
      conditionDay,
      conditionNight,
      high: pickNumber(day, ['tempmax', 'temp_max', 'high']),
      low: pickNumber(day, ['tempmin', 'temp_min', 'low']),
      precipitationProbability: pickNumber(day, [
        'precipprob',
        'precip_probability',
      ]),
      precipitation: pickNumber(day, ['precip', 'precipitation']),
      humidity: pickNumber(day, ['humidity']),
      windDirection: formatWindDirection(
        pickText(day, ['wind_direction']),
        pickNumber(day, ['winddir', 'wind_direction_degree']),
      ),
      windSpeed: pickNumber(day, ['windspeed', 'wind_speed']),
      windScale: pickText(day, ['wind_scale']),
      icon: visualCrossingIcon(
        pickText(day, ['icon']),
        conditionDay,
        true,
      ),
    };
  });
  return finalizeForecastDays(days, normalized);
}

function normalizeSeniverseAlerts(data: unknown): WeatherAlert[] | null {
  const root = asRecord(data);
  if (!root || !Array.isArray(root['results'])) return null;
  if (root['results'].length === 0) return [];

  const alerts: WeatherAlert[] = [];
  let hasAlarmArray = false;
  let rawAlarmCount = 0;
  for (const result of records(root['results'])) {
    if (!Array.isArray(result['alarms'])) continue;
    hasAlarmArray = true;
    rawAlarmCount += result['alarms'].length;
    const alarms = records(result['alarms']);
    const location = asRecord(result['location']);
    for (const alarm of alarms) {
      alerts.push(
        normalizeAlert('seniverse', alarm, alerts.length, {
          defaultAreas: normalizeAreas(
            firstDefined(location?.['name'], location?.['path']),
          ),
          publishedKeys: ['pub_date', 'published_at', 'published'],
        }),
      );
    }
  }
  const usableAlerts = alerts.filter(isUsableAlert);
  if (usableAlerts.length > 0) return usableAlerts;
  if (!hasAlarmArray || rawAlarmCount > 0) return null;
  return [];
}

function normalizeOpenWeatherAlerts(data: unknown): WeatherAlert[] | null {
  const root = asRecord(data);
  if (!root || !isRecognizedAlertRoot(root, ['lat', 'lon', 'current', 'daily'])) {
    return null;
  }
  const sourceAlerts = Array.isArray(root['alerts']) ? root['alerts'] : [];
  const alerts = records(sourceAlerts);

  const normalized = alerts.map((alert, index) =>
    normalizeAlert('openWeather', alert, index, {
      titleKeys: ['title', 'event'],
      typeKeys: ['event', 'type'],
      sourceKeys: ['sender_name', 'sender', 'source'],
      publishedKeys: ['published_at', 'sent'],
      effectiveKeys: ['start', 'onset', 'effective'],
      expiresKeys: ['end', 'expires'],
    }),
  );
  return finalizeAlerts(sourceAlerts, normalized);
}

function normalizeWeatherApiAlerts(data: unknown): WeatherAlert[] | null {
  const root = asRecord(data);
  const alertsRoot = asRecord(root?.['alerts']);
  if (!root || !alertsRoot || !Array.isArray(alertsRoot['alert'])) return null;

  const sourceAlerts = alertsRoot['alert'];
  const normalized = records(sourceAlerts).map((alert, index) =>
    normalizeAlert('weatherApi', alert, index, {
      titleKeys: ['headline', 'title', 'event'],
      typeKeys: ['event', 'category', 'type'],
      levelKeys: ['level', 'urgency'],
      statusKeys: ['msgtype', 'msgType', 'status'],
      descriptionKeys: ['desc', 'description', 'note'],
      sourceKeys: ['sender_name', 'sender', 'source'],
      publishedKeys: ['sent', 'published_at'],
      effectiveKeys: ['effective', 'onset'],
      expiresKeys: ['expires', 'end'],
      instructionKeys: ['instruction', 'note'],
    }),
  );
  return finalizeAlerts(sourceAlerts, normalized);
}

function normalizeVisualCrossingAlerts(data: unknown): WeatherAlert[] | null {
  const root = asRecord(data);
  if (
    !root ||
    !isRecognizedAlertRoot(root, ['days', 'currentConditions', 'latitude'])
  ) {
    return null;
  }
  const sourceAlerts = Array.isArray(root['alerts']) ? root['alerts'] : [];
  const alerts = records(sourceAlerts);

  const normalized = alerts.map((alert, index) =>
    normalizeAlert('visualCrossing', alert, index, {
      titleKeys: ['headline', 'event', 'title'],
      typeKeys: ['event', 'type'],
      publishedKeys: ['published', 'sent'],
      effectiveKeys: ['onset', 'effective', 'starts'],
      expiresKeys: ['ends', 'expires', 'end'],
      sourceKeys: ['sender_name', 'sender', 'source'],
    }),
  );
  return finalizeAlerts(sourceAlerts, normalized);
}

interface NormalizeAlertOptions {
  titleKeys?: string[];
  typeKeys?: string[];
  levelKeys?: string[];
  statusKeys?: string[];
  descriptionKeys?: string[];
  sourceKeys?: string[];
  publishedKeys?: string[];
  effectiveKeys?: string[];
  expiresKeys?: string[];
  instructionKeys?: string[];
  defaultAreas?: string[];
}

function normalizeAlert(
  provider: WeatherServiceProvider,
  alert: JsonRecord,
  index: number,
  options: NormalizeAlertOptions = {},
): WeatherAlert {
  const title = pickText(alert, options.titleKeys ?? ['title', 'headline', 'event']);
  const type = pickText(alert, options.typeKeys ?? ['type', 'event', 'category']);
  const level = pickText(alert, options.levelKeys ?? ['level', 'urgency']);
  const severityText = pickText(alert, ['severity']);
  const publishedValue = pickValue(alert, options.publishedKeys ?? [
    'pub_date',
    'published_at',
    'published',
    'sent',
  ]);
  const effectiveValue = pickValue(alert, options.effectiveKeys ?? [
    'effective',
    'onset',
    'start',
  ]);
  const expiresValue = pickValue(alert, options.expiresKeys ?? [
    'expires',
    'ends',
    'end',
  ]);
  const idCandidate = pickValue(alert, [
    'id',
    'alert_id',
    'identifier',
    'event_id',
  ]);
  const areas = normalizeAreas(
    pickValue(alert, ['areas', 'area', 'regions', 'region', 'zones']),
  );

  return {
    id: stableId(provider, idCandidate, [title, type, publishedValue], index),
    title,
    type,
    level,
    severity: normalizeAlertSeverity(severityText, level, title, type),
    status: pickText(alert, options.statusKeys ?? ['status', 'msgtype']),
    description: pickText(
      alert,
      options.descriptionKeys ?? ['description', 'desc', 'note'],
    ),
    publishedAt: parseDate(publishedValue),
    effectiveAt: parseDate(effectiveValue),
    expiresAt: parseDate(expiresValue),
    source: pickText(
      alert,
      options.sourceKeys ?? ['source', 'sender_name', 'sender'],
    ),
    areas: areas.length > 0 ? areas : options.defaultAreas ?? [],
    instruction: pickText(
      alert,
      options.instructionKeys ?? ['instruction', 'advice', 'recommendation'],
    ),
  };
}

function finalizeForecastDays(
  source: unknown[],
  normalized: WeatherForecastDay[],
): WeatherForecastDay[] | null {
  if (source.length === 0) return [];
  const usableDays = normalized.filter(isUsableForecastDay);
  return usableDays.length > 0 ? usableDays : null;
}

function createForecastHour(
  provider: WeatherServiceProvider,
  record: JsonRecord,
  timeValue: unknown,
  index: number,
  time: Date | null,
  fields: WeatherForecastHourFields,
): WeatherForecastHourCandidate {
  return {
    id: stableId(
      provider,
      pickValue(record, ['id', 'forecast_id']),
      [time?.toISOString() ?? timeValue],
      index,
    ),
    time,
    ...fields,
  };
}

function finalizeForecastHours(
  source: unknown[],
  normalized: WeatherForecastHourCandidate[],
  now: Date,
  limit: number,
): WeatherForecastHour[] | null {
  if (source.length === 0) return [];
  const usableHours = normalized.filter(isUsableForecastHour);
  if (usableHours.length === 0) return null;

  const nowTimestamp =
    now instanceof Date && Number.isFinite(now.getTime())
      ? now.getTime()
      : Date.now();
  const resultLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 3;

  return usableHours
    .filter((hour) => hour.time.getTime() > nowTimestamp)
    .sort((left, right) => left.time.getTime() - right.time.getTime())
    .slice(0, resultLimit);
}

function isUsableForecastHour(
  hour: WeatherForecastHourCandidate,
): hour is WeatherForecastHour {
  if (!hour.time || !Number.isFinite(hour.time.getTime())) return false;
  return (
    Boolean(hour.condition.trim()) ||
    hour.temperature !== null ||
    hour.feelsLike !== null ||
    hour.precipitationProbability !== null ||
    hour.precipitation !== null ||
    hour.humidity !== null ||
    Boolean(hour.windDirection.trim()) ||
    hour.windSpeed !== null
  );
}

function isUsableForecastDay(day: WeatherForecastDay): boolean {
  if (!day.date || !Number.isFinite(day.date.getTime())) return false;
  return (
    Boolean(day.conditionDay.trim()) ||
    Boolean(day.conditionNight.trim()) ||
    day.high !== null ||
    day.low !== null ||
    day.precipitationProbability !== null ||
    day.precipitation !== null ||
    day.humidity !== null ||
    Boolean(day.windDirection.trim()) ||
    day.windSpeed !== null ||
    Boolean(day.windScale.trim())
  );
}

function finalizeAlerts(
  source: unknown[],
  normalized: WeatherAlert[],
): WeatherAlert[] | null {
  if (source.length === 0) return [];
  const usableAlerts = normalized.filter(isUsableAlert);
  return usableAlerts.length > 0 ? usableAlerts : null;
}

function isUsableAlert(alert: WeatherAlert): boolean {
  return [
    alert.title,
    alert.type,
    alert.description,
    alert.instruction,
  ].some((value) => Boolean(value.trim()));
}

function normalizeAlertSeverity(...values: unknown[]): WeatherAlertSeverity {
  const value = values.map(cleanText).filter(Boolean).join(' ').toLowerCase();
  if (/红色|\bred\b/.test(value)) return 'red';
  if (/橙色|\borange\b/.test(value)) return 'orange';
  if (/黄色|\byellow\b/.test(value)) return 'yellow';
  if (/蓝色|\bblue\b/.test(value)) return 'blue';
  if (/白色|\bwhite\b/.test(value)) return 'minor';
  if (/极端|\bextreme\b/.test(value)) return 'extreme';
  if (/严重|\bsevere\b/.test(value)) return 'severe';
  if (/中等|中度|\bmoderate\b/.test(value)) return 'moderate';
  if (/轻微|较轻|\bminor\b/.test(value)) return 'minor';
  return 'unknown';
}

function isRecognizedAlertRoot(root: JsonRecord, otherKeys: string[]): boolean {
  if (Object.prototype.hasOwnProperty.call(root, 'alerts')) {
    return root['alerts'] === undefined || Array.isArray(root['alerts']);
  }
  return otherKeys.some((key) => Object.prototype.hasOwnProperty.call(root, key));
}

function forecastId(
  provider: WeatherServiceProvider,
  record: JsonRecord,
  dateValue: unknown,
  index: number,
): string {
  return stableId(
    provider,
    pickValue(record, ['id', 'forecast_id']),
    [dateValue],
    index,
  );
}

function stableId(
  provider: WeatherServiceProvider,
  candidate: unknown,
  parts: unknown[],
  index: number,
): string {
  const explicit = cleanText(candidate);
  if (explicit) return explicit;
  const source = parts.map(cleanText).filter(Boolean).join('|') || String(index);
  let hash = 2166136261;
  for (let characterIndex = 0; characterIndex < source.length; characterIndex += 1) {
    hash ^= source.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }
  return `${provider}-${(hash >>> 0).toString(36)}`;
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
}

function firstArray(
  record: JsonRecord,
  keys: string[],
): unknown[] | null {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key];
  }
  return null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstArrayRecord(value: unknown): JsonRecord | null {
  return records(value)[0] ?? null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
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

function cleanText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function pickText(
  record: JsonRecord | null | undefined,
  keys: string[],
): string {
  return cleanText(pickValue(record, keys));
}

function pickValue(
  record: JsonRecord | null | undefined,
  keys: string[],
): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && cleanText(value) !== '') {
      return value;
    }
    if (Array.isArray(value) || asRecord(value)) return value;
  }
  return undefined;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== null && value !== undefined);
}

function firstDate(...values: unknown[]): Date | null {
  for (const value of values) {
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

function firstText(...values: string[]): string {
  return values.find(Boolean) ?? '';
}

function firstNumber(...values: Array<number | null>): number | null {
  return values.find((value): value is number => value !== null) ?? null;
}

function convert(
  value: number | null,
  converter: (input: number) => number,
): number | null {
  return value === null ? null : converter(value);
}

function metricTemperature(
  record: JsonRecord,
  metricKey: string,
  imperialKey: string,
): number | null {
  return firstNumber(
    pickNumber(record, [metricKey]),
    convert(pickNumber(record, [imperialKey]), fahrenheitToCelsius),
  );
}

function parseForecastDate(value: unknown): Date | null {
  const text = cleanText(value);
  const calendarDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (calendarDate) {
    const year = Number(calendarDate[1]);
    const month = Number(calendarDate[2]) - 1;
    const day = Number(calendarDate[3]);
    const date = new Date(
      year,
      month,
      day,
    );
    return Number.isFinite(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
      ? date
      : null;
  }
  return parseDate(value);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  const numeric = finiteNumber(value);
  if (numeric !== null && (typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(cleanText(value)))) {
    const milliseconds = Math.abs(numeric) < 1_000_000_000_000
      ? numeric * 1000
      : numeric;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const text = cleanText(value);
  if (!text || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function parseOpenWeatherHourlyDate(hour: JsonRecord): Date | null {
  const epochDate = firstDate(hour['dt'], hour['datetimeEpoch']);
  if (epochDate) return epochDate;

  const directDate = firstDate(hour['time'], hour['datetime']);
  if (directDate) return directDate;

  const text = pickText(hour, ['dt_txt']);
  if (!text) return null;
  const utcText = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(?::\d{2})?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  return parseDate(utcText);
}

function parseVisualCrossingHourlyDate(
  root: JsonRecord,
  day: JsonRecord,
  hour: JsonRecord,
): Date | null {
  const epochDate = firstDate(hour['datetimeEpoch'], hour['time_epoch']);
  if (epochDate) return epochDate;

  const timeText = pickText(hour, ['datetime', 'time']);
  if (!timeText) return null;
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(timeText)) {
    return parseDate(timeText);
  }

  const timeParts = timeText.split(':').map(Number);
  const dayEpoch = pickNumber(day, ['datetimeEpoch']);
  if (dayEpoch !== null) {
    return new Date(
      dayEpoch * 1000 +
        timeParts[0] * 60 * 60 * 1000 +
        timeParts[1] * 60 * 1000 +
        (timeParts[2] ?? 0) * 1000,
    );
  }

  const dayText = pickText(day, ['datetime', 'date']);
  const dateParts = dayText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) return null;
  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]) - 1;
  const date = Number(dateParts[3]);
  const hourValue = timeParts[0];
  const minute = timeParts[1];
  const second = timeParts[2] ?? 0;
  const utcTimestamp = Date.UTC(
    year,
    month,
    date,
    hourValue,
    minute,
    second,
  );
  const validationDate = new Date(utcTimestamp);
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month ||
    validationDate.getUTCDate() !== date ||
    validationDate.getUTCHours() !== hourValue ||
    validationDate.getUTCMinutes() !== minute ||
    validationDate.getUTCSeconds() !== second
  ) {
    return null;
  }

  const timezoneOffset = pickNumber(root, ['tzoffset']);
  return timezoneOffset === null
    ? new Date(year, month, date, hourValue, minute, second)
    : new Date(utcTimestamp - timezoneOffset * 60 * 60 * 1000);
}

function inferHourlyDay(
  explicitDay: number | null,
  providerIcon: string,
  timeValue: unknown,
  time: Date | null,
): boolean {
  if (explicitDay !== null) return explicitDay !== 0;

  const normalizedIcon = providerIcon.toLowerCase();
  if (
    normalizedIcon.includes('night') ||
    normalizedIcon.includes('/night/') ||
    /\d{2}n(?:\.|$)/.test(normalizedIcon)
  ) {
    return false;
  }
  if (
    normalizedIcon.includes('day') ||
    normalizedIcon.includes('/day/') ||
    /\d{2}d(?:\.|$)/.test(normalizedIcon)
  ) {
    return true;
  }

  const localTimeMatch = cleanText(timeValue).match(
    /(?:T|\s|^)(\d{1,2}):\d{2}/,
  );
  if (localTimeMatch) {
    const hour = Number(localTimeMatch[1]);
    if (Number.isFinite(hour)) return hour >= 6 && hour < 18;
  }
  if (time) {
    const hour = time.getHours();
    return hour >= 6 && hour < 18;
  }
  return true;
}

function openWeatherProbability(value: number | null): number | null {
  if (value === null) return null;
  return value >= 0 && value <= 1 ? value * 100 : value;
}

function sumOptional(...values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length > 0
    ? available.reduce((total, value) => total + value, 0)
    : null;
}

function sumNumbers(values: Array<number | null>): number | null {
  return sumOptional(...values);
}

function maximum(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length > 0 ? Math.max(...available) : null;
}

function minimum(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length > 0 ? Math.min(...available) : null;
}

function average(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  if (available.length === 0) return null;
  return available.reduce((total, value) => total + value, 0) / available.length;
}

function maximumRecord(
  values: JsonRecord[],
  selector: (value: JsonRecord) => number | null,
): JsonRecord | null {
  let selected: JsonRecord | null = null;
  let maximumValue = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const numeric = selector(value);
    if (numeric !== null && numeric > maximumValue) {
      selected = value;
      maximumValue = numeric;
    }
  }
  return selected;
}

function openWeatherLocalDate(item: JsonRecord, timezone: number): string {
  const epoch = pickNumber(item, ['dt']);
  if (epoch !== null) {
    return new Date((epoch + timezone) * 1000).toISOString().slice(0, 10);
  }

  const dateText = pickText(item, ['dt_txt']);
  const match = dateText.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  return '';
}

function openWeatherLocalHour(
  item: JsonRecord,
  timezone: number,
): number | null {
  const epoch = pickNumber(item, ['dt']);
  if (epoch !== null) {
    return new Date((epoch + timezone) * 1000).getUTCHours();
  }

  const dateText = pickText(item, ['dt_txt']);
  const match = dateText.match(/\s(\d{1,2}):/);
  if (match) return Number(match[1]);
  return null;
}

function closestOpenWeatherRecord(
  recordsForDay: JsonRecord[],
  targetHour: number,
  timezone: number,
): JsonRecord | null {
  let selected: JsonRecord | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const record of recordsForDay) {
    const hour = openWeatherLocalHour(record, timezone);
    if (hour === null) continue;
    const candidateDistance = Math.abs(hour - targetHour);
    if (candidateDistance < distance) {
      selected = record;
      distance = candidateDistance;
    }
  }
  return selected ?? recordsForDay[0] ?? null;
}

function findWeatherApiNightHour(hours: JsonRecord[]): JsonRecord | null {
  const nighttime = hours.filter((hour) => pickNumber(hour, ['is_day']) === 0);
  return nighttime[nighttime.length - 1] ?? hours[hours.length - 1] ?? null;
}

function closestVisualCrossingHour(
  hours: JsonRecord[],
  targetHour: number,
): JsonRecord | null {
  let selected: JsonRecord | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const hour of hours) {
    const hourValue = finiteNumber(pickText(hour, ['datetime']).split(':')[0]);
    if (hourValue === null) continue;
    const candidateDistance = Math.abs(hourValue - targetHour);
    if (candidateDistance < distance) {
      selected = hour;
      distance = candidateDistance;
    }
  }
  return selected ?? hours[hours.length - 1] ?? null;
}

function formatWindDirection(direction: string, degrees: number | null): string {
  if (degrees === null) return direction;
  const degreeText = `${round(degrees, 1)}°`;
  return direction ? `${direction} ${degreeText}` : degreeText;
}

function normalizeAreas(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeAreas(item))
      .filter((item, index, values) => values.indexOf(item) === index);
  }
  const record = asRecord(value);
  if (record) {
    const name = pickText(record, ['name', 'area', 'region', 'zone']);
    return name ? [name] : [];
  }
  return cleanText(value)
    .split(/[;；|\n]/)
    .map((area) => area.trim())
    .filter(Boolean);
}

function fahrenheitToCelsius(value: number): number {
  return (value - 32) * (5 / 9);
}

function milesToKilometres(value: number): number {
  return value * 1.609344;
}

function inchesToMillimetres(value: number): number {
  return value * 25.4;
}

function metresPerSecondToKilometresPerHour(value: number): number {
  return value * 3.6;
}

function round(value: number, maximumFractionDigits: number): number {
  const factor = 10 ** maximumFractionDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
