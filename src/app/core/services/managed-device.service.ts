import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, Observable, tap } from 'rxjs';

import { DataService } from './data.service';
import { gatewayContext } from '../injectable/gateway.context';
import { API } from '../../configs/api.config';
import { normalizeGatewayError } from '../model/gateway-error.model';
import {
  applyManagedDeviceConfig,
  applyManagedDeviceSnapshot,
  applyManagedDeviceStatus,
  ManagedBlinkerDevice,
  ManagedDeviceConfigResponse,
  ManagedDeviceDto,
  ManagedDeviceListResponse,
  ManagedDeviceResponse,
  ManagedDeviceSnapshotResponse,
  ManagedDeviceStatusResponse,
  mapManagedDevice,
} from './managed-device.mapper';

export interface ManagedDeviceCreateResponse extends ManagedDeviceResponse {
  authKey?: string;
  replayed: boolean;
}

export interface ManagedDeviceCreateInput {
  name: string;
  deviceType: string;
}

@Injectable({ providedIn: 'root' })
export class ManagedDeviceService {
  constructor(
    private readonly http: HttpClient,
    private readonly dataService: DataService
  ) {}

  listDevices(): Observable<ManagedDeviceListResponse> {
    return this.http.get<ManagedDeviceListResponse>(
      API.GATEWAY.DEVICE.ALL,
      {
        context: gatewayContext('required'),
      }
    );
  }

  getDevice(deviceId: string): Observable<ManagedDeviceResponse> {
    return this.http.get<ManagedDeviceResponse>(API.GATEWAY.DEVICE.DETAIL(deviceId), {
      context: gatewayContext('required'),
    });
  }

  getStatus(deviceId: string): Observable<ManagedDeviceStatusResponse> {
    return this.http.get<ManagedDeviceStatusResponse>(
      API.GATEWAY.DEVICE.STATUS(deviceId),
      { context: gatewayContext('required') }
    );
  }

  getData(deviceId: string): Observable<ManagedDeviceSnapshotResponse> {
    return this.http.get<ManagedDeviceSnapshotResponse>(
      API.GATEWAY.DEVICE.DATA(deviceId),
      { context: gatewayContext('required') }
    );
  }

  getConfig(deviceId: string): Observable<ManagedDeviceConfigResponse> {
    return this.http.get<ManagedDeviceConfigResponse>(
      API.GATEWAY.DEVICE.CONFIG(deviceId),
      { context: gatewayContext('required') }
    );
  }

  createDevice(
    input: ManagedDeviceCreateInput,
    idempotencyKey: string
  ): Observable<ManagedDeviceCreateResponse> {
    const name = input.name.trim();
    const deviceType = input.deviceType.trim();
    const key = idempotencyKey.trim();
    if (!name) throw new Error('Device name is required.');
    if (name.length > 128) {
      throw new Error('Device name must not exceed 128 characters.');
    }
    if (!deviceType) throw new Error('Device type is required.');
    if (deviceType.length > 64) {
      throw new Error('Device type must not exceed 64 characters.');
    }
    if (!key || key.length > 128) {
      throw new Error('Idempotency key must contain 1 to 128 characters.');
    }

    return this.http
      .post<ManagedDeviceCreateResponse>(
        API.GATEWAY.DEVICE.ALL,
        { name, deviceType },
        {
          context: gatewayContext('required'),
          headers: new HttpHeaders({ 'Idempotency-Key': key }),
        }
      )
      .pipe(
        tap((response) => {
          // authKey remains only in the caller-owned response and is never copied
          // into shared App state.
          this.upsertLocal(response.device);
          this.publishDeviceData();
        })
      );
  }

  updateConfig(
    deviceId: string,
    patch: Record<string, unknown>
  ): Observable<ManagedDeviceConfigResponse> {
    return this.http
      .put<ManagedDeviceConfigResponse>(
        API.GATEWAY.DEVICE.CONFIG(deviceId),
        { config: patch },
        { context: gatewayContext('required') }
      )
      .pipe(
        tap((response) => {
          const device = this.findLocal(deviceId);
          if (!device) return;
          applyManagedDeviceConfig(device, response);
          device.subject.next({
            key: 'managed-config',
            value: response.config,
          });
        })
      );
  }

  deleteDevice(deviceId: string): Observable<ManagedDeviceResponse> {
    return this.http
      .delete<ManagedDeviceResponse>(API.GATEWAY.DEVICE.DETAIL(deviceId), {
        context: gatewayContext('required'),
      })
      .pipe(
        tap(() => {
          this.removeLocal(deviceId);
          this.publishDeviceData();
        })
      );
  }

  async loadAll(): Promise<ManagedBlinkerDevice[]> {
    const response = await firstValueFrom(this.listDevices());
    const devices = this.reconcileLocal(response.devices);

    // Each supplemental endpoint is isolated. A missing status, snapshot, or
    // config must not discard an otherwise valid list item.
    await Promise.all(devices.map((device) => this.enrichDevice(device)));
    this.publishDeviceData(true);
    return devices;
  }

