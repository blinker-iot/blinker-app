import {
  HTTP_INTERCEPTORS,
  HttpEventType,
  HttpHandler,
  HttpClient,
  HttpRequest,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { NEVER, concat, of } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { GatewayHttpError } from '../model/response.model';
import { DataService } from '../services/data.service';
import { ServerInterceptor } from './server.interceptor';

describe('ServerInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let dataService: DataService;
  let navigateRoot: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    navigateRoot = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        DataService,
        { provide: NavController, useValue: { navigateRoot } },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: ServerInterceptor,
          multi: true,
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    dataService = TestBed.inject(DataService);
    dataService.auth = {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      tokenType: 'bearer',
    };
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('never leaks Gateway credentials or request ids to another origin', () => {
    http.get('https://example.com/public.json').subscribe();
    const request = httpTesting.expectOne('https://example.com/public.json');

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Request-ID')).toBe(false);
    expect(request.request.params.has('uuid')).toBe(false);
    expect(request.request.params.has('token')).toBe(false);
    request.flush({ ok: true });
  });

  it('adds Bearer and a bounded request id only to protected Gateway calls', () => {
    http.get(API.AUTH.ME).subscribe();
    const request = httpTesting.expectOne(API.AUTH.ME);

    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer old-access',
    );
    const requestId = request.request.headers.get('X-Request-ID');
    expect(requestId).toBeTruthy();
    expect(requestId!.length).toBeLessThanOrEqual(128);
    request.flush({ status: 200, data: { id: 'user-1' } });
  });

  it('preserves exact account-deletion bodies with Bearer and JSON headers', () => {
    http.post(API.ACCOUNT.DELETION_CODE, {}).subscribe();
    const codeRequest = httpTesting.expectOne(API.ACCOUNT.DELETION_CODE);
    expect(codeRequest.request.method).toBe('POST');
    expect(codeRequest.request.body).toEqual({});
    expect(codeRequest.request.headers.get('Authorization')).toBe(
      'Bearer old-access',
    );
    expect(codeRequest.request.headers.get('Content-Type')).toBe(
      'application/json',
    );
    codeRequest.flush({ status: 200, data: {} });

    http.delete(API.ACCOUNT.ROOT, {
      body: { code: 'D-123456' },
    }).subscribe();
    const deleteRequest = httpTesting.expectOne(API.ACCOUNT.ROOT);
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteRequest.request.body).toEqual({ code: 'D-123456' });
    expect(deleteRequest.request.headers.get('Authorization')).toBe(
      'Bearer old-access',
    );
    expect(deleteRequest.request.headers.get('Content-Type')).toBe(
      'application/json',
    );
    deleteRequest.flush({ account: { status: 'deleted' } });
  });

  it('normalizes Retry-After without exposing response headers wholesale', () => {
    let received: unknown;
    http.post(API.ACCOUNT.DELETION_CODE, {}).subscribe({
      error: (error) => (received = error),
    });
    httpTesting.expectOne(API.ACCOUNT.DELETION_CODE).flush(
      {
        errorCode: 'ACCOUNT_DELETION_CODE_RATE_LIMITED',
        errorMessage: 'upstream internal diagnostic',
      },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '37' },
      },
    );

    expect(received).toBeInstanceOf(GatewayHttpError);
    expect(received).toMatchObject({
      code: 'ACCOUNT_DELETION_CODE_RATE_LIMITED',
      retryAfterSeconds: 37,
    });
  });

  it('does not clear or refresh the session for deletion AUTH_TOKEN_MISSING', () => {
    let received: unknown;
    http.delete(API.ACCOUNT.ROOT, {
      body: { code: 'D-123456' },
    }).subscribe({ error: (error) => (received = error) });
    httpTesting.expectOne(API.ACCOUNT.ROOT).flush(
      { errorCode: 'AUTH_TOKEN_MISSING' },
      { status: 401, statusText: 'Unauthorized' },
    );

    httpTesting.expectNone(API.AUTH.REFRESH);
    expect(received).toMatchObject({ code: 'AUTH_TOKEN_MISSING' });
    expect(dataService.auth?.accessToken).toBe('old-access');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('preserves the refreshed session when deletion replay lacks a token', async () => {
    let received: unknown;
    http.delete(API.ACCOUNT.ROOT, {
      body: { code: 'D-123456' },
    }).subscribe({ error: (error) => (received = error) });
    httpTesting.expectOne(API.ACCOUNT.ROOT).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const replay = httpTesting.expectOne(API.ACCOUNT.ROOT);
    expect(replay.request.body).toEqual({ code: 'D-123456' });
    expect(replay.request.headers.get('Authorization')).toBe(
      'Bearer new-access',
    );
    replay.flush(
      { errorCode: 'AUTH_TOKEN_MISSING' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(received).toMatchObject({ code: 'AUTH_TOKEN_MISSING' });
    expect(dataService.auth?.accessToken).toBe('new-access');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('does not clear the session when deletion token refresh fails', async () => {
    let received: unknown;
    http.post(API.ACCOUNT.DELETION_CODE, {}).subscribe({
      error: (error) => (received = error),
    });
    httpTesting.expectOne(API.ACCOUNT.DELETION_CODE).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush(
      { errorCode: 'AUTH_REFRESH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toMatchObject({ code: 'AUTH_REFRESH_TOKEN_EXPIRED' });
    expect(dataService.auth?.accessToken).toBe('old-access');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('does not attach Bearer to public authentication calls', () => {
    http.post(API.AUTH.EMAIL_LOGIN, { email: 'person@example.com' }).subscribe();
    const request = httpTesting.expectOne(API.AUTH.EMAIL_LOGIN);

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.headers.has('X-Request-ID')).toBe(true);
    request.flush({ status: 200, data: {} });
  });

  it('adds App auth only to Device V2 management endpoints', () => {
    const context = {
      logicalDeviceId: 'device/a b',
      credentialVersion: 1,
      locator: 'AQIDBAUGBwgJCgsMDQ4PEA',
    };
    const managementUrls = [
      API.DEVICE_V2.CREATE,
      API.DEVICE_V2.DETAIL(context.logicalDeviceId),
      API.DEVICE_V2.REVEAL(context.logicalDeviceId),
      API.DEVICE_V2.ROTATE(context.logicalDeviceId),
      API.DEVICE_V2.SHARES(context.logicalDeviceId),
      API.DEVICE_V2.SHARE_INVITATIONS(context.logicalDeviceId),
      API.DEVICE_V2.SHARE(context.logicalDeviceId, 'share-1'),
      API.DEVICE_V2.ACCEPT_SHARE,
      API.DEVICE_V2.RECEIVED_SHARES,
      API.DEVICE_V2.RECEIVED_SHARE(context.logicalDeviceId),
    ];
    const deviceUrls = [
      API.BASE_URL + '/api/v2/device-auth/challenges',
      API.BASE_URL + '/api/v2/device-sessions',
    ];

    for (const url of managementUrls) {
      http.post(url, {}).subscribe();
      const request = httpTesting.expectOne(url);
      expect(request.request.headers.get('Authorization')).toBe(
        'Bearer old-access',
      );
      expect(request.request.headers.has('X-Request-ID')).toBe(true);
      request.flush({ status: 200, data: {} });
    }

    for (const url of deviceUrls) {
      http.post(url, new ArrayBuffer(0)).subscribe();
      const request = httpTesting.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Request-ID')).toBe(false);
      request.flush({});
    }
  });

  it('preserves V2 create body and idempotency key across one 401 replay', async () => {
    const body = { name: 'Kitchen sensor', deviceType: 'diy' };
    let response: unknown;
    http.post(
      API.DEVICE_V2.CREATE,
      body,
      { headers: { 'Idempotency-Key': 'v2-create-operation-1' } },
    ).subscribe((value) => (response = value));

    const initial = httpTesting.expectOne(API.DEVICE_V2.CREATE);
    expect(initial.request.body).toEqual(body);
    expect(initial.request.headers.get('Idempotency-Key')).toBe(
      'v2-create-operation-1',
    );
    initial.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const replay = httpTesting.expectOne(API.DEVICE_V2.CREATE);
    expect(replay.request.body).toEqual(body);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(
      'v2-create-operation-1',
    );
    expect(replay.request.headers.get('Authorization')).toBe(
      'Bearer new-access',
    );
    replay.flush({ status: 201, data: { replayed: false } });

    expect(response).toEqual({ status: 201, data: { replayed: false } });
  });

  it('does not refresh or retry a blocked V2 reveal', () => {
    let received: unknown;
    const url = API.DEVICE_V2.REVEAL('device-1');
    http.post(url, {}).subscribe({ error: (error) => (received = error) });
    httpTesting.expectOne(url).flush(
      {
        status: 503,
        errorCode: 'DEVICE_KEY_STEP_UP_UNAVAILABLE',
        errorMessage: 'Verified step-up is unavailable.',
      },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(received).toBeInstanceOf(GatewayHttpError);
    expect(received).toMatchObject({
      httpStatus: 503,
      code: 'DEVICE_KEY_STEP_UP_UNAVAILABLE',
    });
    httpTesting.expectNone(API.AUTH.REFRESH);
  });

  it('preserves multipart feedback uploads and lets the browser set the boundary', () => {
    const formData = new FormData();
    formData.append('file', new Blob(['image'], { type: 'image/png' }));

    http.post(API.FEEDBACK.UPLOAD_IMAGE, formData).subscribe();
    const request = httpTesting.expectOne(API.FEEDBACK.UPLOAD_IMAGE);

    expect(request.request.body).toBe(formData);
    expect(request.request.headers.has('Content-Type')).toBe(false);
    request.flush({ status: 200, data: { url: 'https://example.com/image.png' } });
  });

  it('normalizes errors and never refreshes a 403', () => {
    let received: unknown;
    http.get(API.DEVICE_V2.LIST).subscribe({ error: (error) => (received = error) });
    const request = httpTesting.expectOne(API.DEVICE_V2.LIST);
    request.flush(
      {
        errorCode: 'DEVICE_ENTITLEMENT_INVALID',
        errorMessage: 'Device entitlement is invalid.',
        data: { entitlement: 'iot.devices' },
      },
      {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'X-Request-ID': 'request-403' },
      },
    );

    expect(received).toBeInstanceOf(GatewayHttpError);
    expect(received).toMatchObject({
      httpStatus: 403,
      code: 'DEVICE_ENTITLEMENT_INVALID',
      requestId: 'request-403',
      data: { entitlement: 'iot.devices' },
    });
    httpTesting.expectNone(API.AUTH.REFRESH);
  });

  it('times out a pending Gateway request with a normalized error', async () => {
    vi.useFakeTimers();
    try {
      let received: unknown;
      http.get(API.AUTH.ME).subscribe({
        error: (error) => (received = error),
      });
      const request = httpTesting.expectOne(API.AUTH.ME);

      await vi.advanceTimersByTimeAsync(30_001);

      expect(request.cancelled).toBe(true);
      expect(received).toBeInstanceOf(GatewayHttpError);
      expect(received).toMatchObject({
        httpStatus: 0,
        code: 'GATEWAY_TIMEOUT',
      });
      httpTesting.expectNone(API.AUTH.REFRESH);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timeout active after the backend emits Sent', async () => {
    vi.useFakeTimers();
    try {
      let received: unknown;
      const handler = {
        handle: vi.fn(() =>
          concat(
            of({ type: HttpEventType.Sent }),
            NEVER,
          ),
        ),
      } as HttpHandler;
      const interceptor = (TestBed.inject(HTTP_INTERCEPTORS) as unknown[])
        .find((value) => value instanceof ServerInterceptor) as
        | ServerInterceptor
        | undefined;

      interceptor!
        .intercept(new HttpRequest('GET', API.AUTH.ME), handler)
        .subscribe({ error: (error) => (received = error) });
      await vi.advanceTimersByTimeAsync(30_001);

      expect(handler.handle).toHaveBeenCalledOnce();
      expect(received).toMatchObject({
        httpStatus: 0,
        code: 'GATEWAY_TIMEOUT',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out a pending refresh and clears the expired session', async () => {
    vi.useFakeTimers();
    try {
      let received: unknown;
      http.get(API.AUTH.ME).subscribe({
        error: (error) => (received = error),
      });
      httpTesting.expectOne(API.AUTH.ME).flush(
        { errorCode: 'AUTH_TOKEN_EXPIRED' },
        { status: 401, statusText: 'Unauthorized' },
      );
      const refresh = httpTesting.expectOne(API.AUTH.REFRESH);

      await vi.advanceTimersByTimeAsync(30_001);

      expect(refresh.cancelled).toBe(true);
      expect(received).toBeInstanceOf(GatewayHttpError);
      expect(received).toMatchObject({
        httpStatus: 0,
        code: 'GATEWAY_TIMEOUT',
      });
      expect(dataService.auth).toBeNull();
      expect(navigateRoot).toHaveBeenCalledWith('/login');
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out a pending replay without refreshing or clearing the new session', async () => {
    vi.useFakeTimers();
    try {
      let received: unknown;
      http.get(API.AUTH.ME).subscribe({
        error: (error) => (received = error),
      });
      httpTesting.expectOne(API.AUTH.ME).flush(
        { errorCode: 'AUTH_TOKEN_EXPIRED' },
        { status: 401, statusText: 'Unauthorized' },
      );
      httpTesting.expectOne(API.AUTH.REFRESH).flush({
        status: 200,
        data: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      const replay = httpTesting.expectOne(API.AUTH.ME);

      await vi.advanceTimersByTimeAsync(30_001);

      expect(replay.cancelled).toBe(true);
      expect(received).toBeInstanceOf(GatewayHttpError);
      expect(received).toMatchObject({
        httpStatus: 0,
        code: 'GATEWAY_TIMEOUT',
      });
      expect(dataService.auth?.accessToken).toBe('new-access');
      expect(navigateRoot).not.toHaveBeenCalled();
      httpTesting.expectNone(API.AUTH.REFRESH);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows feedback image uploads a longer bounded timeout', async () => {
    vi.useFakeTimers();
    try {
      let received: unknown;
      http.post(API.FEEDBACK.UPLOAD_IMAGE, new FormData()).subscribe({
        error: (error) => (received = error),
      });
      const upload = httpTesting.expectOne(API.FEEDBACK.UPLOAD_IMAGE);

      await vi.advanceTimersByTimeAsync(30_001);
      expect(upload.cancelled).toBe(false);
      expect(received).toBeUndefined();

      await vi.advanceTimersByTimeAsync(90_000);
      expect(upload.cancelled).toBe(true);
      expect(received).toMatchObject({
        httpStatus: 0,
        code: 'GATEWAY_TIMEOUT',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces concurrent 401 responses into one refresh and replays once', async () => {
    const results: string[] = [];
    http.get<{ value: string }>(API.AUTH.ME).subscribe((body) => {
      results.push(body.value);
    });
    http.get<{ value: string }>(API.DEVICE_V2.LIST).subscribe((body) => {
      results.push(body.value);
    });

    httpTesting.expectOne(API.AUTH.ME).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.DEVICE_V2.LIST).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    const refreshRequests = httpTesting.match(API.AUTH.REFRESH);
    expect(refreshRequests).toHaveLength(1);
    expect(refreshRequests[0].request.body).toEqual({
      refresh_token: 'old-refresh',
    });
    expect(refreshRequests[0].request.headers.has('Authorization')).toBe(false);
    refreshRequests[0].flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const replayMe = httpTesting.expectOne(API.AUTH.ME);
    const replayDevices = httpTesting.expectOne(API.DEVICE_V2.LIST);
    expect(replayMe.request.headers.get('Authorization')).toBe('Bearer new-access');
    expect(replayDevices.request.headers.get('Authorization')).toBe(
      'Bearer new-access',
    );
    replayMe.flush({ value: 'me' });
    replayDevices.flush({ value: 'devices' });

    expect(results).toEqual(['me', 'devices']);
    expect(dataService.auth).toEqual(expect.objectContaining({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenType: 'bearer',
      token: 'new-access',
    }));
  });

  it('keeps late old-token 401s joined while refreshed tokens are being stored', async () => {
    let releaseStorage: () => void = () => undefined;
    const storage = new Promise<void>((resolve) => {
      releaseStorage = resolve;
    });
    vi.spyOn(dataService, 'replaceAuthData').mockImplementation(
      async (_expected, tokens) => {
        dataService.auth = tokens;
        await storage;
        return true;
      },
    );
    const results: string[] = [];
    http.get<{ value: string }>(API.AUTH.ME).subscribe((body) => {
      results.push(body.value);
    });
    http.get<{ value: string }>(API.DEVICE_V2.LIST).subscribe((body) => {
      results.push(body.value);
    });

    const first = httpTesting.expectOne(API.AUTH.ME);
    const late = httpTesting.expectOne(API.DEVICE_V2.LIST);
    first.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });
    late.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectNone(API.AUTH.REFRESH);

    releaseStorage();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const replayMe = httpTesting.expectOne(API.AUTH.ME);
    const replayDevices = httpTesting.expectOne(API.DEVICE_V2.LIST);
    replayMe.flush({ value: 'me' });
    replayDevices.flush({ value: 'devices' });

    expect(results).toEqual(['me', 'devices']);
  });

  it('replays a late stale-token 401 without refreshing the rotated token again', async () => {
    const results: string[] = [];
    http.get<{ value: string }>(API.AUTH.ME).subscribe((body) => {
      results.push(body.value);
    });
    http.get<{ value: string }>(API.DEVICE_V2.LIST).subscribe((body) => {
      results.push(body.value);
    });

    const first = httpTesting.expectOne(API.AUTH.ME);
    const late = httpTesting.expectOne(API.DEVICE_V2.LIST);
    first.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const replayFirst = httpTesting.expectOne(API.AUTH.ME);
    expect(replayFirst.request.headers.get('Authorization')).toBe(
      'Bearer new-access',
    );
    replayFirst.flush({ value: 'me' });

    late.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectNone(API.AUTH.REFRESH);
    const replayLate = httpTesting.expectOne(API.DEVICE_V2.LIST);
    expect(replayLate.request.headers.get('Authorization')).toBe(
      'Bearer new-access',
    );
    replayLate.flush({ value: 'devices' });

    expect(results).toEqual(['me', 'devices']);
  });

  it('waits for a second refresh before replaying a two-generation stale request', async () => {
    http.get(API.AUTH.ME).subscribe();
    http.get(API.DEVICE_V2.LIST).subscribe();
    const firstA = httpTesting.expectOne(API.AUTH.ME);
    const lateA = httpTesting.expectOne(API.DEVICE_V2.LIST);
    firstA.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'token-b',
        refresh_token: 'refresh-b',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpTesting.expectOne(API.AUTH.ME).flush({ status: 200, data: {} });

    http.get(API.ACCOUNT.CONNECTION).subscribe();
    httpTesting.expectOne(API.ACCOUNT.CONNECTION).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const refreshToC = httpTesting.expectOne(API.AUTH.REFRESH);
    lateA.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectNone(API.DEVICE_V2.LIST);

    refreshToC.flush({
      status: 200,
      data: {
        access_token: 'token-c',
        refresh_token: 'refresh-c',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const replayCurrent = httpTesting.expectOne(API.ACCOUNT.CONNECTION);
    const replayStale = httpTesting.expectOne(API.DEVICE_V2.LIST);
    expect(replayCurrent.request.headers.get('Authorization')).toBe(
      'Bearer token-c',
    );
    expect(replayStale.request.headers.get('Authorization')).toBe(
      'Bearer token-c',
    );
    replayCurrent.flush({ status: 200, data: {} });
    replayStale.flush({ devices: [] });

    expect(dataService.auth?.accessToken).toBe('token-c');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('does not clear the session when an old replay fails during its token refresh', async () => {
    let staleError: unknown;
    http.get(API.AUTH.ME).subscribe();
    http.get(API.DEVICE_V2.LIST).subscribe({
      error: (error) => (staleError = error),
    });
    const firstA = httpTesting.expectOne(API.AUTH.ME);
    const lateA = httpTesting.expectOne(API.DEVICE_V2.LIST);
    firstA.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'token-b',
        refresh_token: 'refresh-b',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpTesting.expectOne(API.AUTH.ME).flush({ status: 200, data: {} });

    lateA.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const replayStale = httpTesting.expectOne(API.DEVICE_V2.LIST);
    http.get(API.ACCOUNT.CONNECTION).subscribe();
    httpTesting.expectOne(API.ACCOUNT.CONNECTION).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const refreshToC = httpTesting.expectOne(API.AUTH.REFRESH);
    replayStale.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(staleError).toBeInstanceOf(GatewayHttpError);
    expect(dataService.auth?.accessToken).toBe('token-b');
    expect(navigateRoot).not.toHaveBeenCalled();

    refreshToC.flush({
      status: 200,
      data: {
        access_token: 'token-c',
        refresh_token: 'refresh-c',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpTesting.expectOne(API.ACCOUNT.CONNECTION).flush({ status: 200, data: {} });

    expect(dataService.auth?.accessToken).toBe('token-c');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('never replays an old-session write against a newly signed-in account', async () => {
    let received: unknown;
    http.delete(API.ACCOUNT.ROOT).subscribe({
      error: (error) => (received = error),
    });
    const oldDelete = httpTesting.expectOne(API.ACCOUNT.ROOT);

    await dataService.setAuthData({
      accessToken: 'other-account-access',
      refreshToken: 'other-account-refresh',
      tokenType: 'bearer',
    });
    oldDelete.flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(received).toBeInstanceOf(GatewayHttpError);
    httpTesting.expectNone(API.AUTH.REFRESH);
    httpTesting.expectNone(API.ACCOUNT.ROOT);
    expect(dataService.auth?.accessToken).toBe('other-account-access');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('lets a new account refresh independently from an old refresh in flight', async () => {
    let oldError: unknown;
    let newError: unknown;
    let newValue: unknown;
    http.get(API.AUTH.ME).subscribe({ error: (error) => (oldError = error) });
    httpTesting.expectOne(API.AUTH.ME).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const oldRefresh = httpTesting.expectOne(API.AUTH.REFRESH);

    await dataService.setAuthData({
      accessToken: 'other-account-access',
      refreshToken: 'other-account-refresh',
      tokenType: 'bearer',
    });
    http.get(API.DEVICE_V2.LIST).subscribe({
      next: (value) => (newValue = value),
      error: (error) => (newError = error),
    });
    httpTesting.expectOne(API.DEVICE_V2.LIST).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const newRefresh = httpTesting.expectOne(API.AUTH.REFRESH);
    expect(newRefresh.request.body).toEqual({
      refresh_token: 'other-account-refresh',
    });
    newRefresh.flush({
      status: 200,
      data: {
        access_token: 'other-account-new-access',
        refresh_token: 'other-account-new-refresh',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const replayNew = httpTesting.expectOne(API.DEVICE_V2.LIST);
    expect(replayNew.request.headers.get('Authorization')).toBe(
      'Bearer other-account-new-access',
    );
    replayNew.flush({ value: 'new-account-devices' });

    oldRefresh.flush({
      status: 200,
      data: {
        access_token: 'discarded-access',
        refresh_token: 'discarded-refresh',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(oldError).toBeInstanceOf(GatewayHttpError);
    expect(newError).toBeUndefined();
    expect(newValue).toEqual({ value: 'new-account-devices' });
    expect(dataService.auth?.accessToken).toBe('other-account-new-access');
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('clears the session when refresh fails', async () => {
    let received: unknown;
    http.get(API.AUTH.ME).subscribe({ error: (error) => (received = error) });
    httpTesting.expectOne(API.AUTH.ME).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush(
      { errorCode: 'AUTH_REFRESH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toBeInstanceOf(GatewayHttpError);
    expect(dataService.auth).toBeNull();
    expect(navigateRoot).toHaveBeenCalledWith('/login');
  });

  it('drops remembered refresh lineage when local auth is cleared', async () => {
    http.get(API.AUTH.ME).subscribe();
    httpTesting.expectOne(API.AUTH.ME).flush(
      { errorCode: 'AUTH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpTesting.expectOne(API.AUTH.REFRESH).flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpTesting.expectOne(API.AUTH.ME).flush({ status: 200, data: {} });

    const interceptor = (TestBed.inject(HTTP_INTERCEPTORS) as unknown[])
      .find((value) => value instanceof ServerInterceptor) as unknown as
      | { lastRefresh: unknown }
      | undefined;
    expect(interceptor?.lastRefresh).toBeTruthy();

    await dataService.removeAuthData();
    expect(interceptor?.lastRefresh).toBeNull();
  });
});
