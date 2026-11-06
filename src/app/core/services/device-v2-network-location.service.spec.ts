import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { NETWORK_LOCATION_ATTRIBUTION } from '../device-v2/device-network-location';
import { GATEWAY_NO_AUTH_REPLAY, ServerInterceptor } from '../injectable/server.interceptor';
import { DataService } from './data.service';
import { DeviceV2NetworkLocationService, NETWORK_LOCATION_HTTP_DEADLINE_MS } from './device-v2-network-location.service';

const id = 'device_a', url = () => API.DEVICE_V2.LOCATION_NETWORK(id);
const empty = { logicalDeviceId: id, source: 'network-ip', status: 'unknown', region: null,
  observedAt: null, queriedAt: 1000, dataVersion: null, attribution: NETWORK_LOCATION_ATTRIBUTION,
  coordinateSystem: null, coordinates: null };
const headers = { 'Cache-Control': 'private, no-store' };

describe('Network reference one-shot authenticated HTTP without replay', () => {
  let service: DeviceV2NetworkLocationService, http: HttpTestingController;
  let data: { auth: any; authDataChanged: Subject<void>; replaceAuthData: ReturnType<typeof vi.fn> };
  let nav: { navigateRoot: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    data = { auth: { uuid: 'owner', accessToken: 'access-test', refreshToken: 'refresh-test' },
      authDataChanged: new Subject<void>(), replaceAuthData: vi.fn() };
    nav = { navigateRoot: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
      { provide: DataService, useValue: data }, { provide: NavController, useValue: nav }] });
    service = TestBed.inject(DeviceV2NetworkLocationService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('uses only the exact owner GET with the existing Bearer chain, no query or body', async () => {
    const promise = service.read(id, new AbortController().signal), request = http.expectOne(url());
    expect(request.request.method).toBe('GET'); expect(request.request.body).toBeNull();
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.headers.get('X-Request-ID')).toBeTruthy();
    expect(request.request.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(isGatewayUrl(url())).toBe(true);
    for (const suffix of ['/extra', '?ip=8.8.8.8', '#fragment', '/']) expect(isGatewayUrl(url() + suffix)).toBe(false);
    expect(isGatewayUrl(API.DEVICE_V2.LOCATION_NETWORK('a/b'))).toBe(false);
    expect(isGatewayUrl(API.DEVICE_V2.LOCATION(id) + '/anything')).toBe(false);
    request.flush({ status: 200, data: empty }, { headers });
    await expect(promise).resolves.toEqual(empty);
    http.expectNone(API.DEVICE_V2.LOCATION(id)); http.expectNone(API.DEVICE_V2.LOCATION_LATEST(id));
    http.expectNone(API.DEVICE_V2.LOCATION_LEASE(id)); http.expectNone(API.DEVICE_V2.LIST);
  });
  it.each([
    [401, 'AUTH_TOKEN_EXPIRED'], [403, 'DEVICE_V2_NETWORK_LOCATION_ACCESS_CHANGED'],
    [429, 'RATE_LIMIT_EXCEEDED'], [503, 'DEVICE_V2_NETWORK_LOCATION_UNAVAILABLE'],
  ])('preserves HTTP %s and never refreshes auth, replays, reconciles or changes accounts', async (status, code) => {
    const promise = service.read(id, new AbortController().signal);
    const rejected = expect(promise).rejects.toMatchObject({ httpStatus: status, code });
    http.expectOne(url()).flush({ status, errorCode: code }, { status: Number(status), statusText: 'Rejected' });
    await rejected; http.expectNone(API.AUTH.REFRESH); http.expectNone(() => true);
    expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(nav.navigateRoot).not.toHaveBeenCalled();
    expect(data.auth.accessToken).toBe('access-test');
  });
  it.each([
    { status: 200, body: empty, headers },
    { status: 200, body: { status: 201, data: empty }, headers },
    { status: 201, body: { status: 200, data: empty }, headers },
    { status: 200, body: { status: 200, data: empty }, headers: { 'Cache-Control': 'public' } },
    { status: 200, body: { status: 200, data: { ...empty, logicalDeviceId: 'other' } }, headers },
    { status: 200, body: { status: 200, data: { ...empty, rawIp: '8.8.8.8' } }, headers },
  ])('rejects invalid envelope/cache/projection without follow-up %#', async candidate => {
    const promise = service.read(id, new AbortController().signal);
    const rejected = expect(promise).rejects.toThrow('DEVICE_V2_NETWORK_LOCATION_RESPONSE_INVALID');
    http.expectOne(url()).flush(candidate.body, { status: candidate.status, statusText: 'OK', headers: candidate.headers });
    await rejected; http.expectNone(() => true);
  });
  it('validates before HTTP and cancels a pending read without background work', async () => {
    await expect(service.read('a/b', new AbortController().signal)).rejects.toThrow();
    const aborted = new AbortController(); aborted.abort();
    await expect(service.read(id, aborted.signal)).rejects.toThrow(); http.expectNone(() => true);
    const controller = new AbortController(), promise = service.read(id, controller.signal);
    const rejected = expect(promise).rejects.toThrow(), request = http.expectOne(url());
    controller.abort(); await rejected; expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
  it('enforces one whole request deadline, never retrying the timed-out read', async () => {
    vi.useFakeTimers();
    const promise = service.read(id, new AbortController().signal), rejected = expect(promise).rejects.toThrow();
    const request = http.expectOne(url());
    await vi.advanceTimersByTimeAsync(NETWORK_LOCATION_HTTP_DEADLINE_MS);
    await rejected; expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
});
