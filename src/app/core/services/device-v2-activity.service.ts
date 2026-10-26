import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../configs/api.config';
import { ActivityQuery, activityDeviceId, activityQuery, parseActivityPage } from '../device-v2/device-activity';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';

@Injectable({ providedIn: 'root' })
export class DeviceV2ActivityService {
  constructor(private readonly http: HttpClient) {}

  async read(logicalDeviceId: string, input: ActivityQuery, signal: AbortSignal) {
    signal.throwIfAborted(); activityDeviceId(logicalDeviceId);
    const query = activityQuery(input);
    const params = new URLSearchParams({ from: String(query.from), to: String(query.to), limit: String(query.limit),
      ...(query.before === undefined ? {} : { before: query.before }) });
    const response = await firstValueFrom(this.http.get(`${API.DEVICE_V2.ACTIVITY(logicalDeviceId)}?${params}`, {
      observe: 'response', responseType: 'text', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    }).pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    const cache = (response.headers.get('Cache-Control') ?? '').toLowerCase().split(',').map(part => part.trim());
    if (response.status !== 200 || cache.length !== 2 || !cache.includes('private') || !cache.includes('no-store')
      || typeof response.body !== 'string' || new TextEncoder().encode(response.body).length > 64 * 1024) {
      throw Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
    }
    let envelope: unknown;
    try { envelope = JSON.parse(response.body); } catch { throw Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID'); }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
      || Object.keys(envelope).length !== 2 || !Object.hasOwn(envelope, 'detail')
      || !Object.hasOwn(envelope, 'message') || envelope['message'] !== 1000) {
      throw Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
    }
    return parseActivityPage(envelope['detail'], logicalDeviceId, query);
  }
}
