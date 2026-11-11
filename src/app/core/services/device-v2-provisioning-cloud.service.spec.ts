import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { DeviceV2ManagementService } from './device-v2-management.service';
import { API, isGatewayUrl } from '../../configs/api.config';
import { base64UrlEncode } from '../device-v2/ble-direct/wire';
import { GATEWAY_NO_AUTH_REPLAY, ServerInterceptor } from '../injectable/server.interceptor';
import { DataService } from './data.service';

describe('WiFiProv one-shot owner Cloud observation', () => {
  const id = 'device_11111111-1111-4111-8111-111111111111';
  const instance = new Uint8Array(16).fill(2), instanceId = base64UrlEncode(instance);
  const context = { logicalDeviceId: id, credentialVersion: 1, locator: base64UrlEncode(new Uint8Array(16).fill(1)) };
  const device = { ...context, tenantId: 'owner-tenant', name: 'Device', deviceType: 'diy',
    state: 'active', cloudEnabled: true, createdAt: 800, updatedAt: 900 };
  const resultDevice = { ...context, state: 'active', cloudEnabled: true };
  const observation = { kind: 'online', observedAt: 1300, deviceInstanceId: instanceId, issuedAt: 1000, stateUpdatedAt: 1200 };
  const headers = { 'Cache-Control': 'private, no-store' };
  const url = () => API.DEVICE_V2.RESOLVE_INSTANCE;
  let service: DeviceV2ManagementService, http: HttpTestingController;
  let data: { auth: any; authDataChanged: Subject<void>; replaceAuthData: ReturnType<typeof vi.fn> };
  let nav: { navigateRoot: ReturnType<typeof vi.fn> };
  const read = (signal = new AbortController().signal) => service.readProvisioningCloudV2(instance, context, signal);
  const envelope = (patch: object = {}) => ({ status: 200, data: { device, observation, ...patch } });

  beforeEach(() => {
    data = { auth: { uuid: 'owner', accessToken: 'access-test', refreshToken: 'refresh-test' },
      authDataChanged: new Subject<void>(), replaceAuthData: vi.fn() };
    nav = { navigateRoot: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
      { provide: DataService, useValue: data }, { provide: NavController, useValue: nav }] });
    service = TestBed.inject(DeviceV2ManagementService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('uses only the tagged resolve variant and projects non-secret evidence', async () => {
    const promise = read(), request = http.expectOne(url());
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ deviceInstanceId: instanceId, expectedContext: context });
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.headers.get('X-Blinker-Contract')).toBe('provisioning-cloud-v1');
    expect(request.request.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(isGatewayUrl(url())).toBe(true);
    request.flush(envelope({ device: { ...device, deviceKey: 'never-return', controllerSecret: 'never-return', cloudReachable: true } }), { headers });
    await expect(promise).resolves.toEqual({ device: resultDevice, observation });
    http.expectNone(() => true);
  });

  it('retains explicit non-online observations without promoting them or inventing a session', async () => {
    for (const kind of ['unconfirmed', 'unavailable']) {
      const proof = { kind, observedAt: 1300, deviceInstanceId: null, issuedAt: null, stateUpdatedAt: null };
      const promise = read();
      http.expectOne(url()).flush(envelope({ observation: proof }), { headers });
      await expect(promise).resolves.toEqual({ device: resultDevice, observation: proof });
    }
    http.expectNone(() => true);
  });

  it('snapshots instance and context before await and never sends extra credential fields', async () => {
    const input = instance.slice(), expected = { ...context, deviceKey: 'never-send', controllerSecret: 'never-send' };
    const promise = service.readProvisioningCloudV2(input, expected, new AbortController().signal);
    input.fill(0); expected.locator = 'changed'; expected.credentialVersion = 2;
    const request = http.expectOne(url());
    expect(request.request.body).toEqual({ deviceInstanceId: instanceId, expectedContext: context });
    request.flush(envelope(), { headers });
    await expect(promise).resolves.toEqual({ device: resultDevice, observation });
  });

  it('requires the exact active owner context and instance before accepting online evidence', async () => {
    for (const patch of [{ device: null }, { device: { ...device, logicalDeviceId: id + '-other' } },
      { device: { ...device, credentialVersion: 2 } },
      { device: { ...device, locator: base64UrlEncode(new Uint8Array(16).fill(9)) } },
      { device: { ...device, state: 'deleted' } }, { device: { ...device, cloudEnabled: false } },
      { observation: { ...observation, deviceInstanceId: base64UrlEncode(new Uint8Array(16).fill(3)) } },
      { observation: { ...observation, deviceInstanceId: null } },
    ]) {
      const promise = read(), rejected = expect(promise).rejects.toThrow();
      http.expectOne(url()).flush(envelope(patch), { headers });
      await rejected; http.expectNone(() => true);
    }
  });

  it('refuses malformed observations, unknown fields and impossible time order without retry', async () => {
    for (const patch of [
      { kind: 'ready' }, { kind: true }, { observedAt: 0 }, { observedAt: 1.5 }, { observedAt: '1300' },
      { issuedAt: null }, { stateUpdatedAt: null }, { issuedAt: -1 }, { issuedAt: 1400 },
      { stateUpdatedAt: 1400 }, { stateUpdatedAt: 999 },
      { deviceInstanceId: instanceId + '==' }, { deviceInstanceId: base64UrlEncode(new Uint8Array(16)) },
      { sessionToken: 'never-accept' },
    ]) {
      const promise = read(), rejected = expect(promise).rejects.toThrow();
      http.expectOne(url()).flush(envelope({ observation: { ...observation, ...patch } }), { headers });
      await rejected; http.expectNone(() => true);
    }
  });

  it('fails closed against an old resolve response or a missing freshness contract', async () => {
    for (const candidate of [
      { status: 200, body: { status: 200, data: { device } }, cache: 'no-store' },
      { status: 200, body: envelope(), cache: 'private, max-age=0' },
      { status: 200, body: envelope(), cache: '' },
      { status: 201, body: { ...envelope(), status: 201 }, cache: 'no-store' },
      { status: 200, body: { ...envelope(), status: 201 }, cache: 'no-store' },
      { status: 200, body: { status: 200, data: null }, cache: 'no-store' },
    ]) {
      const promise = read(), rejected = expect(promise).rejects.toThrow();
      http.expectOne(url()).flush(candidate.body, { status: candidate.status, statusText: 'OK',
        headers: { 'Cache-Control': candidate.cache } });
      await rejected; http.expectNone(() => true);
    }
  });

  it('rejects invalid inputs and already aborted reads before HTTP without throwIfAborted', async () => {
    for (const input of [new Uint8Array(15).fill(1), new Uint8Array(16), null])
      await expect(service.readProvisioningCloudV2(input as any, context, new AbortController().signal)).rejects.toThrow();
    for (const patch of [{ logicalDeviceId: 'a/b' }, { credentialVersion: 0 }, { credentialVersion: 0x100000000 },
      { locator: '' }, { locator: context.locator + '=' }])
      await expect(service.readProvisioningCloudV2(instance, { ...context, ...patch }, new AbortController().signal)).rejects.toThrow();
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined }); controller.abort();
    await expect(read(controller.signal)).rejects.toThrow(); http.expectNone(() => true);
  });

  it('cancels the pending single read and rejects a response arriving after cancellation', async () => {
    const controller = new AbortController(), promise = read(controller.signal), rejected = expect(promise).rejects.toThrow();
    const request = http.expectOne(url()); controller.abort(); await rejected;
    expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });

  it('checks cancellation again after response delivery instead of publishing stale evidence', async () => {
    const controller = new AbortController(), promise = read(controller.signal), rejected = expect(promise).rejects.toThrow();
    http.expectOne(url()).flush(envelope(), { headers }); controller.abort();
    await rejected; http.expectNone(() => true);
  });

  it('bounds the one request to 15 seconds without a fallback or automatic retry', async () => {
    vi.useFakeTimers();
    const promise = read(), rejected = expect(promise).rejects.toThrow(), request = http.expectOne(url());
    await vi.advanceTimersByTimeAsync(14999); expect(request.cancelled).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });

  it.each([[401, 'AUTH_TOKEN_EXPIRED'], [403, 'DEVICE_ACCESS_DENIED'], [409, 'DEVICE_CONTEXT_CHANGED'],
    [429, 'RATE_LIMIT_EXCEEDED'], [503, 'SERVICE_UNAVAILABLE']])(
    'preserves HTTP %s without refresh, replay, navigation or account mutation', async (status, code) => {
      const promise = read(), rejected = expect(promise).rejects.toMatchObject({ httpStatus: status, code });
      http.expectOne(url()).flush({ status, errorCode: code }, { status: Number(status), statusText: 'Rejected' });
      await rejected; http.expectNone(API.AUTH.REFRESH); http.expectNone(() => true);
      expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(nav.navigateRoot).not.toHaveBeenCalled();
      expect(data.auth.accessToken).toBe('access-test');
    });
});
