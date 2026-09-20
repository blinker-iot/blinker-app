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
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WeChat native login', () => {
  let service: AuthService;
  let data: DataService;
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('retains an unbound 409 transaction and binds the same login after email authentication', async () => {
    await attemptUnboundLogin();

    const emailLogin = service.loginWithEmailCode('person@example.com', '654321');
    http.expectOne(API.AUTH.EMAIL_LOGIN).flush({ status: 200, data: tokens });
    await settle();
    const bind = http.expectOne(API.AUTH.WECHAT_MOBILE_BIND);
    expect(data.auth).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(bind.request.method).toBe('POST');
    expect(bind.request.body).toEqual({ login_id: startData.login_id });
    expect(service.wechatNeedsBinding).toBe(true);
    bind.flush({ status: 200, data: { bound: true } });

    await expect(emailLogin).resolves.toBe(true);
    expect(service.wechatNeedsBinding).toBe(false);
    expect(Wechat.login).toHaveBeenCalledExactlyOnceWith({ scope: startData.scope, state: startData.state });
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

  it('does not bind an expired WeChat transaction after a successful email login', async () => {
    await attemptUnboundLogin();
    vi.mocked(Date.now).mockReturnValue(1_000_000 + startData.expires_in * 1000);

    const emailLogin = service.loginWithEmailCode('person@example.com', '654321');
    http.expectOne(API.AUTH.EMAIL_LOGIN).flush({ status: 200, data: tokens });

    await expect(emailLogin).resolves.toBe(true);
    expect(service.wechatNeedsBinding).toBe(false);
    expect(data.auth).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    http.expectNone(API.AUTH.WECHAT_MOBILE_BIND);
  });
});
