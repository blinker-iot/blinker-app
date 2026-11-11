import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, NavController } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../configs/api.config';
import type { DeviceV2AccountSource } from '../../core/device-v2/account-scope';
import type { OrderData } from '../../core/model/data.model';
import type { RegionSnapshot } from '../../core/model/region.model';
import { DataService } from '../../core/services/data.service';
import { RoomEditPage } from './room-edit/room-edit';
import { RoomManagerPage } from './room-manager/room-manager';
import { RoomService } from './room.service';

// Actual page handlers, RoomService, account guards and HTTP serialization;
// only account restoration, backend responses and navigation are local doubles.
describe('room cold reads through the guarded HTTP chain', () => {
  const snapshot: RegionSnapshot = { revision: 7, order: ['客厅'], rooms: { 客厅: ['lamp'] } };
  let data: DeviceV2AccountSource & {
    authDataChanged: Subject<void>; userDataLoader: BehaviorSubject<boolean>;
    room: OrderData; roomRevision: number | null; loadRegions: (snapshot: RegionSnapshot) => void;
    device: { list: string[]; dict: Record<string, unknown> };
  };
  let http: HttpTestingController;
  let rooms: RoomService;
  let page: RoomManagerPage | RoomEditPage | undefined;
  let nav: { navigateBack: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    data = {
      auth: null, user: {}, sessionEpoch: 0, authDataChanged: new Subject<void>(), userDataLoader: new BehaviorSubject(false),
      room: { list: [], dict: {} }, roomRevision: null, device: { list: ['lamp', 'sensor'], dict: {} },
      loadRegions: value => {
        if (data.roomRevision !== null && value.revision < data.roomRevision) return;
        data.room = { list: [...value.order], dict: structuredClone(value.rooms) }; data.roomRevision = value.revision;
        data.userDataLoader.next(true);
      },
    };
    nav = { navigateBack: vi.fn(async () => true) };
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), RoomService, { provide: DataService, useValue: data },
    ] });
    rooms = TestBed.inject(RoomService); http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { page?.ngOnDestroy(); page = undefined; http.verify(); TestBed.resetTestingModule(); });

  function create(kind: 'manager' | 'editor') {
    const alerts = { create: vi.fn() } as unknown as AlertController;
    page = kind === 'manager'
      ? new RoomManagerPage({ getCurrentNavigation: () => null, navigate: vi.fn() } as unknown as Router,
        rooms, alerts, data as unknown as DataService)
      : new RoomEditPage(data as unknown as DataService, rooms, alerts,
        { snapshot: { params: { room: '客厅' } } } as unknown as ActivatedRoute, nav as unknown as NavController);
    return page;
  }
  async function settled() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  function restored() { data.auth = { uuid: 'account-a' }; data.sessionEpoch++; data.authDataChanged.next(); }
  function read() {
    const request = http.expectOne(API.ACCOUNT.REGIONS); expect(request.request.method).toBe('GET'); return request;
  }
  async function finishRead() { read().flush({ data: snapshot }); await settled(); }

  it.each(['manager', 'editor'] as const)('%s recovers an empty cold identity once without user-loader feedback', async kind => {
    const p = create(kind); await p.ionViewDidEnter();
    expect(p.loaded).toBe(false); http.expectNone(API.ACCOUNT.REGIONS);
    expect(data.authDataChanged.observed).toBe(true);
    restored(); await settled();
    const request = read();
    data.authDataChanged.next(); data.userDataLoader.next(true); await settled(); http.expectNone(API.ACCOUNT.REGIONS);
    request.flush({ data: snapshot }); await settled();
    expect(p.loaded).toBe(true); expect(p.error).toBe(''); expect(data.authDataChanged.observed).toBe(false);
    data.authDataChanged.next(); data.userDataLoader.next(true); await settled(); http.expectNone(API.ACCOUNT.REGIONS);
  });

  it('recovers when a restored token acquires its UUID in the same session', async () => {
    data.auth = {}; data.sessionEpoch = 3;
    const p = create('editor'); await p.ionViewDidEnter(); http.expectNone(API.ACCOUNT.REGIONS);
    data.authDataChanged.next(); await settled(); http.expectNone(API.ACCOUNT.REGIONS);
    data.auth = { uuid: 'account-a' }; data.authDataChanged.next(); await settled(); await finishRead();
    expect(p.loaded).toBe(true); expect((p as RoomEditPage).currentRoomData).toEqual(['lamp']);
  });

  it.each(['manager', 'editor'] as const)('%s handles restoration before the failed capture reaches catch', async kind => {
    const p = create(kind), first = p.ionViewDidEnter(); restored();
    await first; await settled(); await finishRead(); expect(p.loaded).toBe(true);
    http.expectNone(API.ACCOUNT.REGIONS);
  });

  it('does not automatically retry a real read failure; the existing reload still works', async () => {
    const p = create('manager'); await p.ionViewDidEnter(); restored(); await settled();
    read().flush({ message: 'unavailable' }, { status: 503, statusText: 'Unavailable' }); await settled();
    expect(p.error).toContain('区域同步失败'); expect(p.loaded).toBe(false); expect(data.authDataChanged.observed).toBe(false);
    data.authDataChanged.next(); data.userDataLoader.next(true); await settled(); http.expectNone(API.ACCOUNT.REGIONS);
    const manual = p.load(); await finishRead(); await manual; expect(p.loaded).toBe(true);
  });

  it.each(['manager', 'editor'] as const)('%s stops cold recovery on cached leave and can read on re-entry', async kind => {
    const p = create(kind); await p.ionViewDidEnter(); p.ionViewWillLeave();
    expect(data.authDataChanged.observed).toBe(false); restored(); await settled(); http.expectNone(API.ACCOUNT.REGIONS);
    const entering = p.ionViewDidEnter(); await finishRead(); await entering; expect(p.loaded).toBe(true);
  });

  it.each(['manager', 'editor'] as const)('%s ignores an HTTP result arriving after leave', async kind => {
    restored(); const p = create(kind), first = p.ionViewDidEnter(); const request = read();
    p.ionViewWillLeave(); request.flush({ data: snapshot }); await first; expect(p.loaded).toBe(false);
    const entering = p.ionViewDidEnter(); await finishRead(); await entering; expect(p.loaded).toBe(true);
  });

  it.each(['manager', 'editor'] as const)('%s keeps the real account guard against a late cross-session response', async kind => {
    restored(); const p = create(kind), first = p.ionViewDidEnter(); const request = read();
    data.auth = { uuid: 'account-b' }; data.sessionEpoch++; data.authDataChanged.next();
    request.flush({ data: snapshot }); await first; expect(p.loaded).toBe(false);
    expect(data.roomRevision).toBeNull(); expect(data.room).toEqual({ list: [], dict: {} });
    http.expectNone(API.ACCOUNT.REGIONS);
  });

  it('keeps a recovered editing draft across notifications and same-session re-entry, then uses original CAS', async () => {
    const p = create('editor') as RoomEditPage; await p.ionViewDidEnter(); restored(); await settled(); await finishRead();
    p.toggleDevice('sensor');
    data.authDataChanged.next(); data.userDataLoader.next(true); await settled();
    p.ionViewWillLeave(); await p.ionViewDidEnter(); http.expectNone(API.ACCOUNT.REGIONS);
    expect(p.currentRoomData).toEqual(['lamp', 'sensor']); expect(data.room.dict['客厅']).toEqual(['lamp']);
    const save = p.save(), request = http.expectOne(API.ACCOUNT.REGIONS);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ expectedRevision: 7, order: ['客厅'], rooms: { 客厅: ['lamp', 'sensor'] } });
    request.flush({ data: { revision: 8, order: ['客厅'], rooms: { 客厅: ['lamp', 'sensor'] } } }); await save;
    expect(nav.navigateBack).toHaveBeenCalledExactlyOnceWith('/room-manager');
  });

  it('does not reload a loaded draft after a session change or weaken its original save fence', async () => {
    restored(); const p = create('editor') as RoomEditPage, entering = p.ionViewDidEnter(); await finishRead(); await entering;
    p.toggleDevice('sensor'); data.auth = { uuid: 'account-b' }; data.sessionEpoch++; data.authDataChanged.next(); await settled();
    expect(p.currentRoomData).toEqual(['lamp', 'sensor']); http.expectNone(API.ACCOUNT.REGIONS);
    await p.save(); expect(p.error).not.toBe(''); expect(nav.navigateBack).not.toHaveBeenCalled(); http.expectNone(API.ACCOUNT.REGIONS);
  });

  it('does not let a manual read replace a draft during an in-flight save', async () => {
    restored(); const p = create('editor') as RoomEditPage, entering = p.ionViewDidEnter(); await finishRead(); await entering;
    p.toggleDevice('sensor'); const save = p.save(); const request = http.expectOne(API.ACCOUNT.REGIONS);
    await p.load(); http.expectNone(API.ACCOUNT.REGIONS); expect(p.currentRoomData).toEqual(['lamp', 'sensor']);
    request.flush({ data: { ...snapshot, revision: 8 } }); await save;
  });
});
