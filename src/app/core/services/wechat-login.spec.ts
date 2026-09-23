import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { NavController } from '@ionic/angular/standalone';
import { Wechat } from 'capacitor-wechat';
import { throwError } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { GatewayHttpError } from '../model/response.model';
import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { NtfyService } from './ntfy.service';

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    setKeyPrefix: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('capacitor-wechat', () => ({
  Wechat: {
    isInstalled: vi.fn().mockResolvedValue({ value: true }),
    login: vi.fn().mockResolvedValue({ code: 'wechat-code', state: 'wechat-state' }),
  },
}));

const startData = {
  login_id: 'wechat-login-1', app_id: 'wx-test-app', state: 'wechat-state',
  scope: 'snsapi_userinfo', expires_in: 300,
};
const tokens = { access_token: 'access', refresh_token: 'refresh' };
const pendingEmail = { status: 'needs_wechat_bind', pending_ticket: 'pending-email', expires_in: 300 };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WeChat native login', () => {
  let service: AuthService;
  let data: DataService;
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Wechat.isInstalled).mockResolvedValue({ value: true });
    vi.mocked(Wechat.login).mockResolvedValue({ code: 'wechat-code', state: 'wechat-state' });
    localStorage.clear();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    TestBed.configureTestingModule({
      providers: [DataService, provideHttpClient(), provideHttpClientTesting()],
    });
    data = TestBed.inject(DataService);
    vi.spyOn(data, 'getInstallationId').mockReturnValue('installation-1');
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    service = new AuthService(
      client, data,
      { navigateRoot: vi.fn() } as unknown as NavController,
      { revoke: vi.fn().mockResolvedValue(undefined) } as unknown as NtfyService,
    );
  });

  afterEach(() => {
    try { http.verify(); } finally {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    }
  });

  async function startLogin() {
    const login = service.loginWithWechat();
    await settle();
    const start = http.expectOne(API.AUTH.WECHAT_MOBILE_START);
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ device_id: 'installation-1', platform: 'android' });
    return { login, start };
  }

  async function attemptUnboundLogin(): Promise<void> {
    const { login, start } = await startLogin();
    // The interceptor's error mapping is covered separately; exercise its normalized output here.
    const post = vi.spyOn(client, 'post').mockReturnValueOnce(throwError(() => new GatewayHttpError({
      httpStatus: 409, code: 'AUTH_WECHAT_NOT_BOUND', message: 'WeChat identity is not bound.',
    })));
    start.flush({ status: 200, data: startData });
    await expect(login).resolves.toBe(false);
    expect(post).toHaveBeenCalledExactlyOnceWith(API.AUTH.WECHAT_MOBILE_LOGIN, {
      login_id: startData.login_id, code: 'wechat-code', state: startData.state, device_id: 'installation-1',
    });
    post.mockRestore();
    expect(service.wechatNeedsBinding).toBe(true);
    expect(data.auth).toBeNull();
    expect(SecureStorage.set).not.toHaveBeenCalled();
  }

  async function verifyEmail(): Promise<void> {
    const login = service.loginWithEmailCode('person@example.com', '654321');
    http.expectOne(API.AUTH.EMAIL_LOGIN).flush({ status: 200, data: pendingEmail });
    await expect(login).resolves.toBe(false);
    expect(service.emailNeedsWechatBinding).toBe(true);
    expect(data.auth).toBeNull();
    expect(SecureStorage.set).not.toHaveBeenCalled();
  }

  it('reuses an unbound WeChat authorization after email verification without saving a partial session', async () => {
    await attemptUnboundLogin();
    await verifyEmail();
    const binding = service.bindWechatForLogin();
    const bind = http.expectOne(API.AUTH.WECHAT_MOBILE_BIND);
    expect(bind.request.body).toEqual({
      login_id: startData.login_id, pending_ticket: pendingEmail.pending_ticket, device_id: 'installation-1',
    });
    expect(data.auth).toBeNull();
    bind.flush({ status: 200, data: tokens });

    await expect(binding).resolves.toBe('success');
    expect(data.auth).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(service.emailNeedsWechatBinding).toBe(false);
    expect(service.wechatNeedsBinding).toBe(false);
    expect(Wechat.login).toHaveBeenCalledOnce();
  });

  it('stores a normal WeChat login token pair without requesting a bind', async () => {
    const { login, start } = await startLogin();
    start.flush({ status: 200, data: startData });
    await settle();
    const exchange = http.expectOne(API.AUTH.WECHAT_MOBILE_LOGIN);
    expect(exchange.request.method).toBe('POST');
    expect(exchange.request.body).toEqual({
      login_id: startData.login_id, code: 'wechat-code', state: startData.state, device_id: 'installation-1',
    });
    exchange.flush({ status: 200, data: tokens });

    await expect(login).resolves.toBe(true);
    expect(data.auth).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(service.wechatNeedsBinding).toBe(false);
    http.expectNone(API.AUTH.WECHAT_MOBILE_BIND);
  });

  it('authorizes again when a previous WeChat transaction expired, and rejects duplicate binding starts', async () => {
    await attemptUnboundLogin();
    vi.mocked(Date.now).mockReturnValue(1_000_000 + startData.expires_in * 1000);
    await verifyEmail();
    const binding = service.bindWechatForLogin();
    await expect(service.bindWechatForLogin()).resolves.toBe('failed');
    await settle();
    http.expectOne(API.AUTH.WECHAT_MOBILE_START).flush({ status: 200, data: startData });
    await settle();
    const bind = http.expectOne(API.AUTH.WECHAT_MOBILE_BIND);
    expect(bind.request.body).toEqual({
      login_id: startData.login_id, code: 'wechat-code', state: startData.state,
      pending_ticket: pendingEmail.pending_ticket, device_id: 'installation-1',
    });
    http.expectNone(API.AUTH.WECHAT_MOBILE_LOGIN);
    bind.flush({ status: 200, data: tokens });
    await expect(binding).resolves.toBe('success');
    expect(Wechat.login).toHaveBeenCalledTimes(2);
  });

  it('keeps email verification after cancellation and retries with fresh WeChat authorization', async () => {
    await verifyEmail();
    vi.mocked(Wechat.login).mockRejectedValueOnce({ code: 'WECHAT_USER_CANCELLED' });
    const cancelled = service.bindWechatForLogin();
    await settle();
    http.expectOne(API.AUTH.WECHAT_MOBILE_START).flush({ status: 200, data: startData });
    await expect(cancelled).resolves.toBe('cancelled');
    expect(service.emailNeedsWechatBinding).toBe(true);
    expect(data.auth).toBeNull();
    http.expectNone(API.AUTH.WECHAT_MOBILE_BIND);

    const retry = service.bindWechatForLogin();
    await settle();
    http.expectOne(API.AUTH.WECHAT_MOBILE_START).flush({ status: 200, data: startData });
    await settle();
    http.expectOne(API.AUTH.WECHAT_MOBILE_BIND).flush({ status: 200, data: tokens });
    await expect(retry).resolves.toBe('success');
  });

  it('expires email verification without authorizing WeChat or creating a session', async () => {
    await verifyEmail();
    vi.mocked(Date.now).mockReturnValue(1_300_000);
    await expect(service.bindWechatForLogin()).resolves.toBe('expired');
    expect(service.emailNeedsWechatBinding).toBe(false);
    expect(data.auth).toBeNull();
    expect(Wechat.login).not.toHaveBeenCalled();
    http.expectNone(API.AUTH.WECHAT_MOBILE_START);
  });

  it.each([
    ['AUTH_WECHAT_PENDING_LOGIN_EXPIRED', 'expired', false],
    ['AUTH_WECHAT_ALREADY_BOUND', 'conflict', true],
    ['NETWORK_ERROR', 'failed', true],
  ])('handles %s without accepting a login session', async (code, result, remainsPending) => {
    await attemptUnboundLogin();
    await verifyEmail();
    vi.spyOn(client, 'post').mockReturnValueOnce(throwError(() => new GatewayHttpError({
      httpStatus: 409, code: code as string, message: 'Binding failed',
    })));
    await expect(service.bindWechatForLogin()).resolves.toBe(result);
    expect(service.emailNeedsWechatBinding).toBe(remainsPending);
    expect(data.auth).toBeNull();
    expect(SecureStorage.set).not.toHaveBeenCalled();
  });

  it('does not complete a binding response after the user returns to email login', async () => {
    await attemptUnboundLogin();
    await verifyEmail();
    const binding = service.bindWechatForLogin();
    const bind = http.expectOne(API.AUTH.WECHAT_MOBILE_BIND);
    service.cancelEmailWechatBinding();
    bind.flush({ status: 200, data: tokens });
    await expect(binding).resolves.toBe('failed');
    expect(data.auth).toBeNull();
    expect(service.emailNeedsWechatBinding).toBe(false);
  });

  it('does not accept a bound-only response in place of complete login tokens', async () => {
    await attemptUnboundLogin();
    await verifyEmail();
    const binding = service.bindWechatForLogin();
    http.expectOne(API.AUTH.WECHAT_MOBILE_BIND).flush({ status: 200, data: { bound: true } });
    await expect(binding).resolves.toBe('failed');
    expect(data.auth).toBeNull();
    expect(service.emailNeedsWechatBinding).toBe(true);
  });

  it('explains unavailable WeChat without discarding the verified email', async () => {
    await verifyEmail();
    vi.mocked(Wechat.isInstalled).mockResolvedValue({ value: false });
    await expect(service.bindWechatForLogin()).resolves.toBe('not_installed');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    await expect(service.bindWechatForLogin()).resolves.toBe('unsupported');
    expect(service.emailNeedsWechatBinding).toBe(true);
    expect(data.auth).toBeNull();
    http.expectNone(API.AUTH.WECHAT_MOBILE_START);
  });
});
