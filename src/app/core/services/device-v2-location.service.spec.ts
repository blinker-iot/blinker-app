import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { ServerInterceptor } from '../injectable/server.interceptor';
import { DataService } from './data.service';
import { DeviceV2LocationService } from './device-v2-location.service';

const id = 'device_a', url = () => API.DEVICE_V2.LOCATION(id);
const location = { longitude: 0, latitude: 0, coordinateSystem: 'WGS84' as const, source: 'manual' as const };
const empty = { logicalDeviceId: id, revision: 0, location: null, updatedAt: null };
describe('Device location real authenticated HTTP chain without automatic replay', () => {
  let service: DeviceV2LocationService, http: HttpTestingController;
  let data: { auth: any; authDataChanged: Subject<void>; replaceAuthData: ReturnType<typeof vi.fn> };
  let nav: { navigateRoot: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    data = { auth: { uuid: 'owner', accessToken: 'access-test', refreshToken: 'refresh-test' },
      authDataChanged: new Subject<void>(), replaceAuthData: vi.fn() };
    nav = { navigateRoot: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
      { provide: DataService, useValue: data }, { provide: NavController, useValue: nav }] });
    service = TestBed.inject(DeviceV2LocationService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('uses the exact protected route and validates a single Aily data envelope with no-store', async () => {
    const promise = service.read(id, new AbortController().signal);
    const request = http.expectOne(url());
    expect(request.request.method).toBe('GET'); expect(request.request.body).toBeNull();
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.headers.get('X-Request-ID')).toBeTruthy();
    expect(request.request.params.has('uuid')).toBe(false); expect(request.request.params.has('token')).toBe(false);
    expect(isGatewayUrl(url())).toBe(true); expect(isGatewayUrl(url() + '/extra')).toBe(false);
    request.flush({ status: 200, data: empty }, { headers: { 'Cache-Control': 'private, no-store' } });
    await expect(promise).resolves.toEqual(empty);
  });
  it('sends exact one-shot CAS set and clear, validates their real revisions and does not refresh inventories', async () => {
    const signal = new AbortController().signal;
    const saved = { ...empty, revision: 1, location, updatedAt: 1000 };
    const first = service.save(id, { expectedRevision: 0, location }, signal);
    const set = http.expectOne(url()); expect(set.request.method).toBe('PUT');
    expect(set.request.body).toEqual({ expectedRevision: 0, location });
    set.flush({ status: 200, data: saved }, { headers: { 'Cache-Control': 'no-store' } });
    await expect(first).resolves.toEqual(saved);
    const second = service.save(id, { expectedRevision: 1, location: null }, signal);
    const clear = http.expectOne(url()); expect(clear.request.method).toBe('PUT');
    expect(clear.request.body).toEqual({ expectedRevision: 1, location: null });
    clear.flush({ status: 200, data: { ...empty, revision: 2, updatedAt: 2000 } }, { headers: { 'Cache-Control': 'no-store' } });
    await expect(second).resolves.toMatchObject({ revision: 2, location: null });
    http.expectNone(() => true);
  });
  it.each(['GET', 'PUT'])('does not refresh credentials or replay a %s after 401 while preserving error classification', async method => {
    const signal = new AbortController().signal;
    const promise = method === 'GET' ? service.read(id, signal) : service.save(id, { expectedRevision: 0, location }, signal);
    const rejected = expect(promise).rejects.toMatchObject({ httpStatus: 401, code: 'AUTH_TOKEN_EXPIRED' });
    const request = http.expectOne(url()); expect(request.request.method).toBe(method);
    request.flush({ status: 401, errorCode: 'AUTH_TOKEN_EXPIRED', errorMessage: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    http.expectNone(API.AUTH.REFRESH); http.expectNone(url());
    expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(nav.navigateRoot).not.toHaveBeenCalled();
    expect(data.auth.accessToken).toBe('access-test');
  });
  it.each([
    { body: empty, cache: 'no-store', status: 200 },
    { body: { status: 200, data: empty }, cache: 'public', status: 200 },
    { body: { status: 201, data: empty }, cache: 'no-store', status: 200 },
    { body: { status: 200, data: empty }, cache: 'no-store', status: 201 },
  ])('rejects a wrong envelope/status/cache contract %j', async candidate => {
    const promise = service.read(id, new AbortController().signal), rejected = expect(promise).rejects.toThrow('DEVICE_V2_LOCATION_RESPONSE_INVALID');
    http.expectOne(url()).flush(candidate.body, { status: candidate.status, statusText: 'OK', headers: { 'Cache-Control': candidate.cache } });
    await rejected;
  });
  it('does not accept a mismatched confirmation or perform an automatic reconciliation request', async () => {
    const promise = service.save(id, { expectedRevision: 0, location }, new AbortController().signal);
    const rejected = expect(promise).rejects.toThrow('DEVICE_V2_LOCATION_RESPONSE_INVALID');
    http.expectOne(url()).flush({ status: 200, data: { ...empty, revision: 2, location, updatedAt: 1 } }, { headers: { 'Cache-Control': 'no-store' } });
    await rejected; http.expectNone(() => true);
  });
  it('rejects invalid requests before HTTP and cancels a pending read without retry', async () => {
    const signal = new AbortController().signal;
    await expect(service.save(id, { expectedRevision: -1, location }, signal)).rejects.toThrow();
    http.expectNone(() => true);
    const controller = new AbortController(), promise = service.read(id, controller.signal);
    const rejected = expect(promise).rejects.toThrow(); const request = http.expectOne(url());
    controller.abort(); await rejected; expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
});
