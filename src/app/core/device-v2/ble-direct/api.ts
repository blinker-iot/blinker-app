import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API } from '../../../configs/api.config';
import { base64UrlDecode, base64UrlEncode } from './wire';

export interface BleEnrollmentIntentRequest {
  requestId: Uint8Array;
  displayName: string;
  deviceInstanceId: Uint8Array;
  setupSessionId: Uint8Array;
  setupTranscriptHash: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  controllerSecretDigest: Uint8Array;
  adminFingerprint: Uint8Array;
  securityProfile: number;
  serverKeyId: number;
  signatureAlgorithm: number;
}

export interface BleEnrollmentIntent {
  intentId: Uint8Array;
  logicalDeviceId: string;
  grant: Uint8Array;
  presenceKeyVersion: number;
  presenceKey: Uint8Array;
  expiresAt: number;
  securityProfile: number;
  serverKeyId: number;
  signatureAlgorithm: number;
  replayed: boolean;
}

export interface BleEnrollmentCommit {
  logicalDeviceId: string;
  accessEpoch: number;
  presenceKeyVersion: number;
  controllerId: Uint8Array;
  state: 'active';
  replayed: boolean;
}

export interface BleEnrollmentCancellation {
  intentId: Uint8Array;
  logicalDeviceId: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  state: 'cancelled' | 'expired';
  replayed: boolean;
}

export interface BleEnrollmentApi {
  issue(request: BleEnrollmentIntentRequest): Promise<BleEnrollmentIntent>;
  commit(
    intentId: Uint8Array,
    commitId: Uint8Array,
    receipt: Uint8Array,
  ): Promise<BleEnrollmentCommit>;
  cancel(intentId: Uint8Array): Promise<BleEnrollmentCancellation>;
}

interface Envelope<T> {
  status: number;
  data: T;
}

interface IntentJson {
  intentId: string;
  logicalDeviceId: string;
  grant: string;
  presenceKeyVersion: number;
  presenceKey: string;
  expiresAt: number;
  securityProfile: number;
  serverKeyId: number;
  signatureAlgorithm: number;
  replayed: boolean;
}

interface CommitJson {
  logicalDeviceId: string;
  accessEpoch: number;
  presenceKeyVersion: number;
  controllerId: string;
  state: string;
  replayed: boolean;
}

interface CancellationJson {
  intentId: string;
  logicalDeviceId: string;
  deviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  state: string;
  replayed: boolean;
}

export class HttpBleEnrollmentApi implements BleEnrollmentApi {
  constructor(private readonly http: HttpClient) {}

  async issue(request: BleEnrollmentIntentRequest): Promise<BleEnrollmentIntent> {
    const response = await firstValueFrom(this.http.post<Envelope<IntentJson>>(
      API.DEVICE_V2.BLE_ENROLLMENT_INTENTS,
      {
        requestId: base64UrlEncode(request.requestId),
        displayName: request.displayName,
        deviceInstanceId: base64UrlEncode(request.deviceInstanceId),
        setupSessionId: base64UrlEncode(request.setupSessionId),
        setupTranscriptHash: base64UrlEncode(request.setupTranscriptHash),
        accessEpoch: request.accessEpoch,
        controllerId: base64UrlEncode(request.controllerId),
        controllerSecretDigest: base64UrlEncode(request.controllerSecretDigest),
        adminFingerprint: base64UrlEncode(request.adminFingerprint),
        securityProfile: request.securityProfile,
        serverKeyId: request.serverKeyId,
        signatureAlgorithm: request.signatureAlgorithm,
      },
      { observe: 'response' },
    ));
    requireNoStore(response.headers.get('Cache-Control'));
    const envelope = response.body;
    const value = envelope?.data;
    if ((response.status !== 200 && response.status !== 201)
      || envelope?.status !== response.status
      || !value || !/^ble_[A-Za-z0-9_-]{22}$/.test(value.logicalDeviceId)
      || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 1
      || !Number.isSafeInteger(value.presenceKeyVersion)
      || value.presenceKeyVersion < 1 || value.presenceKeyVersion > 0xffffffff
      || typeof value.replayed !== 'boolean') {
      throw new Error('BLE_DIRECT_INTENT_RESPONSE_INVALID');
    }
    return {
      intentId: base64UrlDecode(value.intentId, 16),
      logicalDeviceId: value.logicalDeviceId,
      grant: base64UrlDecode(value.grant),
      presenceKeyVersion: value.presenceKeyVersion,
      presenceKey: base64UrlDecode(value.presenceKey, 16),
      expiresAt: value.expiresAt,
      securityProfile: value.securityProfile,
      serverKeyId: value.serverKeyId,
      signatureAlgorithm: value.signatureAlgorithm,
      replayed: value.replayed,
    };
  }

  async commit(
    intentId: Uint8Array,
    commitId: Uint8Array,
    receipt: Uint8Array,
  ): Promise<BleEnrollmentCommit> {
    const response = await firstValueFrom(this.http.post<Envelope<CommitJson>>(
      API.DEVICE_V2.BLE_ENROLLMENT_COMMIT(base64UrlEncode(intentId)),
      {
        commitId: base64UrlEncode(commitId),
        receipt: base64UrlEncode(receipt),
        method2Confirmed: true,
      },
    ));
    const value = response?.data;
    if (response?.status !== 200
      || !value || !/^ble_[A-Za-z0-9_-]{22}$/.test(value.logicalDeviceId)
      || !Number.isSafeInteger(value.accessEpoch) || value.accessEpoch < 1
      || !Number.isSafeInteger(value.presenceKeyVersion)
      || value.presenceKeyVersion < 1 || value.presenceKeyVersion > 0xffffffff
      || value.state !== 'active' || typeof value.replayed !== 'boolean') {
      throw new Error('BLE_DIRECT_COMMIT_RESPONSE_INVALID');
    }
    return {
      logicalDeviceId: value.logicalDeviceId,
      accessEpoch: value.accessEpoch,
      presenceKeyVersion: value.presenceKeyVersion,
      controllerId: base64UrlDecode(value.controllerId, 16),
      state: 'active',
      replayed: value.replayed,
    };
  }

  async cancel(intentId: Uint8Array): Promise<BleEnrollmentCancellation> {
    const response = await firstValueFrom(this.http.post<Envelope<CancellationJson>>(
      API.DEVICE_V2.BLE_ENROLLMENT_CANCEL(base64UrlEncode(intentId)),
      {},
    ));
    const value = response?.data;
    if (response?.status !== 200
      || !value || !/^ble_[A-Za-z0-9_-]{22}$/.test(value.logicalDeviceId)
      || !Number.isSafeInteger(value.accessEpoch) || value.accessEpoch < 1
      || (value.state !== 'cancelled' && value.state !== 'expired')
      || typeof value.replayed !== 'boolean') {
      throw new Error('BLE_DIRECT_CANCEL_RESPONSE_INVALID');
    }
    return {
      intentId: base64UrlDecode(value.intentId, 16),
      logicalDeviceId: value.logicalDeviceId,
      deviceInstanceId: base64UrlDecode(value.deviceInstanceId, 16),
      accessEpoch: value.accessEpoch,
      controllerId: base64UrlDecode(value.controllerId, 16),
      state: value.state,
      replayed: value.replayed,
    };
  }
}

function requireNoStore(value: string | null): void {
  if (!value?.toLowerCase().split(',').some(token => token.trim() === 'no-store')) {
    throw new Error('BLE_DIRECT_CACHE_POLICY_INVALID');
  }
}
