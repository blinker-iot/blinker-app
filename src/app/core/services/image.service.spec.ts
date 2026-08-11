import { of } from 'rxjs';

import { DeviceImageAsset, ImageService } from './image.service';

const CATALOG: DeviceImageAsset[] = [
  {
    name: 'Smart Bulb',
    dark: 'home-living/smart-bulb-dark.webp',
    light: 'home-living/smart-bulb-light.webp',
    keywords: ['Smart Bulb', 'smart-bulb', '智能灯'],
  },
  {
    name: 'Unknown Device',
    dark: 'home-living/unknown-device-dark.webp',
    light: 'home-living/unknown-device-light.webp',
    keywords: ['Unknown Device', 'unknown-device'],
  },
];

describe('ImageService', () => {
  it('loads the local catalog and resolves light/dark image pairs', () => {
    const http = {
      get: vi.fn(() => of(CATALOG)),
    };
    const service = new ImageService(http as never);

    service.init();

    expect(http.get).toHaveBeenCalledWith(
      expect.stringMatching(/^devices\/index\.json\?date=\d+$/),
    );
    expect(service.loader.value).toBe(true);
    expect(
      service.resolveDeviceImage('home-living/smart-bulb-light.webp'),
    ).toEqual({
      dark: 'devices/home-living/smart-bulb-dark.webp',
      light: 'devices/home-living/smart-bulb-light.webp',
    });
  });

  it('maps legacy image names to catalog images', () => {
    const service = new ImageService({ get: () => of(CATALOG) } as never);
    service.init();

    expect(service.resolveDeviceImage('ownlight.png')).toEqual({
      dark: 'devices/home-living/smart-bulb-dark.webp',
      light: 'devices/home-living/smart-bulb-light.webp',
    });
  });
});
