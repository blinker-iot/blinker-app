import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Subject } from 'rxjs';
import { API } from '../../configs/api.config';
import { loadDeviceCatalog, saveDeviceCatalog } from '../device-v2/device-catalog-cache';
import { environment } from '../../../environments/environment';
import {
  AUTH_INVALIDATED_STORAGE_KEY,
  DEV_WEB_AUTH_STORAGE_KEY,
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
    sessionStorage.clear();
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
    expect(service.ownedDeviceCount).toBeNull();
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

  it('counts only the complete owned response, independent of shared catalog and optional sharing errors', async () => {
    await service.setAuthData(auth);
    const owned = (id: string, state: string) => ({ ...item.device, logicalDeviceId: id, state });
    service.loadGatewayData({ id: 'user-a' } as any, [
      owned('own-a', 'active'), owned('own-a', 'active'), owned('own-b', 'disabled'), owned('deleted', 'deleted'),
    ] as any, [{ ...item.device, share: { state: 'active', shareId: 'share-1', role: 'viewer' } } as any], false);
    expect(service.ownedDeviceCount).toBe(2);
    await service.setAuthData({ ...auth, uuid: 'user-b' });
    expect(service.ownedDeviceCount).toBeNull();
    service.loadGatewayData({ id: 'user-b' } as any, []);
    expect(service.ownedDeviceCount).toBe(0);
  });

  it('uses server display names, retains newer CAS receipts across stale inventory and offline restart', async () => {
    await service.setAuthData(auth);
    const metadata = { logicalDeviceId: 'device_a', revision: 1, name: 'Server name',
      capabilities: [{ key: 'power', kind: 0, type: 0, displayName: '电源' }] };
    const device = { ...item.device, logicalDeviceId: 'device_a', name: metadata.name, displayMetadata: metadata, state: 'active' };
    service.loadGatewayData({ id: 'user-a' } as any, [device as any]);
    const current = service.getDevice('device_a');
    const sharedConfig = current.config;
    const panel = { html: '<main>Control</main>' };
    Object.assign(sharedConfig, { panelMode: 'custom', customPanel: panel });
    current.config.customName = 'Stale local name';
    service.loadGatewayData({ id: 'user-a' } as any, [device as any]);
    expect(service.getDevice('device_a').config).toBe(sharedConfig);
    expect(service.getDevice('device_a').config.panelMode).toBe('custom');
    expect(service.getDevice('device_a').config.customPanel).toBe(panel);
    expect(service.getDevice('device_a').config.customName).toBe('Server name');
    const saved = { ...metadata, revision: 2, name: '客厅灯',
      capabilities: [{ key: 'power', kind: 0, type: 0, displayName: '电源开关' }] };
    service.updateDeviceV2DisplayMetadata(saved);
    service.loadGatewayData({ id: 'user-a' } as any, [device as any]);
    expect(service.getDevice('device_a').config).toBe(sharedConfig);
    expect(service.getDevice('device_a').displayMetadata).toEqual(saved);
    expect(service.getDevice('device_a').config.customName).toBe('客厅灯');
    expect(loadDeviceCatalog(scope())?.[0].device.displayMetadata).toEqual(saved);
    const restarted = new DataService(); await restarted.setAuthData(auth);
    expect(restarted.getDevice('device_a').displayMetadata).toEqual(saved);
    expect(restarted.getDevice('device_a').config.customName).toBe('客厅灯');
    await service.setAuthData({ ...auth, uuid: 'user-b' });
    expect(service.getDevice('device_a')).toBeUndefined();
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

  it('persists and restores a development Web session in the current tab', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

    await expect(service.setAuthData({
      accessToken: 'web-access',
      refreshToken: 'web-refresh',
      tokenType: 'bearer',
      uuid: 'web-user',
    })).resolves.toBe(true);

    expect(JSON.parse(sessionStorage.getItem(DEV_WEB_AUTH_STORAGE_KEY) ?? '')).toEqual({
      accessToken: 'web-access',
      refreshToken: 'web-refresh',
      tokenType: 'bearer',
      uuid: 'web-user',
    });
    expect(localStorage.getItem(DEV_WEB_AUTH_STORAGE_KEY)).toBeNull();

    const restarted = new DataService();
    await restarted.loadAuthData();

    expect(restarted.auth).toEqual({
      accessToken: 'web-access',
      refreshToken: 'web-refresh',
      tokenType: 'bearer',
      uuid: 'web-user',
      token: 'web-access',
    });
  });

  it('removes malformed development Web sessions instead of restoring them', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    sessionStorage.setItem(DEV_WEB_AUTH_STORAGE_KEY, '{not-json');

    await service.loadAuthData();

    expect(service.auth).toBeNull();
    expect(sessionStorage.getItem(DEV_WEB_AUTH_STORAGE_KEY)).toBeNull();
  });

  it('clears the development Web session when local auth is removed', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    await service.setAuthData({
      accessToken: 'web-access',
      refreshToken: 'web-refresh',
      tokenType: 'bearer',
    });

    await service.removeAuthData();

    expect(service.auth).toBeNull();
    expect(sessionStorage.getItem(DEV_WEB_AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_INVALIDATED_STORAGE_KEY)).toBe('1');
  });

  it('does not persist or restore the development Web session in production', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const previousProduction = environment.production;
    environment.production = true;
    sessionStorage.setItem(DEV_WEB_AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      tokenType: 'bearer',
    }));

    try {
      await expect(service.setAuthData({
        accessToken: 'production-access',
        refreshToken: 'production-refresh',
        tokenType: 'bearer',
      })).resolves.toBe(true);

      expect(sessionStorage.getItem(DEV_WEB_AUTH_STORAGE_KEY)).toBeNull();

      const restarted = new DataService();
      await restarted.loadAuthData();
      expect(restarted.auth).toBeNull();
    } finally {
      environment.production = previousProduction;
    }
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
      customName: 'Temperature sensor',
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
