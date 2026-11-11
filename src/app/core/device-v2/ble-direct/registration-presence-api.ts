import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../../configs/api.config';
import { isLogicalDeviceReferenceId } from '../../protocol/device-v2/logical-device-reference';
import { GATEWAY_NO_AUTH_REPLAY } from '../../injectable/server.interceptor';
import { RegistrationPresenceBinding, RegistrationPresenceReadError, validateRegistrationPresenceBinding } from './registration-presence-contract';

export class HttpRegistrationPresenceApi {
  constructor(private readonly http: HttpClient) {}
  async read(logicalDeviceId: string, signal: AbortSignal): Promise<RegistrationPresenceBinding> {
    signal.throwIfAborted();
    if (!isLogicalDeviceReferenceId(logicalDeviceId)) throw new RegistrationPresenceReadError('schema');
    const response = await firstValueFrom(this.http.get<{ status: number; data: RegistrationPresenceBinding }>(
      API.DEVICE_V2.ACCESS_REGISTRATION_PRESENCE(logicalDeviceId),
      { observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true) },
    ).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    if (response.status !== 200) throw new RegistrationPresenceReadError('response');
    if (response.body?.status !== 200 || response.body.data?.logicalDeviceId !== logicalDeviceId)
      throw new RegistrationPresenceReadError('envelope');
    if (!response.headers.get('Cache-Control')?.toLowerCase().split(',').some(value => value.trim() === 'no-store'))
      throw new RegistrationPresenceReadError('no-store');
    let value: RegistrationPresenceBinding;
    try { value = await validateRegistrationPresenceBinding(response.body.data); }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof RegistrationPresenceReadError) throw error;
      throw new RegistrationPresenceReadError('validation');
    }
    signal.throwIfAborted(); return value;
  }
}
