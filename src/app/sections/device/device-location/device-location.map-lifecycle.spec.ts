import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { LocationMapComponent } from '../../../core/components/location-map/location-map.component';
import { DeviceLocationRecord } from '../../../core/device-v2/device-location';
import { DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { ServerInterceptor } from '../../../core/injectable/server.interceptor';
import { ManagedMapError, ManagedMapSession } from '../../../core/maps/managed-map';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { MapTileClientService } from '../../../core/services/map-tile-client.service';
import { PhoneLocationService } from '../../../core/services/phone-location.service';
import { DeviceLocationPage } from './device-location.page';

const id = 'device_location_map_owner';
const recorded: DeviceLocationRecord = { logicalDeviceId: id, revision: 1, updatedAt: 1000,
  location: { longitude: 120, latitude: 30, coordinateSystem: 'WGS84', source: 'manual' } };

describe('location page retains the real map terminal state across foreground recovery', () => {
  let fixture: ComponentFixture<DeviceLocationPage> | undefined;
  afterEach(() => {
    try { TestBed.inject(HttpTestingController).verify(); }
    finally {
      fixture?.destroy(); fixture = undefined;
      TestBed.resetTestingModule(); localStorage.clear(); vi.restoreAllMocks();
    }
  });

  it.each(['auth', 'limit', 'disabled'] as const)(
    'keeps %s terminal while hiding and releasing the child, until an explicit retry', async kind => {
      localStorage.clear();
      const data = { auth: { uuid: 'owner', accessToken: 'test-access', refreshToken: 'test-refresh' },
        sessionEpoch: 1, authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(true),
        device: { dict: { [id]: { state: 'active', deviceName: id, name: '位置测试设备',
          config: { mode: 'bbp2', disabled: false, isPreview: false, isShared: false } } } } };
      const visibility = { active: new BehaviorSubject(true) };
      const snapshot = new BehaviorSubject<DeviceUiSnapshot>({ manifestAccepted: true, manifestRevision: 1,
        manifestFingerprint: 'accepted-test', stateRevision: 1, stateFresh: true, endpoints: [] });
      const loadConfig = vi.fn().mockResolvedValue({ enabled: false });
      if (kind !== 'disabled') loadConfig.mockRejectedValueOnce(new ManagedMapError(kind));
      const sessions: ManagedMapSession[] = [];
      const createSession = vi.fn(() => {
        let open = true;
        const session: ManagedMapSession = { loadConfig, getTile: vi.fn(), current: () => open,
          close: vi.fn(() => { open = false; }) };
        sessions.push(session); return session;
      });
      const phoneLocation = { current: vi.fn() };
      TestBed.configureTestingModule({ imports: [DeviceLocationPage], providers: [
        provideRouter([]), provideIonicAngular({ animated: false }),
        provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
        { provide: DataService, useValue: data }, { provide: AppVisibilityService, useValue: visibility },
        { provide: MapTileClientService, useValue: { createSession } },
        { provide: PhoneLocationService, useValue: phoneLocation },
        { provide: DeviceUiPort, useValue: { watchState: () => snapshot.asObservable() } },
        { provide: NavController, useValue: { navigateRoot: vi.fn() } },
      ] });
      await TestBed.compileComponents();
      fixture = TestBed.createComponent(DeviceLocationPage);
      const page = fixture.componentInstance, http = TestBed.inject(HttpTestingController);
      const element = fixture.nativeElement as HTMLElement;
      const child = () => fixture!.debugElement.query(By.directive(LocationMapComponent))?.componentInstance as LocationMapComponent | undefined;
      const settle = async () => {
        for (let pass = 0; pass < 3; pass++) {
          fixture!.detectChanges();
          for (let tick = 0; tick < 12; tick++) await Promise.resolve();
        }
        fixture!.detectChanges();
      };
      const read = async () => {
        const request = http.expectOne(API.DEVICE_V2.LOCATION(id));
        expect(request.request.method).toBe('GET');
        request.flush({ status: 200, data: recorded }, { headers: { 'Cache-Control': 'no-store' } });
        await settle();
      };

      fixture.detectChanges(); page.ionViewWillEnter(); await settle();
      expect(child()!.active).toBe(false); expect(loadConfig).not.toHaveBeenCalled();
      await read();
      const originalChild = child()!;
      const failureState = kind === 'disabled' ? 'unavailable' : kind;
      expect(originalChild).toBeInstanceOf(LocationMapComponent);
      expect(originalChild.mapState).toBe(failureState);
      expect(createSession).toHaveBeenCalledOnce(); expect(loadConfig).toHaveBeenCalledOnce();
      expect(sessions[0].close).toHaveBeenCalledOnce();

      visibility.active.next(false); await settle();
      expect(child()).toBe(originalChild);
      expect(element.querySelector<HTMLElement>('.map-area')!.hidden).toBe(true);
      expect(originalChild.active).toBe(false);
      expect(element.querySelector('.leaflet-pane')).toBeNull();
      expect(page.record).toBeNull();

      visibility.active.next(true); await settle(); await read();
      expect(child()).toBe(originalChild);
      expect(element.querySelector<HTMLElement>('.map-area')!.hidden).toBe(false);
      expect(originalChild.mapState).toBe(failureState);
      expect(createSession).toHaveBeenCalledOnce(); expect(loadConfig).toHaveBeenCalledOnce();
      expect(phoneLocation.current).not.toHaveBeenCalled();
      expect(sessions.every(session => vi.mocked(session.getTile).mock.calls.length === 0)).toBe(true);

      originalChild.refresh(); await settle();
      expect(createSession).toHaveBeenCalledTimes(2); expect(loadConfig).toHaveBeenCalledTimes(2);
      http.expectNone(() => true);
    });
});
