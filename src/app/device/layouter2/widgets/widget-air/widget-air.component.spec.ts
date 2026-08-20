import { ChangeDetectorRef, NgZone } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { WeatherService } from 'src/app/core/services/weather.service';
import {
  ThirdPartyServicesService,
  WeatherServiceProvider,
} from 'src/app/core/services/third-party-services.service';
import { WidgetAirComponent } from './widget-air.component';

describe('WidgetAirComponent', () => {
  const components: WidgetAirComponent[] = [];

  afterEach(() => {
    components.forEach((component) => component.ngOnDestroy());
    components.length = 0;
    vi.unstubAllGlobals();
  });

  function createComponent(
    provider: WeatherServiceProvider | null = 'seniverse',
    responses: {
      current?: unknown;
      currentStream?: Observable<unknown>;
    } = {}
  ): {
    component: WidgetAirComponent;
    getAirQuality: ReturnType<typeof vi.fn>;
    markForCheck: ReturnType<typeof vi.fn>;
  } {
    const responseProvider = provider ?? 'seniverse';
    const getAirQuality = vi.fn(() =>
      responses.currentStream ??
      of({
        provider: responseProvider,
        data: responses.current ?? SENIVERSE_CURRENT,
      })
    );
    const weatherService = { getAirQuality } as unknown as WeatherService;
    const thirdPartyServices = {
      getActiveWeatherService: () =>
        provider ? { provider, key: 'configured-key' } : null,
    } as ThirdPartyServicesService;
    const ngZone = {
      run: vi.fn((callback: () => void) => callback()),
    } as unknown as NgZone;
    const markForCheck = vi.fn();
    const changeDetectorRef = { markForCheck } as unknown as ChangeDetectorRef;
    const component = new WidgetAirComponent(
      weatherService,
      thirdPartyServices,
      ngZone,
      changeDetectorRef
    );
    component.device = {
      config: {
        customName: '阳台传感器',
        position: {
          location: [120.1551, 30.2741],
          address: '杭州市西湖区',
        },
      },
    };
    component.widget = { type: 'air', key: 'air', lstyle: 0, rows: 3 };
    components.push(component);
    return { component, getAirQuality, markForCheck };
  }

  it('requests current air quality for the configured coordinates', async () => {
    const { component, getAirQuality, markForCheck } = createComponent();

    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('ready'));

    expect(getAirQuality).toHaveBeenCalledTimes(1);
    expect(getAirQuality).toHaveBeenCalledWith(
      { latitude: 30.2741, longitude: 120.1551 },
      { language: 'zh-Hans' }
    );
    expect(component.snapshot?.location).toBe('杭州');
    expect(component.providerName).toBe('心知天气');
    expect(component.displayPages).toHaveLength(1);
    expect(component.particlePollutants.map((pollutant) => pollutant.label)).toEqual([
      'PM2.5',
      'PM10',
    ]);
    expect(component.pollutantPages[0].map((pollutant) => pollutant.label)).toEqual([
      'O₃',
      'NO₂',
      'SO₂',
      'CO',
    ]);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('does not issue requests without a configured weather API key', () => {
    const { component, getAirQuality } = createComponent(null);

    component.ngOnInit();

    expect(component.airState).toBe('missing-key');
    expect(getAirQuality).not.toHaveBeenCalled();
  });

  it('uses static current-air demo data without consuming the weather API', () => {
    const { component, getAirQuality } = createComponent();
    component.isDemo = true;

    component.ngOnInit();

    expect(component.airState).toBe('ready');
    expect(component.snapshot?.aqiDisplay).toBe('42');
    expect(component.particlePollutants.map((pollutant) => pollutant.label)).toEqual([
      'PM2.5',
      'PM10',
    ]);
    expect(component.pollutantPages[0]).toHaveLength(4);
    expect(component.pollutantPages[0].map((pollutant) => pollutant.label)).toEqual([
      'O₃',
      'NO₂',
      'SO₂',
      'CO',
    ]);
    expect(component.displayPages).toHaveLength(1);
    expect(getAirQuality).not.toHaveBeenCalled();
  });

  it('keeps PM2.5 and PM10 visible when the second row is empty', async () => {
    const { component } = createComponent('seniverse', {
      current: {
        results: [
          {
            location: { name: 'Hangzhou' },
            air: {
              city: { aqi: 42, pm25: 18, pm10: 35 },
            },
          },
        ],
      },
    });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('ready'));

    expect(component.particlePollutants.map((pollutant) => pollutant.id)).toEqual([
      'pm2.5',
      'pm10',
    ]);
    expect(component.particlePollutants.map((pollutant) => pollutant.displayValue)).toEqual([
      '18',
      '35',
    ]);
    expect(component.displayPages).toHaveLength(1);
    expect(component.displayPages[0].particles).toEqual(
      component.particlePollutants
    );
    expect(component.displayPages[0].pollutants).toEqual([]);
  });

  it('keeps fixed PM slots and preserves a zero value when one PM value is missing', async () => {
    const { component } = createComponent('seniverse', {
      current: {
        results: [
          {
            location: { name: 'Hangzhou' },
            air: { city: { aqi: 42, pm10: 0 } },
          },
        ],
      },
    });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('ready'));

    expect(component.particlePollutants.map((pollutant) => pollutant.label)).toEqual([
      'PM2.5',
      'PM10',
    ]);
    expect(component.particlePollutants.map((pollutant) => pollutant.displayValue)).toEqual([
      '--',
      '0',
    ]);
  });

  it('assigns a suitable icon to every displayed pollutant', () => {
    const { component } = createComponent();

    expect(component.pollutantIcon('pm2.5')).toBe('fa-light fa-smog');
    expect(component.pollutantIcon('pm10')).toBe('fa-light fa-sun-dust');
    expect(component.pollutantIcon('o3')).toBe('fa-light fa-sun-haze');
    expect(component.pollutantIcon('no2')).toBe(
      'fa-light fa-industry-windows'
    );
    expect(component.pollutantIcon('so2')).toBe('fa-light fa-cloud');
    expect(component.pollutantIcon('co')).toBe('fa-light fa-wind');
    expect(component.pollutantIcon('unknown')).toBe('fa-light fa-flask');
  });

  it('shows an error when the current-air request fails without cached data', async () => {
    const { component } = createComponent('seniverse', {
      currentStream: throwError(() => ({ status: 500 })),
    });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('error'));

    expect(component.snapshot).toBeNull();
    expect(component.errorMessage).toContain('加载失败');
  });

  it('preserves current data as stale after a background refresh failure', async () => {
    const { component, getAirQuality } = createComponent();
    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('ready'));
    const originalSnapshot = component.snapshot;
    getAirQuality.mockReturnValueOnce(throwError(() => ({ status: 429 })));

    component.refresh(false);
    await vi.waitFor(() => expect(component.stale).toBe(true));

    expect(component.airState).toBe('ready');
    expect(component.snapshot).toBe(originalSnapshot);
    expect(component.errorMessage).toContain('请求过于频繁');
  });

  it('keeps PM data in the first row and paginates four details per second row', async () => {
    const current = createSeniverseCurrentWithPollutants();
    const component = createComponent('seniverse', { current }).component;
    component.lstyle = 0;
    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('ready'));

    expect(component.particlePollutants.map((pollutant) => pollutant.id)).toEqual([
      'pm2.5',
      'pm10',
    ]);
    expect(component.pollutantPages.map((page) => page.length)).toEqual([4, 3]);
    const detailIds = component.pollutantPages
      .flat()
      .map((pollutant) => pollutant.id);
    expect(detailIds).not.toContain('pm2.5');
    expect(detailIds).not.toContain('pm10');
    expect(component.pollutantPages.flat().map((pollutant) => pollutant.label)).toEqual([
      'O₃',
      'NO₂',
      'SO₂',
      'CO',
      'PM1',
      'NO',
      'NH₃',
    ]);
    expect(component.displayPages).toHaveLength(2);
    expect(
      component.displayPages.every((page) =>
        page.particles === component.particlePollutants
      )
    ).toBe(true);
  });

  it('supports keyboard and direct navigation between pollutant pages', () => {
    const { component } = createComponent();
    component.displayPages = [
      { id: 'first', particles: [], pollutants: [] },
      { id: 'second', particles: [], pollutants: [] },
    ];

    component.nextPage();
    expect(component.pageIndex).toBe(1);
    component.previousPage();
    expect(component.pageIndex).toBe(0);
    const event = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    component.onCarouselKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.pageIndex).toBe(1);
    component.showPage(0);
    expect(component.pageIndex).toBe(0);
  });

  it('leaves loading and shows an error for an unrecognized current payload', async () => {
    const { component } = createComponent('seniverse', {
      current: { results: [] },
    });

    component.ngOnInit();
    await vi.waitFor(() => expect(component.airState).toBe('error'));

    expect(component.snapshot).toBeNull();
    expect(component.errorMessage).toContain('解析失败');
  });
});

const SENIVERSE_CURRENT = {
  results: [
    {
      location: { name: '杭州', path: '杭州,浙江,中国', country: '中国' },
      air: {
        city: {
          aqi: '42',
          pm25: '18',
          pm10: '35',
          so2: '7',
          no2: '24',
          co: '0.7',
          o3: '72',
          primary_pollutant: null,
          quality: '优',
          last_update: '2026-08-20T12:00:00+08:00',
        },
      },
    },
  ],
};

function createSeniverseCurrentWithPollutants(): unknown {
  const base = SENIVERSE_CURRENT.results[0];
  return {
    results: [
      {
        ...base,
        air: {
          city: {
            ...base.air.city,
            pm1: '12',
            no: '4',
            nh3: '2',
          },
        },
      },
    ],
  };
}
