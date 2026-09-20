import 'zone.js';

import { provideZoneChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, NavController } from '@ionic/angular/standalone';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { UserService } from 'src/app/core/services/user.service';
import { LoginPage } from './login';

describe('LoginPage WeChat login', () => {
  const bindTip = 'WeChat authorization succeeded. Sign in with email to link your account.';
  let fixture: ComponentFixture<LoginPage>;
  let page: LoginPage;
  let auth: {
    wechatNeedsBinding: boolean;
    loginWithWechat: ReturnType<typeof vi.fn>;
  };
  let notice: {
    showLoading: ReturnType<typeof vi.fn>;
    hideLoading: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
  };
  let getAllInfo: ReturnType<typeof vi.fn>;
  let navigateRoot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    auth = {
      wechatNeedsBinding: false,
      loginWithWechat: vi.fn().mockResolvedValue(false),
    };
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

  it('prevents duplicate starts and preserves the successful login navigation', async () => {
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
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith('/');
    expect(notice.showToast).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.wechat-btn').disabled).toBe(false);
  });
});
