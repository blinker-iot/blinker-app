import '@angular/compiler';

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API } from '../../configs/api.config';
import { DataService } from './data.service';
import { DeviceV2Service } from './device-v2.service';
import { WiFiProvCloudLease, wiFiProvCloudBoundary } from '../device-v2/provisioning/wifiprov-cloud-boundary';

describe('DeviceV2Service connection contract', () => {
  let service: DeviceV2Service;
  let data: DataService;
  let http: HttpTestingController;
  let localLease: WiFiProvCloudLease | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    await localLease?.retire(async () => undefined);
    localLease = undefined;
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

  it('cancels a pending connection HTTP subscription when Local starts and never resumes it on release', async () => {
    const start = service.start().catch(error => error);
    const request = http.expectOne(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    localLease = wiFiProvCloudBoundary.enter();
    expect(request.cancelled).toBe(true);
    expect(() => request.flush({}, { status: 401, statusText: 'Fixture late unauthorized' })).toThrow(/cancelled/i);
    expect(await start).toMatchObject({ code: 'DEVICE_V2_ACCOUNT_SUSPENDED' });
    await expect(service.start()).rejects.toMatchObject({ code: 'DEVICE_V2_ACCOUNT_SUSPENDED' });
    http.expectNone(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    await localLease.retire(async () => undefined);
    await Promise.resolve();
    http.expectNone(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    const explicit = service.start().catch(error => error);
    const next = http.expectOne(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    next.flush({}, { status: 503, statusText: 'Fixture offline' }); await explicit;
  });

  it('blocks inventory-triggered Cloud login during Local without clearing the cached inventory', async () => {
    localLease = wiFiProvCloudBoundary.enter();
    const id = 'device_01234567-89ab-cdef-0123-456789abcdef';
    const cached = { config: { mode: 'bbp2' }, cloudEnabled: true, data: { cloudReachable: false, cloudLastSeenAt: 123 } };
    data.device = { list: [id], dict: { [id]: cached } } as any;
    data.deviceDataLoader.next(true); await Promise.resolve();
    http.expectNone(candidate => candidate.url === API.ACCOUNT.CONNECTION);
    expect(data.device.dict[id]).toBe(cached); expect(service.store.snapshot(id).cloudLastSeenAt).toBe(123);
    await localLease.retire(async () => undefined); await Promise.resolve();
    http.expectNone(candidate => candidate.url === API.ACCOUNT.CONNECTION);
  });
});
