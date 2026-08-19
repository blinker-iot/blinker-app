import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API } from 'src/app/configs/api.config';
import { BlinkerDevice } from '../model/device.model';
import { GatewayDevice } from '../model/response.model';
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
