import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { ACTIVITY_MAX_AGE_MS } from '../device-v2/device-activity';
import { GATEWAY_NO_AUTH_REPLAY, ServerInterceptor } from '../injectable/server.interceptor';
import { DataService } from './data.service';
import { DeviceV2ActivityService } from './device-v2-activity.service';

const id = 'device_a', query = { from: 1000, to: 2000, limit: 20 };
const url = () => `${API.DEVICE_V2.ACTIVITY(id)}?from=1000&to=2000&limit=20`;
const detail = { logicalDeviceId: id, from: 1000, to: 2000, items: [], nextCursor: null,
  retention: { maxAgeMs: ACTIVITY_MAX_AGE_MS }, timeBasis: 'serverRecordedAt', source: 'broker-command' };
const body = () => JSON.stringify({ message: 1000, detail });
const headers = { 'Cache-Control': 'private, no-store' };

describe('Device activity real account HTTP adapter without replay', () => {
  let service: DeviceV2ActivityService, http: HttpTestingController;
  let data: { auth: any; authDataChanged: Subject<void>; replaceAuthData: ReturnType<typeof vi.fn> };
  let nav: { navigateRoot: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    data = { auth: { uuid: 'owner', accessToken: 'access-test', refreshToken: 'refresh-test' },
      authDataChanged: new Subject<void>(), replaceAuthData: vi.fn() };
    nav = { navigateRoot: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
      { provide: DataService, useValue: data }, { provide: NavController, useValue: nav }] });
    service = TestBed.inject(DeviceV2ActivityService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('uses the sole protected GET with Bearer, bounded query and an explicit no-auth-replay context', async () => {
    const promise = service.read(id, { ...query, before: 'YWJj' }, new AbortController().signal);
    const request = http.expectOne(url() + '&before=YWJj');
    expect(request.request.method).toBe('GET'); expect(request.request.body).toBeNull();
    expect(request.request.responseType).toBe('text');
    expect(request.request.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.headers.get('X-Request-ID')).toBeTruthy();
    expect(request.request.params.has('uuid')).toBe(false); expect(request.request.params.has('token')).toBe(false);
    expect(isGatewayUrl(url())).toBe(true);
    expect(isGatewayUrl(API.DEVICE_V2.ACTIVITY(id) + '/extra')).toBe(false);
    expect(isGatewayUrl(API.DEVICE_V2.ACTIVITY(id) + '-invalid')).toBe(false);
    request.flush(body(), { headers }); await expect(promise).resolves.toEqual(detail);
    http.expectNone(() => true);
  });
  it.each([401, 403, 404, 503])('keeps HTTP %s a failure, never empty data, refresh or retry', async status => {
    const promise = service.read(id, query, new AbortController().signal);
    const rejected = expect(promise).rejects.toMatchObject({ httpStatus: status });
    http.expectOne(url()).flush(JSON.stringify({ errorCode: `ACTIVITY_${status}`, errorMessage: 'Unavailable' }),
      { status, statusText: 'Rejected' });
    await rejected; http.expectNone(() => true);
    expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(nav.navigateRoot).not.toHaveBeenCalled();
    expect(data.auth.accessToken).toBe('access-test');
  });
  it.each([
    { body: body(), status: 201, cache: 'private, no-store' },
    { body: JSON.stringify(detail), status: 200, cache: 'private, no-store' },
    { body: JSON.stringify({ message: 1001, detail }), status: 200, cache: 'private, no-store' },
    { body: JSON.stringify({ message: 1000, detail, token: 'private' }), status: 200, cache: 'private, no-store' },
    { body: '{', status: 200, cache: 'private, no-store' },
    { body: body(), status: 200, cache: 'no-store' },
    { body: body(), status: 200, cache: 'private' },
    { body: body(), status: 200, cache: 'public, no-store' },
    { body: body(), status: 200, cache: 'private, no-store, max-age=60' },
    { body: JSON.stringify({ message: 1000, detail: { ...detail, logicalDeviceId: 'other' } }), status: 200, cache: 'private, no-store' },
  ])('rejects wrong envelopes/status/target/cache without reconciliation %j', async candidate => {
    const promise = service.read(id, query, new AbortController().signal);
    const rejected = expect(promise).rejects.toThrow('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
    http.expectOne(url()).flush(candidate.body, { status: candidate.status, statusText: 'OK', headers: { 'Cache-Control': candidate.cache } });
    await rejected; http.expectNone(() => true);
  });
  it('checks the 64 KiB UTF-8 byte boundary before parsing instead of counting UTF-16 characters', async () => {
    const valid = body(), exact = valid + ' '.repeat(65536 - new TextEncoder().encode(valid).length);
    const first = service.read(id, query, new AbortController().signal);
    http.expectOne(url()).flush(exact, { headers }); await expect(first).resolves.toEqual(detail);
    for (const candidate of [exact + ' ', valid + '温'.repeat(22000)]) {
      expect(new TextEncoder().encode(candidate).length).toBeGreaterThan(65536);
      const promise = service.read(id, query, new AbortController().signal);
      const rejected = expect(promise).rejects.toThrow('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
      http.expectOne(url()).flush(candidate, { headers }); await rejected;
    }
    http.expectNone(() => true);
  });
  it('validates aborted and invalid input before sending any HTTP request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(service.read(id, query, controller.signal)).rejects.toThrow();
    await expect(service.read(id, { ...query, limit: 51 }, new AbortController().signal)).rejects.toThrow();
    await expect(service.read('../other', query, new AbortController().signal)).rejects.toThrow();
    http.expectNone(() => true);
  });
  it('unsubscribes the actual pending backend request on cancellation without issuing a replacement', async () => {
    const controller = new AbortController(), promise = service.read(id, query, controller.signal);
    const rejected = expect(promise).rejects.toThrow(), request = http.expectOne(url());
    controller.abort(); await rejected; expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
  it('unsubscribes at the existing fifteen-second client deadline without automatic retry', async () => {
    vi.useFakeTimers();
    const promise = service.read(id, query, new AbortController().signal);
    const rejected = expect(promise).rejects.toThrow(), request = http.expectOne(url());
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
});
