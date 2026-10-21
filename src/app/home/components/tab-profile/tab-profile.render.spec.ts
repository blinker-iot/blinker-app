import { TestBed } from '@angular/core/testing';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { DataService } from '../../../core/services/data.service';
import { UpdateService } from '../../../core/services/update.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { MessageService } from '../../../sections/message/message.service';
import { TabProfileComponent } from './tab-profile';

describe('profile entitlement production template', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(name: string | null, limit: number | null, used: number | null) {
    const data = { auth: { uuid: 'user-a' }, sessionEpoch: 1,
      user: { username: 'User', avatar: '', phone: '',
        subscriptionPlan: name ? { name: name.toLowerCase(), display_name: name } : null,
        entitlements: limit === null ? {} : { 'iot.devices': limit } },
      ownedDeviceCount: used, userLoadError: new BehaviorSubject<unknown>(null),
      deviceLoadError: new BehaviorSubject<unknown>(null),
    };
    const users = { getAllInfo: vi.fn(async () => true) };
    await TestBed.configureTestingModule({ imports: [TabProfileComponent], providers: [
      provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: DataService, useValue: data },
      { provide: UpdateService, useValue: { currentVersion: '2.4.1', hasNewVersion: false } },
      { provide: AuthService, useValue: { logout: vi.fn() } },
      { provide: UserService, useValue: users },
      { provide: MessageService, useValue: { unreadTotal: 0, init: vi.fn(async () => undefined) } },
      { provide: NavController, useValue: { navigateForward: vi.fn() } },
    ] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('zh-profile-test', { PROFILE: {
      ACCOUNT_ENTITLEMENTS_TITLE: '套餐与设备额度', ACCOUNT_REFRESH: '刷新', ACCOUNT_REFRESHING: '更新中',
      ACCOUNT_REFRESH_FAILED: '更新未完成，当前显示上次获取的数据。', PLAN_LABEL: '当前套餐', PLAN_UNKNOWN: '套餐待查询',
      DEVICE_QUOTA_LABEL: '设备额度', DEVICE_QUOTA_COUNT: '{{used}} / {{limit}} 台',
      DEVICE_QUOTA_UNKNOWN: '待查询', DEVICE_QUOTA_UNLIMITED_COUNT: '已用 {{used}} 台 · 不限量',
    } });
    translate.use('zh-profile-test');
    const fixture = TestBed.createComponent(TabProfileComponent);
    fixture.autoDetectChanges(); await fixture.whenStable();
    return { fixture, data, users, element: fixture.nativeElement as HTMLElement };
  }

  it.each([['Free', 7], ['Pro', 1]] as const)('renders %s and its returned quota without a hard-coded plan allowance', async (name, limit) => {
    const h = await render(name, limit, 1);
    expect(h.element.querySelector('.plan-badge')?.textContent?.trim()).toBe(name);
    expect(h.element.querySelector('.device-quota')?.textContent?.trim()).toBe(`1 / ${limit} 台`);
    expect(h.element.querySelectorAll('app-menu-list')).toHaveLength(2);
    expect(h.users.getAllInfo).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'Free', limit: 0, used: 0, quota: '0 / 0 台', badge: 'Free' },
    { name: 'Free', limit: -1, used: 2, quota: '已用 2 台 · 不限量', badge: 'Free' },
    { name: null, limit: null, used: null, quota: '待查询', badge: '套餐待查询' },
  ])('renders the independent $quota state without inferring a plan or allowance', async ({ name, limit, used, quota, badge }) => {
    const h = await render(name, limit, used);
    expect(h.element.querySelector('.plan-badge')?.textContent?.trim()).toBe(badge);
    expect(h.element.querySelector('.device-quota')?.textContent?.trim()).toBe(quota);
  });

  it('keeps a failed explicit refresh read-only and displays the last account data with a recovery hint', async () => {
    const h = await render('Pro', 3, 2);
    h.users.getAllInfo.mockResolvedValue(false);
    h.element.querySelector<HTMLButtonElement>('.account-refresh')!.click();
    await h.fixture.whenStable();
    expect(h.users.getAllInfo).toHaveBeenCalledOnce();
    expect(h.element.querySelector('[role="status"]')?.textContent).toContain('更新未完成');
    expect(h.element.querySelector('.device-quota')?.textContent?.trim()).toBe('2 / 3 台');
    expect(h.element.querySelector('.plan-badge')?.textContent?.trim()).toBe('Pro');
    h.users.getAllInfo.mockResolvedValue(true);
    h.element.querySelector<HTMLButtonElement>('.account-refresh')!.click();
    await h.fixture.whenStable();
    expect(h.element.querySelector('[role="status"]')).toBeNull();
  });
});
