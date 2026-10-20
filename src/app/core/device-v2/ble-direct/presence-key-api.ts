import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API } from '../../../configs/api.config';
import { BleDirectCrypto, constantTimeEqual } from './crypto';
import { base64UrlDecode, base64UrlEncode } from './wire';

export interface BlePresenceKeyVersion {
  version: number;
  accessEpoch: number;
  key: Uint8Array;
  keyDigest: Uint8Array;
  deviceConfirmed: boolean;
}

export interface BlePresenceKeyBundle {
  logicalDeviceId: string;
  current: BlePresenceKeyVersion;
  previous: BlePresenceKeyVersion | null;
  replayed: boolean;
}

interface Envelope<T> {
  status: number;
  data: T;
}

interface PresenceKeyVersionJson {
  version: number;
  accessEpoch: number;
  key: string;
  keyDigest: string;
  deviceConfirmed: boolean;
}

interface PresenceKeyBundleJson {
  logicalDeviceId: string;
  current: PresenceKeyVersionJson;
  previous: PresenceKeyVersionJson | null;
  replayed: boolean;
}

export class HttpBlePresenceKeyApi {
  constructor(
    private readonly http: HttpClient,
    private readonly crypto = new BleDirectCrypto(),
  ) {}

  async reveal(logicalDeviceId: string): Promise<BlePresenceKeyBundle> {
    const id = exactLogicalDeviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.get<Envelope<PresenceKeyBundleJson>>(
      API.DEVICE_V2.PRESENCE_KEY(id),
      { observe: 'response' },
    ));
    return this.decode(response.status, response.headers.get('Cache-Control'), response.body, id, [200]);
  }

  async allocate(
    logicalDeviceId: string,
    idempotencyKey: string,
  ): Promise<BlePresenceKeyBundle> {
    const id = exactLogicalDeviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.post<Envelope<PresenceKeyBundleJson>>(
      API.DEVICE_V2.ALLOCATE_PRESENCE_KEY(id),
      {},
      {
        headers: { 'Idempotency-Key': exactIdempotencyKey(idempotencyKey) },
        observe: 'response',
      },
    ));
    return this.decode(
      response.status, response.headers.get('Cache-Control'), response.body, id, [200, 201],
    );
  }

  async rotate(
    logicalDeviceId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<BlePresenceKeyBundle> {
    const id = exactLogicalDeviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.post<Envelope<PresenceKeyBundleJson>>(
      API.DEVICE_V2.ROTATE_PRESENCE_KEY(id),
      { expectedVersion: u32(expectedVersion) },
      {
        headers: { 'Idempotency-Key': exactIdempotencyKey(idempotencyKey) },
        observe: 'response',
      },
    ));
    return this.decode(response.status, response.headers.get('Cache-Control'), response.body, id, [200]);
  }

  async sync(logicalDeviceId: string): Promise<BlePresenceKeyBundle> {
    const id = exactLogicalDeviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.post<Envelope<PresenceKeyBundleJson>>(
      API.DEVICE_V2.SYNC_PRESENCE_KEY(id),
      {},
      { observe: 'response' },
    ));
    return this.decode(
      response.status, response.headers.get('Cache-Control'), response.body, id, [200],
    );
  }

  async confirm(
    logicalDeviceId: string,
    receipt: Uint8Array,
  ): Promise<BlePresenceKeyBundle> {
    const id = exactLogicalDeviceId(logicalDeviceId);
    if (!(receipt instanceof Uint8Array) || receipt.length < 1 || receipt.length > 93) {
      throw new Error('BLE_PRESENCE_RECEIPT_INVALID');
    }
    const response = await firstValueFrom(this.http.post<Envelope<PresenceKeyBundleJson>>(
      API.DEVICE_V2.CONFIRM_PRESENCE_KEY(id),
      { receipt: base64UrlEncode(receipt) },
      { observe: 'response' },
    ));
    const result = await this.decode(
      response.status, response.headers.get('Cache-Control'), response.body, id, [200],
    );
    if (!result.current.deviceConfirmed || result.previous !== null) {
      clearBlePresenceKeyBundleSecrets(result);
      throw new Error('BLE_PRESENCE_CONFIRMATION_INVALID');
    }
    return result;
  }

  private async decode(
    httpStatus: number,
    cacheControl: string | null,
    envelope: Envelope<PresenceKeyBundleJson> | null,
    logicalDeviceId: string,
    allowedStatuses: readonly number[],
  ): Promise<BlePresenceKeyBundle> {
    if (!cacheControl?.toLowerCase().split(',').some(value => value.trim() === 'no-store')) {
      throw new Error('BLE_PRESENCE_CACHE_POLICY_INVALID');
    }
    const value = envelope?.data;
    if (!allowedStatuses.includes(httpStatus) || envelope?.status !== httpStatus
      || !value || value.logicalDeviceId !== logicalDeviceId
      || typeof value.replayed !== 'boolean') {
      throw new Error('BLE_PRESENCE_RESPONSE_INVALID');
    }

    let current: BlePresenceKeyVersion | undefined;
    let previous: BlePresenceKeyVersion | null = null;
    try {
      current = await this.decodeVersion(value.current);
      previous = value.previous === null ? null : await this.decodeVersion(value.previous);
      if (previous && (previous.version + 1 !== current.version
        || previous.accessEpoch !== current.accessEpoch
        || constantTimeEqual(previous.keyDigest, current.keyDigest))) {
        throw new Error('BLE_PRESENCE_RESPONSE_INVALID');
      }
      return { logicalDeviceId, current, previous, replayed: value.replayed };
    } catch (error) {
      clearBlePresenceKeyVersion(current);
      clearBlePresenceKeyVersion(previous);
      throw error;
    }
  }

  private async decodeVersion(value: PresenceKeyVersionJson): Promise<BlePresenceKeyVersion> {
    if (!value || typeof value !== 'object' || typeof value.deviceConfirmed !== 'boolean') {
      throw new Error('BLE_PRESENCE_RESPONSE_INVALID');
    }
    const key = base64UrlDecode(value.key, 16);
    const keyDigest = base64UrlDecode(value.keyDigest, 32);
    try {
      if (!key.some(byte => byte !== 0) || !keyDigest.some(byte => byte !== 0)) {
        throw new Error('BLE_PRESENCE_RESPONSE_INVALID');
      }
      const actual = await this.crypto.sha256(key);
      const matches = constantTimeEqual(actual, keyDigest);
      actual.fill(0);
      if (!matches) throw new Error('BLE_PRESENCE_RESPONSE_INVALID');
      return {
        version: u32(value.version),
        accessEpoch: u32(value.accessEpoch),
        key,
        keyDigest,
        deviceConfirmed: value.deviceConfirmed,
      };
    } catch (error) {
      key.fill(0);
      keyDigest.fill(0);
      throw error;
    }
  }
}

export function clearBlePresenceKeyBundleSecrets(
  bundle: BlePresenceKeyBundle | undefined,
): void {
  if (!bundle) return;
  clearBlePresenceKeyVersion(bundle.current);
  clearBlePresenceKeyVersion(bundle.previous);
}

function clearBlePresenceKeyVersion(value: BlePresenceKeyVersion | null | undefined): void {
  value?.key.fill(0);
  value?.keyDigest.fill(0);
}

function exactLogicalDeviceId(value: string): string {
  if (!value || value !== value.trim() || value.includes('/') || value.includes('\0')
    || new TextEncoder().encode(value).length > 128) {
    throw new Error('BLE_PRESENCE_DEVICE_ID_INVALID');
  }
  return value;
}

function exactIdempotencyKey(value: string): string {
  if (!value || value !== value.trim() || value.includes('\0')
    || new TextEncoder().encode(value).length > 128) {
    throw new Error('BLE_PRESENCE_IDEMPOTENCY_KEY_INVALID');
  }
  return value;
}

function u32(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error('BLE_PRESENCE_RESPONSE_INVALID');
  }
  return value;
}
