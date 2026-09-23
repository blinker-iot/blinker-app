import { convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { BleDeviceGuidePage } from './ble-device.page';

const source = { sourceCollection: 'devices', sourceId: 'a'.repeat(24) };
function harness() {
  const data = { auth: { accessToken: 'test', uuid: 'account-a' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const ble = {
    pendingEnrollmentSources: vi.fn(async () => [
      { logicalDeviceId: 'mine', ownerAccountId: 'account-a' },
      { logicalDeviceId: 'migration', ownerAccountId: 'account-a', legacySource: source },
    ]),
    replayPendingCommit: vi.fn(async () => false),
    resume: vi.fn(),
  };
  const nav = { navigateRoot: vi.fn() };
  const route = { snapshot: { queryParamMap: convertToParamMap({}) } };
  const imports = { detail: vi.fn(async () => ({ snapshot: { displayName: 'Old lamp' } })) };
  const page = new BleDeviceGuidePage(ble as any, data as any, {} as any, nav as any,
    { instant: (key: string) => key } as any, { markForCheck: vi.fn() } as any, route as any, imports as any);
  return { page, ble, data, nav, route, imports };
}

describe('BLE migration recovery integrated with the current account lifecycle', () => {
  it('uses account-scoped pending results and clears them when the account changes', async () => {
    const { page, data, nav } = harness();
    page.ionViewWillEnter();
    await vi.waitFor(() => expect(page.pendingEnrollments).toEqual(['mine']));
    data.auth.uuid = 'account-b';
    data.sessionEpoch += 1;
    data.authDataChanged.next();
    expect(page.pendingEnrollments).toEqual([]);
    expect(nav.navigateRoot).toHaveBeenCalledWith('/home/device');
    page.ngOnDestroy();
  });

  it('verifies the migration source before exposing only its pending recovery', async () => {
    const { page, route, imports } = harness();
    route.snapshot.queryParamMap = convertToParamMap(source);
    page.ionViewWillEnter();
    await vi.waitFor(() => expect(page.pendingEnrollments).toEqual(['migration']));
    expect(imports.detail).toHaveBeenCalledWith(source);
    page.ngOnDestroy();
  });

  it('stops before discovering hardware if the page leaves during original commit replay', async () => {
    const { page, ble } = harness();
    let resolve!: (value: boolean) => void;
    ble.replayPendingCommit.mockReturnValueOnce(new Promise<boolean>(done => resolve = done));
    page.pendingEnrollments = ['mine'];
    const pending = page.resumeEnrollment('mine');
    page.ionViewWillLeave();
    resolve(false);
    await pending;
    expect(ble.resume).not.toHaveBeenCalled();
    expect(page.phase).toBe('idle');
    page.ngOnDestroy();
  });

  it('passes the abort signal into hardware recovery after an unconfirmed original commit', async () => {
    const { page, ble } = harness();
    let resolve!: (value: any) => void;
    ble.resume.mockReturnValueOnce(new Promise(done => resolve = done));
    page.pendingEnrollments = ['mine'];
    const pending = page.resumeEnrollment('mine');
    await vi.waitFor(() => expect(ble.resume).toHaveBeenCalledOnce());
    const signal = ble.resume.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    page.ionViewWillLeave();
    expect(signal.aborted).toBe(true);
    const session = { close: vi.fn(async () => undefined) };
    resolve({ session, logicalDeviceId: 'mine' });
    await pending;
    expect(session.close).toHaveBeenCalledOnce();
    expect(page.phase).toBe('idle');
    page.ngOnDestroy();
  });
});
