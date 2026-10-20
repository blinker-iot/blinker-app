import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../../configs/api.config';
import { DeviceV2AccountContext } from '../account-scope';
import { GatewayHttpError } from '../../model/response.model';
import { LocalAccessPreparationError } from './preparation-error';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import { decodeLocalAccessChallenge, decodeLocalAccessGrant, isLocalAccessIdentifier,
  LocalAccessGrant, sameLocalAccessBytes } from '../../protocol/device-v2/local-access';

export interface LocalAccessRequest {
  securityProfile: 1 | 2;
  recipientLogicalDeviceId: string;
  targetLogicalDeviceId: string;
  targetDeviceInstanceId: Uint8Array;
  accessEpoch: number;
  topologyVersion: number;
  callerSessionId: Uint8Array;
  requestId: Uint8Array;
  exactChallenge: Uint8Array;
  permissions: number;
  lifetimeMillis: number;
}

export interface LocalAccessMaterial {
  validForMillis: number;
  exactGrant: Uint8Array;
  grant: LocalAccessGrant;
  sessionKey: Uint8Array;
  clear(): void;
}

interface Envelope { status: number; data: { contract: string; exactGrant: string; sessionKey: string; validForMillis: number }; }
export interface LocalAccessContext {
  securityProfile: 1 | 2;
  logicalDeviceId: string;
  deviceInstanceId: Uint8Array;
  permissions: 1 | 3;
  maximumLifetimeMillis: number;
}

// No Angular service/page state, MQTT, discovery or durable credentials here.
// A composition supplies the current authenticated account context. Callers
// own the short-lived result and clear it when handshake/session work ends.
export class HttpLocalAccessApi {
  constructor(private readonly http: HttpClient,
    private readonly context: () => DeviceV2AccountContext) {}

