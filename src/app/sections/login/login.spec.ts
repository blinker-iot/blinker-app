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
  const bindTip = 'Link your email to also sign in with an email verification code.';
  const emailBindTip = 'Email verified. Link WeChat to complete sign-in.';
  let fixture: ComponentFixture<LoginPage>;
  let page: LoginPage;
  let auth: {
    wechatNeedsBinding: boolean;
    emailNeedsWechatBinding: boolean;
    bindWechatForLogin: ReturnType<typeof vi.fn>;
    cancelEmailWechatBinding: ReturnType<typeof vi.fn>;
    sendEmailCode: ReturnType<typeof vi.fn>;
    loginWithWechat: ReturnType<typeof vi.fn>;
    githubLoginSupported: boolean;
    loginWithGithub: ReturnType<typeof vi.fn>;
    loginWithEmailCode: ReturnType<typeof vi.fn>;
    completeWechatLogin: ReturnType<typeof vi.fn>;
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
      emailNeedsWechatBinding: false,
      bindWechatForLogin: vi.fn().mockResolvedValue('failed'),
      cancelEmailWechatBinding: vi.fn().mockImplementation(() => {
        auth.emailNeedsWechatBinding = false;
        auth.wechatNeedsBinding = false;
      }),
      sendEmailCode: vi.fn().mockResolvedValue(true),
      loginWithWechat: vi.fn().mockResolvedValue(false),
      githubLoginSupported: true,
      loginWithGithub: vi.fn().mockResolvedValue(false),
      loginWithEmailCode: vi.fn().mockResolvedValue(false),
      completeWechatLogin: vi.fn().mockResolvedValue('failed'),
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
        WECHAT_EMAIL_CHOICE_TIP: bindTip,
        EMAIL_WECHAT_BIND_TIP: emailBindTip,
        BIND_WECHAT_AND_LOGIN: 'Link WeChat and sign in',
        BACK_TO_EMAIL: 'Back to email verification',
      },
    });
    translate.use('en');
    fixture = TestBed.createComponent(LoginPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('offers email binding or skipping after an unbound WeChat authorization', async () => {
    auth.loginWithWechat.mockImplementation(async () => {
      auth.wechatNeedsBinding = true;
      return false;
    });

    await page.loginWithWechat();
    fixture.detectChanges();

    expect(notice.showToast).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe(bindTip);
    expect(fixture.nativeElement.querySelector('.email-choice')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.skip-email-btn')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="email"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.social-login')).toBeNull();
    expect(getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(page.wechatStarting).toBe(false);
  });

  it('verifies an email against the current WeChat authorization', async () => {
    auth.wechatNeedsBinding = true;
    page.chooseEmailBinding();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="email"]')).not.toBeNull();
    page.email = 'test@example.com';
    page.code = '123456';
    auth.completeWechatLogin.mockResolvedValue('success');

    await page.login();

    expect(auth.completeWechatLogin).toHaveBeenCalledExactlyOnceWith('test@example.com', '123456');
    expect(auth.loginWithEmailCode).not.toHaveBeenCalled();
    expect(getAllInfo).toHaveBeenCalledOnce();
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('skips email once and completes the pending share invitation only after server success', async () => {
    auth.wechatNeedsBinding = true;
    shareInvitation.hasPending = true;
    let finish!: (value: string) => void;
    auth.completeWechatLogin.mockReturnValue(new Promise<string>(resolve => { finish = resolve; }));
    const login = page.completeWechatLogin(true);
    await page.completeWechatLogin(true);
    page.cancelWechatLogin();
    await vi.waitFor(() => expect(auth.completeWechatLogin).toHaveBeenCalledOnce());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skip-email-btn').disabled).toBe(true);
    expect(auth.cancelEmailWechatBinding).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(auth.completeWechatLogin).toHaveBeenCalledWith(undefined, undefined);
    finish('success');
    await login;
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith('/share-invitation');
  });

  it('allows returning to the choice or cancelling without creating a session', () => {
    auth.wechatNeedsBinding = true;
    page.chooseEmailBinding();
    page.code = '123456';
    page.backToEmailChoice();
    expect(page.choosingEmail).toBe(false);
    expect(page.code).toBe('');
    expect(auth.wechatNeedsBinding).toBe(true);
    page.cancelWechatLogin();
    expect(auth.wechatNeedsBinding).toBe(false);
    expect(auth.completeWechatLogin).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', 'wechatAuthorizationExpired'],
    ['conflict', 'emailBindingConflict'],
    ['failed', 'emailBindingFailed'],
  ])('reports %s email completion without navigating', async (result, message) => {
    auth.wechatNeedsBinding = true;
    auth.completeWechatLogin.mockResolvedValue(result);
    await page.completeWechatLogin(false);
    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith(message);
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(page.loginBusy).toBe(false);
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
    page.email = 'test@example.com';
    page.code = '123456';
    await page.login();
    await page.loginWithGithub();
    await page.sendCode(new Event('click'));
    await vi.waitFor(() => expect(auth.loginWithWechat).toHaveBeenCalledOnce());
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.wechat-btn').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.github-btn').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.login-btn').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.send-code-btn').disabled).toBe(true);
    expect(auth.loginWithEmailCode).not.toHaveBeenCalled();
    expect(auth.loginWithGithub).not.toHaveBeenCalled();
    expect(auth.sendEmailCode).not.toHaveBeenCalled();

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
  it('requires WeChat binding after email verification and hides other login entries', async () => {
    auth.loginWithEmailCode.mockImplementation(async () => {
      auth.emailNeedsWechatBinding = true;
      return false;
    });
    page.email = 'test@example.com';
    page.code = '123456';

    await page.login();
    fixture.detectChanges();
    await page.loginWithWechat();
    await page.loginWithGithub();
    await page.login();

    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe(emailBindTip);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.social-login')).toBeNull();
    expect(auth.loginWithWechat).not.toHaveBeenCalled();
    expect(auth.loginWithGithub).not.toHaveBeenCalled();
    expect(auth.loginWithEmailCode).toHaveBeenCalledOnce();
    expect(page.code).toBe('');
    expect(getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(notice.showToast).not.toHaveBeenCalled();
    expect(notice.hideLoading).toHaveBeenCalledOnce();
  });

  it.each(['false', 'rejected'])('reports a %s email login failure and clears loading', async (result) => {
    if (result === 'rejected') auth.loginWithEmailCode.mockRejectedValue(new Error('Login failed'));
    page.email = 'test@example.com';
    page.code = '123456';

    await page.login();

    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith('emailLoginFailed');
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(page.loginBusy).toBe(false);
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('finishes binding once and returns to the pending share invitation', async () => {
    auth.emailNeedsWechatBinding = true;
    shareInvitation.hasPending = true;
    let finishBinding!: (value: string) => void;
    auth.bindWechatForLogin.mockReturnValue(new Promise<string>((resolve) => {
      finishBinding = resolve;
    }));

    const binding = page.bindWechatForLogin();
    await page.bindWechatForLogin();
    page.cancelEmailWechatBinding();
    await vi.waitFor(() => expect(auth.bindWechatForLogin).toHaveBeenCalledOnce());
    fixture.detectChanges();

    expect(notice.showLoading).toHaveBeenCalledExactlyOnceWith('wechatBinding');
    expect(fixture.nativeElement.querySelector('.wechat-binding .login-btn').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.back-to-email-btn').disabled).toBe(true);
    expect(auth.cancelEmailWechatBinding).not.toHaveBeenCalled();
    finishBinding('success');
    await binding;

    expect(getAllInfo).toHaveBeenCalledOnce();
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith('/share-invitation');
    expect(notice.showToast).not.toHaveBeenCalled();
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(page.loginBusy).toBe(false);
  });

  it.each([
    ['cancelled', 'wechatBindingCancelled'],
    ['not_installed', 'wechatNotInstalled'],
    ['unsupported', 'wechatNativeOnly'],
    ['conflict', 'wechatBindingConflict'],
    ['failed', 'wechatBindingFailed'],
  ])('keeps the binding step available after %s', async (result, message) => {
    auth.emailNeedsWechatBinding = true;
    auth.bindWechatForLogin.mockResolvedValue(result);

    await page.bindWechatForLogin();
    fixture.detectChanges();

    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith(message);
    expect(fixture.nativeElement.querySelector('.wechat-binding')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.wechat-binding .login-btn').disabled).toBe(false);
    expect(auth.cancelEmailWechatBinding).not.toHaveBeenCalled();
    expect(getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
    expect(notice.hideLoading).toHaveBeenCalledOnce();
  });

  it('returns to email verification when the binding ticket expires', async () => {
    auth.emailNeedsWechatBinding = true;
    auth.bindWechatForLogin.mockResolvedValue('expired');
    page.email = 'test@example.com';
    page.code = '123456';

    await page.bindWechatForLogin();
    fixture.detectChanges();

    expect(auth.cancelEmailWechatBinding).toHaveBeenCalledOnce();
    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith('emailBindingExpired');
    expect(page.email).toBe('test@example.com');
    expect(page.code).toBe('');
    expect(fixture.nativeElement.querySelector('input[type="email"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.wechat-binding')).toBeNull();
  });

  it('clears the ticket and verification code when returning to email', () => {
    auth.emailNeedsWechatBinding = true;
    page.code = '123456';
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.back-to-email-btn').click();
    fixture.detectChanges();

    expect(auth.cancelEmailWechatBinding).toHaveBeenCalledOnce();
    expect(page.code).toBe('');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('clears loading after a send-code error', async () => {
    auth.sendEmailCode.mockRejectedValue(new Error('Network failed'));
    page.email = 'test@example.com';

    await page.sendCode(new Event('click'));

    expect(notice.showToast).toHaveBeenCalledExactlyOnceWith('sendCodeFailed');
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(page.loginBusy).toBe(false);
    expect(page.countdown).toBe(0);
  });
});
