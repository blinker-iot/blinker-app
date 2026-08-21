import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import {
  DeviceKeyContext,
  DeviceKeyCreateResponse,
  DeviceKeyRevealResponse,
  DeviceKeyRotateResponse,
} from '../model/response.model';

@Injectable({ providedIn: 'root' })
export class DeviceV2ManagementService {
  constructor(private readonly http: HttpClient) {}

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

  async deleteDeviceV2(logicalDeviceId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(API.DEVICE_V2.DETAIL(this.deviceId(logicalDeviceId))),
    );
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
