import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2BleService } from '../../../core/services/device-v2-ble.service';
import { UserService } from '../../../core/services/user.service';
import { BleDeviceGuidePage } from './ble-device.page';

const sourceId = 'device_11111111-1111-4111-8111-111111111111';
const targetId = 'ble_AgICAgICAgICAgICAgICAg';
const requestId = 'AwMDAwMDAwMDAwMDAwMDAw';
const target = { device: { deviceId: 'offline-native-handle', name: 'Offline Direct fixture' } };
const dictionary = JSON.parse(readFileSync(resolve('public/i18n/zh_cn/zh_cn.json'), 'utf8'));
function checkpoint(phase: string = 'unknown'): any {
  return { request: { requestId, sourceLogicalDeviceId: sourceId, name: 'Fixture BLE', targetProduct: 'ble_direct' },
    phase, ...(phase === 'prepared' ? { intent: { state: 'prepared' } } : {}) };
}
const committed = () => ({ intent: { state: 'committed', targetLogicalDeviceId: targetId,
  device: { logicalDeviceId: targetId, state: 'active' } }, localReferencePending: false });

describe('IP-2 original BLE guide explicit product registration', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  async function render(records: any[] = []) {
    const changes = new Subject<void>(), active = new BehaviorSubject(true);
    const data = { auth: { accessToken: 'offline-not-a-token' }, sessionEpoch: 1, authDataChanged: changes };
    const ble = {
      pendingEnrollmentLogicalDeviceIds: vi.fn().mockResolvedValue([]),
      accessRegistrationSources: vi.fn().mockResolvedValue([{ logicalDeviceId: sourceId, displayName: 'Fixture Cloud' }]),
      accessRegistrationCheckpoints: vi.fn().mockResolvedValue(records),
      discoverAccessRegistrationTargets: vi.fn().mockResolvedValue([target]),
      beginAccessRegistration: vi.fn().mockResolvedValue(committed()),
      continueAccessRegistration: vi.fn().mockResolvedValue(committed()),
      recoverAccessRegistration: vi.fn().mockResolvedValue({ intent: { state: 'prepared' }, localReferencePending: false }),
      cancelAccessRegistration: vi.fn(), clearAccessRegistration: vi.fn().mockResolvedValue(undefined),
      discoverProvisioningDevices: vi.fn(), enroll: vi.fn(), resume: vi.fn(),
    };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) }, nav = { navigateRoot: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({ imports: [BleDeviceGuidePage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: DeviceV2BleService, useValue: ble }, { provide: DataService, useValue: data },
      { provide: AppVisibilityService, useValue: { active } }, { provide: UserService, useValue: users },
      { provide: NavController, useValue: nav },
    ] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('ip2-fixture', dictionary); translate.use('ip2-fixture');
    const fixture = TestBed.createComponent(BleDeviceGuidePage), page = fixture.componentInstance;
    fixture.autoDetectChanges(); page.ionViewWillEnter();
    await vi.waitFor(() => expect(page.registration.sources).toHaveLength(1));
    await fixture.whenStable(); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    async function click(selector: string) {
      const button = element.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull();
      button!.click(); await fixture.whenStable(); fixture.detectChanges();
    }
    return { fixture, page, ble, users, nav, active, changes, data, element, click };
  }
  it('requires explicit source and Direct candidate selection before creating one independent registration', async () => {
    const f = await render();
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled();
    await f.click('.ble-registration-sources button');
    expect(f.ble.discoverAccessRegistrationTargets).toHaveBeenCalledOnce();
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled();
    expect(f.ble.enroll).not.toHaveBeenCalled();
    await f.click('.ble-registration-targets button');
    expect(f.ble.beginAccessRegistration).toHaveBeenCalledExactlyOnceWith(sourceId, expect.any(String), expect.any(AbortSignal), target);
    expect(f.page.phase).toBe('ready'); expect(f.page.logicalDeviceId).toBe(targetId);
    expect(f.element.querySelector('.ready')?.textContent).not.toContain(dictionary.DEVICE_GUIDE.BLE_READY_DESCRIPTION);
    expect(f.ble.enroll).not.toHaveBeenCalled();
  });
  it('lists UNKNOWN locally but reads only on the explicit action and never retries a write', async () => {
    const f = await render([checkpoint()]);
    expect(f.ble.recoverAccessRegistration).not.toHaveBeenCalled();
    expect(f.element.querySelector('.ble-registration-continue')).toBeNull();
    expect(f.element.querySelector('.ble-registration-cancel')).toBeNull();
    await f.click('.ble-registration-read');
    expect(f.ble.recoverAccessRegistration).toHaveBeenCalledExactlyOnceWith(requestId, expect.any(AbortSignal));
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled(); expect(f.ble.enroll).not.toHaveBeenCalled();
    expect(f.ble.discoverAccessRegistrationTargets).not.toHaveBeenCalled();
  });
  it('continues only a prepared original intent after a new explicit target selection', async () => {
    const f = await render([checkpoint('prepared')]);
    await f.click('.ble-registration-continue');
    expect(f.ble.continueAccessRegistration).not.toHaveBeenCalled();
    await f.click('.ble-registration-targets button');
    expect(f.ble.continueAccessRegistration).toHaveBeenCalledExactlyOnceWith(requestId, expect.any(AbortSignal), target);
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled();
  });
  it('retires candidate selection on background and does no remote work on foreground return', async () => {
    const f = await render(); await f.click('.ble-registration-sources button');
    f.active.next(false); await f.fixture.whenStable(); f.fixture.detectChanges();
    expect((f.ble.discoverAccessRegistrationTargets.mock.calls as unknown[][])[0][0]).toHaveProperty('aborted', true);
    expect(f.element.querySelector('.ble-registration-targets')).toBeNull();
    f.active.next(true); await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.ble.discoverAccessRegistrationTargets).toHaveBeenCalledOnce();
    expect(f.ble.recoverAccessRegistration).not.toHaveBeenCalled(); expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled();
  });
  it('aborts an in-flight registration and ignores its late result after account replacement', async () => {
    const f = await render(); await f.click('.ble-registration-sources button');
    let resolve!: (result: ReturnType<typeof committed>) => void;
    f.ble.beginAccessRegistration.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.element.querySelector<HTMLButtonElement>('.ble-registration-targets button')!.click();
    await Promise.resolve();
    const signal = f.ble.beginAccessRegistration.mock.calls[0][2] as AbortSignal;
    f.data.sessionEpoch++; f.changes.next(); expect(signal.aborted).toBe(true);
    resolve(committed()); await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.page.logicalDeviceId).toBe(''); expect(f.page.phase).not.toBe('ready');
    expect(f.ble.beginAccessRegistration).toHaveBeenCalledOnce();
  });
  it('keeps registration confirmed if the following account list refresh fails', async () => {
    const f = await render(); await f.click('.ble-registration-sources button');
    await f.click('.ble-registration-targets button'); f.users.getAllInfo.mockRejectedValueOnce(Error('offline'));
    await f.page.finish(); await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.page.phase).toBe('ready'); expect(f.page.logicalDeviceId).toBe(targetId);
    expect(f.element.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.ble.beginAccessRegistration).toHaveBeenCalledOnce();
  });
  it('retires the selected preserving-root target when explicitly switching to original enrollment recovery', async () => {
    const f = await render(); await f.click('.ble-registration-sources button');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    f.page.pendingEnrollments = ['ble_original_pending'];
    f.ble.resume.mockRejectedValueOnce(Error('offline fixture'));
    await f.page.resumeEnrollment('ble_original_pending'); await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.element.querySelector('.ble-registration-targets')).toBeNull();
    expect((f.ble.discoverAccessRegistrationTargets.mock.calls as unknown[][])[0][0]).toHaveProperty('aborted', true);
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled(); expect(f.ble.resume).toHaveBeenCalledOnce();
  });
  it('keeps confirmed-but-local-pending registration separate from a usable card confirmation', async () => {
    const f = await render(); await f.click('.ble-registration-sources button');
    f.ble.beginAccessRegistration.mockResolvedValueOnce({ ...committed(), localReferencePending: true });
    await f.click('.ble-registration-targets button');
    expect(f.page.phase).toBe('idle'); expect(f.page.logicalDeviceId).toBe('');
    expect(f.element.querySelector('.ready')).toBeNull();
    expect(f.element.querySelector('[role="status"]')?.textContent).toContain(dictionary.DEVICE_GUIDE.BLE_REGISTRATION_LOCAL_PENDING);
    expect(f.ble.beginAccessRegistration).toHaveBeenCalledOnce(); expect(f.ble.recoverAccessRegistration).not.toHaveBeenCalled();
  });
  it('preserves registration success and separately reports pending nearby confirmation without retry', async () => {
    const f = await render(); await f.click('.ble-registration-sources button');
    f.ble.beginAccessRegistration.mockResolvedValueOnce({ ...committed(), presenceSetupPending: true });
    await f.click('.ble-registration-targets button');
    expect(f.page.phase).toBe('ready'); expect(f.page.logicalDeviceId).toBe(targetId);
    expect(f.element.querySelector('.ready')?.textContent).toContain(dictionary.DEVICE_GUIDE.BLE_REGISTRATION_READY_TITLE);
    expect(f.element.querySelector('.ble-registration-presence-pending')?.textContent)
      .toContain(dictionary.DEVICE_GUIDE.BLE_REGISTRATION_PRESENCE_PENDING);
    expect(f.element.querySelector('[role="alert"]')).toBeNull();
    expect(f.ble.beginAccessRegistration).toHaveBeenCalledOnce();
    expect(f.ble.recoverAccessRegistration).not.toHaveBeenCalled();
  });
  it('shows a certain rejected prepare as terminal without a recovery read or blocking a new explicit choice', async () => {
    const rejected = { ...checkpoint(), phase: 'rejected', intent: undefined, unknownOperation: undefined,
      localReferencePending: false,
      prepareRejection: { httpStatus: 409, code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING' } };
    const f = await render([rejected]);
    expect(f.element.querySelector('.ble-registration-read')).toBeNull();
    expect(f.element.textContent).toContain(dictionary.DEVICE_GUIDE.BLE_REGISTRATION_REJECTED);
    expect(f.element.querySelector<HTMLButtonElement>('.ble-registration-sources button')?.disabled).toBe(false);
    expect(f.ble.recoverAccessRegistration).not.toHaveBeenCalled();
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled();
  });
  it('reports missing Direct runtime candidates without starting an empty-root enrollment or prepare', async () => {
    const f = await render(); f.ble.discoverAccessRegistrationTargets.mockResolvedValueOnce([]);
    await f.click('.ble-registration-sources button');
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain(dictionary.DEVICE_GUIDE.BLE_REGISTRATION_NOT_FOUND);
    expect(f.ble.beginAccessRegistration).not.toHaveBeenCalled(); expect(f.ble.enroll).not.toHaveBeenCalled();
  });
  it('defines every new registration label in all registered locales without exposing diagnostic identifiers', () => {
    const languages = JSON.parse(readFileSync(resolve('public/i18n/i18n.json'), 'utf8')) as Array<{ code: string }>;
    const keys = Object.keys(dictionary.DEVICE_GUIDE).filter(key => key.startsWith('BLE_REGISTRATION_'));
    expect(keys.length).toBeGreaterThan(0);
    for (const { code } of languages) {
      const locale = JSON.parse(readFileSync(resolve(`public/i18n/${code}/${code}.json`), 'utf8'));
      for (const key of keys) {
        expect(typeof locale.DEVICE_GUIDE[key], `${code}: ${key}`).toBe('string');
        expect(locale.DEVICE_GUIDE[key].trim(), `${code}: ${key}`).not.toBe('');
        expect(locale.DEVICE_GUIDE[key]).not.toMatch(/DEVICE_GUIDE\.|PRIVATE_|DEVICE_V2_/);
      }
    }
  });
});
