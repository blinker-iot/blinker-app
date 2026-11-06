import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../../configs/api.config';
import { GATEWAY_NO_AUTH_REPLAY } from '../../injectable/server.interceptor';
import { AccessRegistrationIntent, AccessRegistrationRootContext,
  accessRegistrationRootJson, accessRegistrationRootTuple,
  validateAccessRegistrationIntent, validateAccessRegistrationRoot } from './access-registration-contract';
import { base64UrlDecode } from './wire';

export interface AccessRegistrationRequest {
  requestId: string;
  sourceLogicalDeviceId: string;
  targetProduct: 'ble_direct';
  name: string;
  expectedRoot: AccessRegistrationRootContext;
}
export interface AccessRegistrationApi {
  prepare(request: AccessRegistrationRequest, signal: AbortSignal): Promise<AccessRegistrationIntent>;
  read(intentId: string, signal: AbortSignal): Promise<AccessRegistrationIntent>;
  commit(intent: AccessRegistrationIntent, commitId: string, confirmationDigest: string, signal: AbortSignal): Promise<AccessRegistrationIntent>;
  cancel(intentId: string, signal: AbortSignal): Promise<AccessRegistrationIntent>;
}

export class HttpAccessRegistrationApi implements AccessRegistrationApi {
  constructor(private readonly http: HttpClient) {}
  async prepare(request: AccessRegistrationRequest, signal: AbortSignal): Promise<AccessRegistrationIntent> {
    nonzero(request.requestId, 16); validateAccessRegistrationRoot(request.expectedRoot);
    if (request.targetProduct !== 'ble_direct' || !request.name.trim() || request.name.trim() !== request.name)
      throw Error('ACCESS_REGISTRATION_REQUEST_INVALID');
    const value = await this.request('POST', API.DEVICE_V2.ACCESS_REGISTRATION_INTENTS, {
      requestId: request.requestId, sourceLogicalDeviceId: request.sourceLogicalDeviceId,
      targetProduct: request.targetProduct, name: request.name, expectedRoot: accessRegistrationRootJson(request.expectedRoot),
    }, signal);
    if (value.intentId !== request.requestId || value.sourceLogicalDeviceId !== request.sourceLogicalDeviceId
      || JSON.stringify(accessRegistrationRootTuple(value.expectedRoot)) !== JSON.stringify(accessRegistrationRootTuple(request.expectedRoot))) throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
    return value;
  }
  async read(intentId: string, signal: AbortSignal): Promise<AccessRegistrationIntent> {
    nonzero(intentId, 16);
    const value = await this.request('GET', API.DEVICE_V2.ACCESS_REGISTRATION_INTENT(intentId), undefined, signal);
    if (value.intentId !== intentId) throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
    return value;
  }
  async commit(intent: AccessRegistrationIntent, commitId: string, confirmationDigest: string, signal: AbortSignal): Promise<AccessRegistrationIntent> {
    validateAccessRegistrationIntent(intent); nonzero(commitId, 16); nonzero(confirmationDigest, 32);
    const value = await this.request('POST', API.DEVICE_V2.ACCESS_REGISTRATION_COMMIT(intent.intentId),
      { commitId, method2Confirmed: true, clientNonce: intent.clientNonce, confirmationDigest }, signal);
    if (!sameIntent(intent, value) || value.state !== 'committed') throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
    return value;
  }
  async cancel(intentId: string, signal: AbortSignal): Promise<AccessRegistrationIntent> {
    nonzero(intentId, 16);
    const value = await this.request('POST', API.DEVICE_V2.ACCESS_REGISTRATION_CANCEL(intentId), {}, signal);
    if (value.intentId !== intentId || !['cancelled', 'expired', 'invalidated'].includes(value.state))
      throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
    return value;
  }
  private async request(method: 'GET' | 'POST', url: string, body: unknown, signal: AbortSignal): Promise<AccessRegistrationIntent> {
    check(signal);
    const response = await firstValueFrom(this.http.request<{ status: number; data: AccessRegistrationIntent }>(method, url, {
      body, observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    }).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    check(signal);
    if (![200, 201].includes(response.status) || response.body?.status !== response.status
      || !response.headers.get('Cache-Control')?.toLowerCase().split(',').some(value => value.trim() === 'no-store'))
      throw Error('ACCESS_REGISTRATION_RESPONSE_INVALID');
    validateAccessRegistrationIntent(response.body.data);
    return response.body.data;
  }
}

export function sameIntent(expected: AccessRegistrationIntent, actual: AccessRegistrationIntent): boolean {
  return expected.intentId === actual.intentId && expected.sourceLogicalDeviceId === actual.sourceLogicalDeviceId
    && expected.targetLogicalDeviceId === actual.targetLogicalDeviceId && expected.rootBindingId === actual.rootBindingId
    && expected.bindingRevision === actual.bindingRevision && expected.clientNonce === actual.clientNonce
    && expected.registrationProduct === actual.registrationProduct
    && JSON.stringify(accessRegistrationRootTuple(expected.expectedRoot)) === JSON.stringify(accessRegistrationRootTuple(actual.expectedRoot));
}
function nonzero(value: string, length: number): void {
  if (!base64UrlDecode(value, length).some(Boolean)) throw Error('ACCESS_REGISTRATION_REQUEST_INVALID');
}
function check(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? Error('ACCESS_REGISTRATION_CANCELLED');
}
