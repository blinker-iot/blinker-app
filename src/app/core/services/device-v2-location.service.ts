import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, Observable, takeUntil, timeout } from 'rxjs';
import { API } from '../../configs/api.config';
import { DeviceLocationInput, deviceLocationInput, locationDeviceId, parseDeviceLocationRecord } from '../device-v2/device-location';
import { AilyResponse } from '../model/response.model';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';

@Injectable({ providedIn: 'root' })
export class DeviceV2LocationService {
  constructor(private readonly http: HttpClient) {}

  async read(id: string, signal: AbortSignal) {
    signal.throwIfAborted(); locationDeviceId(id);
    return parseDeviceLocationRecord(await this.response(this.http.get<AilyResponse<unknown>>(
      API.DEVICE_V2.LOCATION(id), { observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true) }), signal), id);
  }

  async save(id: string, candidate: DeviceLocationInput, signal: AbortSignal) {
    signal.throwIfAborted(); locationDeviceId(id);
    const input = deviceLocationInput(candidate);
    const record = parseDeviceLocationRecord(await this.response(this.http.put<AilyResponse<unknown>>(
      API.DEVICE_V2.LOCATION(id), input, { observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true) }), signal), id);
    if (record.revision !== input.expectedRevision + 1 || JSON.stringify(record.location) !== JSON.stringify(input.location)) {
      throw Error('DEVICE_V2_LOCATION_RESPONSE_INVALID');
    }
    return record;
  }

  private async response(request: Observable<HttpResponse<AilyResponse<unknown>>>, signal: AbortSignal) {
    const response = await firstValueFrom(request.pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    if (response.status !== 200 || response.body?.status !== 200
      || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) {
      throw Error('DEVICE_V2_LOCATION_RESPONSE_INVALID');
    }
    return response.body.data;
  }
}
