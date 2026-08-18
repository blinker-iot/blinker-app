import { ChangeDetectorRef, Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule } from '@ionic/angular';
import { HeroCardComponent } from '../../core/components/hero-card/hero-card.component';
import { GeocodingService } from '../../core/services/geocoding.service';
import {
  DEFAULT_GEOLOCATION_SERVICE_PROVIDER,
  DEFAULT_WEATHER_SERVICE_PROVIDER,
  EMPTY_GEOLOCATION_SERVICE_KEYS,
  EMPTY_WEATHER_SERVICE_KEYS,
  GeolocationServiceProvider,
  GeolocationServiceKeys,
  ThirdPartyServicesService,
  WeatherServiceProvider,
  WeatherServiceKeys,
} from '../../core/services/third-party-services.service';
import { WeatherService } from '../../core/services/weather.service';

type ServiceGroup = 'weather' | 'geolocation';
type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

interface ServiceProvider<TId extends string> {
  id: TId;
  name: string;
  placeholder: string;
}

@Component({
  selector: 'app-third-party-services',
  standalone: true,
  templateUrl: './third-party-services.page.html',
  styleUrls: ['./third-party-services.page.scss'],
  imports: [FormsModule, IonicModule, HeroCardComponent],
})
export class ThirdPartyServicesPage {
  readonly weatherProviders: readonly ServiceProvider<
    keyof WeatherServiceKeys
  >[] = [
    { id: 'seniverse', name: '心知天气', placeholder: '输入心知天气 API Key' },
    {
      id: 'openWeather',
      name: 'OpenWeather',
      placeholder: '输入 OpenWeather API Key',
    },
    { id: 'weatherApi', name: 'WeatherAPI', placeholder: '输入 WeatherAPI Key' },
    {
      id: 'visualCrossing',
      name: 'Visual Crossing',
      placeholder: '输入 Visual Crossing API Key',
    },
  ];

  readonly geolocationProviders: readonly ServiceProvider<
    keyof GeolocationServiceKeys
  >[] = [
    { id: 'tianditu', name: '天地图', placeholder: '输入天地图 API Key' },
    { id: 'geoapify', name: 'Geoapify', placeholder: '输入 Geoapify API Key' },
    {
      id: 'locationIq',
      name: 'LocationIQ',
      placeholder: '输入 LocationIQ Access Token',
    },
    {
      id: 'googleMaps',
      name: 'Google Maps',
      placeholder: '输入 Google Maps API Key',
    },
  ];

  weatherKeys: WeatherServiceKeys = { ...EMPTY_WEATHER_SERVICE_KEYS };
  geolocationKeys: GeolocationServiceKeys = {
    ...EMPTY_GEOLOCATION_SERVICE_KEYS,
  };
  selectedWeatherProvider: WeatherServiceProvider =
    DEFAULT_WEATHER_SERVICE_PROVIDER;
  selectedGeolocationProvider: GeolocationServiceProvider =
    DEFAULT_GEOLOCATION_SERVICE_PROVIDER;
  weatherValidationStatus: ValidationStatus = 'idle';
  geolocationValidationStatus: ValidationStatus = 'idle';
  hasSavedWeatherKeys = false;
  hasSavedGeolocationKeys = false;

  private readonly visibleKeys = new Set<string>();
  private weatherValidationRun = 0;
  private geolocationValidationRun = 0;

  constructor(
    private readonly services: ThirdPartyServicesService,
    private readonly weatherService: WeatherService,
    private readonly geocodingService: GeocodingService,
    private readonly alertController: AlertController,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef,
  ) {
    const weatherConfig = this.services.getWeatherServiceConfig();
    if (weatherConfig) {
      this.weatherKeys = weatherConfig.keys;
      this.selectedWeatherProvider = weatherConfig.selectedProvider;
      this.hasSavedWeatherKeys = true;
    }

    const geolocationConfig = this.services.getGeolocationServiceConfig();
    if (geolocationConfig) {
      this.geolocationKeys = geolocationConfig.keys;
      this.selectedGeolocationProvider = geolocationConfig.selectedProvider;
      this.hasSavedGeolocationKeys = true;
    }
  }

