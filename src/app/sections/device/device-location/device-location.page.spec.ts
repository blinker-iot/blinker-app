import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { ServerInterceptor } from '../../../core/injectable/server.interceptor';
import { DeviceLocationRecord } from '../../../core/device-v2/device-location';
import { DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { LocationMapComponent, Wgs84MapPoint } from '../../../core/components/location-map/location-map.component';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { PhoneLocationError, PhoneLocationService } from '../../../core/services/phone-location.service';
import { HomeCardPreferencesStore } from '../../../home/device-card-preferences';
import { DeviceLocationPage } from './device-location.page';

const id = 'device_location_owner', url = () => API.DEVICE_V2.LOCATION(id);
const empty: DeviceLocationRecord = { logicalDeviceId: id, revision: 0, location: null, updatedAt: null };
const recorded: DeviceLocationRecord = { logicalDeviceId: id, revision: 1, updatedAt: 1000,
  location: { longitude: 120, latitude: 30, coordinateSystem: 'WGS84', source: 'manual' } };
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
@Component({ selector: 'app-location-map', standalone: true, template: '<div class="map-stub">{{ name }}</div>' })
class TestLocationMapComponent {
  @Input() point: Wgs84MapPoint | null = null;
  @Input() name = '';
  @Input() editable = false;
  @Input() active = true;
  @Output() readonly pointChange = new EventEmitter<Wgs84MapPoint>();
}
async function render(options: { record?: DeviceLocationRecord; config?: Record<string, unknown>;
  state?: string; missing?: boolean; authenticated?: boolean; pendingRead?: boolean } = {}) {
  const getCurrentPosition = vi.fn().mockRejectedValue(new PhoneLocationError('permission')), saveDeviceConfig = vi.fn();
  const browserLocation = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: browserLocation } });
  const device: any = { state: options.state ?? 'active', deviceName: id, name: '位置测试设备', config: { mode: 'bbp2', disabled: false,
    isPreview: false, isShared: false, position: { location: [123.456, 45.678] }, ...options.config } };
  const data = { auth: options.authenticated === false ? null : { uuid: 'owner', accessToken: 'test-access', refreshToken: 'test-refresh' },
    sessionEpoch: 1, authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(true),
    device: { dict: options.missing ? {} : { [id]: device } } as { dict: Record<string, any> } };
  const visibility = { active: new BehaviorSubject(true) };
  const stateSnapshot = new BehaviorSubject<DeviceUiSnapshot>({ manifestAccepted: true, manifestRevision: 1,
    manifestFingerprint: 'accepted-test', stateRevision: 1, stateFresh: true, endpoints: [] });
  const deviceUi = { watchState: vi.fn(() => stateSnapshot.asObservable()), connect: vi.fn(), query: vi.fn(), command: vi.fn(), openTelemetry: vi.fn() };
  TestBed.configureTestingModule({ imports: [DeviceLocationPage], providers: [provideRouter([]), provideIonicAngular({ animated: false }),
    provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
    { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
    { provide: DataService, useValue: data }, { provide: DeviceService, useValue: { saveDeviceConfig } },
    { provide: PhoneLocationService, useValue: { current: getCurrentPosition } }, { provide: DeviceUiPort, useValue: deviceUi },
    { provide: AppVisibilityService, useValue: visibility }, { provide: NavController, useValue: { navigateRoot: vi.fn() } },
  ] });
  TestBed.overrideComponent(DeviceLocationPage, { remove: { imports: [LocationMapComponent] }, add: { imports: [TestLocationMapComponent] } });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(DeviceLocationPage), page = fixture.componentInstance;
  fixture.detectChanges(); page.ionViewWillEnter();
  const http = TestBed.inject(HttpTestingController), element = fixture.nativeElement as HTMLElement;
  async function settle() { for (let n = 0; n < 16; n++) await Promise.resolve(); if (!fixture.componentRef.hostView.destroyed) fixture.detectChanges(); }
  async function read(record: DeviceLocationRecord) {
    const request = http.expectOne(url()); expect(request.request.method).toBe('GET');
    request.flush({ status: 200, data: record }, { headers: { 'Cache-Control': 'no-store' } }); await settle();
  }
  async function type(field: 'longitude' | 'latitude', value: string) {
    if (!page.editing) { page.startEditing(); await settle(); }
    const input = element.querySelector<HTMLInputElement>(`input[name="${field}"]`)!;
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  }
  async function submit() {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
  }
  if (page.canQuery && !options.pendingRead) await read(options.record ?? empty);
  else await settle();
  const map = () => fixture.debugElement.query(By.directive(TestLocationMapComponent))?.componentInstance as TestLocationMapComponent | undefined;
  return { fixture, page, data, device, visibility, http, element, getCurrentPosition, browserLocation, saveDeviceConfig,
    deviceUi, stateSnapshot, map, settle, read, type, submit };
}

