import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { getServiceRegion, setServiceRegion } from '../../configs/service-region.config';
import { ServerInterceptor } from '../injectable/server.interceptor';
import { MANAGED_MAP_LIMITS, ManagedMapLayer, ManagedMapSession } from '../maps/managed-map';
import { AppVisibilityService } from './app-visibility.service';
import { DataService } from './data.service';
import { MapTileClientService } from './map-tile-client.service';

const config = { enabled: true, provider: 'tianditu', version: 1, layers: ['base', 'annotation'],
  tileSize: 256, minZoom: 1, maxZoom: 18, crs: 'EPSG:3857',
  attribution: { text: '天地图', href: 'https://www.tianditu.gov.cn/' } };
const headers = { 'Cache-Control': 'private, no-store' };
const coords = { z: 2, x: 1, y: 3 };
const signal = () => new AbortController().signal;
const tileUrl = () => API.MAPS.TILE('base', coords.z, coords.x, coords.y);

describe('managed map authenticated HTTP session without auth replay', () => {
  let client: MapTileClientService, http: HttpTestingController, raw: HttpClient;
  let data: { auth: any; sessionEpoch: number; authDataChanged: Subject<void>;
    replaceAuthData: ReturnType<typeof vi.fn>; removeAuthData: ReturnType<typeof vi.fn> };
  let visibility: { active: BehaviorSubject<boolean> }, nav: { navigateRoot: ReturnType<typeof vi.fn> };
  const sessions = new Set<ManagedMapSession>();
  const session = () => { const value = client.createSession(); sessions.add(value); return value; };
  beforeEach(() => {
    localStorage.clear();
    data = { auth: { uuid: 'owner', accessToken: 'access-test', refreshToken: 'refresh-test' }, sessionEpoch: 1,
      authDataChanged: new Subject<void>(), replaceAuthData: vi.fn(), removeAuthData: vi.fn() };
    visibility = { active: new BehaviorSubject(true) }; nav = { navigateRoot: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
      { provide: DataService, useValue: data }, { provide: AppVisibilityService, useValue: visibility },
      { provide: NavController, useValue: nav }] });
    client = TestBed.inject(MapTileClientService); http = TestBed.inject(HttpTestingController); raw = TestBed.inject(HttpClient);
  });
  afterEach(() => {
    for (const value of sessions) value.close(); sessions.clear();
    http.verify(); TestBed.resetTestingModule(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers();
  });

  it('loads the exact no-store config envelope with current Bearer, region and request id', async () => {
    const value = session(), pending = value.loadConfig(signal());
    const request = http.expectOne(API.MAPS.CONFIG);
    expect(request.request.method).toBe('GET'); expect(request.request.responseType).toBe('json');
    expect(request.request.body).toBeNull(); expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.headers.get('x-region')).toBe(getServiceRegion());
    expect(request.request.headers.get('X-Request-ID')).toBeTruthy();
    expect(request.request.params.keys()).toEqual([]); expect(request.request.headers.has('Content-Type')).toBe(false);
    request.flush({ status: 200, data: config }, { headers });
    await expect(pending).resolves.toEqual(config); expect(value.current()).toBe(true);
    expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(data.removeAuthData).not.toHaveBeenCalled();
  });

  it('accepts a disabled capability without starting a tile or provider request', async () => {
    const pending = session().loadConfig(signal());
    http.expectOne(API.MAPS.CONFIG).flush({ status: 200, data: { enabled: false } }, { headers });
    await expect(pending).resolves.toEqual({ enabled: false }); http.expectNone(() => true);
  });

  it.each(['image/png', 'image/jpeg'])('fetches %s bytes only through the fixed Gateway URL with Bearer', async mime => {
    const pending = session().getTile('base', coords, signal()), request = http.expectOne(tileUrl());
    expect(request.request.responseType).toBe('blob'); expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-test');
    expect(request.request.headers.get('x-region')).toBe('China');
    expect(request.request.headers.get('X-Request-ID')).toBeTruthy(); expect(request.request.params.keys()).toEqual([]);
    expect(request.request.url).not.toMatch(/token|tk=|apiKey|access-test/);
    request.flush(new Blob(['image bytes'], { type: mime }), { headers: { ...headers, 'Content-Type': mime } });
    await expect(pending).resolves.toMatchObject({ type: mime, size: 11 });
  });

  it('uses the same session for annotation and legitimate same-account token rotation', async () => {
    const value = session(); data.auth = { ...data.auth, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' };
    data.authDataChanged.next(); expect(value.current()).toBe(true);
    const pending = value.getTile('annotation', coords, signal());
    const request = http.expectOne(API.MAPS.TILE('annotation', coords.z, coords.x, coords.y));
    expect(request.request.headers.get('Authorization')).toBe('Bearer rotated-access');
    request.flush(new Blob(['image'], { type: 'image/png' }), { headers: { ...headers, 'Content-Type': 'image/png' } });
    await expect(pending).resolves.toBeInstanceOf(Blob);
  });

  it.each([
    { status: 401, kind: 'auth' }, { status: 403, kind: 'forbidden' }, { status: 429, kind: 'limit' },
    { status: 503, kind: 'unavailable' }, { status: 502, kind: 'unavailable' },
    { status: 504, kind: 'timeout' }, { status: 400, kind: 'invalid' }, { status: 404, kind: 'unavailable' },
  ])('sanitizes binary HTTP $status without parsing, refreshing, replaying or navigating', async ({ status, kind }) => {
    const pending = session().getTile('base', coords, signal());
    const rejected = expect(pending).rejects.toMatchObject({ name: 'ManagedMapError', kind,
      message: 'Managed map request failed', retryAfterSeconds: status === 429 ? 37 : undefined });
    http.expectOne(tileUrl()).flush(new Blob(['private upstream URL or Key must not escape'], { type: 'application/json' }),
      { status, statusText: 'Map error', headers: { ...headers, 'Retry-After': '37' } });
    await rejected; http.expectNone(API.AUTH.REFRESH); http.expectNone(tileUrl());
    expect(data.replaceAuthData).not.toHaveBeenCalled(); expect(data.removeAuthData).not.toHaveBeenCalled();
    expect(nav.navigateRoot).not.toHaveBeenCalled(); expect(data.auth.accessToken).toBe('access-test');
  });

  it('does not replay or refresh JSON config after 401', async () => {
    const pending = session().loadConfig(signal()), rejected = expect(pending).rejects.toMatchObject({ kind: 'auth' });
    http.expectOne(API.MAPS.CONFIG).flush({ errorCode: 'AUTH_TOKEN_EXPIRED', message: 'private auth detail' },
      { status: 401, statusText: 'Unauthorized' });
    await rejected; http.expectNone(API.AUTH.REFRESH); http.expectNone(API.MAPS.CONFIG);
    expect(nav.navigateRoot).not.toHaveBeenCalled(); expect(data.removeAuthData).not.toHaveBeenCalled();
  });

  it('drops an out-of-contract Retry-After without retrying', async () => {
    const pending = session().getTile('base', coords, signal());
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'limit', retryAfterSeconds: undefined });
    http.expectOne(tileUrl()).flush(new Blob(['error']), { status: 429, statusText: 'Limited', headers: { 'Retry-After': '999999' } });
    await rejected; http.expectNone(() => true);
  });

  it.each([
    { body: config, cache: 'no-store', status: 200 },
    { body: { status: 201, data: config }, cache: 'no-store', status: 200 },
    { body: { status: 200, data: config }, cache: 'public', status: 200 },
    { body: { status: 200, data: config }, cache: 'no-store', status: 201 },
    { body: { status: 200, data: config, key: 'unit-key' }, cache: 'no-store', status: 200 },
    { body: { status: 200, data: { ...config, tileTemplate: 'https://untrusted.invalid/{z}/{x}/{y}' } }, cache: 'no-store', status: 200 },
  ])('rejects invalid config status, cache or unknown secret/template fields', async candidate => {
    const pending = session().loadConfig(signal()), rejected = expect(pending).rejects.toMatchObject({ kind: 'invalid' });
    http.expectOne(API.MAPS.CONFIG).flush(candidate.body,
      { status: candidate.status, statusText: 'Result', headers: { 'Cache-Control': candidate.cache } });
    await rejected; http.expectNone(() => true);
  });

  it.each([
    { blob: new Blob([], { type: 'image/png' }), mime: 'image/png', cache: 'no-store', status: 200 },
    { blob: new Blob(['image']), mime: 'image/png', cache: 'no-store', status: 200 },
    { blob: new Blob(['html'], { type: 'text/html' }), mime: 'text/html', cache: 'no-store', status: 200 },
    { blob: new Blob(['image'], { type: 'image/png' }), mime: 'image/jpeg', cache: 'no-store', status: 200 },
    { blob: new Blob(['image'], { type: 'image/png' }), mime: 'image/png', cache: 'public', status: 200 },
    { blob: new Blob(['image'], { type: 'image/png' }), mime: 'image/png', cache: 'no-store', status: 201 },
    { blob: new Blob([new Uint8Array(MANAGED_MAP_LIMITS.tileBytes + 1)], { type: 'image/png' }), mime: 'image/png', cache: 'no-store', status: 200 },
  ])('rejects empty, oversized, mismatched or non-image tile responses', async candidate => {
    const pending = session().getTile('base', coords, signal()), rejected = expect(pending).rejects.toMatchObject({ kind: 'invalid' });
    http.expectOne(tileUrl()).flush(candidate.blob, { status: candidate.status, statusText: 'Result',
      headers: { 'Cache-Control': candidate.cache, 'Content-Type': candidate.mime } });
    await rejected; http.expectNone(() => true);
  });

  it('rejects invalid tile arguments before HTTP and authenticates only canonical maps paths', async () => {
    const value = session();
    for (const [layer, point] of [['unknown', coords], ['base', { z: 0, x: 0, y: 0 }],
      ['base', { z: 19, x: 0, y: 0 }], ['base', { z: 1, x: 2, y: 0 }],
      ['base', { z: 1, x: -1, y: 0 }], ['base', { z: 1, x: 0.5, y: 0 }]] as const) {
      await expect(value.getTile(layer as ManagedMapLayer, point, signal())).rejects.toMatchObject({ kind: 'invalid' });
    }
    http.expectNone(() => true);
    for (const url of [API.MAPS.CONFIG, API.MAPS.TILE('base', 1, 0, 0), API.MAPS.TILE('annotation', 18, 262143, 262143)]) {
      expect(isGatewayUrl(url)).toBe(true);
    }
    const prefix = API.MAPS.CONFIG.replace(/config$/, 'tiles/');
    for (const url of [API.MAPS.CONFIG + '?x=1', API.MAPS.CONFIG + '#fragment', API.MAPS.CONFIG + '/extra',
      prefix + 'unknown/1/0/0', prefix + 'base/01/0/0', prefix + 'base/0/0/0', prefix + 'base/19/0/0',
      prefix + 'base/1/2/0', prefix + 'base/1/-1/0', prefix + 'base/1/0/0/', prefix + 'base/1/0/0?token=x',
      prefix + 'base/1/0/0#fragment', prefix + 'base/1/0/%30', 'https://foreign.invalid/api/v2/maps/config']) {
      expect(isGatewayUrl(url)).toBe(false);
      raw.get(url).subscribe(); const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Request-ID')).toBe(false); request.flush({});
    }
  });

  it('requires restored uuid and an access token, and never opens a background session', () => {
    for (const auth of [null, { accessToken: 'access-test' }, { uuid: 'owner' }, { uuid: 'owner', accessToken: '  ' }]) {
      data.auth = auth; expect(() => session()).toThrowError(expect.objectContaining({ kind: 'auth' }));
    }
    data.auth = { uuid: 'owner', accessToken: 'access-test' }; visibility.active.next(false);
    expect(() => session()).toThrowError(expect.objectContaining({ kind: 'cancelled' })); http.expectNone(() => true);
  });

  it('cancels only an individual tile when its signal aborts and does not retry it', async () => {
    const value = session(), controller = new AbortController();
    const pending = value.getTile('base', coords, controller.signal), rejected = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    const request = http.expectOne(tileUrl()); controller.abort(); await rejected;
    expect(request.cancelled).toBe(true); expect(value.current()).toBe(true); http.expectNone(() => true);
  });

  it('does not dispatch an already-aborted request', async () => {
    const value = session(), controller = new AbortController(); controller.abort();
    await expect(value.loadConfig(controller.signal)).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(value.getTile('base', coords, controller.signal)).rejects.toMatchObject({ kind: 'cancelled' });
    http.expectNone(() => true);
  });

  it('close cancels XHRs, unsubscribes session listeners and is idempotent', async () => {
    const value = session(), pending = value.loadConfig(signal());
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    const request = http.expectOne(API.MAPS.CONFIG), authObservers = data.authDataChanged.observers.length;
    const visibilityObservers = visibility.active.observers.length;
    value.close(); value.close(); await rejected; expect(request.cancelled).toBe(true);
    expect(data.authDataChanged.observers.length).toBe(authObservers - 1);
    expect(visibility.active.observers.length).toBe(visibilityObservers - 1); expect(value.current()).toBe(false);
    await expect(value.getTile('base', coords, signal())).rejects.toMatchObject({ kind: 'cancelled' }); http.expectNone(() => true);
  });

  it.each(['logout', 'epoch', 'account', 'background', 'region'])('closes and cancels on %s scope changes', async change => {
    const value = session(), pending = value.loadConfig(signal());
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'cancelled' }), request = http.expectOne(API.MAPS.CONFIG);
    if (change === 'logout') data.auth = null;
    if (change === 'epoch') data.sessionEpoch += 1;
    if (change === 'account') data.auth = { ...data.auth, uuid: 'other-owner' };
    if (change === 'region') setServiceRegion('Global');
    if (change === 'background') visibility.active.next(false); else data.authDataChanged.next();
    await rejected; expect(request.cancelled).toBe(true); expect(value.current()).toBe(false);
    visibility.active.next(true); expect(value.current()).toBe(false); http.expectNone(() => true);
  });

  it('rejects a late response after a silent account change, before parsing or publishing config', async () => {
    const value = session(), pending = value.loadConfig(signal());
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    http.expectOne(API.MAPS.CONFIG).flush({ status: 200, data: config }, { headers });
    data.sessionEpoch += 1; // No event: the post-response fence must still reject.
    await rejected; expect(value.current()).toBe(false); http.expectNone(() => true);
  });

  it('checks actual API authority, rather than validating the captured authority against itself', async () => {
    const value = session(), pending = value.loadConfig(signal());
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'cancelled' }), request = http.expectOne(API.MAPS.CONFIG);
    const original = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;
    try {
      Object.defineProperty(API, 'BASE_URL', { value: 'https://different.invalid' });
      expect(value.current()).toBe(false); await rejected; expect(request.cancelled).toBe(true);
    } finally { Object.defineProperty(API, 'BASE_URL', original); }
    http.expectNone(() => true);
  });

  it('enforces its existing 12-second deadline by unsubscribing XHR without another request', async () => {
    vi.useFakeTimers();
    const value = session(), pending = value.getTile('base', coords, signal());
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'timeout' }), request = http.expectOne(tileUrl());
    await vi.advanceTimersByTimeAsync(MANAGED_MAP_LIMITS.deadlineMs); await rejected;
    expect(request.cancelled).toBe(true); http.expectNone(() => true);
  });
});
