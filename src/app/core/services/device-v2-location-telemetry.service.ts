import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, Observable, takeUntil, timeout } from 'rxjs';
import { API } from '../../configs/api.config';
import { locationDeviceId } from '../device-v2/device-location';
import { DeviceLocationTelemetryLatest, DeviceLocationTelemetryLease, DeviceLocationTelemetryLeaseControl,
  deviceLocationTelemetryLeaseControl, parseDeviceLocationTelemetryLatest,
  parseDeviceLocationTelemetryLease } from '../device-v2/device-location-telemetry';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';
import { AilyResponse } from '../model/response.model';

export const DEVICE_LOCATION_HTTP_DEADLINE_MS = 15000;

/** Owner authority remains server-side. No retry, inventory refresh or manual-location mutation. */
@Injectable({ providedIn: 'root' })
export class DeviceV2LocationTelemetryService {
  constructor(private readonly http: HttpClient) {}

  async read(id: string, signal: AbortSignal): Promise<DeviceLocationTelemetryLatest> {
    signal.throwIfAborted(); locationDeviceId(id);
    const request = this.http.get<AilyResponse<unknown>>(API.DEVICE_V2.LOCATION_LATEST(id), {
      observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    });
    return parseDeviceLocationTelemetryLatest(await this.response(request, signal), id);
  }

  async control(id: string, command: DeviceLocationTelemetryLeaseControl,
    signal: AbortSignal): Promise<DeviceLocationTelemetryLease> {
    signal.throwIfAborted(); locationDeviceId(id);
    const input = deviceLocationTelemetryLeaseControl(command);
    const request = this.http.post<AilyResponse<unknown>>(API.DEVICE_V2.LOCATION_LEASE(id), input, {
      observe: 'response', context: new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true),
    });
    return parseDeviceLocationTelemetryLease(await this.response(request, signal), id, input);
  }

  private async response(request: Observable<HttpResponse<AilyResponse<unknown>>>, signal: AbortSignal) {
    const response = await firstValueFrom(request.pipe(timeout(DEVICE_LOCATION_HTTP_DEADLINE_MS),
      takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    if (response.status !== 200 || response.body?.status !== 200
      || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) {
      throw Error('DEVICE_V2_LOCATION_TELEMETRY_RESPONSE_INVALID');
    }
    return response.body.data;
  }
}
