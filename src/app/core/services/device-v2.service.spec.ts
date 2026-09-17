import '@angular/compiler';

import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API } from '../../configs/api.config';
import { DeviceV2AccountClient } from '../device-v2/account-client';
import { UserService } from './user.service';
import { NoticeService } from './notice.service';
import { DataService } from './data.service';
import { DeviceV2Service } from './device-v2.service';

describe('DeviceV2Service connection contract', () => {
  let service: DeviceV2Service;
  let data: DataService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: UserService, useValue: { getAllInfo: vi.fn() } },
      ],
    });
    data = TestBed.inject(DataService);
    data.auth = {
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'bearer',
      uuid: 'user-a',
    };
    service = TestBed.inject(DeviceV2Service);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await service.stop();
    vi.restoreAllMocks();
  });

  it('requests an explicit BBP/2 WebSocket credential and rejects silent TCP fallback', async () => {
    const start = service.start();
    const request = http.expectOne(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('wire')).toBe('bbp2');
    expect(request.request.params.get('pv')).toBe('2');
    expect(request.request.params.get('transport')).toBe('websocket');
    request.flush({
      account: { accountId: 'user', tenantId: 'tenant' },
      mqtt: {
        host: 'mqtt.example.test',
        port: 8883,
        protocol: 'mqtt',
        clientId: 'appu-user-a1b2c3d4',
        username: 'appu_user',
        password: 'jwt',
        expiresIn: 600,
        publishTopic: '/device/appu-user-a1b2c3d4/s',
        subscribeTopic: '/device/appu-user-a1b2c3d4/r',
        keepalive: 60,
        clean: true,
      },
      wire: 'bbp2',
      protocolVersion: 2,
      transport: 'tcp',
      shard: { shard_id: 0, route_version: 1 },
    });
    await expect(start).rejects.toThrow(/credential contract/);
  });

  it('does not reacquire credentials for ws on an HTTPS page', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', new URL('https://app.example.test/devices'));
    try {
      const start = service.start();
      const request = http.expectOne(candidate => candidate.url === API.ACCOUNT.CONNECTION);
      request.flush({
        account: { accountId: 'user', tenantId: 'tenant' },
        mqtt: {
          host: 'mqtt.example.test',
          port: 80,
          protocol: 'ws',
          url: 'ws://mqtt.example.test/mqtt',
          path: '/mqtt',
          clientId: 'appu-user-a1b2c3d4',
          username: 'appu_user',
          password: 'jwt',
          expiresIn: 600,
          publishTopic: '/device/appu-user-a1b2c3d4/s',
          subscribeTopic: '/device/appu-user-a1b2c3d4/r',
          keepalive: 60,
          clean: true,
        },
        wire: 'bbp2',
        protocolVersion: 2,
        transport: 'websocket',
        shard: { shard_id: 0, route_version: 1 },
      });

      await expect(start).rejects.toThrow(/must use wss/);
      expect(service.state.value).toBe('stopped');
      await expect(service.start()).rejects.toThrow(/must use wss/);
      await vi.advanceTimersByTimeAsync(120_000);
      http.expectNone(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('stops the account client when the authenticated account is cleared', async () => {
    data.auth = null;
    await Promise.resolve();
    await Promise.resolve();
    expect(service.state.value).toBe('stopped');
  });
});

describe('DeviceV2Service migration refresh', () => {
  const watchedId = 'device_01234567-89ab-cdef-0123-456789abcdef';
  const unwatchedId = 'device_abcdef01-2345-6789-abcd-ef0123456789';
  let service: DeviceV2Service;
  let data: DataService;
  let reload: ReturnType<typeof vi.fn>;
  let start: ReturnType<typeof vi.spyOn>;
  let watch: ReturnType<typeof vi.spyOn>;

  function inventoryDevice(logicalDeviceId: string) {
    return {
      id: logicalDeviceId, deviceName: logicalDeviceId, cloudEnabled: true,
      config: { mode: 'bbp2', broker: 'blinker', customName: 'Sensor' },
      data: {
        state: 'online', enable: true, cloudReachable: true, cloudLastSeenAt: 10,
        manifestRevision: 4, manifestFingerprint: 'old', manifestUpdatedAt: 10,
      },
      storage: {}, subject: new Subject(),
    };
  }

  beforeEach(() => {
    reload = vi.fn().mockResolvedValue(true);
    start = vi.spyOn(DeviceV2AccountClient.prototype, 'start').mockResolvedValue();
    watch = vi.spyOn(DeviceV2AccountClient.prototype, 'watchPresence').mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: UserService, useValue: { getAllInfo: reload } },
      ],
    });
    data = TestBed.inject(DataService);
    data.auth = {
      accessToken: 'access', refreshToken: 'refresh', tokenType: 'bearer', uuid: 'user-a',
    };
    data.device = {
      list: [watchedId, unwatchedId],
      dict: {
        [watchedId]: inventoryDevice(watchedId),
        [unwatchedId]: inventoryDevice(unwatchedId),
      },
    };
    service = TestBed.inject(DeviceV2Service);
  });

  afterEach(async () => {
    await service.stop();
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  it('clears old cloud state including unwatched devices and awaits new presence subscriptions', async () => {
    service.store.applyPresence(watchedId, { cloudReachable: true, cloudLastSeenAt: 10 });
    let completeReload!: (loaded: boolean) => void;
    reload.mockImplementation(() => new Promise<boolean>(resolve => { completeReload = resolve; }));
    const refreshed = service.refreshAfterServerMigration();
    expect(service.refreshAfterServerMigration()).toBe(refreshed);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    for (const id of [watchedId, unwatchedId]) {
      expect(data.device.dict[id].data).toMatchObject({
        state: 'waiting', enable: false, cloudReachable: null, cloudLastSeenAt: null,
        manifestRevision: null, manifestFingerprint: null, manifestUpdatedAt: null,
      });
    }
    expect(service.snapshot(watchedId)).toMatchObject({
      manifest: null, manifestAccepted: false, stateFresh: false,
      cloudReachable: null, cloudLastSeenAt: null, values: {},
    });
    data.device.dict[watchedId].data.cloudReachable = false;
    data.device.dict[watchedId].data.cloudLastSeenAt = 20;
    data.deviceDataLoader.next(true);
    expect(watch).not.toHaveBeenCalled();
    completeReload(true);
    await refreshed;
    expect(start).toHaveBeenCalledOnce();
    expect(watch).toHaveBeenCalledExactlyOnceWith([watchedId, unwatchedId]);
    expect(service.snapshot(watchedId)).toMatchObject({
      cloudReachable: false, cloudLastSeenAt: 20, manifestAccepted: false, stateFresh: false,
    });
  });

  it('clears inventory presence even when closing the old connection fails', async () => {
    vi.spyOn(DeviceV2AccountClient.prototype, 'stop').mockRejectedValueOnce(new Error('Close failed'));
    await expect(service.refreshAfterServerMigration()).rejects.toThrow('Close failed');
    expect(data.device.dict[unwatchedId].data).toMatchObject({
      enable: false, cloudReachable: null, cloudLastSeenAt: null,
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('rejects partial inventory load even when the existing user loader returns true', async () => {
    reload.mockImplementation(async () => {
      data.deviceLoadError.next(new Error('Inventory unavailable'));
      return true;
    });
    await expect(service.refreshAfterServerMigration()).rejects.toThrow(/inventory/);
    expect(start).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    expect(data.device.dict[unwatchedId].data.enable).toBe(false);
  });

  it('propagates a new connection failure and permits a refresh-only retry', async () => {
    start.mockRejectedValueOnce(new Error('Target unavailable'));
    await expect(service.refreshAfterServerMigration()).rejects.toThrow('Target unavailable');
    expect(watch).not.toHaveBeenCalled();
    await service.refreshAfterServerMigration();
    expect(reload).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);
    expect(watch).toHaveBeenCalledOnce();
  });


  it('resumes presence for a newer same-account inventory when it supersedes migration refresh', async () => {
    const user = new UserService(TestBed.inject(HttpClient), data, {
      hideLoading: vi.fn().mockResolvedValue(undefined),
    } as unknown as NoticeService);
    reload.mockImplementation(() => user.getAllInfo());
    const http = TestBed.inject(HttpTestingController);
    const migrated = service.refreshAfterServerMigration();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    const oldUser = http.expectOne(API.AUTH.ME);
    const oldDevices = http.expectOne(API.DEVICE_V2.LIST);
    const oldShares = http.expectOne(API.DEVICE_V2.RECEIVED_SHARES);

    const newer = user.getAllInfo();
    http.expectOne(API.AUTH.ME).flush({ status: 200, data: { id: 'user-a' } });
    http.expectOne(API.DEVICE_V2.LIST).flush({
      status: 200, data: { devices: [{
        logicalDeviceId: watchedId, name: 'Current sensor', state: 'active',
        cloudEnabled: true, cloudReachable: false, cloudLastSeenAt: 20,
      }] },
    });
    http.expectOne(API.DEVICE_V2.RECEIVED_SHARES).flush({
      status: 200, data: { devices: [] },
    });
    await expect(newer).resolves.toBe(true);
    expect(watch).not.toHaveBeenCalled();

    oldUser.flush({ status: 200, data: { id: 'user-a' } });
    oldDevices.flush({ status: 200, data: { devices: [] } });
    oldShares.flush({ status: 200, data: { devices: [] } });
    await expect(migrated).rejects.toThrow(/inventory/);
    expect(watch).toHaveBeenCalledExactlyOnceWith([watchedId]);
    expect(service.snapshot(watchedId)).toMatchObject({
      cloudReachable: false, cloudLastSeenAt: 20,
    });
  });

  it('stops an old refresh before reconnecting when the account changes during inventory load', async () => {
    let completeReload!: (loaded: boolean) => void;
    reload.mockImplementation(() => new Promise<boolean>(resolve => { completeReload = resolve; }));
    const refreshed = service.refreshAfterServerMigration();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    data.deviceDataLoader.next(true);
    data.auth = {
      accessToken: 'other', refreshToken: 'other-refresh', tokenType: 'bearer', uuid: 'user-b',
    };
    data.device = { list: [], dict: {} };
    completeReload(true);
    await expect(refreshed).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    expect(start).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    expect(data.device.list).toEqual([]);
  });
});
