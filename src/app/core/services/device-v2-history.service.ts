import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';
import { API } from '../../configs/api.config';
import { StateHistoryQuery, parseStateHistoryPage, stateHistoryDeviceId, stateHistoryQuery } from '../device-v2/state-history';

@Injectable({ providedIn: 'root' })
export class DeviceV2HistoryService {
  constructor(private readonly http: HttpClient) {}
  async read(logicalDeviceId: string, input: StateHistoryQuery, signal: AbortSignal) {
    signal.throwIfAborted(); stateHistoryDeviceId(logicalDeviceId);
    const query = stateHistoryQuery(input);
    const params = new URLSearchParams({ from: String(query.from), to: String(query.to), limit: String(query.limit),
      ...(query.key ? { key: query.key } : {}), ...(query.before ? { before: query.before } : {}) });
    const response = await firstValueFrom(this.http.get<{ message: number; detail: unknown }>(
      `${API.DEVICE_V2.STATE_HISTORY(logicalDeviceId)}?${params}`, { observe: 'response' })
      .pipe(timeout(15000), takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    if (response.status !== 200 || response.body?.message !== 1000
      || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) {
      throw Error('STATE_HISTORY_RESPONSE_INVALID');
    }
    return parseStateHistoryPage(response.body.detail, logicalDeviceId, query);
  }
}
