import { DeviceLocationPage } from './device-location.page';

describe('DeviceLocationPage', () => {
  it('preserves nested position fields when updating coordinates', async () => {
    const saveDeviceConfig = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn().mockResolvedValue(undefined);
    const page = new DeviceLocationPage(
      {} as any,
      {} as any,
      { saveDeviceConfig } as any,
      { showToast } as any,
    );
    const existingPosition = {
      location: [100, 20],
      address: '原地址',
      geofence: { radius: 250 },
      providerMetadata: { source: 'manual' },
    };
    const device = {
      config: { position: existingPosition },
    } as any;
    page.device = device;
    page.longitude = 120.1551;
    page.latitude = 30.2741;

    await page.saveGeolocation();

    const expectedPosition = {
      ...existingPosition,
      location: [120.1551, 30.2741],
    };
    expect(saveDeviceConfig).toHaveBeenCalledWith(device, {
      position: expectedPosition,
    });
    expect(device.config.position).toEqual(expectedPosition);
  });
});
