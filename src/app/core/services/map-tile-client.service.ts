import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, merge, Observable, Subscription, takeUntil, timeout, TimeoutError } from 'rxjs';
import { API } from '../../configs/api.config';
import { getServiceRegion } from '../../configs/service-region.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext, DeviceV2AccountContext } from '../device-v2/account-scope';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';
import { MANAGED_MAP_LIMITS, ManagedMapConfig, ManagedMapError, ManagedMapSession,
  parseManagedMapConfig, validManagedTile } from '../maps/managed-map';
import { GatewayHttpError } from '../model/response.model';
import { AppVisibilityService } from './app-visibility.service';
import { DataService } from './data.service';

function failure(error: unknown): ManagedMapError {
  if (error instanceof ManagedMapError) return error;
  if (error instanceof TimeoutError) return new ManagedMapError('timeout');
  if (error instanceof GatewayHttpError) {
    if (error.httpStatus === 401) return new ManagedMapError('auth');
    if (error.httpStatus === 403) return new ManagedMapError('forbidden');
    if (error.httpStatus === 429) {
      const retry = error.retryAfterSeconds;
      return new ManagedMapError('limit', Number.isInteger(retry) && retry! >= 1 && retry! <= 86400 ? retry : undefined);
    }
    if (error.httpStatus === 504 || error.code === 'GATEWAY_TIMEOUT') return new ManagedMapError('timeout');
    if (error.httpStatus === 400) return new ManagedMapError('invalid');
  }
  return new ManagedMapError('unavailable');
}

@Injectable({ providedIn: 'root' })
export class MapTileClientService {
  constructor(private readonly http: HttpClient, private readonly data: DataService,
    private readonly visibility: AppVisibilityService) {}

  createSession(): ManagedMapSession {
    if (!this.data.auth?.uuid || typeof this.data.auth.accessToken !== 'string' || !this.data.auth.accessToken.trim()) {
      throw new ManagedMapError('auth');
    }
    if (!this.visibility.active.value) throw new ManagedMapError('cancelled');
    let account: DeviceV2AccountContext;
    try { account = captureDeviceV2AccountContext(this.data, API.BASE_URL); }
    catch { throw new ManagedMapError('auth'); }
    let region: ReturnType<typeof getServiceRegion>;
    try { region = getServiceRegion(); } catch { throw new ManagedMapError('unavailable'); }
    const controller = new AbortController(), subscriptions = new Subscription();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true; controller.abort(); subscriptions.unsubscribe();
    };
    const current = () => {
      if (closed) return false;
      try {
        if (!this.visibility.active.value || !this.data.auth?.uuid || !this.data.auth.accessToken?.trim()
          || API.BASE_URL !== account.authority || getServiceRegion() !== region) throw Error();
        assertDeviceV2AccountContext(this.data, account);
        return true;
      } catch { close(); return false; }
    };
    const assertCurrent = () => { if (!current()) throw new ManagedMapError('cancelled'); };
    const assertRequest = (signal: AbortSignal) => {
      assertCurrent();
      if (signal.aborted) throw new ManagedMapError('cancelled');
    };
    subscriptions.add(this.data.authDataChanged.subscribe(current));
    subscriptions.add(this.visibility.active.subscribe(active => { if (!active) close(); }));

    const request = async <T>(signal: AbortSignal, make: () => Observable<HttpResponse<T>>) => {
      assertRequest(signal);
      try {
        // takeUntil actually unsubscribes the existing XHR backend. No separate
        // native HTTP path, retry, refresh or token in a tile URL is needed.
        const response = await firstValueFrom(make().pipe(
          timeout(MANAGED_MAP_LIMITS.deadlineMs),
          takeUntil(merge(fromEvent(signal, 'abort'), fromEvent(controller.signal, 'abort'))),
        ));
        assertRequest(signal);
        if (response.status !== 200 || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) {
          throw new ManagedMapError('invalid');
        }
        return response;
      } catch (error) {
        if (!current() || signal.aborted) throw new ManagedMapError('cancelled');
        throw failure(error);
      }
    };
    const context = () => new HttpContext().set(GATEWAY_NO_AUTH_REPLAY, true);
    const thisHttp = this.http;
    return Object.freeze({
      async loadConfig(signal: AbortSignal): Promise<ManagedMapConfig> {
        const response = await request(signal, () => thisHttp.get<unknown>(API.MAPS.CONFIG,
          { observe: 'response', context: context() }));
        assertRequest(signal);
        const body = response.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'data') || !('data' in body)
          || !Object.hasOwn(body, 'status') || !('status' in body) || body.status !== 200) {
          throw new ManagedMapError('invalid');
        }
        return parseManagedMapConfig(body.data);
      },
      async getTile(layer, coords, signal): Promise<Blob> {
        assertCurrent();
        if (!validManagedTile(layer, coords)) throw new ManagedMapError('invalid');
        const response = await request(signal, () => thisHttp.get(API.MAPS.TILE(layer, coords.z, coords.x, coords.y),
          { observe: 'response', responseType: 'blob', context: context() }));
        assertRequest(signal);
        const blob = response.body, mime = response.headers.get('Content-Type')?.trim().toLowerCase();
        if (!(blob instanceof Blob) || !blob.size || blob.size > MANAGED_MAP_LIMITS.tileBytes
          || (mime !== 'image/png' && mime !== 'image/jpeg') || blob.type.toLowerCase() !== mime) {
          throw new ManagedMapError('invalid');
        }
        return blob;
      },
      current, close,
    } satisfies ManagedMapSession);
  }
}