describe('Device location server-authoritative manual production template', () => {
  afterEach(() => {
    try { TestBed.inject(HttpTestingController).verify(); }
    finally {
      TestBed.resetTestingModule(); vi.restoreAllMocks();
      if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
      else Reflect.deleteProperty(navigator, 'geolocation');
    }
  });

  it('reads the unset state and asks permission to set it without starting GPS, a map or unrelated writes', async () => {
    const f = await render();
    expect(f.element.querySelector('h1')!.textContent).toBe('要设置设备位置吗？');
    expect(f.page.longitude).toBe(''); expect(f.page.latitude).toBe('');
    expect(f.element.querySelector('.setup')?.textContent).toContain('设置位置'); expect(f.element.textContent).toContain('暂不设置');
    expect(f.element.textContent).not.toMatch(/杭州|上海|成都|123\.456|45\.678/);
    expect(f.element.querySelector('app-location-map, .map-preview, .preset-list')).toBeNull();
    expect(f.getCurrentPosition).not.toHaveBeenCalled(); expect(f.saveDeviceConfig).not.toHaveBeenCalled();
    f.http.expectNone(() => true);
  });
  it('rejects blank and invalid drafts but accepts explicit zeros and immediately displays the real confirmation', async () => {
    const f = await render();
    await f.type('longitude', ''); await f.type('latitude', '0'); await f.page.save(); f.http.expectNone(url());
    expect(f.page.canSave).toBe(false);
    await f.type('longitude', '181'); expect(f.page.canSave).toBe(false);
    await f.type('longitude', '0'); expect(f.page.canSave).toBe(true); await f.submit();
    const request = f.http.expectOne(url()); expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ expectedRevision: 0,
      location: { longitude: 0, latitude: 0, coordinateSystem: 'WGS84', source: 'manual' } });
    expect(f.page.notice).toBe(''); expect(f.page.record).toEqual(empty);
    request.flush({ status: 200, data: { ...recorded, location: request.request.body.location } }, { headers: { 'Cache-Control': 'no-store' } });
    await f.settle(); expect(f.page.notice).toBe('位置已保存'); expect(f.page.editing).toBe(false);
    expect(f.map()?.point).toEqual({ longitude: 0, latitude: 0, coordinateSystem: 'WGS84', source: 'manual' });
    expect(f.element.querySelector('.device-heading h1')!.textContent).toBe('位置测试设备');
    expect(f.element.querySelector('input, .coordinate-entry')).toBeNull(); f.http.expectNone(() => true);
  });
  it('clears through one explicit CAS PUT with null and never uses DELETE or a full inventory refresh', async () => {
    const f = await render({ record: recorded });
    f.element.querySelector<HTMLButtonElement>('.edit')!.click(); await f.settle();
    f.element.querySelector<HTMLButtonElement>('.remove')!.click(); await f.settle();
    f.http.expectNone(url()); expect(f.element.textContent).toContain('移除设备位置？');
    f.element.querySelector<HTMLButtonElement>('.clear')!.click(); await f.settle();
    const request = f.http.expectOne(url()); expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ expectedRevision: 1, location: null });
    request.flush({ status: 200, data: { ...empty, revision: 2, updatedAt: 2000 } }, { headers: { 'Cache-Control': 'no-store' } });
    await f.settle(); expect(f.page.record?.location).toBeNull(); expect(f.page.longitude).toBe('');
    expect(f.page.notice).toBe('位置已移除'); expect(f.getCurrentPosition).not.toHaveBeenCalled(); f.http.expectNone(() => true);
  });
  it('preserves a conflicting draft, reads a new revision and requires explicit review before any new write', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '0'); await f.type('latitude', '0'); await f.submit();
    f.http.expectOne(url()).flush({ status: 409, errorCode: 'DEVICE_V2_LOCATION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    await f.settle(); expect(f.page.error).toContain('位置已被更新'); expect(f.page.longitude).toBe('0');
    expect(f.page.canSave).toBe(false); await f.page.save(); f.http.expectNone(url());
    f.element.querySelector<HTMLButtonElement>('.reload')!.click();
    await f.read({ ...recorded, revision: 3 });
    expect(f.page.longitude).toBe('0'); expect(f.page.latitude).toBe('0'); expect(f.page.reviewRequired).toBe(true);
    expect(f.page.canSave).toBe(false); expect(f.page.canClear).toBe(false);
    f.element.querySelector<HTMLButtonElement>('.review')!.click(); await f.settle();
    expect(f.page.canSave).toBe(true); expect(f.page.record?.revision).toBe(3); f.http.expectNone(url());
  });
  it('does not equate an uncertain network write with failure or success and reconciles by read only', async () => {
    const f = await render(); await f.type('longitude', '0'); await f.type('latitude', '0'); await f.submit();
    f.http.expectOne(url()).error(new ProgressEvent('error')); await f.settle();
    expect(f.page.error).toContain('尚未确认'); expect(f.page.notice).toBe(''); expect(f.page.longitude).toBe('0');
    await f.page.save(); await f.page.clearLocation(); f.http.expectNone(url());
    void f.page.reload(); await f.read({ ...recorded, location: { ...recorded.location!, longitude: 0, latitude: 0 } });
    expect(f.page.reviewRequired).toBe(true); expect(f.page.canSave).toBe(false); f.http.expectNone(url());
  });
  it('keeps the draft after a manual read failure, with no local-cache fallback or permission to write', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '2');
    void f.page.reload(); f.http.expectOne(url()).flush({ status: 503, errorCode: 'DEVICE_V2_LOCATION_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    await f.settle(); expect(f.page.record).toBeNull(); expect(f.page.longitude).toBe('2'); expect(f.page.canSave).toBe(false);
    expect(f.page.error).toContain('加载失败'); f.http.expectNone(() => true);
  });
  it('distinguishes a generic read 404 on an older Gateway from a device-owner denial', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '2');
    void f.page.reload(); f.http.expectOne(url()).flush({ status: 404, errorCode: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await f.settle(); expect(f.page.state).toBe('owner'); expect(f.page.canQuery).toBe(true);
    expect(f.page.record).toBeNull(); expect(f.page.longitude).toBe('2'); expect(f.page.canSave).toBe(false);
    expect(f.page.error).toContain('服务暂不可用'); expect(f.page.error).not.toContain('所有者权限');
    expect(f.page.record).toBeNull(); expect(f.map()?.point).not.toEqual(recorded.location);
    expect(f.element.querySelector<HTMLButtonElement>('.reload')!.disabled).toBe(false);
    expect(f.element.textContent).not.toMatch(/123\.456|45\.678/); f.http.expectNone(() => true);
  });
  it('preserves an uncertain draft after a generic write 404 without retrying or claiming changed ownership', async () => {
    const f = await render(); await f.type('longitude', '0'); await f.type('latitude', '0'); await f.submit();
    f.http.expectOne(url()).flush({ status: 404, errorCode: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await f.settle(); expect(f.page.state).toBe('owner'); expect(f.page.canQuery).toBe(true);
    expect(f.page.longitude).toBe('0'); expect(f.page.latitude).toBe('0'); expect(f.page.notice).toBe('');
    expect(f.page.canSave).toBe(false); expect(f.page.canClear).toBe(false);
    expect(f.page.error).toContain('服务暂不可用'); expect(f.page.error).not.toContain('所有者权限');
    await f.page.save(); await f.page.clearLocation(); f.http.expectNone(() => true);
  });
  it('does not refresh the token or retry a rejected write and asks for a new explicit read after login', async () => {
    const f = await render(); await f.type('longitude', '0'); await f.type('latitude', '0'); await f.submit();
    f.http.expectOne(url()).flush({ status: 401, errorCode: 'AUTH_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await f.settle(); expect(f.page.error).toContain('重新登录'); expect(f.page.canSave).toBe(false);
    f.http.expectNone(API.AUTH.REFRESH); f.http.expectNone(url());
  });
  it('does not request or display precise owner data for a shared device', async () => {
    const f = await render({ config: { isShared: true } }); expect(f.page.state).toBe('shared');
    expect(f.element.textContent).toContain('暂无位置访问权限'); expect(f.element.textContent).not.toMatch(/123\.456|45\.678/);
    expect(f.element.querySelector('form, app-location-map')).toBeNull();
    expect(f.getCurrentPosition).not.toHaveBeenCalled(); expect(f.deviceUi.watchState).not.toHaveBeenCalled(); f.http.expectNone(url());
  });
  it.each([{ state: 'deleted' }, { config: { disabled: true } }, { config: { isPreview: true } },
    { config: { mode: 'legacy' } }, { config: { isShared: undefined } }, { missing: true }, { authenticated: false }])(
    'refuses an invalid or unauthenticated device before HTTP %j', async options => {
      const f = await render(options); expect(f.page.state).toBe('unavailable'); expect(f.page.record).toBeNull();
      expect(f.element.querySelector('form, app-location-map, ion-spinner')).toBeNull();
      expect(f.getCurrentPosition).not.toHaveBeenCalled(); expect(f.deviceUi.watchState).not.toHaveBeenCalled(); f.http.expectNone(url());
    });
  it('drops the server projection and draft after owner permissions are revoked', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '2');
    f.device.config.isShared = true; f.data.deviceDataLoader.next(true); await f.settle();
    expect(f.page.record).toBeNull(); expect(f.page.longitude).toBe(''); expect(f.page.state).toBe('shared');
    expect(f.element.querySelector('form, .server-coordinates')).toBeNull(); f.http.expectNone(url());
  });
  it('clears server-denied access and does not trust an old local owner flag', async () => {
    const f = await render({ pendingRead: true });
    f.http.expectOne(url()).flush({ status: 403, errorCode: 'DEVICE_V2_LOCATION_OWNER_REQUIRED' }, { status: 403, statusText: 'Forbidden' });
    await f.settle(); expect(f.page.state).toBe('unavailable'); expect(f.page.record).toBeNull();
    expect(f.element.querySelector('form')).toBeNull(); f.http.expectNone(url());
  });
  it('cancels a read and clears old coordinates on logout, and never binds a new account from a late inventory event', async () => {
    const f = await render({ pendingRead: true }), request = f.http.expectOne(url());
    f.data.auth = null; f.data.sessionEpoch++; f.data.authDataChanged.next(); await f.settle();
    expect(request.cancelled).toBe(true); expect(f.page.record).toBeNull(); expect(f.page.longitude).toBe('');
    f.data.auth = { uuid: 'other', accessToken: 'other', refreshToken: 'other' }; f.data.sessionEpoch++;
    f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true); await f.settle();
    expect(f.page.state).toBe('unavailable'); f.http.expectNone(url());
  });
  it('preserves a normal same-context token notification without discarding a draft or making another request', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '2');
    f.data.authDataChanged.next(); await f.settle(); expect(f.page.longitude).toBe('2'); expect(f.page.record?.revision).toBe(1);
    f.http.expectNone(url());
  });
  it('preserves a background draft, hides coordinates and resumes through a fresh read plus review', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '2');
    f.visibility.active.next(false); await f.settle(); expect(f.element.querySelector('form, .server-coordinates')).toBeNull();
    expect(f.page.record).toBeNull(); f.visibility.active.next(true); await f.read({ ...recorded, revision: 2 });
    expect(f.page.longitude).toBe('2'); expect(f.page.reviewRequired).toBe(true); expect(f.page.canSave).toBe(false);
    f.http.expectNone(url());
  });
  it('treats a write interrupted by leaving as potentially committed and only reads on reentry', async () => {
    const f = await render(); await f.type('longitude', '0'); await f.type('latitude', '0'); await f.submit();
    const write = f.http.expectOne(url()); f.page.ionViewWillLeave(); await f.settle();
    expect(write.cancelled).toBe(true); expect(f.page.record).toBeNull(); expect(f.page.longitude).toBe('');
    f.page.ionViewWillEnter(); await f.read(recorded); expect(f.page.record?.revision).toBe(1); f.http.expectNone(url());
  });
  it('blocks revision overflow and releases all page subscriptions on destruction', async () => {
    const f = await render({ record: { ...recorded, revision: 0x7fffffff } });
    expect(f.page.canSave).toBe(false); expect(f.page.canClear).toBe(false);
    const authObservers = f.data.authDataChanged.observers.length;
    f.fixture.destroy(); expect(f.data.authDataChanged.observers.length).toBe(authObservers - 1);
    expect(f.data.deviceDataLoader.observers).toHaveLength(0); expect(f.visibility.active.observers).toHaveLength(0);
    expect(f.stateSnapshot.observers).toHaveLength(0);
    f.data.deviceDataLoader.next(true); f.page.ionViewWillEnter(); expect(f.page.record).toBeNull(); f.http.expectNone(url());
  });

  it('starts one phone fix only after the unset-state setup action and never saves the obtained point automatically', async () => {
    const f = await render(); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    expect(f.getCurrentPosition).not.toHaveBeenCalled(); expect(f.map()).toBeUndefined();
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    expect(f.page.editing).toBe(true); expect(f.page.locating).toBe(true); expect(f.map()?.editable).toBe(true);
    expect(f.getCurrentPosition).toHaveBeenCalledOnce(); expect(f.getCurrentPosition.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    f.http.expectNone(() => true); expect(f.page.record).toEqual(empty);
    resolve({ longitude: 0, latitude: 0, coordinateSystem: 'WGS84', accuracyMeters: 20, measuredAt: 1000 }); await f.settle();
    expect(f.page.longitude).toBe('0.000000'); expect(f.page.latitude).toBe('0.000000');
    expect(f.page.canSave).toBe(true); expect(f.page.record).toEqual(empty); expect(f.page.notice).toBe('');
    expect(f.map()?.point).toMatchObject({ longitude: 0, latitude: 0 }); f.http.expectNone(() => true);
  });
  it('shows an existing point as a readonly map and edits/cancels it without locating or writing', async () => {
    const f = await render({ record: recorded });
    expect(f.map()?.point).toEqual(recorded.location); expect(f.map()?.editable).toBe(false);
    expect(f.element.querySelector('.coordinate-entry, form')).toBeNull();
    f.element.querySelector<HTMLButtonElement>('.edit')!.click(); await f.settle();
    expect(f.map()?.editable).toBe(true); expect(f.getCurrentPosition).not.toHaveBeenCalled();
    f.map()!.pointChange.emit({ longitude: 1, latitude: 2 }); await f.settle();
    expect(f.page.longitude).toBe('1.000000');
    f.element.querySelector<HTMLButtonElement>('.cancel')!.click(); await f.settle();
    expect(f.page.editing).toBe(false); expect(f.map()?.point).toEqual(recorded.location);
    expect(f.page.longitude).toBe('120'); expect(f.page.record).toEqual(recorded); f.http.expectNone(() => true);
  });
  it('cancels a pending setup fix without adopting its late result or starting a replacement', async () => {
    const f = await render(); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    const signal = f.getCurrentPosition.mock.calls[0][0] as AbortSignal;
    f.element.querySelector<HTMLButtonElement>('.cancel')!.click(); await f.settle(); expect(signal.aborted).toBe(true);
    resolve({ longitude: 20, latitude: 30, coordinateSystem: 'WGS84' }); await f.settle();
    expect(f.page.editing).toBe(false); expect(f.page.longitude).toBe(''); expect(f.page.draftPoint).toBeNull();
    expect(f.map()).toBeUndefined(); expect(f.getCurrentPosition).toHaveBeenCalledOnce(); f.http.expectNone(() => true);
  });
  it.each(['map', 'input'] as const)('keeps the newer %s selection when an older phone fix arrives late', async source => {
    const f = await render(); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    const signal = f.getCurrentPosition.mock.calls[0][0] as AbortSignal;
    if (source === 'map') { f.map()!.pointChange.emit({ longitude: 0, latitude: 5 }); await f.settle(); }
    else { f.page.locationError = '上一次手机定位尚未结束'; await f.type('longitude', '0'); await f.type('latitude', '5'); }
    expect(signal.aborted).toBe(true); expect(f.page.locating).toBe(false);
    expect(f.page.locationError).toBe('');
    resolve({ longitude: 80, latitude: 60, coordinateSystem: 'WGS84' }); await f.settle();
    expect(Number(f.page.longitude)).toBe(0); expect(Number(f.page.latitude)).toBe(5);
    expect(f.map()?.point).toMatchObject({ longitude: 0, latitude: 5 });
    expect(f.page.canSave).toBe(true); expect(f.getCurrentPosition).toHaveBeenCalledOnce(); f.http.expectNone(() => true);
  });
  it('keeps manual map selection usable after permission denial and saves only on explicit confirmation', async () => {
    const f = await render(); f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    expect(f.element.querySelector('[role=alert]')?.textContent).toContain('定位权限');
    expect(f.page.locating).toBe(false); expect(f.map()?.editable).toBe(true);
    f.http.expectNone(() => true);
    f.map()!.pointChange.emit({ longitude: 0, latitude: 0 }); await f.settle();
    expect(f.page.locationError).toBe(''); expect(f.page.canSave).toBe(true); await f.submit();
    const request = f.http.expectOne(url()); expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ expectedRevision: 0,
      location: { longitude: 0, latitude: 0, coordinateSystem: 'WGS84', source: 'manual' } });
    expect(f.page.notice).toBe(''); expect(f.page.record).toEqual(empty);
    request.flush({ status: 200, data: { ...recorded, location: request.request.body.location } }, { headers: { 'Cache-Control': 'no-store' } });
    await f.settle(); expect(f.page.notice).toBe('位置已保存'); expect(f.page.editing).toBe(false);
    expect(f.getCurrentPosition).toHaveBeenCalledOnce(); expect(f.browserLocation).not.toHaveBeenCalled();
    expect(f.saveDeviceConfig).not.toHaveBeenCalled(); f.http.expectNone(() => true);
  });
  it.each(['leave', 'background', 'account'] as const)('drops a late phone fix and local state subscription after %s', async mode => {
    const f = await render({ record: recorded }); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.page.startEditing(); const work = f.page.locate(); await f.settle();
    const signal = f.getCurrentPosition.mock.calls[0][0] as AbortSignal;
    expect(f.stateSnapshot.observers).toHaveLength(1);
    if (mode === 'leave') f.page.ionViewWillLeave();
    else if (mode === 'background') f.visibility.active.next(false);
    else { f.data.auth = { uuid: 'other', accessToken: 'other', refreshToken: 'other' }; f.data.sessionEpoch++; f.data.authDataChanged.next(); }
    await f.settle(); expect(signal.aborted).toBe(mode !== 'background'); expect(f.stateSnapshot.observers).toHaveLength(0);
    resolve({ longitude: 99, latitude: 88, coordinateSystem: 'WGS84' }); await work; await f.settle();
    expect(f.page.record).toBeNull(); expect(f.map()).toBeUndefined(); expect(f.page.longitude).not.toBe('99.000000');
    expect(f.page.canSave).toBe(false); expect(f.getCurrentPosition).toHaveBeenCalledOnce(); f.http.expectNone(() => true);
  });
  it('allows a cancelled empty draft to recover from a fresh null record without getting stuck', async () => {
    const f = await render();
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    f.map()!.pointChange.emit({ longitude: 0, latitude: 0 }); await f.settle();
    f.visibility.active.next(false); await f.settle();
    f.visibility.active.next(true); await f.read(empty);
    expect(f.page.reviewRequired).toBe(true); expect(f.page.canSave).toBe(false);
    f.element.querySelector<HTMLButtonElement>('.cancel')!.click(); await f.settle();
    expect(f.map()).toBeUndefined(); expect(f.element.querySelector('.review')).not.toBeNull();
    f.element.querySelector<HTMLButtonElement>('.review')!.click(); await f.settle();
    expect(f.page.canMutate).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.setup')!.disabled).toBe(false);
    f.http.expectNone(() => true);
  });
  it('shows the confirmed marker separately while reviewing a conflict without replacing the draft', async () => {
    const f = await render({ record: recorded }); await f.type('longitude', '0'); await f.type('latitude', '0'); await f.submit();
    f.http.expectOne(url()).flush({ status: 409, errorCode: 'DEVICE_V2_LOCATION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    await f.settle(); void f.page.reload(); await f.read({ ...recorded, revision: 3 });
    expect(f.map()?.point).toMatchObject({ longitude: 0, latitude: 0 });
    f.element.querySelector<HTMLButtonElement>('.compare')!.click(); await f.settle();
    expect(f.map()?.point).toEqual(recorded.location); expect(f.map()?.editable).toBe(false);
    expect(f.page.longitude).toBe('0'); expect(f.page.canSave).toBe(false);
    f.element.querySelector<HTMLButtonElement>('.review')!.click(); await f.settle();
    expect(f.map()?.point).toMatchObject({ longitude: 0, latitude: 0 }); expect(f.page.canSave).toBe(true);
    f.http.expectNone(() => true);
  });
  it.each(['read-first', 'fix-first'] as const)('finishes the same permission-paused one-shot fix after resume (%s), without retry or needless review', async order => {
    const f = await render(); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    const signal = f.getCurrentPosition.mock.calls[0][0] as AbortSignal;
    f.visibility.active.next(false); await f.settle();
    expect(signal.aborted).toBe(false); expect(f.map()).toBeUndefined();
    f.visibility.active.next(true); await f.settle();
    if (order === 'read-first') await f.read(empty);
    resolve({ longitude: 99, latitude: 88, coordinateSystem: 'WGS84' }); await f.settle();
    if (order === 'fix-first') await f.read(empty);
    expect(f.page.draftPoint).toMatchObject({ longitude: 99, latitude: 88 }); expect(f.page.reviewRequired).toBe(false);
    expect(f.element.querySelector('.locate')!.textContent).toContain('使用手机当前位置');
    expect(f.getCurrentPosition).toHaveBeenCalledOnce(); expect(f.page.canSave).toBe(true); f.http.expectNone(() => true);
  });
  it('discards a fix completed while hidden and never restarts it on resume', async () => {
    const f = await render(); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    f.visibility.active.next(false); await f.settle();
    resolve({ longitude: 99, latitude: 88, coordinateSystem: 'WGS84' }); await f.settle();
    expect(f.page.draftPoint).toBeNull(); expect(f.page.locationError).toContain('定位未完成');
    f.visibility.active.next(true); await f.read(empty);
    expect(f.page.draftPoint).toBeNull(); expect(f.getCurrentPosition).toHaveBeenCalledOnce(); f.http.expectNone(() => true);
  });
  it('still requires review if the server location changes while the same fix waits for permission', async () => {
    const f = await render(); let resolve!: (point: unknown) => void;
    f.getCurrentPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.element.querySelector<HTMLButtonElement>('.setup')!.click(); await f.settle();
    f.visibility.active.next(false); await f.settle();
    f.visibility.active.next(true); await f.read(recorded);
    resolve({ longitude: 99, latitude: 88, coordinateSystem: 'WGS84' }); await f.settle();
    expect(f.page.draftPoint).toMatchObject({ longitude: 99, latitude: 88 });
    expect(f.page.reviewRequired).toBe(true); expect(f.page.canSave).toBe(false); f.http.expectNone(() => true);
  });
  it('projects accepted home-card aliases and values without connecting, querying, leasing or writing preferences', async () => {
    vi.spyOn(HomeCardPreferencesStore.prototype, 'load').mockReturnValue({ raw: null, value: { version: 3, revision: 0,
      layouts: {}, orders: {}, slots: { [id]: [{ key: 'temperature', kind: 0, type: 3 },
        { key: 'button', kind: 1, type: 0, mode: 'action' }] } } });
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const f = await render({ record: recorded });
    f.device.displayMetadata = { logicalDeviceId: id, revision: 1, name: '客厅温度计', capabilities: [
      { key: 'temperature', kind: 0, type: 3, displayName: '室内温度' },
      { key: 'button', kind: 1, type: 0, displayName: '执行按钮' },
    ] };
    const snapshot: DeviceUiSnapshot = { ...f.stateSnapshot.value, endpoints: [
      { id: 1, key: 'temperature', manifestKind: 0, manifestType: 3, role: 'property', valueType: 'number',
        readable: true, writable: false, notifies: true, value: 23.5, unit: '℃' },
      { id: 2, key: 'button', manifestKind: 1, manifestType: 0, role: 'action', valueType: 'boolean',
        readable: false, writable: true, notifies: false, value: false },
    ] };
    f.stateSnapshot.next(snapshot); await f.settle();
    expect(f.element.querySelector('.device-heading h1')?.textContent).toBe('客厅温度计');
    expect(f.page.summary).toEqual([{ label: '室内温度', value: '23.5℃' }]);
    expect(f.element.querySelector('.device-summary')?.textContent).toContain('室内温度');
    expect(f.element.textContent).not.toContain('执行按钮'); expect(f.deviceUi.watchState).toHaveBeenCalledExactlyOnceWith(id);
    f.stateSnapshot.next({ ...snapshot, stateFresh: false }); await f.settle();
    expect(f.element.querySelector('.last-state')?.textContent).toContain('上次状态');
    for (const action of [f.deviceUi.connect, f.deviceUi.query, f.deviceUi.command, f.deviceUi.openTelemetry]) expect(action).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled(); expect(f.getCurrentPosition).not.toHaveBeenCalled(); f.http.expectNone(() => true);
    f.visibility.active.next(false); await f.settle(); expect(f.stateSnapshot.observers).toHaveLength(0); expect(f.page.summary).toEqual([]);
    f.visibility.active.next(true); await f.read(recorded); expect(f.stateSnapshot.observers).toHaveLength(1);
    expect(f.deviceUi.watchState).toHaveBeenCalledTimes(2);
    f.page.ionViewWillLeave(); await f.settle(); expect(f.stateSnapshot.observers).toHaveLength(0); expect(f.page.summary).toEqual([]);
    f.http.expectNone(() => true);
  });
});
