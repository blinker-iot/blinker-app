import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import {
  DeviceKeyContext,
  DeviceCloudEnableResponse,
  DeviceKeyCreateResponse,
  DeviceKeyRevealResponse,
  DeviceKeyRotateResponse,
  DeviceInstanceResolveResponse,
  DeviceRemovalResponse,
} from '../model/response.model';
import { base64UrlDecode, base64UrlEncode } from '../device-v2/ble-direct/wire';

export interface DirectAdminRecord {
  logicalDeviceId: string;
  accessEpoch: number;
  controllerId: string;
  credentialVersion: number;
}

// Non-secret metadata only. The provisioning coordinator owns the durable
// pending secret and must not mark it active from this HTTP result.
export interface DirectAdminResetRequest {
  operationId: string;
  deviceInstanceId: string;
  expectedAccessEpoch: number;
  expectedControllerId: string;
  cloudCredentialVersion: number;
  controllerId: string;
  credentialVersion: 1;
  fingerprint: string;
}

@Injectable({ providedIn: 'root' })
export class DeviceV2ManagementService {
  constructor(private readonly http: HttpClient) {}

  async getDirectAdminV2(logicalDeviceId: string): Promise<DirectAdminRecord | null> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.get<{ status: number; data: { record: DirectAdminRecord | null } }>(
      API.DEVICE_V2.DIRECT_ADMIN(id), { observe: 'response' },
    ));
    this.noStore(response.headers.get('Cache-Control'));
    const record = this.body(response.body, response.status).data.record;
    if (response.status !== 200) throw new Error('DIRECT_ADMIN_RESPONSE_INVALID');
    if (record !== null) this.directAdmin(record, id);
    return record;
  }

  async registerDirectAdminV2(
    logicalDeviceId: string, controllerId: Uint8Array, fingerprint: Uint8Array,
  ): Promise<DirectAdminRecord> {
    const id = this.deviceId(logicalDeviceId);
    if (controllerId.length !== 16 || fingerprint.length !== 32
      || !controllerId.some(Boolean) || !fingerprint.some(Boolean)) throw new Error('DIRECT_ADMIN_INVALID');
    return this.writeDirectAdminV2(id, {
      controllerId: base64UrlEncode(controllerId), credentialVersion: 1, fingerprint: base64UrlEncode(fingerprint),
    }, 'put');
  }

  async resetDirectAdminV2(logicalDeviceId: string, input: DirectAdminResetRequest): Promise<DirectAdminRecord> {
    const id = this.deviceId(logicalDeviceId);
    for (const value of [input.operationId, input.deviceInstanceId, input.expectedControllerId, input.controllerId]) {
      if (base64UrlDecode(value, 16).every(byte => byte === 0)) throw new Error('DIRECT_ADMIN_INVALID');
    }
    if (base64UrlDecode(input.fingerprint, 32).every(byte => byte === 0)
      || input.credentialVersion !== 1 || input.expectedControllerId === input.controllerId
      || !Number.isSafeInteger(input.expectedAccessEpoch) || input.expectedAccessEpoch < 1
      || input.expectedAccessEpoch >= 0xffffffff || !Number.isSafeInteger(input.cloudCredentialVersion)
      || input.cloudCredentialVersion < 2 || input.cloudCredentialVersion > 0xffffffff) throw new Error('DIRECT_ADMIN_INVALID');
    // Enumerate the wire fields: never spread a credential (contains a secret).
    return this.writeDirectAdminV2(id, { operationId: input.operationId, deviceInstanceId: input.deviceInstanceId,
      expectedAccessEpoch: input.expectedAccessEpoch, expectedControllerId: input.expectedControllerId,
      cloudCredentialVersion: input.cloudCredentialVersion, controllerId: input.controllerId,
      credentialVersion: 1, fingerprint: input.fingerprint }, 'patch', input.expectedAccessEpoch + 1);
  }

  private async writeDirectAdminV2(id: string, input: { controllerId: string; credentialVersion: number;
    fingerprint: string } | DirectAdminResetRequest, method: 'put' | 'patch', expectedEpoch?: number): Promise<DirectAdminRecord> {
    const response = await firstValueFrom(this.http[method]<{
      status: number; data: DirectAdminRecord & { replayed: boolean };
    }>(API.DEVICE_V2.DIRECT_ADMIN(id), input, { observe: 'response' }));
    this.noStore(response.headers.get('Cache-Control'));
    const record = this.body(response.body, response.status).data;
    this.directAdmin(record, id);
    if (![200, 201].includes(response.status) || typeof record.replayed !== 'boolean'
      || (response.status === 200) !== record.replayed
      || record.controllerId !== input.controllerId || record.credentialVersion !== 1
      || (expectedEpoch !== undefined && record.accessEpoch !== expectedEpoch)) {
      throw new Error('DIRECT_ADMIN_RESPONSE_INVALID');
    }
    return record;
  }

  private directAdmin(record: DirectAdminRecord, id: string): void {
    if (!record || record.logicalDeviceId !== id
      || !Number.isSafeInteger(record.accessEpoch) || record.accessEpoch < 1 || record.accessEpoch > 0xffffffff
      || !Number.isSafeInteger(record.credentialVersion) || record.credentialVersion < 1
      || record.credentialVersion > 0xffffffff
      || base64UrlDecode(record.controllerId, 16).every(byte => byte === 0)) {
      throw new Error('DIRECT_ADMIN_RESPONSE_INVALID');
    }
  }

  async createDeviceKeyV2(
    name: string,
    idempotencyKey: string,
    deviceType = 'diy',
  ): Promise<DeviceKeyCreateResponse> {
    const normalizedName = name.trim();
    const normalizedType = deviceType.trim();
    const normalizedKey = this.idempotencyKey(idempotencyKey);
    if (!normalizedName || !normalizedType) throw new Error('设备名称和类型不能为空');

    const response = await firstValueFrom(this.http.post<DeviceKeyCreateResponse>(
      API.DEVICE_V2.CREATE,
      { name: normalizedName, deviceType: normalizedType },
      { headers: { 'Idempotency-Key': normalizedKey }, observe: 'response' },
    ));
    return this.body(response.body, response.status);
  }

  async revealDeviceKeyV2(context: DeviceKeyContext): Promise<DeviceKeyRevealResponse> {
    this.context(context);
    const response = await firstValueFrom(this.http.post<DeviceKeyRevealResponse>(
      API.DEVICE_V2.REVEAL(context.logicalDeviceId),
      {},
      { observe: 'response' },
    ));
    this.noStore(response.headers.get('Cache-Control'));
    return this.body(response.body, response.status);
  }

  async resolveDeviceInstanceV2(
    deviceInstanceId: Uint8Array,
  ): Promise<DeviceInstanceResolveResponse> {
    if (!(deviceInstanceId instanceof Uint8Array) || deviceInstanceId.length !== 16
      || !deviceInstanceId.some(byte => byte !== 0)) {
      throw new Error('设备实例号无效');
    }
    const response = await firstValueFrom(this.http.post<DeviceInstanceResolveResponse>(
      API.DEVICE_V2.RESOLVE_INSTANCE,
      { deviceInstanceId: base64UrlEncode(deviceInstanceId) },
      { observe: 'response' },
    ));
    return this.body(response.body, response.status);
  }

  async enableDeviceCloudV2(
    deviceInstanceId: Uint8Array,
  ): Promise<DeviceCloudEnableResponse> {
    this.deviceInstanceId(deviceInstanceId);
    const response = await firstValueFrom(this.http.post<DeviceCloudEnableResponse>(
      API.DEVICE_V2.ENABLE_CLOUD,
      { deviceInstanceId: base64UrlEncode(deviceInstanceId) },
      { observe: 'response' },
    ));
    this.noStore(response.headers.get('Cache-Control'));
    return this.body(response.body, response.status);
  }

  async rotateDeviceKeyV2(
    context: DeviceKeyContext,
    idempotencyKey: string,
  ): Promise<DeviceKeyRotateResponse> {
    this.context(context);
    const response = await firstValueFrom(this.http.post<DeviceKeyRotateResponse>(
      API.DEVICE_V2.ROTATE(context.logicalDeviceId),
      {},
      {
        headers: { 'Idempotency-Key': this.idempotencyKey(idempotencyKey) },
        observe: 'response',
      },
    ));
    this.noStore(response.headers.get('Cache-Control'));
    return this.body(response.body, response.status);
  }

  async deleteDeviceV2(logicalDeviceId: string): Promise<DeviceRemovalResponse> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.delete<DeviceRemovalResponse>(API.DEVICE_V2.DETAIL(id),
      { observe: 'response' }));
    const result = this.body(response.body, response.status), data = result.data;
    if (![200, 202].includes(response.status) || data.logicalDeviceId !== id || data.state !== 'deleted'
      || data.cloudAuthorization !== 'revoked' || data.localAccess !== 'not_confirmed'
      || !Number.isSafeInteger(data.deletedAt) || data.deletedAt < 0
      || typeof data.brokerCleanupPending !== 'boolean' || typeof data.realtimeRefreshPending !== 'boolean'
      || (response.status === 202) !== (data.brokerCleanupPending || data.realtimeRefreshPending)) {
      throw new Error('设备移除结果无效，请刷新设备列表确认');
    }
    return result;
  }

  async readDeviceStateV2(logicalDeviceId: string): Promise<'active' | 'deleted'> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.get<{ status: number; data: { logicalDeviceId: string; state: string } }>(
      API.DEVICE_V2.DETAIL(id), { observe: 'response' }));
    const value = this.body(response.body, response.status).data;
    if (response.status !== 200 || value.logicalDeviceId !== id || !['active', 'deleted'].includes(value.state)) {
      throw Error('DEVICE_V2_STATE_RESPONSE_INVALID');
    }
    return value.state as 'active' | 'deleted';
  }

  private body<T extends { status: number; data: unknown }>(body: T | null, status: number): T {
    if (!body?.data || body.status !== status) throw new Error('设备管理响应无效');
    return body;
  }

  private context(value: DeviceKeyContext): void {
    if (
      !value?.logicalDeviceId
      || !Number.isSafeInteger(value.credentialVersion)
      || value.credentialVersion < 1
      || !value.locator
    ) {
      throw new Error('设备密钥上下文无效');
    }
  }

  private deviceInstanceId(value: Uint8Array): void {
    if (!(value instanceof Uint8Array) || value.length !== 16
      || !value.some(byte => byte !== 0)) {
      throw new Error('设备实例号无效');
    }
  }

  private deviceId(value: string): string {
    const normalized = value?.trim();
    if (!normalized || normalized.includes('\0')) throw new Error('设备标识无效');
    return normalized;
  }

  private idempotencyKey(value: string): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > 128 || normalized.includes('\0')) {
      throw new Error('幂等键无效');
    }
    return normalized;
  }

  private noStore(value: string | null): void {
    if (!value?.toLowerCase().split(',').some(token => token.trim() === 'no-store')) {
      throw new Error('设备密钥响应禁止缓存');
    }
  }
}
