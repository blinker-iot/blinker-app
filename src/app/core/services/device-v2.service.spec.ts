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

describe('DeviceV2Service connection contract', () => {
  let service: DeviceV2Service;
  let data: DataService;
  let http: HttpTestingController;

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
