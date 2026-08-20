import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { ActionSheetController } from '@ionic/angular';
import { WeatherService } from 'src/app/core/services/weather.service';
import { ThirdPartyServicesService } from 'src/app/core/services/third-party-services.service';
import { WidgetAirComponent } from './widget-air/widget-air.component';
import { WidgetMapComponent } from './widget-map/widget-map.component';
import { WidgetWeatherComponent } from './widget-weather/widget-weather.component';

vi.mock('@ionic/angular', () => ({
  ActionSheetController: class {},
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
        provideRouter([]),
        {
          provide: ThirdPartyServicesService,
          useValue: {
            getActiveGeolocationService: () => null,
            getActiveWeatherService: () => null,
          },
        },
        { provide: WeatherService, useValue: {} },
        { provide: ActionSheetController, useValue: {} },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  function expectConfigurationLink<T>(componentType: Type<T>): void {
    const router = TestBed.inject(Router);
    const navigateByUrl = vi
      .spyOn(router, 'navigateByUrl')
      .mockResolvedValue(true);
    const fixture = TestBed.createComponent(componentType);
    fixture.componentRef.setInput('device', {
      config: { customName: '测试设备' },
      data: {},
    });
    fixture.componentRef.setInput('widget', { key: 'test', lstyle: 0 });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button[routerlink="/third-party-services"]'
    ) as HTMLButtonElement | null;
    expect(button?.textContent?.trim()).toBe('点击配置');

    button?.click();

    expect(navigateByUrl).toHaveBeenCalledTimes(1);
    const target = navigateByUrl.mock.calls[0][0];
    expect(router.serializeUrl(target as UrlTree)).toBe(
      '/third-party-services'
    );
    fixture.destroy();
  }

  it('opens configuration from the map missing-key state', () => {
    expectConfigurationLink(WidgetMapComponent);
  });

  it('opens configuration from the air-quality missing-key state', () => {
    expectConfigurationLink(WidgetAirComponent);
  });

  it('opens configuration from the weather missing-key state', () => {
    expectConfigurationLink(WidgetWeatherComponent);
  });
});
