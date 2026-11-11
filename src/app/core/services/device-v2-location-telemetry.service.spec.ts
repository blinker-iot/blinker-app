import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { GATEWAY_NO_AUTH_REPLAY, ServerInterceptor } from '../injectable/server.interceptor';
import { DataService } from './data.service';
import { DEVICE_LOCATION_HTTP_DEADLINE_MS, DeviceV2LocationTelemetryService } from './device-v2-location-telemetry.service';

const id = 'device_a', nonce = '3a8a013e-e225-4ff6-8fc4-6bbd1953b432';
const latestUrl = () => API.DEVICE_V2.LOCATION_LATEST(id), leaseUrl = () => API.DEVICE_V2.LOCATION_LEASE(id);
const empty = { logicalDeviceId: id, capability: null, source: 'device-gnss', coordinateSystem: 'WGS84',
  sample: null, ageMillis: null, fresh: false };
const open = { operation: 'open' as const, leaseId: nonce, intervalMs: 1000 };
const lease = { logicalDeviceId: id, leaseId: nonce, phase: 'active', intervalMs: 1000, expiresAt: 30001, leaseMs: 30000 };
const headers = { 'Cache-Control': 'private, no-store' };

describe('Private device-location real authenticated HTTP without replay', () => {
  let service: DeviceV2LocationTelemetryService, http: HttpTestingController;
  let data: { auth: any; authDataChanged: Subject<void>; replaceAuthData: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    data = { auth: { uuid: 'owner', accessToken: 'access-test', refreshToken: 'refresh-test' },
      authDataChanged: new Subject<void>(), replaceAuthData: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
      { provide: DataService, useValue: data }, { provide: NavController, useValue: { navigateRoot: vi.fn() } }] });
    service = TestBed.inject(DeviceV2LocationTelemetryService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('uses only exact protected routes with owner credentials and no-store latest', async () => {
    const promise = service.read(id, new AbortController().signal), request = http.expectOne(latestUrl());
    expect(request.request.method).toBe('GET'); expect(request.request.body).toBeNull();
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(request.request.params.has('token')).toBe(false); expect(request.request.headers.get('X-Request-ID')).toBeTruthy();
    for (const url of [latestUrl(), leaseUrl()]) { expect(isGatewayUrl(url)).toBe(true); expect(isGatewayUrl(url + '/extra')).toBe(false); }
    expect(isGatewayUrl(API.DEVICE_V2.LOCATION(id) + '/anything')).toBe(false);
    request.flush({ status: 200, data: empty }, { headers });
    await expect(promise).resolves.toEqual(empty); http.expectNone(API.DEVICE_V2.LOCATION(id));
  });
  it('sends exact open, renew and close once, and never writes the manual CAS record', async () => {
    const signal = new AbortController().signal;
    for (const operation of ['open', 'renew', 'close'] as const) {
      const command = operation === 'open' ? open : { operation, leaseId: nonce };
      const promise = service.control(id, command, signal), request = http.expectOne(leaseUrl());
      expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(command);
      expect(request.request.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
      request.flush({ status: 200, data: operation === 'close' ? { ...lease, phase: 'closed', leaseMs: 0 } : lease }, { headers });
      await expect(promise).resolves.toMatchObject({ phase: operation === 'close' ? 'closed' : 'active' });
    }
    http.expectNone(API.DEVICE_V2.LOCATION(id)); http.expectNone(API.DEVICE_V2.LIST);
  });
  it.each(['read', 'control'])('preserves 401 and does not refresh credentials or replay %s', async method => {
    const signal = new AbortController().signal;
    const promise = method === 'read' ? service.read(id, signal) : service.control(id, open, signal);
    const rejected = expect(promise).rejects.toMatchObject({ httpStatus: 401, code: 'AUTH_TOKEN_EXPIRED' });
    http.expectOne(method === 'read' ? latestUrl() : leaseUrl()).flush({ status: 401, errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' });
    await rejected; http.expectNone(API.AUTH.REFRESH); http.expectNone(() => true);
    expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(data.auth.accessToken).toBe('access-test');
  });
  it.each([
    { status: 200, body: empty, headers }, { status: 200, body: { status: 201, data: empty }, headers },
    { status: 201, body: { status: 200, data: empty }, headers },
    { status: 200, body: { status: 200, data: empty }, headers: { 'Cache-Control': 'public' } },
    { status: 200, body: { status: 200, data: { ...empty, logicalDeviceId: 'other' } }, headers },
  ])('rejects wrong response envelope, status, cache or device without retry', async candidate => {
    const promise = service.read(id, new AbortController().signal);
    const rejected = expect(promise).rejects.toThrow('DEVICE_V2_LOCATION_TELEMETRY_RESPONSE_INVALID');
    http.expectOne(latestUrl()).flush(candidate.body, { status: candidate.status, statusText: 'OK', headers: candidate.headers });
    await rejected; http.expectNone(() => true);
  });
  it('validates requests before network, cancels pending requests and does not retry or implicitly close', async () => {
    await expect(service.control(id, { ...open, intervalMs: 999 }, new AbortController().signal)).rejects.toThrow();
    const aborted = new AbortController(); aborted.abort();
    await expect(service.read(id, aborted.signal)).rejects.toThrow(); http.expectNone(() => true);
    const controller = new AbortController(), promise = service.control(id, open, controller.signal);
    const rejected = expect(promise).rejects.toThrow(), request = http.expectOne(leaseUrl());
    controller.abort(); await rejected; expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
  it('enforces a whole one-shot HTTP deadline without automatic retry', async () => {
    vi.useFakeTimers();
    const promise = service.read(id, new AbortController().signal), rejected = expect(promise).rejects.toThrow();
    const request = http.expectOne(latestUrl());
    await vi.advanceTimersByTimeAsync(DEVICE_LOCATION_HTTP_DEADLINE_MS);
    await rejected; expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
  it('rejects a lease from a different nonce without automatic reconciliation', async () => {
    const promise = service.control(id, open, new AbortController().signal);
    const rejected = expect(promise).rejects.toThrow('DEVICE_V2_LOCATION_TELEMETRY_RESPONSE_INVALID');
    http.expectOne(leaseUrl()).flush({ status: 200, data: { ...lease, leaseId: nonce.replace('3a8a', '4a8a') } }, { headers });
    await rejected; http.expectNone(() => true);
  });
});
