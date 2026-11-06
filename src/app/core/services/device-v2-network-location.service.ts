import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../configs/api.config';
import { DeviceNetworkLocation, networkLocationDeviceId, parseDeviceNetworkLocation } from '../device-v2/device-network-location';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';
import { AilyResponse } from '../model/response.model';

export const NETWORK_LOCATION_HTTP_DEADLINE_MS = 15000;

/** One explicit owner read. No authentication refresh, lease, retry or location write. */
@Injectable({ providedIn: 'root' })
export class DeviceV2NetworkLocationService {
  constructor(private readonly http: HttpClient) {}

  async read(id: string, signal: AbortSignal): Promise<DeviceNetworkLocation> {
    signal.throwIfAborted(); networkLocationDeviceId(id);
    const response = await firstValueFrom(this.http.get<AilyResponse<unknown>>(API.DEVICE_V2.LOCATION_NETWORK(id), {
      observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    }).pipe(timeout(NETWORK_LOCATION_HTTP_DEADLINE_MS), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    if (response.status !== 200 || response.body?.status !== 200
      || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) {
      throw Error('DEVICE_V2_NETWORK_LOCATION_RESPONSE_INVALID');
    }
    return parseDeviceNetworkLocation(response.body.data, id);
  }
}
