import { BehaviorSubject } from 'rxjs';
import { TabProfileComponent } from './tab-profile';

describe('profile account refresh', () => {
  function harness() {
    const data = { auth: { uuid: 'user-a' } as unknown, sessionEpoch: 1,
      user: { id: 'user-a', username: 'User', avatar: '', phone: '', subscriptionPlan: {
        name: 'pro', display_name: 'Pro',
      }, entitlements: { 'iot.devices': 3 } },
      ownedDeviceCount: 1 as number | null,
      userLoadError: new BehaviorSubject<unknown>(null), deviceLoadError: new BehaviorSubject<unknown>(null),
    };
    const users = { getAllInfo: vi.fn(async () => true) };
    const messages = { init: vi.fn(async () => undefined) };
    const component = new TabProfileComponent(data as any, {} as any, {} as any,
      { instant: (key: string, params?: unknown) => `${key}:${JSON.stringify(params)}` } as any,
      {} as any, messages as any, users as any);
    return { data, users, component, messages };
  }

  it('does not add a new auto-refresh or polling chain on initialization', () => {
    const h = harness(); h.component.ngOnInit();
    expect(h.messages.init).toHaveBeenCalledOnce();
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
    expect(h.component.deviceQuotaLabel).toBe('PROFILE.DEVICE_QUOTA_COUNT:{"used":1,"limit":3}');
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
});
