import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Subject } from 'rxjs';
import { API } from '../../configs/api.config';
import { loadDeviceCatalog, saveDeviceCatalog } from '../device-v2/device-catalog-cache';
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

  const scope = () => ({ authority: API.BASE_URL, accountId: 'user-a' });
  const auth = { accessToken: 'a', refreshToken: 'r', tokenType: 'bearer', uuid: 'user-a' };
  const item = { device: { logicalDeviceId: 'ble_one', name: 'Sensor', deviceType: 'ble', cloudEnabled: true },
    state: 'active', shared: true, access: { shareId: 'share-1', role: 'viewer' as const } };

  it('restores directory only after native auth; no fake user, online state, values or credential', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.mocked(SecureStorage.get).mockResolvedValue(auth);
    saveDeviceCatalog(scope(), [item]);
    await service.init();
    expect(service.getDevice('ble_one')).toMatchObject({ deviceType: 'ble', cloudEnabled: true,
      config: { mode: 'bbp2', isShared: true }, data: { enable: false, cloudReachable: null, canCommand: false } });
    expect(service.deviceDataLoader.value).toBe(true);
    expect(service.initCompleted.value).toBe(true);
    expect(service.userDataLoader.value).toBe(false);
    expect(service.user.id).toBeUndefined();
    expect(service.getDevice('ble_one')?.data.power).toBeUndefined();
    expect(SecureStorage.get).toHaveBeenCalledExactlyOnceWith('session');
  });

  it('clears old account view synchronously and does not restore another account catalog', async () => {
    saveDeviceCatalog(scope(), [item]);
    await service.setAuthData(auth);
    expect(service.device.list).toEqual(['ble_one']);
    const changed = service.setAuthData({ ...auth, uuid: 'user-b', accessToken: 'b' });
    expect(service.device.list).toEqual([]);
    await changed;
    expect(service.device.list).toEqual([]);
  });

  it.each(['logout', 'login'])('a late SecureStorage read cannot undo %s', async action => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    let resolve!: (value: any) => void;
    vi.mocked(SecureStorage.get).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const loading = service.loadAuthData();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    saveDeviceCatalog(scope(), [item]);
    if (action === 'logout') await service.removeAuthData();
    else await service.setAuthData({ ...auth, uuid: 'user-b', accessToken: 'b' });
    resolve(auth); await loading;
    expect(service.auth?.uuid).toBe(action === 'logout' ? undefined : 'user-b');
    expect(service.device.list).toEqual([]);
  });

  it('logout removes the current catalog and full server replacement removes revoked shared entries', async () => {
    await service.setAuthData(auth);
    saveDeviceCatalog(scope(), [item]);
    service.loadGatewayData({ id: 'user-a' } as any, [], [{ ...item.device,
      share: { state: 'revoked', shareId: 'share-1', role: 'viewer' } } as any]);
    expect(loadDeviceCatalog(scope())).toEqual([]);
    expect(service.device.list).toEqual([]);
    expect(service.share.received).toEqual([]);
    await service.removeAuthData();
    expect(loadDeviceCatalog(scope())).toBeUndefined();
  });

  it('partial online directories cannot be persisted as a complete shared inventory', async () => {
    await service.setAuthData(auth);
    saveDeviceCatalog(scope(), [item]);
    service.loadGatewayData({ id: 'user-a' } as any, [], [], false);
    expect(loadDeviceCatalog(scope())).toBeUndefined();
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

  it('maps V2 inventory onto the app device model without clearing other domains', async () => {
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
      byDevice: {},
      received: [],
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
          logicalDeviceId: deviceId,
          tenantId: 'tenant-1',
          name: 'Temperature sensor',
          deviceType: 'diy',
          cloudEnabled: true,
          state: 'active',
          credentialVersion: 1,
          locator: 'AQIDBA',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    );

    const device = service.device.dict[deviceId];
    expect(service.device.list).toEqual([deviceId]);
    expect(device.id).toBe(deviceId);
    expect(device.deviceName).toBe(deviceId);
    expect(device.config).toMatchObject({
      customName: 'Previous name',
      image: 'diyarduino.png',
      broker: 'blinker',
      mode: 'bbp2',
      disabled: false,
    });
    expect(device.data).toMatchObject({
      humidity: 45,
      state: 'waiting',
      enable: false,
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
      emailIsVirtual: false,
      username: 'Person',
      avatar: 'https://example.com/avatar.png',
      phone: '+8613800008888',
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

  it('maps a virtual email and falls back to the full email when the nickname is blank', () => {
    const entitlements = { enabled: true, limit: 0 };

    service.loadGatewayUser(
      {
        id: 'user-2',
        nickname: '   ',
        email: 'fallback@wechat.invalid',
        email_is_virtual: true,
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
      email: 'fallback@wechat.invalid',
      emailIsVirtual: true,
      username: 'fallback@wechat.invalid',
      avatar: '',
      phone: '',
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