  async refreshDevice(deviceId: string): Promise<ManagedBlinkerDevice> {
    let device = this.findLocal(deviceId);

    if (!device) {
      const response = await firstValueFrom(this.getDevice(deviceId));
      device = this.upsertLocal(response.device);
    }

    await this.enrichDevice(device);
    this.publishDeviceData();
    return device;
  }

  removeLocal(deviceId: string): void {
    this.ensureCollections();
    delete this.dataService.device.dict[deviceId];
    this.dataService.device.list = this.dataService.device.list.filter(
      (id) => id !== deviceId
    );

    for (const roomName of Object.keys(this.dataService.room.dict)) {
      const roomDevices = this.dataService.room.dict[roomName];
      if (Array.isArray(roomDevices)) {
        this.dataService.room.dict[roomName] = roomDevices.filter(
          (id) => id !== deviceId
        );
      }
    }
  }

  clearLocal(): void {
    this.ensureCollections();
    this.dataService.device.dict = {};
    this.dataService.device.list = [];
    for (const roomName of Object.keys(this.dataService.room.dict)) {
      if (Array.isArray(this.dataService.room.dict[roomName])) {
        this.dataService.room.dict[roomName] = [];
      }
    }
    this.publishDeviceData();
  }

  private async enrichDevice(device: ManagedBlinkerDevice): Promise<void> {
    const deviceId = device.deviceName;
    await Promise.all([
      this.applyIfAvailable(
        this.getStatus(deviceId),
        (response) => applyManagedDeviceStatus(device, response),
        () => {
          device.managed.mqttOnline = undefined;
          device.data.enable = false;
          device.data.state = 'unknown';
        },
      ),
      this.applyIfAvailable(this.getData(deviceId), (response) =>
        applyManagedDeviceSnapshot(device, response)
      ),
      this.applyIfAvailable(this.getConfig(deviceId), (response) =>
        applyManagedDeviceConfig(device, response)
      ),
    ]);
    device.subject.next({ key: 'managed-refresh', value: device.managed });
  }

  private async applyIfAvailable<T>(
    request: Observable<T>,
    apply: (response: T) => unknown,
    unavailable?: () => void,
  ): Promise<void> {
    try {
      apply(await firstValueFrom(request));
    } catch (error) {
      const gatewayError = normalizeGatewayError(error);
      if (
        gatewayError.httpStatus === 401 ||
        gatewayError.httpStatus === 403 ||
        gatewayError.code.startsWith('AUTH_')
      ) {
        throw gatewayError;
      }
      unavailable?.();
      // The list/detail response remains usable when supplemental data is
      // temporarily unavailable. The interceptor owns user-facing errors.
    }
  }

  private reconcileLocal(dtos: ManagedDeviceDto[]): ManagedBlinkerDevice[] {
    this.ensureCollections();
    const previous = this.dataService.device.dict;
    const next: Record<string, ManagedBlinkerDevice> = {};
    const devices = dtos.map((dto) => {
      const existing = previous[dto.deviceId];
      const managedExisting = existing?.isManaged
        ? (existing as ManagedBlinkerDevice)
        : undefined;
      const device = mapManagedDevice(dto, managedExisting);
      next[dto.deviceId] = device;
      return device;
    });

    for (const previousId of Object.keys(previous)) {
      if (!(previousId in next)) this.removeRoomReferences(previousId);
    }
    this.dataService.device.dict = next;
    this.dataService.device.list = dtos.map((dto) => dto.deviceId);
    return devices;
  }

  private upsertLocal(dto: ManagedDeviceDto): ManagedBlinkerDevice {
    this.ensureCollections();
    const existing = this.findLocal(dto.deviceId);
    const device = mapManagedDevice(dto, existing);
    this.dataService.device.dict[dto.deviceId] = device;
    if (!this.dataService.device.list.includes(dto.deviceId)) {
      this.dataService.device.list.push(dto.deviceId);
    }
    return device;
  }

  private findLocal(deviceId: string): ManagedBlinkerDevice | undefined {
    const device = this.dataService.device?.dict?.[deviceId];
    return device?.isManaged ? (device as ManagedBlinkerDevice) : undefined;
  }

  private removeRoomReferences(deviceId: string): void {
    for (const roomName of Object.keys(this.dataService.room.dict)) {
      const roomDevices = this.dataService.room.dict[roomName];
      if (Array.isArray(roomDevices)) {
        this.dataService.room.dict[roomName] = roomDevices.filter(
          (id) => id !== deviceId
        );
      }
    }
  }

  private ensureCollections(): void {
    this.dataService.device ||= { dict: {}, list: [] };
    this.dataService.room ||= { dict: {}, list: [] };
    this.dataService.scene ||= { dict: {}, list: [] };
    this.dataService.auto ||= { dict: {}, list: [] };
    this.dataService.block ||= { dict: {}, list: [] };
    this.dataService.brokers ||= { dict: {}, list: [] };
    this.dataService.share ||= {
      share: {},
      share0: {},
      shared: [],
      shared0: [],
    };
  }

  private publishDeviceData(initialLoad = false): void {
    this.dataService.deviceDataLoader.next(true);
    if (initialLoad) {
      this.dataService.userDataLoader.next(true);
      if (this.dataService.firstBoot) {
        this.dataService.initCompleted.next(true);
        this.dataService.firstBoot = false;
      }
    }
  }

}
