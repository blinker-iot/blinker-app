import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API } from 'src/app/configs/api.config';
import { BlinkerDevice } from '../model/device.model';
import { DeviceKeyContext, GatewayDevice } from '../model/response.model';
import { DeviceService } from './device.service';

describe('DeviceService Gateway HTTP API', () => {
  let service: DeviceService;
  let httpTesting: HttpTestingController;
  let dataServiceStub: any;

  const gatewayDevice: GatewayDevice = {
    deviceId: 'device/a b',
    tenantId: 'tenant-1',
    name: '客厅温湿度计',
    deviceType: 'diy',
    status: 'active',
    createdAt: 1,
    updatedAt: 2,
  };
  const deviceKeyContext: DeviceKeyContext = {
    logicalDeviceId: 'device/a b',
    credentialVersion: 1,
    locator: 'AQIDBAUGBwgJCgsMDQ4PEA',
  };
  const deviceKeyDevice = {
    ...deviceKeyContext,
    tenantId: 'tenant-1',
    name: gatewayDevice.name,
    deviceType: 'diy',
    state: 'active',
    createdAt: 1,
    updatedAt: 2,
  };
  const syntheticDeviceKey =
    'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    dataServiceStub = {
      auth: {},
      brokers: { dict: {}, list: [] },
      device: { dict: {}, list: [] },
    };

    service = new DeviceService(
      TestBed.inject(HttpClient),
      { is: vi.fn(() => false) } as any,
      dataServiceStub,
      {} as any,
      { enable: false, update: vi.fn() } as any,
      { vibrate: vi.fn() } as any,
      { showToast: vi.fn(), hideLoading: vi.fn() } as any,
      { show: vi.fn() } as any,
    );
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('lists devices without legacy uuid or token parameters', async () => {
    const response = { devices: [gatewayDevice] };
    const resultPromise = service.listDevices();

    const request = httpTesting.expectOne(API.DEVICE.LIST);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.body).toBeNull();
    request.flush(response);

    await expect(resultPromise).resolves.toEqual(response);
  });

  it('creates a device with JSON and the supplied idempotency key', async () => {
    const response = {
      device: gatewayDevice,
      authKey: 'one-time-auth-key',
      replayed: false,
    };
    const resultPromise = service.createDevice(
      gatewayDevice.name,
      'create-operation-1',
    );

    const request = httpTesting.expectOne(API.DEVICE.CREATE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: gatewayDevice.name,
      deviceType: 'diy',
    });
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      'create-operation-1',
    );
    expect(request.request.params.keys()).toEqual([]);
    request.flush(response, { status: 201, statusText: 'Created' });

    await expect(resultPromise).resolves.toEqual(response);
  });

  it('creates a DeviceKey V2 logical device without returning a credential', async () => {
    const response = {
      status: 201,
      data: { device: deviceKeyDevice, replayed: false },
    };
    const resultPromise = service.createDeviceKeyV2(
      '  ' + gatewayDevice.name + '  ',
      '  device-key-create-1  ',
    );

    const request = httpTesting.expectOne(API.DEVICE_V2.CREATE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: gatewayDevice.name,
      deviceType: 'diy',
    });
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      'device-key-create-1',
    );
    expect(request.request.params.keys()).toEqual([]);
    request.flush(response, { status: 201, statusText: 'Created' });

    await expect(resultPromise).resolves.toEqual(response);
    expect(JSON.stringify(response)).not.toContain('authKey');
    expect(JSON.stringify(response)).not.toContain('deviceKey');
    httpTesting.expectNone(API.DEVICE.CREATE);
  });

  it('retries an unknown V2 create result with the same key and body', async () => {
    const create = () =>
      service.createDeviceKeyV2(gatewayDevice.name, 'device-key-create-retry');

    const firstResult = create();
    const firstRequest = httpTesting.expectOne(API.DEVICE_V2.CREATE);
    const firstBody = firstRequest.request.body;
    const firstKey = firstRequest.request.headers.get('Idempotency-Key');
    firstRequest.error(new ProgressEvent('error'));
    await expect(firstResult).rejects.toMatchObject({ status: 0 });

    const replay = {
      status: 200,
      data: { device: deviceKeyDevice, replayed: true },
    };
    const replayResult = create();
    const replayRequest = httpTesting.expectOne(API.DEVICE_V2.CREATE);
    expect(replayRequest.request.body).toEqual(firstBody);
    expect(replayRequest.request.headers.get('Idempotency-Key')).toBe(firstKey);
    replayRequest.flush(replay);

    await expect(replayResult).resolves.toEqual(replay);
    httpTesting.expectNone(API.DEVICE.CREATE);
  });

  it('propagates a V2 idempotency conflict without falling back to V1', async () => {
    const resultPromise = service.createDeviceKeyV2(
      'Changed name',
      'device-key-create-1',
    );
    httpTesting.expectOne(API.DEVICE_V2.CREATE).flush(
      {
        status: 409,
        errorCode: 'IDEMPOTENCY_CONFLICT',
        errorMessage: 'The idempotency key is already bound.',
      },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(resultPromise).rejects.toMatchObject({ status: 409 });
    httpTesting.expectNone(API.DEVICE.CREATE);
  });

  it('rejects a V2 create response containing any credential field', async () => {
    const resultPromise = service.createDeviceKeyV2(
      gatewayDevice.name,
      'device-key-create-secret',
    );
    httpTesting.expectOne(API.DEVICE_V2.CREATE).flush(
      {
        status: 201,
        data: {
          device: deviceKeyDevice,
          replayed: false,
          deviceKey: syntheticDeviceKey,
        },
      },
      { status: 201, statusText: 'Created' },
    );

    await expect(resultPromise).rejects.toMatchObject({
      code: 'DEVICE_KEY_V2_INVALID_RESPONSE',
    });
  });

  it('reveals a DeviceKey with an encoded id and no idempotency header', async () => {
    const response = {
      status: 200,
      data: { ...deviceKeyContext, deviceKey: syntheticDeviceKey },
    };
    const resultPromise = service.revealDeviceKeyV2(deviceKeyContext);

    const request = httpTesting.expectOne(
      API.DEVICE_V2.REVEAL(deviceKeyContext.logicalDeviceId),
    );
    expect(request.request.url).toContain('device%2Fa%20b');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.has('Idempotency-Key')).toBe(false);
    request.flush(response, {
      headers: { 'Cache-Control': 'no-store' },
    });

    await expect(resultPromise).resolves.toEqual(response);
    httpTesting.expectNone(API.DEVICE.CREATE);
  });

  it('rejects a reveal whose context does not match the create response', async () => {
    const resultPromise = service.revealDeviceKeyV2(deviceKeyContext);
    httpTesting.expectOne(
      API.DEVICE_V2.REVEAL(deviceKeyContext.logicalDeviceId),
    ).flush(
      {
        status: 200,
        data: {
          ...deviceKeyContext,
          credentialVersion: 2,
          deviceKey: syntheticDeviceKey,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );

    await expect(resultPromise).rejects.toMatchObject({
      code: 'DEVICE_KEY_V2_INVALID_RESPONSE',
    });
  });

  it('rejects an invalid, zero, or cacheable revealed DeviceKey', async () => {
    const invalidKeys = [
      syntheticDeviceKey.slice(0, -1),
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      syntheticDeviceKey,
    ];

    for (const [index, deviceKey] of invalidKeys.entries()) {
      const resultPromise = service.revealDeviceKeyV2(deviceKeyContext);
      httpTesting.expectOne(
        API.DEVICE_V2.REVEAL(deviceKeyContext.logicalDeviceId),
      ).flush(
        { status: 200, data: { ...deviceKeyContext, deviceKey } },
        index === invalidKeys.length - 1
          ? {}
          : { headers: { 'Cache-Control': 'no-store' } },
      );
      await expect(resultPromise).rejects.toMatchObject({
        code: 'DEVICE_KEY_V2_INVALID_RESPONSE',
      });
    }
  });

  it('rotates with a stable key and accepts only credential version N plus one', async () => {
    const rotatedContext = {
      ...deviceKeyContext,
      credentialVersion: 2,
      locator: 'ERITFBUWFxgZGhscHR4fIA',
    };
    const response = {
      status: 200,
      data: { ...rotatedContext, deviceKey: syntheticDeviceKey },
    };
    const rotate = () =>
      service.rotateDeviceKeyV2(deviceKeyContext, 'device-key-rotate-1');

    const firstResult = rotate();
    const firstRequest = httpTesting.expectOne(
      API.DEVICE_V2.ROTATE(deviceKeyContext.logicalDeviceId),
    );
    expect(firstRequest.request.method).toBe('POST');
    expect(firstRequest.request.body).toEqual({});
    expect(firstRequest.request.headers.get('Idempotency-Key')).toBe(
      'device-key-rotate-1',
    );
    firstRequest.flush(
      {
        status: 503,
        errorCode: 'DEVICE_KEY_DISCONNECT_PENDING',
        errorMessage: 'Credential disconnect is pending.',
      },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await expect(firstResult).rejects.toMatchObject({ status: 503 });

    const retryResult = rotate();
    const retryRequest = httpTesting.expectOne(
      API.DEVICE_V2.ROTATE(deviceKeyContext.logicalDeviceId),
    );
    expect(retryRequest.request.headers.get('Idempotency-Key')).toBe(
      'device-key-rotate-1',
    );
    retryRequest.flush(response, {
      headers: { 'Cache-Control': 'no-store' },
    });

    await expect(retryResult).resolves.toEqual(response);

    const invalidVersionResult = rotate();
    httpTesting.expectOne(
      API.DEVICE_V2.ROTATE(deviceKeyContext.logicalDeviceId),
    ).flush(
      {
        status: 200,
        data: { ...deviceKeyContext, deviceKey: syntheticDeviceKey },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    await expect(invalidVersionResult).rejects.toMatchObject({
      code: 'DEVICE_KEY_V2_INVALID_RESPONSE',
    });
    httpTesting.expectNone(API.DEVICE.CREATE);
  });

  it('uses the detail, status, data, and connection resource paths', async () => {
    const deviceId = gatewayDevice.deviceId;

    const detailsPromise = service.getDeviceDetails(deviceId);
    const detailsRequest = httpTesting.expectOne(API.DEVICE.DETAIL(deviceId));
    expect(detailsRequest.request.method).toBe('GET');
    expect(detailsRequest.request.params.keys()).toEqual([]);
    detailsRequest.flush({ device: gatewayDevice });
    await expect(detailsPromise).resolves.toEqual({ device: gatewayDevice });

    const statusResponse = {
      device: { deviceId, status: 'active' },
      status: {
        status: 1,
        mode: 'mqtt',
        lastActiveAt: null,
        updatedAt: null,
        httpAuthed: false,
        httpAuthFresh: false,
        httpAuthAt: null,
        mqttOnline: true,
        mqttConnectedAt: null,
        mqttLastSeenAt: null,
      },
      brokerStatus: 'active',
    };
    const statusPromise = service.getDeviceStatus(deviceId);
    const statusRequest = httpTesting.expectOne(API.DEVICE.STATUS(deviceId));
    expect(statusRequest.request.method).toBe('GET');
    expect(statusRequest.request.params.keys()).toEqual([]);
    statusRequest.flush(statusResponse);
    await expect(statusPromise).resolves.toEqual(statusResponse);

    const dataResponse = { device: { deviceId }, data: null };
    const dataPromise = service.getLatestDeviceData(deviceId);
    const dataRequest = httpTesting.expectOne(API.DEVICE.DATA(deviceId));
    expect(dataRequest.request.method).toBe('GET');
    expect(dataRequest.request.params.keys()).toEqual([]);
    dataRequest.flush(dataResponse);
    await expect(dataPromise).resolves.toEqual(dataResponse);

    const connectionResponse = {
      device: { deviceId, tenantId: gatewayDevice.tenantId, status: 'active' },
      mqtt: {
        host: '127.0.0.1',
        port: 8883,
        protocol: 'mqtt' as const,
        clientId: 'app-device-1',
        username: 'tenant-1:device-1',
        password: 'short-lived-jwt',
        expiresIn: 600,
        keepalive: 60,
        clean: true,
      },
    };
    const connectionPromise = service.getDeviceConnection(deviceId);
    const connectionRequest = httpTesting.expectOne(
      API.DEVICE.CONNECTION(deviceId),
    );
    expect(connectionRequest.request.method).toBe('GET');
    expect(connectionRequest.request.params.keys()).toEqual([]);
    connectionRequest.flush(connectionResponse);
    await expect(connectionPromise).resolves.toEqual(connectionResponse);
  });

  it('fetches account MQTT parameters without opening a connection', async () => {
    const response = {
      account: { accountId: 'user-1', tenantId: 'tenant-1' },
      mqtt: {
        host: '127.0.0.1',
        port: 8883,
        protocol: 'mqtt' as const,
        clientId: 'appu-user-1-1234abcd',
        username: 'appu_user-1',
        password: 'short-lived-account-jwt',
        expiresIn: 600,
        keepalive: 60,
        clean: true,
      },
      shard: { shard_id: 0, route_version: 1 },
    };
    const resultPromise = service.getAccountConnection();

    const request = httpTesting.expectOne(API.ACCOUNT.CONNECTION);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush(response);

    await expect(resultPromise).resolves.toEqual(response);
  });

  it('loads and shallow-updates config through the device resource', async () => {
    const device = { deviceName: gatewayDevice.deviceId } as BlinkerDevice;
    const loaded = { config: { layouter: { widgets: [] }, image: 'sensor.png' } };
    const loadPromise = service.loadDeviceConfig(device);

    const loadRequest = httpTesting.expectOne(
      API.DEVICE.CONFIG(gatewayDevice.deviceId),
    );
    expect(loadRequest.request.method).toBe('GET');
    expect(loadRequest.request.params.keys()).toEqual([]);
    loadRequest.flush(loaded);
    await expect(loadPromise).resolves.toEqual(loaded.config);

    const patch = { layouter: { widgets: [{ type: 'number' }] } };
    const savePromise = service.saveDeviceConfig(device, patch);

    const saveRequest = httpTesting.expectOne(
      API.DEVICE.CONFIG(gatewayDevice.deviceId),
    );
    expect(saveRequest.request.method).toBe('PUT');
    expect(saveRequest.request.body).toEqual({ config: patch });
    expect(saveRequest.request.headers.get('Content-Type')).toBe(
      'application/json',
    );
    expect(saveRequest.request.params.keys()).toEqual([]);
    saveRequest.flush({ config: { ...loaded.config, ...patch } });
    await expect(savePromise).resolves.toBe(true);
  });

  it('returns false when saving config fails so existing callers stay safe', async () => {
    const savePromise = service.saveDeviceConfig(gatewayDevice.deviceId, {
      customName: 'Kitchen',
    });

    httpTesting
      .expectOne(API.DEVICE.CONFIG(gatewayDevice.deviceId))
      .flush(
        { code: 'DEVICE_CONFIG_FAILED', message: 'Config update failed' },
        { status: 500, statusText: 'Server Error' },
      );

    await expect(savePromise).resolves.toBe(false);
  });

  it('deletes through DELETE and preserves the endpoint response', async () => {
    const deleted = {
      device: { ...gatewayDevice, status: 'deleted' },
    };
    const resultPromise = service.deleteDevice(gatewayDevice.deviceId);

    const request = httpTesting.expectOne(
      API.DEVICE.DETAIL(gatewayDevice.deviceId),
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.body).toBeNull();
    request.flush(deleted);

    await expect(resultPromise).resolves.toEqual(deleted);
  });

  it('propagates HTTP failures instead of interpreting legacy message codes', async () => {
    const resultPromise = service.getDeviceDetails(gatewayDevice.deviceId);

    httpTesting
      .expectOne(API.DEVICE.DETAIL(gatewayDevice.deviceId))
      .flush(
        { code: 'DEVICE_NOT_FOUND', message: 'Device not found' },
        { status: 404, statusText: 'Not Found' },
      );

    await expect(resultPromise).rejects.toMatchObject({ status: 404 });
  });

});
