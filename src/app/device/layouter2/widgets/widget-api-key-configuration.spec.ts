import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActionSheetController } from '@ionic/angular';
import { NavController } from '@ionic/angular/standalone';
import { WeatherService } from 'src/app/core/services/weather.service';
import { ThirdPartyServicesService } from 'src/app/core/services/third-party-services.service';
import { WidgetAirComponent } from './widget-air/widget-air.component';
import { WidgetMapComponent } from './widget-map/widget-map.component';
import { WidgetWeatherComponent } from './widget-weather/widget-weather.component';

vi.mock('@ionic/angular', () => ({
  ActionSheetController: class {},
}));

vi.mock('@ionic/angular/standalone', () => ({
  NavController: class {},
}));

describe('widget API key configuration links', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        WidgetMapComponent,
        WidgetAirComponent,
        WidgetWeatherComponent,
      ],
      providers: [
        {
          provide: ThirdPartyServicesService,
          useValue: {
            getActiveGeolocationService: () => null,
            getActiveWeatherService: () => null,
          },
        },
        { provide: WeatherService, useValue: {} },
        { provide: ActionSheetController, useValue: {} },
        {
          provide: NavController,
          useValue: { navigateForward: () => Promise.resolve(true) },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  function expectConfigurationLink<T>(
    componentType: Type<T>,
    accessibleName: string
  ): void {
    const navController = TestBed.inject(NavController);
    const navigateForward = vi
      .spyOn(navController, 'navigateForward')
      .mockResolvedValue(true);
    const fixture = TestBed.createComponent(componentType);
    fixture.componentRef.setInput('device', {
      config: { customName: '测试设备' },
      data: {},
    });
    fixture.componentRef.setInput('widget', { key: 'test', lstyle: 0 });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button.api-key-settings-button'
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.classList.contains('api-key-settings-button')).toBe(true);
    expect(button?.querySelector('i.fa-gear')).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe(accessibleName);
    expect(button?.title).toBe(accessibleName);

    const style = getComputedStyle(button as HTMLButtonElement);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe('8px');
    expect(style.right).toBe('8px');
    expect(style.width).toBe('28px');
    expect(style.height).toBe('28px');
    expect(style.borderRadius).toBe('50%');

    button?.click();

    expect(navigateForward).toHaveBeenCalledOnce();
    expect(navigateForward).toHaveBeenCalledWith('/third-party-services');
    fixture.destroy();
  }

  it('opens configuration from the map missing-key state', () => {
    expectConfigurationLink(WidgetMapComponent, '配置地图 API Key');
  });

  it('opens configuration from the air-quality missing-key state', () => {
    expectConfigurationLink(WidgetAirComponent, '配置天气 API Key');
  });

  it('opens configuration from the weather missing-key state', () => {
    expectConfigurationLink(WidgetWeatherComponent, '配置天气 API Key');
  });
});
