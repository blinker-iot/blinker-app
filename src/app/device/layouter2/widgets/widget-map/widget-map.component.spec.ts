import { ChangeDetectorRef, NgZone } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
import {
  ActiveThirdPartyService,
  GeolocationServiceProvider,
  ThirdPartyServicesService,
} from 'src/app/core/services/third-party-services.service';
import { WidgetMapComponent } from './widget-map.component';

vi.mock('@ionic/angular', () => ({
  ActionSheetController: class {},
}));

describe('WidgetMapComponent', () => {
  function createComponent(
    activeService: ActiveThirdPartyService<GeolocationServiceProvider> | null
  ): WidgetMapComponent {
    const actionSheetController = {} as ActionSheetController;
    const thirdPartyServices = {
      getActiveGeolocationService: () => activeService,
    } as ThirdPartyServicesService;
    const ngZone = {
      run: (callback: () => void) => callback(),
    } as NgZone;
    const changeDetectorRef = {
      markForCheck: vi.fn(),
    } as unknown as ChangeDetectorRef;

    return new WidgetMapComponent(
      actionSheetController,
      thirdPartyServices,
      ngZone,
      changeDetectorRef
    );
  }

  it('does not initialize a default map when the selected service has no key', () => {
    const component = createComponent(null);

    component.ngOnInit();

    expect(component.mapState).toBe('missing-key');
    expect(component.mymap).toBeNull();
  });

  it.each([
    ['tianditu', '天地图'],
    ['geoapify', 'Geoapify'],
    ['locationIq', 'LocationIQ'],
  ] as const)(
    'uses the configured %s service',
    (provider, expectedProviderName) => {
      const component = createComponent({ provider, key: 'map-key' });

      component.ngOnInit();

      expect(component.mapState).toBe('loading');
      expect(component.mapProviderName).toBe(expectedProviderName);
    }
  );

  it('removes the loading state when the first map tile loads', () => {
    const component = createComponent({
      provider: 'tianditu',
      key: 'map-key',
    });
    const listeners = new Map<string, () => void>();
    const layer = {
      once: (event: string, listener: () => void) =>
        listeners.set(event, listener),
      on: (event: string, listener: () => void) =>
        listeners.set(event, listener),
    };
    component.ngOnInit();

    (component as any).watchTileLoading(layer);
    listeners.get('tileload')?.();

    expect(component.mapState).toBe('ready');
  });

  it('shows a useful error after repeated TianDiTu tile failures', () => {
    const component = createComponent({
      provider: 'tianditu',
      key: 'map-key',
    });
    const listeners = new Map<string, () => void>();
    const layer = {
      once: (event: string, listener: () => void) =>
        listeners.set(event, listener),
      on: (event: string, listener: () => void) =>
        listeners.set(event, listener),
    };
    component.ngOnInit();

    (component as any).watchTileLoading(layer);
    listeners.get('tileerror')?.();
    listeners.get('tileerror')?.();
    listeners.get('tileerror')?.();

    expect(component.mapState).toBe('error');
    expect(component.mapErrorMessage).toContain('应用域名权限');
  });
});