  saveWeatherServices(): void {
    if (this.weatherValidationStatus === 'validating') return;

    const config = this.services.saveWeatherServiceConfig({
      selectedProvider: this.selectedWeatherProvider,
      keys: this.weatherKeys,
    });
    this.weatherKeys = config.keys;
    this.selectedWeatherProvider = config.selectedProvider;
    this.hasSavedWeatherKeys = true;
    this.weatherValidationStatus = 'validating';
    const validationRun = ++this.weatherValidationRun;
    this.weatherService
      .validateCurrentService()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isValid) => {
        if (validationRun !== this.weatherValidationRun) return;
        this.weatherValidationStatus = isValid ? 'valid' : 'invalid';
        this.changeDetectorRef.detectChanges();
      });
  }

  saveGeolocationServices(): void {
    if (this.geolocationValidationStatus === 'validating') return;

    const config = this.services.saveGeolocationServiceConfig({
      selectedProvider: this.selectedGeolocationProvider,
      keys: this.geolocationKeys,
    });
    this.geolocationKeys = config.keys;
    this.selectedGeolocationProvider = config.selectedProvider;
    this.hasSavedGeolocationKeys = true;
    this.geolocationValidationStatus = 'validating';
    const validationRun = ++this.geolocationValidationRun;
    this.geocodingService
      .validateCurrentService()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isValid) => {
        if (validationRun !== this.geolocationValidationRun) return;
        this.geolocationValidationStatus = isValid ? 'valid' : 'invalid';
        this.changeDetectorRef.detectChanges();
      });
  }

  markChanged(group: ServiceGroup): void {
    if (group === 'weather') {
      this.weatherValidationRun += 1;
      this.weatherValidationStatus = 'idle';
    }
    if (group === 'geolocation') {
      this.geolocationValidationRun += 1;
      this.geolocationValidationStatus = 'idle';
    }
  }

  isKeyVisible(group: ServiceGroup, provider: string): boolean {
    return this.visibleKeys.has(this.visibilityId(group, provider));
  }

  toggleKeyVisibility(group: ServiceGroup, provider: string): void {
    const id = this.visibilityId(group, provider);
    if (this.visibleKeys.has(id)) {
      this.visibleKeys.delete(id);
    } else {
      this.visibleKeys.add(id);
    }
  }

  async confirmClearWeatherServices(): Promise<void> {
    const alert = await this.alertController.create({
      header: '清除天气服务设置？',
      message: '已填写的天气服务密钥将从当前设备中移除。',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '清除',
          role: 'destructive',
          handler: () => this.clearWeatherServices(),
        },
      ],
    });
    await alert.present();
  }

  async confirmClearGeolocationServices(): Promise<void> {
    const alert = await this.alertController.create({
      header: '清除地理信息服务设置？',
      message: '已填写的地理信息服务密钥将从当前设备中移除。',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '清除',
          role: 'destructive',
          handler: () => this.clearGeolocationServices(),
        },
      ],
    });
    await alert.present();
  }

  private clearWeatherServices(): void {
    this.services.clearWeatherServiceConfig();
    this.weatherKeys = { ...EMPTY_WEATHER_SERVICE_KEYS };
    this.selectedWeatherProvider = DEFAULT_WEATHER_SERVICE_PROVIDER;
    this.weatherValidationRun += 1;
    this.weatherValidationStatus = 'idle';
    this.hasSavedWeatherKeys = false;
  }

  private clearGeolocationServices(): void {
    this.services.clearGeolocationServiceConfig();
    this.geolocationKeys = { ...EMPTY_GEOLOCATION_SERVICE_KEYS };
    this.selectedGeolocationProvider =
      DEFAULT_GEOLOCATION_SERVICE_PROVIDER;
    this.geolocationValidationRun += 1;
    this.geolocationValidationStatus = 'idle';
    this.hasSavedGeolocationKeys = false;
  }

  private visibilityId(group: ServiceGroup, provider: string): string {
    return `${group}:${provider}`;
  }
}
