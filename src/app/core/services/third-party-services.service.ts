import { Injectable } from '@angular/core';

export interface WeatherServiceKeys {
  seniverse: string;
  openWeather: string;
  weatherApi: string;
  visualCrossing: string;
}

export interface GeolocationServiceKeys {
  tianditu: string;
  geoapify: string;
  locationIq: string;
}

export type WeatherServiceProvider = keyof WeatherServiceKeys;
export type GeolocationServiceProvider = keyof GeolocationServiceKeys;

export interface WeatherServiceConfig {
  selectedProvider: WeatherServiceProvider;
  keys: WeatherServiceKeys;
}

export interface GeolocationServiceConfig {
  selectedProvider: GeolocationServiceProvider;
  keys: GeolocationServiceKeys;
}

export interface ActiveThirdPartyService<TProvider extends string> {
  provider: TProvider;
  key: string;
}

export const WEATHER_SERVICE_KEYS_STORAGE_KEY = 'blinker:weather-service-keys';
export const GEOLOCATION_SERVICE_KEYS_STORAGE_KEY =
  'blinker:geolocation-service-keys';

export const WEATHER_SERVICE_PROVIDERS: readonly WeatherServiceProvider[] = [
  'seniverse',
  'openWeather',
  'weatherApi',
  'visualCrossing',
];
export const GEOLOCATION_SERVICE_PROVIDERS: readonly GeolocationServiceProvider[] =
  ['tianditu', 'geoapify', 'locationIq'];

export const DEFAULT_WEATHER_SERVICE_PROVIDER: WeatherServiceProvider =
  'seniverse';
export const DEFAULT_GEOLOCATION_SERVICE_PROVIDER: GeolocationServiceProvider =
  'tianditu';

export const EMPTY_WEATHER_SERVICE_KEYS: Readonly<WeatherServiceKeys> = {
  seniverse: '',
  openWeather: '',
  weatherApi: '',
  visualCrossing: '',
};

export const EMPTY_GEOLOCATION_SERVICE_KEYS: Readonly<GeolocationServiceKeys> =
  {
    tianditu: '',
    geoapify: '',
    locationIq: '',
  };

@Injectable({
  providedIn: 'root',
})
export class ThirdPartyServicesService {
  getWeatherServiceConfig(): WeatherServiceConfig | null {
    const saved = this.readStoredObject(WEATHER_SERVICE_KEYS_STORAGE_KEY);
    if (!saved) return null;

    const storedKeys = this.readObject(saved['keys']);
    const keys = this.normalizeWeatherServiceKeys(storedKeys ?? saved);
    const storedProvider = saved['selectedProvider'];
    const hasStructuredConfig =
      Boolean(storedKeys) || this.isWeatherProvider(storedProvider);

    if (!hasStructuredConfig && !this.hasConfiguredKey(keys)) return null;

    return {
      selectedProvider: this.isWeatherProvider(storedProvider)
        ? storedProvider
        : this.firstConfiguredProvider(keys, WEATHER_SERVICE_PROVIDERS) ??
          DEFAULT_WEATHER_SERVICE_PROVIDER,
      keys,
    };
  }

  saveWeatherServiceConfig(config: WeatherServiceConfig): WeatherServiceConfig {
    const normalizedConfig: WeatherServiceConfig = {
      selectedProvider: config.selectedProvider,
      keys: this.normalizeWeatherServiceKeys(config.keys),
    };
    localStorage.setItem(
      WEATHER_SERVICE_KEYS_STORAGE_KEY,
      JSON.stringify(normalizedConfig)
    );
    return normalizedConfig;
  }

  getActiveWeatherService(): ActiveThirdPartyService<WeatherServiceProvider> | null {
    const config = this.getWeatherServiceConfig();
    if (!config) return null;

    const key = config.keys[config.selectedProvider];
    return key ? { provider: config.selectedProvider, key } : null;
  }

