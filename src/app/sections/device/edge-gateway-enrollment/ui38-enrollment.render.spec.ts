import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2EdgeGatewayService } from '../../../core/services/device-v2-edge-gateway.service';
import { UserService } from '../../../core/services/user.service';
import { EdgeGatewayEnrollmentPage } from './edge-gateway-enrollment.page';

// Component construction is real; Ionic entry is deliberately not invoked.
// The deployment guard is tested separately, never opened for these fixtures.
async function render(kind: 'owner' | 'shared' | 'ordinary' | 'missing' = 'owner') {
  const hub = kind === 'missing' ? undefined : {
    deviceName: 'ui38-fixture-hub', deviceType: kind === 'ordinary' ? 'wifi' : 'edge-hub',
    config: { customName: '本地模板网关', isShared: kind === 'shared' },
  };
  const data = { auth: { accessToken: 'local-fixture-only' }, sessionEpoch: 1,
    authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(true),
    getDevice: vi.fn(() => hub) };
  const gateway = { beginEnrollment: vi.fn(), recoveries: vi.fn(), resumeRecovery: vi.fn() };
  const users = { getAllInfo: vi.fn() };
  const nav = { navigateRoot: vi.fn() };
  const route = { paramMap: new BehaviorSubject({ get: (key: string) => key === 'id' ? 'ui38-fixture-hub' : null }) };
  await TestBed.configureTestingModule({ imports: [EdgeGatewayEnrollmentPage], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: route }, { provide: DataService, useValue: data },
    { provide: DeviceV2EdgeGatewayService, useValue: gateway }, { provide: UserService, useValue: users },
    { provide: NavController, useValue: nav },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(EdgeGatewayEnrollmentPage);
  fixture.autoDetectChanges(); await fixture.whenStable();
  const update = async () => {
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable();
  };
  const noExternalActions = () => {
    expect(gateway.beginEnrollment).not.toHaveBeenCalled(); expect(gateway.recoveries).not.toHaveBeenCalled();
    expect(gateway.resumeRecovery).not.toHaveBeenCalled(); expect(users.getAllInfo).not.toHaveBeenCalled();
    expect(nav.navigateRoot).not.toHaveBeenCalled();
  };
  return { fixture, update, noExternalActions, hub, data, gateway, users, nav,
    page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
}

describe('UI38 gateway enrollment production template without relay or enrollment', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('keeps the existing owner preparation and settings return without starting entry work', async () => {
    const f = await render();
    expect(f.element.querySelector('ion-header')?.classList).toContain('control-page-header');
    expect((f.element.querySelector('ion-back-button') as HTMLElement & { defaultHref: string }).defaultHref)
      .toBe('/device/ui38-fixture-hub/settings');
    expect(f.element.querySelector('.hub-card h1')?.textContent).toContain('本地模板网关');
    expect(f.element.querySelectorAll('.enrollment-card ol li')).toHaveLength(3);
    expect(f.element.querySelector('.enrollment-card')?.getAttribute('aria-busy')).toBe('false');
    expect(f.element.querySelector('.recovery-card')).toBeNull();
    f.noExternalActions();
  });

  it.each(['shared', 'ordinary', 'missing'] as const)('keeps %s devices outside owner-only enrollment', async kind => {
    const f = await render(kind);
    expect(f.element.querySelector('.notice')?.textContent).toContain('只有设备所有者');
    expect(f.element.querySelector('.enrollment-card')).toBeNull();
    expect(f.element.querySelector('.hub-card')).toBeNull();
    expect(f.element.querySelector('.recovery-card')).toBeNull();
    f.noExternalActions();
  });

  it('retains exact unsaved name input without claiming or persisting anything', async () => {
    const f = await render();
    const input = f.element.querySelector<HTMLInputElement>('.enrollment-card input')!;
    input.value = '  本地未保存名称  '; input.dispatchEvent(new Event('input', { bubbles: true }));
    await f.update();
    expect(f.page.deviceName).toBe('  本地未保存名称  ');
    expect(input.maxLength).toBe(128);
    f.noExternalActions();
  });

  it.each(['discovering', 'enrolling', 'resuming'] as const)('keeps %s inputs and recovery controls busy', async phase => {
    const f = await render();
    f.page.phase = phase;
    f.page.recoveries = [{ id: 'ui38-recovery', logicalDeviceId: 'ui38-child', stage: 'finish_enrollment' }];
    f.page.error = '本地恢复提示'; await f.update();
    expect(f.element.querySelector('.enrollment-card')?.getAttribute('aria-busy')).toBe('true');
    expect(f.element.querySelector<HTMLInputElement>('.enrollment-card input')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.enrollment-card .primary')!.disabled).toBe(true);
    expect(f.element.querySelector('.enrollment-card .primary')?.textContent).toContain('正在处理');
    expect(f.element.querySelector<HTMLButtonElement>('.recovery-card button')!.disabled).toBe(true);
    expect(f.element.querySelector<HTMLButtonElement>('.notice.error button')!.disabled).toBe(true);
    f.noExternalActions();
  });

  it('renders exact candidate codes and keeps selection on its existing handler without enrollment', async () => {
    const f = await render();
    const target = { device: { deviceId: 'ui38-local-candidate' },
      profile: { modeLocator: new Uint8Array([0, 0, 0, 0, 1, 2, 10, 255]) }, rssi: -44 } as any;
    f.page.phase = 'selecting'; f.page.candidates = [target]; await f.update();
    expect(f.element.querySelector('.candidates')?.textContent).toContain('01 02 0A FF');
    expect(f.element.querySelector('.candidates')?.textContent).toContain('-44 dBm');
    const select = vi.spyOn(f.page, 'selectCandidate').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.candidates button')!.click(); await f.update();
    expect(select).toHaveBeenCalledExactlyOnceWith(target);
    f.noExternalActions();
  });

  it('retains the recovery identities and explicit resume event without replaying anything', async () => {
    const f = await render();
    const recovery = { id: 'ui38-finish-enrollment', logicalDeviceId: 'ui38-original-child', stage: 'finish_enrollment' as const };
    f.page.recoveries = [recovery, { id: 'ui38-finish-attachment', logicalDeviceId: 'ui38-second-child', stage: 'finish_attachment' }];
    await f.update();
    expect(f.element.querySelectorAll('.recovery-card > button')).toHaveLength(2);
    expect(f.element.querySelector('.recovery-card')?.textContent).toContain('完成设备认领');
    expect(f.element.querySelector('.recovery-card')?.textContent).toContain('完成网关绑定');
    expect(f.element.querySelector('.recovery-card')?.textContent).toContain('ui38-original-child');
    const resume = vi.spyOn(f.page, 'resume').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.recovery-card > button')!.click(); await f.update();
    expect(resume).toHaveBeenCalledExactlyOnceWith(recovery);
    f.noExternalActions();
  });

  it('keeps failure recovery separate from the name draft and does not restart discovery', async () => {
    const f = await render();
    f.page.phase = 'failed'; f.page.error = '设备接入窗口已失效，请重新扫描'; f.page.deviceName = '原草稿';
    await f.update();
    expect(f.element.querySelector('.notice.error[role="alert"]')?.textContent).toContain(f.page.error);
    expect(f.element.querySelector<HTMLInputElement>('.enrollment-card input')!.value).toBe('原草稿');
    const refresh = vi.spyOn(f.page, 'refreshRecoveries').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.notice.error button')!.click(); await f.update();
    expect(refresh).toHaveBeenCalledOnce();
    expect(f.page.deviceName).toBe('原草稿');
    f.noExternalActions();
  });

  it.each([false, true])('distinguishes gateway confirmation from old-binding retirement (%s)', async retirementPending => {
    const f = await render();
    f.page.phase = 'waiting'; f.page.logicalDeviceId = 'ui38-waiting-child'; f.page.retirementPending = retirementPending;
    await f.update();
    expect(f.element.querySelector('.result.waiting[role="status"]')?.textContent)
      .toContain(retirementPending ? '等待旧绑定退役' : '等待网关确认');
    expect(f.element.querySelector('.result.waiting p')?.textContent).toContain('不需要重新认领');
    const resume = vi.spyOn(f.page, 'continueWaiting').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.result.waiting button')!.click(); await f.update();
    expect(resume).toHaveBeenCalledOnce();
    f.noExternalActions();
  });

  it('shows confirmed completion separately and retains its navigation event without any service call', async () => {
    const f = await render();
    f.page.phase = 'ready'; f.page.logicalDeviceId = 'ui38-confirmed-child'; await f.update();
    expect(f.element.querySelector('.result.ready[role="status"]')?.textContent).toContain('子设备已接入');
    expect(f.element.querySelector('.result.ready p')?.textContent).toBe('ui38-confirmed-child');
    expect(f.element.querySelector('.enrollment-card')).toBeNull();
    const finish = vi.spyOn(f.page, 'finish').mockResolvedValue(undefined);
    f.element.querySelector<HTMLButtonElement>('.result.ready button')!.click(); await f.update();
    expect(finish).toHaveBeenCalledOnce();
    f.noExternalActions();
  });
});
