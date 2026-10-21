import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, Observable, takeUntil, timeout } from 'rxjs';
import { API } from '../../configs/api.config';
import { parsePeriodicHistoryDetail, parsePeriodicHistoryPage, PeriodicHistoryPolicyInput, periodicHistoryPolicyInput,
  PeriodicHistoryQuery } from '../device-v2/periodic-history';
import { stateHistoryDeviceId, stateHistoryQuery } from '../device-v2/state-history';

@Injectable({ providedIn: 'root' })
export class DeviceV2PeriodicHistoryService {
  constructor(private readonly http: HttpClient) {}
  async detail(id: string, signal: AbortSignal) {
    signal.throwIfAborted(); stateHistoryDeviceId(id);
    return parsePeriodicHistoryDetail(await this.response(this.http.get<{ message: number; detail: unknown }>(
      API.DEVICE_V2.PERIODIC_HISTORY_POLICY(id), { observe: 'response' }), signal), id);
  }
  async save(id: string, input: PeriodicHistoryPolicyInput, signal: AbortSignal) {
    signal.throwIfAborted(); stateHistoryDeviceId(id); const body = periodicHistoryPolicyInput(input);
    const detail = parsePeriodicHistoryDetail(await this.response(this.http.put<{ message: number; detail: unknown }>(
      API.DEVICE_V2.PERIODIC_HISTORY_POLICY(id), body, { observe: 'response' }), signal), id);
    const policy = detail.policy;
    if (!policy || policy.revision !== body.expectedRevision + 1 || policy.enabled !== body.enabled
      || policy.manifestFingerprint !== body.manifestFingerprint || JSON.stringify([...policy.keys].sort()) !== JSON.stringify(body.keys)) {
      throw Error('PERIODIC_HISTORY_RESPONSE_INVALID');
    }
    return detail;
  }
  async read(id: string, input: PeriodicHistoryQuery, signal: AbortSignal) {
    signal.throwIfAborted(); stateHistoryDeviceId(id); const query = stateHistoryQuery(input);
    const params = new URLSearchParams({ from: String(query.from), to: String(query.to), limit: String(query.limit),
      ...(query.key ? { key: query.key } : {}), ...(query.before ? { before: query.before } : {}) });
    return parsePeriodicHistoryPage(await this.response(this.http.get<{ message: number; detail: unknown }>(
      `${API.DEVICE_V2.PERIODIC_HISTORY(id)}?${params}`, { observe: 'response' }), signal), id, query);
  }
  private async response(request: Observable<HttpResponse<{ message: number; detail: unknown }>>, signal: AbortSignal) {
    const response = await firstValueFrom(request.pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    if (response.status !== 200 || response.body?.message !== 1000
      || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) throw Error('PERIODIC_HISTORY_RESPONSE_INVALID');
    return response.body.detail;
  }
}
