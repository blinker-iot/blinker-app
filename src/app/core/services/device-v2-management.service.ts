import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';

import { API } from '../../configs/api.config';
import {
  DeviceKeyContext,
  DeviceCloudEnableResponse,
  DeviceKeyCreateResponse,
  DeviceKeyRevealData,
  DeviceKeyRevealResponse,
  DeviceKeyRotateResponse,
  DeviceInstanceResolveResponse,
  DeviceRemovalResponse,
  WiFiProvCloudReadResult,
} from '../model/response.model';
import { base64UrlDecode, base64UrlEncode } from '../device-v2/ble-direct/wire';
import { DeviceDisplayMetadata, parseDeviceDisplayMetadata } from '../device-v2/display-metadata';
import { allocationContext } from '../device-v2/provisioning/wifiprov-allocation';
import { openWiFiProvInstallTransfer, WIFI_PROV_INSTALL_CONTRACT } from '../device-v2/provisioning/wifiprov-install-transfer';
import { normalizeSealedInstallationName, validateInstallationStatus, validateInstallationStatusRequest,
  type WiFiProvInstallationStatus, type WiFiProvInstallationStatusRequest } from '../device-v2/provisioning/wifiprov-sealed-installation-contract';
import { logicalDevicePeerId } from '../protocol/device-v2';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';

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

  async readDeviceContextV2(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceKeyContext> {
    if (signal.aborted) throw signal.reason ?? new DOMException('Read cancelled', 'AbortError');
    logicalDevicePeerId(logicalDeviceId);
    const response = await firstValueFrom(this.http.get<{
      status: number; data: DeviceKeyContext & { state: string; cloudEnabled: boolean };
    }>(API.DEVICE_V2.DETAIL(logicalDeviceId), {
      observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    }).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    if (signal.aborted) throw signal.reason ?? new DOMException('Read cancelled', 'AbortError');
    if (response.status !== 200) throw Error('DEVICE_V2_CONTEXT_RESPONSE_INVALID');
    this.noStore(response.headers.get('Cache-Control'));
    const device = this.body(response.body, response.status).data;
    if (device.logicalDeviceId !== logicalDeviceId || device.state !== 'active' || device.cloudEnabled !== true) {
      throw Error('DEVICE_V2_CONTEXT_RESPONSE_INVALID');
    }
    return allocationContext(device);
  }

  async getDisplayMetadataV2(logicalDeviceId: string): Promise<DeviceDisplayMetadata> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.get<{ status: number; data: DeviceDisplayMetadata }>(
      API.DEVICE_V2.DISPLAY_METADATA(id), { observe: 'response' }));
    if (response.status !== 200) throw Error('DEVICE_V2_DISPLAY_RESPONSE_INVALID');
    this.noStore(response.headers.get('Cache-Control'));
    return parseDeviceDisplayMetadata(this.body(response.body, response.status).data, id);
  }

  async saveDisplayMetadataV2(candidate: DeviceDisplayMetadata): Promise<DeviceDisplayMetadata> {
    const value = parseDeviceDisplayMetadata(candidate);
    if (value.revision >= 0x7fffffff) throw Error('DEVICE_V2_DISPLAY_INVALID');
    const response = await firstValueFrom(this.http.put<{ status: number; data: DeviceDisplayMetadata }>(
      API.DEVICE_V2.DISPLAY_METADATA(value.logicalDeviceId),
      { expectedRevision: value.revision, name: value.name, capabilities: value.capabilities },
      { observe: 'response' }));
    if (response.status !== 200) throw Error('DEVICE_V2_DISPLAY_RESPONSE_INVALID');
    this.noStore(response.headers.get('Cache-Control'));
    const result = parseDeviceDisplayMetadata(this.body(response.body, response.status).data, value.logicalDeviceId);
    if (result.revision !== value.revision + 1 || result.name !== value.name
      || JSON.stringify(result.capabilities) !== JSON.stringify(value.capabilities)) throw Error('DEVICE_V2_DISPLAY_RESPONSE_INVALID');
    return result;
  }

  async getDirectAdminV2(logicalDeviceId: string): Promise<DirectAdminRecord | null> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.get<{ status: number; data: { record: DirectAdminRecord | null } }>(
      API.DEVICE_V2.DIRECT_ADMIN(id), { observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true) },
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
      { observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true) },
    ));
    this.noStore(response.headers.get('Cache-Control'));
    return this.body(response.body, response.status);
  }

  async createDeviceForWiFiProvInstallV2(name: string, requestId: string, instance: Uint8Array,
    beforeDispatch: (recipientPublicKey: string) => Promise<void>, signal?: AbortSignal): Promise<DeviceKeyRevealData> {
    const normalized = normalizeSealedInstallationName(name);
    if (typeof beforeDispatch !== 'function' || !(instance instanceof Uint8Array) || instance.length !== 16 || !instance.some(Boolean))
      throw Error('WIFIPROV_INSTALL_REQUEST_INVALID');
    const deviceInstanceId = base64UrlEncode(instance);
    this.assertInstallationSignal(signal);
    return openWiFiProvInstallTransfer(requestId, deviceInstanceId, async recipientPublicKey => {
      this.assertInstallationSignal(signal);
      await beforeDispatch(recipientPublicKey);
      this.assertInstallationSignal(signal);
      const pending = this.http.post<{ status: number; data: unknown }>(API.DEVICE_V2.CREATE,
        { name: normalized, deviceType: 'diy', deviceInstanceId, recipientPublicKey }, {
          headers: { 'Idempotency-Key': requestId, 'X-Blinker-Contract': WIFI_PROV_INSTALL_CONTRACT },
          observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
        }).pipe(timeout(15000));
      const response = await firstValueFrom(signal ? pending.pipe(takeUntil(fromEvent(signal, 'abort'))) : pending);
      this.assertInstallationSignal(signal);
      this.noStore(response.headers.get('Cache-Control'));
      if (response.status !== 201) throw Error('WIFIPROV_INSTALL_RESPONSE_INVALID');
      return this.body(response.body, response.status).data;
    });
  }

  /** Only the owner-scoped public status of the original installation request. */
  async readWiFiProvInstallationStatusV2(request: WiFiProvInstallationStatusRequest, signal: AbortSignal): Promise<WiFiProvInstallationStatus> {
    this.assertInstallationSignal(signal);
    const params = validateInstallationStatusRequest(request);
    const response = await firstValueFrom(this.http.get<{ status: number; data: unknown }>(API.DEVICE_V2.INSTALL_STATUS, {
      params: { ...params }, headers: { 'X-Blinker-Contract': WIFI_PROV_INSTALL_CONTRACT }, observe: 'response',
      context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    }).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    this.assertInstallationSignal(signal);
    if (response.status !== 200 || !response.body || Object.keys(response.body).length !== 2
      || !Object.hasOwn(response.body, 'status') || !Object.hasOwn(response.body, 'data')) throw Error('WIFIPROV_INSTALL_RESPONSE_INVALID');
    this.noStore(response.headers.get('Cache-Control'));
    return validateInstallationStatus(this.body(response.body, response.status).data);
  }

  private assertInstallationSignal(signal?: AbortSignal): void {
    if (signal?.aborted) throw signal.reason ?? Error('WIFIPROV_OPERATION_CANCELLED');
  }

  async resolveDeviceInstanceV2(
    deviceInstanceId: Uint8Array,
    registrationProduct?: 'cloud' | 'ble_direct',
  ): Promise<DeviceInstanceResolveResponse> {
    if (!(deviceInstanceId instanceof Uint8Array) || deviceInstanceId.length !== 16
      || !deviceInstanceId.some(byte => byte !== 0)) {
      throw new Error('设备实例号无效');
    }
    if (registrationProduct !== undefined && registrationProduct !== 'cloud' && registrationProduct !== 'ble_direct') {
      throw Error('ACCESS_REGISTRATION_REQUEST_INVALID');
    }
    const response = await firstValueFrom(this.http.post<DeviceInstanceResolveResponse>(
      API.DEVICE_V2.RESOLVE_INSTANCE,
      { deviceInstanceId: base64UrlEncode(deviceInstanceId), ...(registrationProduct ? { registrationProduct } : {}) },
      { observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
        ...(registrationProduct ? { headers: { 'X-Blinker-Contract': 'access-registration-v1' } } : {}) },
    ));
    const result = this.body(response.body, response.status);
    if (registrationProduct !== undefined) {
      this.noStore(response.headers.get('Cache-Control'));
      const device = result.data?.device as (NonNullable<DeviceInstanceResolveResponse['data']['device']>
        & { registrationProduct?: unknown }) | null | undefined;
      if (response.status !== 200 || (device !== null && (!device || device.state !== 'active'
        || device.registrationProduct !== registrationProduct))) throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
      if (device) {
        try {
          logicalDevicePeerId(device.logicalDeviceId);
          if (registrationProduct === 'cloud') {
            if (device.cloudEnabled !== true) throw Error('Cloud access is not active');
            allocationContext(device as DeviceKeyContext);
          }
        } catch { throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID'); }
      }
    }
    return result;
  }

  /** One owner-scoped observation. Never resumes or confirms the earlier WiFi RPC. */
  async readProvisioningCloudV2(
    deviceInstanceId: Uint8Array, expected: DeviceKeyContext, signal: AbortSignal,
  ): Promise<WiFiProvCloudReadResult> {
    const cancelled = () => {
      if (signal.aborted) throw signal.reason ?? new DOMException('Read cancelled', 'AbortError');
    };
    cancelled();
    this.deviceInstanceId(deviceInstanceId);
    const instance = base64UrlEncode(deviceInstanceId), context = allocationContext(expected);
    const response = await firstValueFrom(this.http.post<{ status: number; data: WiFiProvCloudReadResult }>(
      API.DEVICE_V2.RESOLVE_INSTANCE,
      { deviceInstanceId: instance, expectedContext: context },
      { observe: 'response', headers: { 'X-Blinker-Contract': 'provisioning-cloud-v1' },
        context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true) },
    ).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort')))).catch(error => {
      cancelled(); throw error;
    });
    cancelled();
    if (response.status !== 200) throw Error('WIFIPROV_CLOUD_RESPONSE_INVALID');
    this.noStore(response.headers.get('Cache-Control'));
    const data = this.body(response.body, response.status).data;
    const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value
      && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
    const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
    if (!exact(data, ['device', 'observation'])
      || !exact(data.observation, ['kind', 'observedAt', 'deviceInstanceId', 'issuedAt', 'stateUpdatedAt'])) {
      throw Error('WIFIPROV_CLOUD_RESPONSE_INVALID');
    }
    const observation = data.observation;
    if (!['online', 'unconfirmed', 'unavailable'].includes(observation.kind)
      || !timestamp(observation.observedAt)
      || (observation.deviceInstanceId !== null
        && (typeof observation.deviceInstanceId !== 'string'
          || !base64UrlDecode(observation.deviceInstanceId, 16).some(Boolean)))
      || (observation.issuedAt !== null && (!timestamp(observation.issuedAt) || observation.issuedAt > observation.observedAt))
      || (observation.stateUpdatedAt !== null
        && (!timestamp(observation.stateUpdatedAt) || observation.stateUpdatedAt > observation.observedAt))) {
      throw Error('WIFIPROV_CLOUD_RESPONSE_INVALID');
    }
    const deviceContext = allocationContext(data.device);
    if (deviceContext.logicalDeviceId !== context.logicalDeviceId || deviceContext.credentialVersion !== context.credentialVersion
      || deviceContext.locator !== context.locator || data.device.state !== 'active' || data.device.cloudEnabled !== true) {
      throw Error('WIFIPROV_CLOUD_RESPONSE_INVALID');
    }
    if (observation.kind === 'online' && (observation.deviceInstanceId !== instance
      || !timestamp(observation.issuedAt) || !timestamp(observation.stateUpdatedAt)
      || observation.stateUpdatedAt < observation.issuedAt)) throw Error('WIFIPROV_CLOUD_RESPONSE_INVALID');
    cancelled();
    // Expose neither the HTTP envelope nor unknown descriptor/credential fields.
    return { device: { ...deviceContext, state: 'active', cloudEnabled: true }, observation: {
      kind: observation.kind, observedAt: observation.observedAt, deviceInstanceId: observation.deviceInstanceId,
      issuedAt: observation.issuedAt, stateUpdatedAt: observation.stateUpdatedAt,
    } };
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
