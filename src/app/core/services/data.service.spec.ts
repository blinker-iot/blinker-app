import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Subject } from 'rxjs';
import {
  AUTH_INVALIDATED_STORAGE_KEY,
  DataService,
} from './data.service';

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    setKeyPrefix: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('DataService', () => {
  let service: DataService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(SecureStorage.setKeyPrefix).mockResolvedValue(undefined);
    vi.mocked(SecureStorage.get).mockResolvedValue(null);
    vi.mocked(SecureStorage.set).mockResolvedValue(undefined);
    vi.mocked(SecureStorage.remove).mockResolvedValue(undefined);
    service = new DataService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps guest preview changes scoped to the original device and room data', () => {
    const scene = { dict: { Evening: {} }, list: ['Evening'] };
    const share = {
      share: { device: true },
      share0: {},
      shared: [],
      shared0: [],
    };
    const brokers = { dict: { blinker: {} }, list: ['blinker'] };
    service.scene = scene;
    service.share = share;
    service.brokers = brokers;

    service.loadGuestDevicePreview();

    expect(service.device.list).toHaveLength(8);
    expect(Object.keys(service.device.dict)).toHaveLength(8);
    expect(service.room.list).toEqual(['客厅', '卧室', '阳台', '工作室']);
    expect(service.scene).toBe(scene);
    expect(service.share).toBe(share);
    expect(service.brokers).toBe(brokers);
    expect(service.userDataLoader.value).toBe(false);
    expect(service.initCompleted.value).toBe(false);
    expect(service.device.dict['preview-living-light'].config.isPreview).toBe(true);
    expect(service.device.dict['preview-plant-monitor'].config.showSwitch).toBe(false);
    expect(service.device.dict['preview-plant-monitor'].data.soilMoisture).toBe(42);
    expect(service.device.dict['preview-air-quality'].config.card?.layout).toBe('wide');
    expect(service.device.dict['preview-energy-monitor'].config.showSwitch).toBe(true);
    expect(service.device.dict['preview-energy-monitor'].config.card?.metrics).toHaveLength(6);
    expect(service.device.dict['preview-nearby-ble'].config.mode).toBe('ble');
    expect(service.device.dict['preview-nearby-ble'].config.previewNearby).toBe(true);
    const previewDashboard = JSON.parse(
      service.device.dict['preview-esp32'].config.layouter as string,
    ).dashboard as Array<Record<string, unknown>>;
    expect(previewDashboard.find((widget) => widget['type'] === 'wea')).toMatchObject({
      key: 'weather',
      lstyle: 0,
      cols: 8,
      rows: 3,
    });
    expect(previewDashboard.find((widget) => widget['type'] === 'air')).toMatchObject({
      key: 'air',
      lstyle: 0,
      cols: 8,
      rows: 3,
    });
    expect(
      Object.values(
        service.device.dict as Record<string, { config: { image: string } }>,
      ).every((device) =>
          /^(home-living|development-boards|health-wearables|agriculture-forestry|municipal-buildings|retail-logistics)\/.+\.webp$/.test(
            device.config.image,
          ),
        ),
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

  it('persists the native token pair in secure storage', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    await expect(service.setAuthData({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'bearer',
    })).resolves.toBe(true);

    expect(SecureStorage.set).toHaveBeenCalledWith('session', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'bearer',
      token: 'access-token',
    });
    expect(service.auth).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      token: 'access-token',
    });
    expect(localStorage.getItem('auth')).toBeNull();
  });

  it('restores a valid native token pair and never restores through a logout tombstone', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.mocked(SecureStorage.get).mockResolvedValue({
      accessToken: 'saved-access',
      refreshToken: 'saved-refresh',
      tokenType: 'bearer',
    });

    await service.loadAuthData();

    expect(service.auth).toEqual({
      accessToken: 'saved-access',
      refreshToken: 'saved-refresh',
      tokenType: 'bearer',
      token: 'saved-access',
    });

    localStorage.setItem(AUTH_INVALIDATED_STORAGE_KEY, '1');
    const restarted = new DataService();
    vi.mocked(SecureStorage.get).mockClear();
    await restarted.loadAuthData();

    expect(SecureStorage.get).not.toHaveBeenCalled();
    expect(restarted.auth).toBeNull();
  });

  it('does not let a late refresh replace a newer login', async () => {
    await service.setAuthData({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      tokenType: 'bearer',
    });

    let releaseStorageWrite: () => void = () => undefined;
    const storageWrite = new Promise<void>((resolve) => {
      releaseStorageWrite = resolve;
    });
    const internals = service as unknown as {
      persistAuthData(auth: unknown): Promise<void>;
    };
    vi.spyOn(internals, 'persistAuthData').mockImplementation(
      async () => storageWrite,
    );

    const refresh = service.replaceAuthData(
      { accessToken: 'old-access', refreshToken: 'old-refresh' },
      {
        accessToken: 'refreshed-access',
        refreshToken: 'refreshed-refresh',
        tokenType: 'bearer',
      },
    );
    const login = service.setAuthData({
      accessToken: 'new-login-access',
      refreshToken: 'new-login-refresh',
      tokenType: 'bearer',
    });
    releaseStorageWrite();

    await expect(refresh).resolves.toBe(false);
    await expect(login).resolves.toBe(true);
    expect(service.auth?.accessToken).toBe('new-login-access');
  });

  it('maps Gateway DTOs onto the existing device model without clearing other domains', async () => {
    await service.setAuthData({
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'bearer',
    });

    const deviceId = 'device_1234567890abcdef';
    const subject = new Subject<unknown>();
    const storage = { cached: true };
    service.device = {
      list: [deviceId],
      dict: {
        [deviceId]: {
          config: { customName: 'Previous name' },
          data: { humidity: 45, state: 'offline' },
          storage,
          subject,
        },
      },
    };
    const room = { dict: { Bedroom: [deviceId] }, list: ['Bedroom'] };
    const scene = { dict: { Night: {} }, list: ['Night'] };
    const share = {
      share: {},
      share0: {},
      shared: [{ deviceName: deviceId }],
      shared0: [],
    };
    const brokers = { dict: { blinker: { connected: true } }, list: ['blinker'] };
    service.room = room;
    service.scene = scene;
    service.share = share;
    service.brokers = brokers;

    service.loadGatewayData(
      {
        id: 'user-1',
        nickname: 'Person',
        email: 'person@example.com',
        phone: '+8613800008888',
        avatar: 'https://example.com/avatar.png',
        subscription_plan: {
          name: 'pro',
          display_name: 'Pro',
          service_tier: 'dedicated',
          subscription_id: 'subscription-1',
          status: 'active',
          end_date: '2026-12-01T00:00:00Z',
        },
        permissions: ['device.read'],
        rbac_permissions: ['devices:*'],
        entitlement_revision: 7,
        entitlements: { 'iot.devices': 10 },
      },
      [
        {
          deviceId,
          tenantId: 'tenant-1',
          name: 'Temperature sensor',
          deviceType: 'diy',
          status: 'disabled',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      {
        configs: {
          [deviceId]: {
            config: {
              customName: 'Bedroom sensor',
              image: { invalid: true },
              broker: 'custom-broker',
              mode: 'mqtt',
              disabled: false,
              showSwitch: 'invalid',
              card: { layout: 'wide', metrics: 'invalid', actions: [] },
              layouter: {
                dashboard: [null, { type: 'tex' }],
                actions: [],
                triggers: [],
              },
              authKey: 'do-not-expose',
              auth_key: 'legacy-auth-key',
              isPreview: true,
              previewNearby: true,
              isShared: true,
            },
          },
        },
        statuses: {
          [deviceId]: { status: { mqttOnline: true } } as any,
        },
        snapshots: {
          [deviceId]: {
            data: {
              data: {
                temperature: 23.5,
                state: 'offline',
                enable: false,
              },
            },
          } as any,
        },
      },
    );

    const device = service.device.dict[deviceId];
    expect(service.device.list).toEqual([deviceId]);
    expect(device.id).toBe(deviceId);
    expect(device.deviceName).toBe(deviceId);
    expect(device.config).toMatchObject({
      customName: 'Bedroom sensor',
      image: 'diyarduino.png',
      broker: 'custom-broker',
      mode: 'mqtt',
      disabled: false,
      card: { layout: 'wide', metrics: 'invalid', actions: [] },
    });
    expect(device.config.showSwitch).toBe('invalid');
    expect(device.config.authKey).toBeUndefined();
    expect(device.config['auth_key']).toBeUndefined();
    expect(device.config.isPreview).toBe(true);
    expect(device.config.previewNearby).toBe(true);
    expect(device.config.isShared).toBe(true);
    expect(device.config.configWriteSupported).toBeUndefined();
    expect(device.config.realtimeControlSupported).toBeUndefined();
    expect(device.config.gatewayMqttOnline).toBeUndefined();
    expect(JSON.parse(device.config.layouter || '')).toEqual({
      dashboard: [null, { type: 'tex' }],
      actions: [],
      triggers: [],
    });
    expect(device.data).toMatchObject({
      humidity: 45,
      temperature: 23.5,
      state: 'online',
      enable: true,
    });
    expect(device.storage).toBe(storage);
    expect(device.subject).toBe(subject);
    expect(service.room).toBe(room);
    expect(service.scene).toBe(scene);
    expect(service.share).toBe(share);
    expect(service.brokers).toBe(brokers);
    expect(service.user).toEqual({
      id: 'user-1',
      nickname: 'Person',
      email: 'person@example.com',
      username: 'Person',
      avatar: 'https://example.com/avatar.png',
      phone: '+8613800008888',
      level: 0,
      subscriptionPlan: {
        name: 'pro',
        display_name: 'Pro',
        service_tier: 'dedicated',
        subscription_id: 'subscription-1',
        status: 'active',
        end_date: '2026-12-01T00:00:00Z',
      },
      permissions: ['device.read'],
      rbacPermissions: ['devices:*'],
      entitlementRevision: 7,
      entitlements: { 'iot.devices': 10 },
    });
    expect(service.userDataLoader.value).toBe(true);

    expect(service.auth).toMatchObject({
      uuid: 'user-1',
      token: 'access',
    });
  });

  it('falls back to the full email when the nickname is blank', () => {
    const entitlements = { enabled: true, limit: 0 };

    service.loadGatewayUser(
      {
        id: 'user-2',
        nickname: '   ',
        email: 'fallback@example.com',
        phone: null,
        avatar: null,
        subscription_plan: null,
        permissions: [],
        rbac_permissions: [],
        entitlements,
      },
    );

    expect(service.user).toEqual({
      id: 'user-2',
      nickname: '   ',
      email: 'fallback@example.com',
      username: 'fallback@example.com',
      avatar: '',
      phone: '',
      level: 0,
      subscriptionPlan: null,
      permissions: [],
      rbacPermissions: [],
      entitlementRevision: undefined,
      entitlements,
    });
    expect(service.userDataLoader.value).toBe(true);
  });

  it('keeps a stable installation id', () => {
    const first = service.getInstallationId();
    const second = service.getInstallationId();

    expect(second).toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
