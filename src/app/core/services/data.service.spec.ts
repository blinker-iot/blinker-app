import { DataService } from './data.service';

describe('DataService guest device preview', () => {
  let service: DataService;

  beforeEach(() => {
    localStorage.clear();
    service = new DataService();
  });

  it('loads the test devices and rooms for a guest', () => {
    service.loadGuestDevicePreview();

    expect(service.device.list).toHaveLength(8);
    expect(Object.keys(service.device.dict)).toHaveLength(8);
    expect(service.room.list).toEqual(['客厅', '卧室', '阳台', '工作室']);
    expect(service.device.dict['preview-living-light'].config.isPreview).toBe(
      true
    );
    expect(service.device.dict['preview-plant-monitor'].config.showSwitch).toBe(
      false
    );
    expect(service.device.dict['preview-plant-monitor'].data.soilMoisture).toBe(
      42
    );
    expect(service.device.dict['preview-air-quality'].config.card?.layout).toBe(
      'wide'
    );
    expect(service.device.dict['preview-air-quality'].config.component).toBe(
      'Customizer'
    );
    expect(
      service.device.dict['preview-energy-monitor'].config.showSwitch
    ).toBe(true);
    expect(
      service.device.dict['preview-energy-monitor'].config.card?.metrics
    ).toHaveLength(6);
    expect(service.device.dict['preview-nearby-ble'].config.mode).toBe('ble');
    expect(service.device.dict['preview-nearby-ble'].config.previewNearby).toBe(
      true
    );
    const previewDashboard = JSON.parse(
      service.device.dict['preview-esp32'].config.layouter as string
    ).dashboard as Array<Record<string, unknown>>;
    expect(
      previewDashboard.find((widget) => widget['type'] === 'wea')
    ).toMatchObject({
      key: 'weather',
      lstyle: 0,
      cols: 8,
      rows: 3,
    });
    expect(
      previewDashboard.find((widget) => widget['type'] === 'air')
    ).toMatchObject({
      key: 'air',
      lstyle: 0,
      cols: 8,
      rows: 3,
    });
    expect(
      Object.values(
        service.device.dict as Record<string, { config: { image: string } }>
      ).every((device) =>
        /^(home-living|development-boards|health-wearables|agriculture-forestry|municipal-buildings|retail-logistics)\/.+\.webp$/.test(
          device.config.image
        )
      )
    ).toBe(true);
  });

  it('does not replace signed-in data unless preview mode is forced', () => {
    service.auth = { uuid: 'saved-user', token: 'saved-token' } as any;
    service.device = { list: ['real-device'], dict: {} };

    service.loadGuestDevicePreview();
    expect(service.device.list).toEqual(['real-device']);

    service.loadGuestDevicePreview(true);
    expect(service.device.list).toContain('preview-living-light');
  });
});