  async getContext(logicalDeviceId: string, signal: AbortSignal): Promise<LocalAccessContext> {
    signal.throwIfAborted();
    const account = this.capture();
    if (!isLocalAccessIdentifier(logicalDeviceId)) throw new Error('LOCAL_ACCESS_REQUEST_INVALID');
    const response = await firstValueFrom(this.http.get<{ status: number; data: {
      contract: string; logicalDeviceId: string; deviceInstanceId: string; permissions: number; maximumLifetimeMillis: number;
      securityProfile: number;
    } }>(API.DEVICE_V2.LOCAL_ACCESS(logicalDeviceId), { observe: 'response' })
      .pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))))
      .catch(error => this.reject(error, signal, account));
    signal.throwIfAborted(); this.assertAccount(account);
    const value = response.body?.data;
    if (response.status !== 200 || response.body?.status !== 200 || !value
      || value.contract !== 'local-access-context/2' || value.logicalDeviceId !== logicalDeviceId
      || (value.securityProfile !== 1 && value.securityProfile !== 2)
      || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')
      || (value.permissions !== 1 && value.permissions !== 3) || typeof value.deviceInstanceId !== 'string'
      || value.deviceInstanceId.length !== 22 || !Number.isInteger(value.maximumLifetimeMillis)
      || value.maximumLifetimeMillis < 1000 || value.maximumLifetimeMillis > 300000) throw new Error('LOCAL_ACCESS_CONTEXT_INVALID');
    const deviceInstanceId = base64UrlDecode(value.deviceInstanceId, 16);
    if (!deviceInstanceId.some(byte => byte !== 0)) throw new Error('LOCAL_ACCESS_CONTEXT_INVALID');
    return { logicalDeviceId, deviceInstanceId, securityProfile: value.securityProfile,
      permissions: value.permissions, maximumLifetimeMillis: value.maximumLifetimeMillis };
  }

  async issue(input: LocalAccessRequest, signal: AbortSignal): Promise<LocalAccessMaterial> {
    signal.throwIfAborted();
    const expectedAccount = this.capture();
    const request = { ...input, targetDeviceInstanceId: input.targetDeviceInstanceId.slice(),
      callerSessionId: input.callerSessionId.slice(), requestId: input.requestId.slice(),
      exactChallenge: input.exactChallenge.slice() };
    const challenge = decodeLocalAccessChallenge(request.exactChallenge);
    if ((request.securityProfile !== 1 && request.securityProfile !== 2)
      || challenge.securityProfile !== request.securityProfile) throw new Error('LOCAL_ACCESS_PROFILE_MISMATCH');
    if (!isLocalAccessIdentifier(request.recipientLogicalDeviceId)
      || (request.targetLogicalDeviceId !== '' && !isLocalAccessIdentifier(request.targetLogicalDeviceId))
      || !Number.isInteger(request.permissions) || request.permissions < 1 || request.permissions > 3
      || !Number.isInteger(request.lifetimeMillis) || request.lifetimeMillis < 1000 || request.lifetimeMillis > 300000
      || [request.requestId, request.callerSessionId, request.targetDeviceInstanceId]
        .some(value => value.length !== 16 || !value.some(byte => byte !== 0))) throw new Error('LOCAL_ACCESS_REQUEST_INVALID');
    const self = request.targetLogicalDeviceId === '';
    if ([request.accessEpoch, request.topologyVersion]
      .some(value => !Number.isInteger(value) || value < (self ? 0 : 1) || value > 0xffffffff)
      || (self && (request.accessEpoch !== 0 || request.topologyVersion !== 0
        || !sameLocalAccessBytes(request.targetDeviceInstanceId, challenge.recipientDeviceInstanceId)))) {
      throw new Error('LOCAL_ACCESS_REQUEST_INVALID');
    }
    let sessionKey: Uint8Array | undefined;
    try {
      const response = await firstValueFrom(this.http.post<Envelope>(
        API.DEVICE_V2.LOCAL_ACCESS(request.recipientLogicalDeviceId),
        { contract: 'local-access/2', requestId: base64UrlEncode(request.requestId), callerSessionId: base64UrlEncode(request.callerSessionId),
          exactChallenge: base64UrlEncode(request.exactChallenge), targetLogicalDeviceId: request.targetLogicalDeviceId,
          permissions: request.permissions, lifetimeMillis: request.lifetimeMillis },
        { observe: 'response' },
      ).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
      signal.throwIfAborted();
      this.assertAccount(expectedAccount);
      if (response.status !== 200 || response.body?.status !== 200 || response.body.data?.contract !== 'local-access/2'
        || !Number.isInteger(response.body.data.validForMillis) || response.body.data.validForMillis <= 0
        || response.body.data.validForMillis > request.lifetimeMillis
        || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')
        || typeof response.body.data.exactGrant !== 'string' || response.body.data.exactGrant.length > 363
        || typeof response.body.data.sessionKey !== 'string' || response.body.data.sessionKey.length !== 43) {
        throw new Error('LOCAL_ACCESS_RESPONSE_INVALID');
      }
      const exactGrant = base64UrlDecode(response.body.data.exactGrant);
      const grant = decodeLocalAccessGrant(exactGrant);
      sessionKey = base64UrlDecode(response.body.data.sessionKey, 32);
      if (!sessionKey.some(byte => byte !== 0)) throw new Error('LOCAL_ACCESS_RESPONSE_INVALID');
      if (grant.securityProfile !== challenge.securityProfile
        || !sameLocalAccessBytes(grant.recipientDeviceInstanceId, challenge.recipientDeviceInstanceId)
        || grant.deviceKeyVersion !== challenge.deviceKeyVersion || grant.authorityRevision !== challenge.authorityRevision
        || !sameLocalAccessBytes(grant.receiverSessionId, challenge.receiverSessionId)
        || !sameLocalAccessBytes(grant.challenge, challenge.challenge)
        || !sameLocalAccessBytes(grant.callerSessionId, request.callerSessionId)
        || grant.targetLogicalDeviceId !== request.targetLogicalDeviceId
        || !sameLocalAccessBytes(grant.targetDeviceInstanceId, request.targetDeviceInstanceId)
        || grant.accessEpoch !== request.accessEpoch || grant.topologyVersion !== request.topologyVersion
        || grant.permissions !== request.permissions || grant.lifetimeMillis !== request.lifetimeMillis) {
        throw new Error('LOCAL_ACCESS_GRANT_MISMATCH');
      }
      const key = sessionKey;
      return { exactGrant, grant, sessionKey: key, validForMillis: response.body.data.validForMillis, clear() { key.fill(0); } };
    } catch (error) {
      sessionKey?.fill(0);
      return this.reject(error, signal, expectedAccount);
    }
  }

  private reject(error: unknown, signal: AbortSignal, account: DeviceV2AccountContext): never {
    signal.throwIfAborted(); this.assertAccount(account);
    // The production interceptor normalizes HTTP failures. Keep that detail
    // here, not in the transport connector; arbitrary lookalike errors cannot
    // trigger a new handshake.
    const status = error instanceof GatewayHttpError ? error.httpStatus
      : error instanceof HttpErrorResponse ? error.status : undefined;
    const code = error instanceof GatewayHttpError ? error.code
      : error instanceof HttpErrorResponse ? error.error?.errorCode : undefined;
    if (status === 409 && code === 'LOCAL_ACCESS_HANDOVER_REQUIRED')
      throw new LocalAccessPreparationError('handover');
    if (status === 503 && code === 'LOCAL_ACCESS_SYNC_REQUIRED')
      throw new LocalAccessPreparationError('pending');
    throw error;
  }

  private capture(): DeviceV2AccountContext {
    const account = { ...this.context() };
    if (new URL(API.BASE_URL).protocol !== 'https:' || account.authority !== API.BASE_URL
      || !account.accountId || !Number.isSafeInteger(account.sessionEpoch) || account.sessionEpoch < 0)
      throw new Error('LOCAL_ACCESS_HTTPS_ACCOUNT_REQUIRED');
    return account;
  }

  private assertAccount(expected: DeviceV2AccountContext): void {
    const current = this.context();
    if (current.accountId !== expected.accountId || current.authority !== expected.authority
      || current.sessionEpoch !== expected.sessionEpoch) throw new Error('LOCAL_ACCESS_ACCOUNT_CHANGED');
    this.capture();
  }
}