  clearWeatherServiceConfig(): void {
    localStorage.removeItem(WEATHER_SERVICE_KEYS_STORAGE_KEY);
  }

  getGeolocationServiceConfig(): GeolocationServiceConfig | null {
    const saved = this.readStoredObject(GEOLOCATION_SERVICE_KEYS_STORAGE_KEY);
    if (!saved) return null;

    const storedKeys = this.readObject(saved['keys']);
    const keys = this.normalizeGeolocationServiceKeys(storedKeys ?? saved);
    const storedProvider = saved['selectedProvider'];
    const hasStructuredConfig =
      Boolean(storedKeys) || this.isGeolocationProvider(storedProvider);

    if (!hasStructuredConfig && !this.hasConfiguredKey(keys)) return null;

    return {
      selectedProvider: this.isGeolocationProvider(storedProvider)
        ? storedProvider
        : this.firstConfiguredProvider(keys, GEOLOCATION_SERVICE_PROVIDERS) ??
          DEFAULT_GEOLOCATION_SERVICE_PROVIDER,
      keys,
    };
  }

  saveGeolocationServiceConfig(
    config: GeolocationServiceConfig
  ): GeolocationServiceConfig {
    const normalizedConfig: GeolocationServiceConfig = {
      selectedProvider: config.selectedProvider,
      keys: this.normalizeGeolocationServiceKeys(config.keys),
    };
    localStorage.setItem(
      GEOLOCATION_SERVICE_KEYS_STORAGE_KEY,
      JSON.stringify(normalizedConfig)
    );
    return normalizedConfig;
  }

  getActiveGeolocationService(): ActiveThirdPartyService<GeolocationServiceProvider> | null {
    const config = this.getGeolocationServiceConfig();
    if (!config) return null;

    const key = config.keys[config.selectedProvider];
    return key ? { provider: config.selectedProvider, key } : null;
  }

  clearGeolocationServiceConfig(): void {
    localStorage.removeItem(GEOLOCATION_SERVICE_KEYS_STORAGE_KEY);
  }

  private normalizeWeatherServiceKeys(
    source: Partial<WeatherServiceKeys> | Record<string, unknown>
  ): WeatherServiceKeys {
    return {
      seniverse: this.normalizeKey(source['seniverse']),
      openWeather: this.normalizeKey(source['openWeather']),
      weatherApi: this.normalizeKey(source['weatherApi']),
      visualCrossing: this.normalizeKey(source['visualCrossing']),
    };
  }

  private normalizeGeolocationServiceKeys(
    source: Partial<GeolocationServiceKeys> | Record<string, unknown>
  ): GeolocationServiceKeys {
    return {
      tianditu: this.normalizeKey(source['tianditu']),
      geoapify: this.normalizeKey(source['geoapify']),
      locationIq: this.normalizeKey(source['locationIq']),
    };
  }

  private normalizeKey(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readStoredObject(storageKey: string): Record<string, unknown> | null {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;
      return this.readObject(JSON.parse(saved));
    } catch {
      return null;
    }
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private firstConfiguredProvider<
    TProvider extends string,
    TKeys extends Record<TProvider, string>
  >(keys: TKeys, providers: readonly TProvider[]): TProvider | null {
    return providers.find((provider) => Boolean(keys[provider])) ?? null;
  }

  private hasConfiguredKey(
    keys: WeatherServiceKeys | GeolocationServiceKeys
  ): boolean {
    return Object.values(keys).some(Boolean);
  }

  private isWeatherProvider(value: unknown): value is WeatherServiceProvider {
    return (
      typeof value === 'string' &&
      (WEATHER_SERVICE_PROVIDERS as readonly string[]).includes(value)
    );
  }

  private isGeolocationProvider(
    value: unknown
  ): value is GeolocationServiceProvider {
    return (
      typeof value === 'string' &&
      (GEOLOCATION_SERVICE_PROVIDERS as readonly string[]).includes(value)
    );
  }
}
