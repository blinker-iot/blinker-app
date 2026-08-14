import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DataService } from './data.service';
import { GATEWAY_AUTH_MODE } from '../injectable/gateway.context';
import { API } from '../../configs/api.config';
import { ManagedDeviceDto } from './managed-device.mapper';
import { ManagedDeviceService } from './managed-device.service';

function deviceDto(deviceId = 'device_full/id'): ManagedDeviceDto {
  return {
    deviceId,
    tenantId: 'tenant-1',
    name: '客厅传感器',
    deviceType: 'diy',
    status: 'active',
    createdAt: 1786600000000,
    updatedAt: 1786600001000,
  };
}

describe('ManagedDeviceService', () => {
  let service: ManagedDeviceService;
  let dataService: DataService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ManagedDeviceService,
        DataService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ManagedDeviceService);
    dataService = TestBed.inject(DataService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('uses full encoded ids and required bearer context for device reads', () => {
    let result: unknown;
    service.getStatus('device_full/id').subscribe((value) => (result = value));

    const request = httpTesting.expectOne(
      API.GATEWAY.DEVICE.STATUS('device_full/id')
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.context.get(GATEWAY_AUTH_MODE)).toBe('required');
    request.flush({
      device: { deviceId: 'device_full/id', status: 'active' },
      status: { status: 1, mqttOnline: true },
    });
    expect(result).toBeTruthy();
  });

  it('creates with a trimmed idempotency key without retaining authKey', () => {
    let responseAuthKey: string | undefined;
    service
      .createDevice(
        { name: '  客厅传感器  ', deviceType: '  diy  ' },
        '  create-key-1  '
      )
      .subscribe((response) => (responseAuthKey = response.authKey));

    const request = httpTesting.expectOne(API.GATEWAY.DEVICE.ALL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: '客厅传感器',
      deviceType: 'diy',
    });
    expect(request.request.headers.get('Idempotency-Key')).toBe('create-key-1');
    request.flush({
      device: deviceDto(),
      authKey: 'one-time-secret',
      replayed: false,
    });

    expect(responseAuthKey).toBe('one-time-secret');
    const local = dataService.device.dict['device_full/id'];
    expect(local.deviceName).toBe('device_full/id');
    expect(local.config.authKey).toBeUndefined();
    expect(JSON.stringify(local)).not.toContain('one-time-secret');
  });

  it('sends an exact config patch envelope and updates local raw config', () => {
    service.createDevice({ name: 'A', deviceType: 'diy' }, 'key').subscribe();
    httpTesting.expectOne(API.GATEWAY.DEVICE.ALL).flush({
      device: deviceDto('device-1'),
      replayed: false,
    });

    service.updateConfig('device-1', { displayName: '新名称' }).subscribe();
    const request = httpTesting.expectOne(
      API.GATEWAY.DEVICE.CONFIG('device-1')
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      config: { displayName: '新名称' },
    });
    request.flush({ config: { displayName: '新名称', interval: 60 } });

    expect(dataService.device.dict['device-1'].config.mode).toBe(
      'managed-http'
    );
    expect(dataService.device.dict['device-1'].config.rawConfig).toEqual({
      displayName: '新名称',
      interval: 60,
    });
  });

  it('removes a deleted device from the list and every room reference', () => {
    service.createDevice({ name: 'A', deviceType: 'diy' }, 'key').subscribe();
    httpTesting.expectOne(API.GATEWAY.DEVICE.ALL).flush({
      device: deviceDto('device-1'),
      replayed: false,
    });
    dataService.room = {
      dict: { living: ['device-1', 'device-2'], orphanRoom: ['device-1'] },
      list: ['living', 'orphanRoom'],
    };

    service.deleteDevice('device-1').subscribe();
    const request = httpTesting.expectOne(
      API.GATEWAY.DEVICE.DETAIL('device-1')
    );
    expect(request.request.method).toBe('DELETE');
    request.flush({
      device: deviceDto('device-1'),
    });

    expect(dataService.device.dict['device-1']).toBeUndefined();
    expect(dataService.device.list).toEqual([]);
    expect(dataService.room.dict.living).toEqual(['device-2']);
    expect(dataService.room.dict.orphanRoom).toEqual([]);
  });

  it('keeps list devices usable when supplemental requests fail', async () => {
    const loadPromise = service.loadAll();
    httpTesting.expectOne(API.GATEWAY.DEVICE.ALL).flush({
      devices: [deviceDto('device-1')],
    });
    await Promise.resolve();

    httpTesting.expectOne(API.GATEWAY.DEVICE.STATUS('device-1')).flush(
      { code: 'BROKER_UNAVAILABLE', message: 'unavailable' },
      {
        status: 502,
        statusText: 'Bad Gateway',
      }
    );
    httpTesting.expectOne(API.GATEWAY.DEVICE.DATA('device-1')).flush({
      device: { deviceId: 'device-1' },
      data: {
        protocol: 'json',
        receivedAt: 1786600002000,
        sourceClientId: 'device-1',
        data: { temperature: 23 },
      },
    });
    httpTesting
      .expectOne(API.GATEWAY.DEVICE.CONFIG('device-1'))
      .flush({ config: { interval: 60 } });

    const devices = await loadPromise;
    expect(devices).toHaveLength(1);
    expect(devices[0].data.state).toBe('unknown');
    expect(devices[0].data.temperature).toBe(23);
    expect(devices[0].config.rawConfig).toEqual({ interval: 60 });
    expect(dataService.initCompleted.value).toBe(true);
  });

  it('propagates supplemental authentication failures', async () => {
    const loadPromise = service.loadAll();
    httpTesting.expectOne(API.GATEWAY.DEVICE.ALL).flush({
      devices: [deviceDto('device-1')],
    });
    await Promise.resolve();

    httpTesting.expectOne(API.GATEWAY.DEVICE.STATUS('device-1')).flush(
      { errorCode: 'AUTH_SESSION_EXPIRED', errorMessage: 'expired' },
      { status: 401, statusText: 'Unauthorized' }
    );
    httpTesting
      .expectOne(API.GATEWAY.DEVICE.DATA('device-1'))
      .flush({ device: { deviceId: 'device-1' }, data: null });
    httpTesting
      .expectOne(API.GATEWAY.DEVICE.CONFIG('device-1'))
      .flush({ config: {} });

    await expect(loadPromise).rejects.toBeDefined();
    expect(dataService.initCompleted.value).toBe(false);
  });

  it('reconciles list refreshes without replacing device subjects', async () => {
    const firstLoad = service.loadAll();
    httpTesting.expectOne(API.GATEWAY.DEVICE.ALL).flush({
      devices: [deviceDto('device-1')],
    });
    await Promise.resolve();
    flushSupplementalRequests(httpTesting, 'device-1');
    await firstLoad;
    const previous = dataService.device.dict['device-1'];

    const secondLoad = service.loadAll();
    httpTesting.expectOne(API.GATEWAY.DEVICE.ALL).flush({
      devices: [deviceDto('device-1')],
    });
    await Promise.resolve();
    flushSupplementalRequests(httpTesting, 'device-1');
    await secondLoad;

    expect(dataService.device.dict['device-1']).toBe(previous);
    expect(dataService.device.dict['device-1'].subject).toBe(previous.subject);
  });
});

function flushSupplementalRequests(
  httpTesting: HttpTestingController,
  deviceId: string
): void {
  httpTesting
    .expectOne(API.GATEWAY.DEVICE.STATUS(deviceId))
    .flush({
      device: { deviceId, status: 'active' },
      status: { status: 0, mqttOnline: false },
    });
  httpTesting
    .expectOne(API.GATEWAY.DEVICE.DATA(deviceId))
    .flush({ device: { deviceId }, data: null });
  httpTesting
    .expectOne(API.GATEWAY.DEVICE.CONFIG(deviceId))
    .flush({ config: {} });
}
