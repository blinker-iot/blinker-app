import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { GatewayHttpError } from '../../../core/model/response.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2BleService } from '../../../core/services/device-v2-ble.service';
import { UserService } from '../../../core/services/user.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { BleDeviceGuidePage } from './ble-device.page';

const conflictCode = 'DEVICE_V2_BLE_CLOUD_IDENTITY_CONFLICT';
const conflictKey = 'BLE_CLOUD_IDENTITY_CONFLICT';
const conflictCopy = '该设备已有云端接入记录，请核对并使用原设备记录；不会自动合并或重置。';
const dictionary = JSON.parse(readFileSync(resolve('public/i18n/zh_cn/zh_cn.json'), 'utf8'));

describe('DA-1 BLE cloud identity conflict production template', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  async function render(status = 409, code = conflictCode, sharedCopy = false) {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const changes = new Subject<void>();
    const data = { auth: { accessToken: 'offline-fixture-not-a-token' }, sessionEpoch: 1, authDataChanged: changes };
    const ble = {
      enroll: vi.fn().mockRejectedValue(new GatewayHttpError({ httpStatus: status, code,
        message: 'PRIVATE_UPSTREAM_DETAIL PRIVATE_DEVICE_ID', data: { logicalDeviceId: 'PRIVATE_DEVICE_ID' } })),
      pendingEnrollmentLogicalDeviceIds: vi.fn().mockResolvedValue([]),
      accessRegistrationSources: vi.fn().mockResolvedValue([]), accessRegistrationCheckpoints: vi.fn().mockResolvedValue([]),
      discoverProvisioningDevices: vi.fn().mockResolvedValue([]), resume: vi.fn(),
    };
    const nav = { navigateRoot: vi.fn().mockResolvedValue(true) };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({ imports: [BleDeviceGuidePage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: DeviceV2BleService, useValue: ble }, { provide: DataService, useValue: data },
      { provide: NavController, useValue: nav }, { provide: UserService, useValue: users },
      { provide: AppVisibilityService, useValue: { active: new BehaviorSubject(true) } },
    ] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    // Expected copy is a fixture until production locales gain this one key.
    // Mapping must depend on the stable reason, never equality of translations.
    translate.setTranslation('da1-fixture', { DEVICE_GUIDE: { ...dictionary.DEVICE_GUIDE,
      [conflictKey]: conflictCopy, ...(sharedCopy ? { BLE_ENROLL_FAILED: conflictCopy } : {}),
    } });
    translate.use('da1-fixture');
    const fixture = TestBed.createComponent(BleDeviceGuidePage);
    const page = fixture.componentInstance;
    page.phase = 'selecting';
    page.candidates = [{ device: { deviceId: 'AA:BB:CC:00:00:01', name: 'Offline fixture' } } as any];
    fixture.autoDetectChanges(); await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, page, element, ble, nav, users, changes, data };
  }

  async function selectFromOriginalTemplate(f: Awaited<ReturnType<typeof render>>) {
    const candidate = f.element.querySelector<HTMLButtonElement>('.ble-candidates button');
    expect(candidate).not.toBeNull();
    candidate!.click();
    await f.fixture.whenStable();
    f.fixture.detectChanges();
  }

  it('shows the exact HTTP409 conflict without retry, identity details or automatic enrollment', async () => {
    const f = await render(); await selectFromOriginalTemplate(f);
    expect(f.page.phase).toBe('failed'); expect(f.page.logicalDeviceId).toBe('');
    const alert = f.element.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.querySelector('p')?.textContent?.trim()).toBe(conflictCopy);
    expect(alert?.textContent).not.toMatch(/PRIVATE_|DEVICE_V2_|DEVICE_GUIDE\./);
    expect(f.element.querySelector('.primary-action')).toBeNull();
    expect(f.element.querySelector('ion-back-button')).not.toBeNull();
    expect(f.element.querySelector('.enrollment-result.ready')).toBeNull();
    expect(f.ble.enroll).toHaveBeenCalledTimes(1);
    expect(f.ble.discoverProvisioningDevices).not.toHaveBeenCalled();
    expect(f.ble.resume).not.toHaveBeenCalled(); expect(f.users.getAllInfo).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'DEVICE_V2_BLE_ENROLLMENT_UNAVAILABLE', 'BLE_ENROLL_FAILED'],
    [409, 'DEVICE_V2_BLE_RESET_REQUIRED', 'BLE_RESET_REQUIRED'],
    [503, conflictCode, 'BLE_ENROLL_FAILED'],
  ])('keeps HTTP%s / %s on the original failure and explicit retry contract', async (status, code, key) => {
    const f = await render(Number(status), String(code)); await selectFromOriginalTemplate(f);
    expect(f.element.querySelector('[role="alert"] p')?.textContent?.trim()).toBe(dictionary.DEVICE_GUIDE[String(key)]);
    expect(f.element.querySelector('.primary-action')?.textContent).toContain(dictionary.DEVICE_GUIDE.BLE_RETRY);
    expect(f.ble.enroll).toHaveBeenCalledTimes(1); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  });

  it('does not infer a cloud conflict from translated text shared by an ordinary failure', async () => {
    const f = await render(503, 'DEVICE_V2_BLE_ENROLLMENT_UNAVAILABLE', true);
    await selectFromOriginalTemplate(f);
    expect(f.element.querySelector('[role="alert"] p')?.textContent?.trim()).toBe(conflictCopy);
    expect(f.element.querySelector('.primary-action')).not.toBeNull();
    expect(f.ble.enroll).toHaveBeenCalledTimes(1);
  });

  it.each(['leave', 'account', 'new-operation'] as const)('clears the old conflict on %s without carrying it to a successor', async reason => {
    const f = await render(); await selectFromOriginalTemplate(f);
    expect(f.element.querySelector('.primary-action')).toBeNull();
    if (reason === 'leave') {
      f.page.ionViewWillLeave(); f.page.ionViewWillEnter();
    } else if (reason === 'account') {
      f.data.sessionEpoch++; f.changes.next();
    } else {
      // An explicit successor operation may discover another device; it must
      // not inherit this target's conflict or automatically retry its enroll.
      await f.page.startDiscovery();
    }
    await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.element.querySelector('.primary-action')).not.toBeNull();
    expect(f.page.error).not.toBe(conflictCopy);
    expect(f.ble.enroll).toHaveBeenCalledTimes(1);
    expect(f.ble.resume).not.toHaveBeenCalled();
    expect(f.ble.discoverProvisioningDevices).toHaveBeenCalledTimes(reason === 'new-operation' ? 1 : 0);
  });

  it('provides only this dedicated safe key in every registered locale without changing the language manifest', () => {
    const languages = JSON.parse(readFileSync(resolve('public/i18n/i18n.json'), 'utf8')) as Array<{ code: string }>;
    expect(languages.length).toBeGreaterThan(0);
    for (const { code } of languages) {
      const locale = JSON.parse(readFileSync(resolve(`public/i18n/${code}/${code}.json`), 'utf8'));
      const copy = locale.DEVICE_GUIDE?.[conflictKey];
      expect(typeof copy, `${code}: ${conflictKey}`).toBe('string');
      expect(copy.trim(), `${code}: nonblank conflict copy`).not.toBe('');
      expect(copy, `${code}: no raw identity or diagnostic code`).not.toMatch(/PRIVATE_|DEVICE_V2_|DEVICE_GUIDE\./);
    }
    expect(dictionary.DEVICE_GUIDE[conflictKey]).toBe(conflictCopy);
  });
});
