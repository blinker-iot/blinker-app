import 'zone.js';

import { provideZoneChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, NavController } from '@ionic/angular/standalone';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceV2ShareInvitationService } from 'src/app/core/services/device-v2-share-invitation.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { UserService } from 'src/app/core/services/user.service';
import { LoginPage } from './login';

describe('LoginPage login', () => {
  const bindTip = 'WeChat authorization succeeded. Sign in with email to link your account.';
  let fixture: ComponentFixture<LoginPage>;
  let page: LoginPage;
  let auth: {
    wechatNeedsBinding: boolean;
    loginWithWechat: ReturnType<typeof vi.fn>;
    githubLoginSupported: boolean;
    loginWithGithub: ReturnType<typeof vi.fn>;
    loginWithEmailCode: ReturnType<typeof vi.fn>;
  };
  let notice: {
    showLoading: ReturnType<typeof vi.fn>;
    hideLoading: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
  };
  let shareInvitation: { hasPending: boolean };
  let getAllInfo: ReturnType<typeof vi.fn>;
  let navigateRoot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    auth = {
      wechatNeedsBinding: false,
      loginWithWechat: vi.fn().mockResolvedValue(false),
      githubLoginSupported: true,
      loginWithGithub: vi.fn().mockResolvedValue(false),
      loginWithEmailCode: vi.fn().mockResolvedValue(false),
    };
    shareInvitation = { hasPending: false };
    notice = {
      showLoading: vi.fn().mockResolvedValue(undefined),
      hideLoading: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn().mockResolvedValue(undefined),
    };
    getAllInfo = vi.fn().mockResolvedValue(true);
    navigateRoot = vi.fn().mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideZoneChangeDetection(),
        provideTranslateService(),
        { provide: AuthService, useValue: auth },
        { provide: UserService, useValue: { getAllInfo } },
        { provide: NoticeService, useValue: notice },
        { provide: NavController, useValue: { navigateRoot } },
        { provide: ModalController, useValue: {} },
        { provide: DataService, useValue: {} },
        { provide: DeviceV2ShareInvitationService, useValue: shareInvitation },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ACCOUNT: {
        LOGIN_TIP: 'Unregistered email will automatically create an account.',
        WECHAT_BIND_TIP: bindTip,
      },
    });
    translate.use('en');
    fixture = TestBed.createComponent(LoginPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('keeps email binding guidance visible after an unbound WeChat authorization', async () => {
    auth.loginWithWechat.mockImplementation(async () => {
      auth.wechatNeedsBinding = true;
      return false;
    });

    await page.loginWithWechat();
    fixture.detectChanges();

    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith('wechatNeedsBinding');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe(bindTip);
    expect(fixture.nativeElement.querySelector('input[type="email"]')).not.toBeNull();
    expect(getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(page.wechatStarting).toBe(false);
  });

  it.each(['false', 'rejected'])('shows a failure message for a %s login result', async (result) => {
    if (result === 'rejected') auth.loginWithWechat.mockRejectedValue(new Error('Login failed'));

    await page.loginWithWechat();

    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith('wechatLoginFailed');
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(page.wechatStarting).toBe(false);
  });

  it.each([
    { hasPending: false, route: '/' },
    { hasPending: true, route: '/share-invitation' },
  ])('prevents duplicate WeChat starts and returns to $route after login', async ({ hasPending, route }) => {
    shareInvitation.hasPending = hasPending;
    let finishLogin!: (value: boolean) => void;
    auth.loginWithWechat.mockReturnValue(new Promise<boolean>((resolve) => {
      finishLogin = resolve;
    }));

    const login = page.loginWithWechat();
    await page.loginWithWechat();
    await vi.waitFor(() => expect(auth.loginWithWechat).toHaveBeenCalledOnce());
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.wechat-btn').disabled).toBe(true);

    finishLogin(true);
    await login;
    fixture.detectChanges();

    expect(getAllInfo).toHaveBeenCalledOnce();
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith(route);
    expect(notice.showToast).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.wechat-btn').disabled).toBe(false);
  });

  it('starts GitHub authorization without completing login or navigating', async () => {
    shareInvitation.hasPending = true;
    auth.loginWithGithub.mockResolvedValue(true);

    await page.loginWithGithub();

    expect(auth.loginWithGithub).toHaveBeenCalledOnce();
    expect(getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(notice.showToast).not.toHaveBeenCalled();
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(page.githubStarting).toBe(false);
  });

  it('returns to the pending share invitation after email login', async () => {
    shareInvitation.hasPending = true;
    auth.loginWithEmailCode.mockResolvedValue(true);
    page.email = 'test@example.com';
    page.code = '123456';

    await page.login();

    expect(auth.loginWithEmailCode).toHaveBeenCalledExactlyOnceWith('test@example.com', '123456');
    expect(getAllInfo).toHaveBeenCalledOnce();
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith('/share-invitation');
  });
});
