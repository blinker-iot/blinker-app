import { BehaviorSubject } from 'rxjs';
import { TabProfileComponent } from './tab-profile';

describe('profile account refresh', () => {
  function harness() {
    const data = { auth: { uuid: 'user-a' } as unknown, sessionEpoch: 1,
      user: { id: 'user-a', username: 'User', avatar: '', phone: '', subscriptionPlan: {
        name: 'pro', display_name: 'Pro',
      }, entitlements: { 'iot.devices': 3 } },
      ownedDeviceCount: 1 as number | null,
      room: { list: [] as unknown[] },
      userLoadError: new BehaviorSubject<unknown>(null), deviceLoadError: new BehaviorSubject<unknown>(null),
    };
    const users = { getAllInfo: vi.fn(async () => true) };
    const messages = { init: vi.fn(async () => undefined) };
    const update = { currentVersion: undefined as string | undefined };
    const auth = { logout: vi.fn() };
    const navigation = { navigateForward: vi.fn() };
    const component = new TabProfileComponent(data as any, update as any, auth as any,
      { instant: (key: string, params?: unknown) => `${key}:${JSON.stringify(params)}` } as any,
      navigation as any, messages as any, users as any);
    return { data, users, component, messages, update, auth, navigation };
  }

  it('does not add a new auto-refresh or polling chain on initialization', () => {
    const h = harness(); h.component.ngOnInit();
    expect(h.messages.init).toHaveBeenCalledOnce();
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
    expect(h.component.deviceQuotaLabel).toBe('PROFILE.DEVICE_QUOTA_COUNT:{"used":1,"limit":3}');
  });

  function sharingFixture(received: { logicalDeviceId: string; share: { state: string } }[] = []) {
    const h = harness();
    Object.assign(h.data, { share: { received, byDevice: {
      'owned-shared-device': { logicalDeviceId: 'owned-shared-device', shares: [
        { state: 'active' }, { state: 'active' },
      ], invitations: [{ state: 'pending' }, { state: 'expired' }] },
    } }, configLoadError: new BehaviorSubject<unknown>(null) });
    const sharing = () => h.component.menuGroups.flatMap(group => group.items).find(item => item.id === 'sharing');
    return { ...h, sharing, configLoadError: (h.data as any).configLoadError as BehaviorSubject<unknown> };
  }

  it('QA-2 counts unique active received devices, not owners, members or revoked grants', () => {
    const h = sharingFixture([
      { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', share: { state: 'active' } },
      { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', share: { state: 'active' } },
      { logicalDeviceId: 'device_22222222-2222-4222-8222-222222222222', share: { state: 'active' } },
      { logicalDeviceId: 'device_33333333-3333-4333-8333-333333333333', share: { state: 'revoked' } },
    ]);
    expect(h.sharing()?.value).toBe('PROFILE.RECEIVED_DEVICE_COUNT:{"count":2}');
    expect(h.sharing()?.route).toBe('/share-manager');
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
  });

  it('QA-2 labels a confirmed empty received list as zero without calling owned sharing totals complete', () => {
    const h = sharingFixture();
    expect(h.sharing()?.value).toBe('PROFILE.RECEIVED_DEVICE_COUNT:{"count":0}');
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
  });

  it('QA-2 omits an unknown received count before inventory restoration or after logout', () => {
    const h = sharingFixture(); h.data.ownedDeviceCount = null;
    expect(h.sharing()?.value).toBeUndefined();
    h.data.ownedDeviceCount = 1; h.data.auth = null;
    expect(h.sharing()?.value).toBeUndefined();
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
  });

  it('QA-2 omits failed share or device refresh counts instead of presenting an empty fallback as zero', () => {
    const h = sharingFixture(); h.configLoadError.next(new Error('received-read-failed'));
    expect(h.sharing()?.value).toBeUndefined();
    h.configLoadError.next(null); h.data.deviceLoadError.next(new Error('device-read-failed'));
    expect(h.sharing()?.value).toBeUndefined();
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
  });

  it('coalesces repeated refresh clicks and preserves the account data on failure', async () => {
    const h = harness();
    let done!: (value: boolean) => void;
    h.users.getAllInfo.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const refresh = h.component.refreshAccount();
    expect(h.component.refreshingAccount).toBe(true);
    await h.component.refreshAccount(); expect(h.users.getAllInfo).toHaveBeenCalledOnce();
    done(false); await refresh;
    expect(h.component.showAccountRefreshFailure).toBe(true);
    expect(h.component.accountEntitlements).toMatchObject({ planName: 'Pro', used: 1, limit: 3 });
    expect(h.component.refreshingAccount).toBe(false);
    await h.component.refreshAccount();
    expect(h.component.showAccountRefreshFailure).toBe(false);
  });

  it('marks a failed owned-list refresh without replacing the last known count with zero', () => {
    const h = harness(); h.data.deviceLoadError.next(new Error('network'));
    expect(h.component.showAccountRefreshFailure).toBe(true);
    expect(h.component.accountEntitlements.used).toBe(1);
  });

  it('shows independent unknown, unlimited and valid zero quota states', () => {
    const h = harness();
    h.data.ownedDeviceCount = null;
    h.data.user.entitlements['iot.devices'] = -1;
    expect(h.component.deviceQuotaLabel).toContain('PROFILE.DEVICE_QUOTA_UNLIMITED:');
    h.data.user.entitlements['iot.devices'] = 0;
    h.data.ownedDeviceCount = 0;
    expect(h.component.deviceQuotaLabel).toBe('PROFILE.DEVICE_QUOTA_COUNT:{"used":0,"limit":0}');
    h.data.user.entitlements = {} as any;
    expect(h.component.deviceQuotaLabel).toContain('PROFILE.DEVICE_QUOTA_USAGE:');
    h.data.ownedDeviceCount = null;
    expect(h.component.deviceQuotaLabel).toContain('PROFILE.DEVICE_QUOTA_UNKNOWN:');
  });

  it('does not attach a late refresh failure to a different account or request when logged out', async () => {
    const h = harness();
    let reject!: (error: Error) => void;
    h.users.getAllInfo.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    const refresh = h.component.refreshAccount();
    h.data.sessionEpoch++; h.data.auth = null;
    reject(new Error('old session')); await refresh;
    expect(h.component.showAccountRefreshFailure).toBe(false);
    await h.component.refreshAccount(); expect(h.users.getAllInfo).toHaveBeenCalledOnce();
  });

  it('does not display previous account load errors before the new account has loaded', () => {
    const h = harness();
    h.data.userLoadError.next(new Error('previous account'));
    h.data.user = { username: '', avatar: '', phone: '' } as any;
    h.data.ownedDeviceCount = null; h.data.sessionEpoch++;
    expect(h.component.showAccountRefreshFailure).toBe(false);
    expect(h.component.accountEntitlements).toMatchObject({ planName: '', limit: null, used: null });
  });

  it('retains a real empty region list and never invents an installed version', () => {
    const h = harness();
    expect(h.component.roomNum).toBe(0);
    expect(h.component.menuGroups[0].items.find(item => item.id === 'room')?.value).toContain('"count":0');
    expect(h.component.currentVersion).toBe('—');
    h.data.room.list = [{ id: 'room-1' }];
    h.update.currentVersion = '3.0.0';
    expect(h.component.roomNum).toBe(1);
    expect(h.component.currentVersion).toBe('3.0.0');
  });

  it('keeps support navigation and logout on their original handlers', () => {
    const h = harness();
    h.component.selectMenuItem({ id: 'feedback', title: 'Feedback', route: '/feedback' });
    h.component.selectMenuItem({ id: 'about', title: 'About', route: '/about' });
    h.component.selectMenuItem({ id: 'logout', title: 'Logout', danger: true });
    expect(h.navigation.navigateForward.mock.calls).toEqual([['/feedback'], ['/about']]);
    expect(h.auth.logout).toHaveBeenCalledOnce();
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
  });
});
