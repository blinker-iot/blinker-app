import {
  EMPTY_GEOLOCATION_SERVICE_KEYS,
  EMPTY_WEATHER_SERVICE_KEYS,
  GEOLOCATION_SERVICE_KEYS_STORAGE_KEY,
  ThirdPartyServicesService,
  WEATHER_SERVICE_KEYS_STORAGE_KEY,
} from './third-party-services.service';

describe('ThirdPartyServicesService', () => {
  let service: ThirdPartyServicesService;

  beforeEach(() => {
    localStorage.clear();
    service = new ThirdPartyServicesService();
  });

  it('saves every weather key while activating only the selected provider', () => {
    service.saveWeatherServiceConfig({
      selectedProvider: 'openWeather',
      keys: {
        ...EMPTY_WEATHER_SERVICE_KEYS,
        seniverse: ' seniverse-key ',
        openWeather: ' open-weather-key ',
      },
    });

    expect(service.getWeatherServiceConfig()).toEqual({
      selectedProvider: 'openWeather',
      keys: {
        ...EMPTY_WEATHER_SERVICE_KEYS,
        seniverse: 'seniverse-key',
        openWeather: 'open-weather-key',
      },
    });
    expect(service.getActiveWeatherService()).toEqual({
      provider: 'openWeather',
      key: 'open-weather-key',
    });
  });

  it('does not activate a saved key from an unselected weather provider', () => {
    service.saveWeatherServiceConfig({
      selectedProvider: 'weatherApi',
      keys: {
        ...EMPTY_WEATHER_SERVICE_KEYS,
        seniverse: 'seniverse-key',
      },
    });

    expect(service.getWeatherServiceConfig()?.keys.seniverse).toBe(
      'seniverse-key',
    );
    expect(service.getActiveWeatherService()).toBeNull();
  });

  it('saves every geolocation key while activating only the selected provider', () => {
    service.saveGeolocationServiceConfig({
      selectedProvider: 'locationIq',
      keys: {
        ...EMPTY_GEOLOCATION_SERVICE_KEYS,
        tianditu: 'tianditu-key',
        locationIq: 'location-iq-key',
      },
    });

    expect(service.getGeolocationServiceConfig()).toEqual({
      selectedProvider: 'locationIq',
      keys: {
        ...EMPTY_GEOLOCATION_SERVICE_KEYS,
        tianditu: 'tianditu-key',
        locationIq: 'location-iq-key',
      },
    });
    expect(service.getActiveGeolocationService()).toEqual({
      provider: 'locationIq',
      key: 'location-iq-key',
    });
  });

  it('stores and clears weather and geolocation settings independently', () => {
    service.saveWeatherServiceConfig({
      selectedProvider: 'weatherApi',
      keys: { ...EMPTY_WEATHER_SERVICE_KEYS },
    });
    service.saveGeolocationServiceConfig({
      selectedProvider: 'googleMaps',
      keys: {
        ...EMPTY_GEOLOCATION_SERVICE_KEYS,
        googleMaps: 'google-maps-key',
      },
    });

    service.clearWeatherServiceConfig();

    expect(service.getWeatherServiceConfig()).toBeNull();
    expect(service.getActiveGeolocationService()).toEqual({
      provider: 'googleMaps',
      key: 'google-maps-key',
    });
  });

  it('migrates legacy flat key data and selects its first configured provider', () => {
    localStorage.setItem(
      WEATHER_SERVICE_KEYS_STORAGE_KEY,
      JSON.stringify({ weatherApi: 'legacy-weather-key' }),
    );
    localStorage.setItem(
      GEOLOCATION_SERVICE_KEYS_STORAGE_KEY,
      JSON.stringify({ geoapify: 'legacy-geo-key' }),
    );

    expect(service.getWeatherServiceConfig()?.selectedProvider).toBe(
      'weatherApi',
    );
    expect(service.getActiveWeatherService()?.key).toBe('legacy-weather-key');
    expect(service.getGeolocationServiceConfig()?.selectedProvider).toBe(
      'geoapify',
    );
    expect(service.getActiveGeolocationService()?.key).toBe('legacy-geo-key');
  });

  it('ignores malformed persisted data', () => {
    localStorage.setItem(WEATHER_SERVICE_KEYS_STORAGE_KEY, '{not-json');
    localStorage.setItem(GEOLOCATION_SERVICE_KEYS_STORAGE_KEY, '[]');

    expect(service.getWeatherServiceConfig()).toBeNull();
    expect(service.getGeolocationServiceConfig()).toBeNull();
  });
});
