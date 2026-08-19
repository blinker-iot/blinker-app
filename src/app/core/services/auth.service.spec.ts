import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { NavController } from '@ionic/angular/standalone';
import { API } from 'src/app/configs/api.config';
import { sha256 } from '../functions/func';
import { AuthService } from './auth.service';
import { DataService } from './data.service';

vi.mock('altcha-lib/v1', () => ({
  solveChallenge: vi.fn(() => ({
    promise: Promise.resolve({ number: 7, took: 1 }),
    controller: new AbortController(),
  })),
}));

describe('AuthService Gateway authentication', () => {
  let service: AuthService;
  let dataService: DataService;
  let httpTesting: HttpTestingController;
  let navigateRoot: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    navigateRoot = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        DataService,
        { provide: NavController, useValue: { navigateRoot } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    dataService = TestBed.inject(DataService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('solves a fresh ALTCHA and coalesces duplicate email-code requests', async () => {
    const first = service.sendEmailCode('person@example.com');
    const second = service.sendEmailCode('person@example.com');
    expect(second).toBe(first);

    const challengeRequest = httpTesting.expectOne(API.AUTH.ALTCHA_CHALLENGE);
    expect(challengeRequest.request.method).toBe('GET');
    challengeRequest.flush({
      algorithm: 'SHA-256',
      challenge: 'challenge',
      maxnumber: 100,
      salt: 'salt',
      signature: 'signature',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const codeRequest = httpTesting.expectOne(API.AUTH.EMAIL_CODE);
    expect(codeRequest.request.method).toBe('POST');
    expect(codeRequest.request.body.email).toBe('person@example.com');
    const payload = JSON.parse(atob(codeRequest.request.body.altcha));
    expect(payload).toEqual({
      algorithm: 'SHA-256',
      challenge: 'challenge',
      number: 7,
      salt: 'salt',
      signature: 'signature',
    });
    codeRequest.flush({ status: 200, data: null });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('stores a login only when both tokens are present', async () => {
    const login = service.loginWithEmailCode('person@example.com', '654321');
    const request = httpTesting.expectOne(API.AUTH.EMAIL_LOGIN);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'person@example.com',
      code: '654321',
      device_id: expect.any(String),
    });
    request.flush({
      status: 200,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      },
    });

    await expect(login).resolves.toBe(true);
    expect(dataService.auth).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenType: 'bearer',
    });
    expect(localStorage.getItem('auth')).toBeNull();
  });

  it('rejects an incomplete login token pair', async () => {
    const login = service.loginWithEmailCode('person@example.com', '654321');
    httpTesting.expectOne(API.AUTH.EMAIL_LOGIN).flush({
      status: 200,
      data: { access_token: 'access-only' },
    });

    await expect(login).resolves.toBe(false);
    expect(dataService.auth).toBeNull();
  });

  it('adapts a legacy username login into the compatible token pair', async () => {
    const login = service.login('legacy-user', 'secret');
    const request = httpTesting.expectOne(
      (candidate) => candidate.url === API.AUTH.LOGIN,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('username')).toBe('legacy-user');
    expect(request.request.params.get('password')).toBe(
      sha256('secret').toString(),
    );
    request.flush({
      message: 1000,
      detail: { uuid: 'legacy-uuid', token: 'legacy-token' },
    });

    await expect(login).resolves.toBe(true);
    expect(dataService.auth).toMatchObject({
      accessToken: 'legacy-token',
      refreshToken: 'legacy-token',
      tokenType: 'legacy',
      uuid: 'legacy-uuid',
      token: 'legacy-token',
    });
  });

  it('keeps register, retrieve, and SMS requests on their legacy endpoints', async () => {
    const register = service.register('13800000000', '123456', 'secret');
    const registerRequest = httpTesting.expectOne(
      (candidate) => candidate.url === API.AUTH.REGISTER,
    );
    expect(registerRequest.request.method).toBe('GET');
    expect(registerRequest.request.params.get('phone')).toBe('13800000000');
    expect(registerRequest.request.params.get('smsCode')).toBe('123456');
    expect(registerRequest.request.params.get('password')).toBe(
      sha256('secret').toString(),
    );
    registerRequest.flush({
      message: 1000,
      detail: { uuid: 'registered-uuid', token: 'registered-token' },
    });
    await expect(register).resolves.toBe(true);

    const retrieve = service.retrieve('13800000000', '654321', 'new-secret');
    const retrieveRequest = httpTesting.expectOne(
      (candidate) => candidate.url === API.AUTH.RETRIEVE,
    );
    expect(retrieveRequest.request.method).toBe('GET');
    expect(retrieveRequest.request.params.get('smsCode')).toBe('654321');
    retrieveRequest.flush({ message: 1000, detail: null });
    await expect(retrieve).resolves.toBe(true);

    const sms = service.getSmscode('13800000000', 'register');
    const smsRequest = httpTesting.expectOne(
      (candidate) => candidate.url === API.AUTH.SMSCODE,
    );
    expect(smsRequest.request.method).toBe('GET');
    expect(smsRequest.request.params.get('sendType')).toBe('register');
    smsRequest.flush({ message: 1000, detail: null });
    await expect(sms).resolves.toBe(true);
  });

  it('retains GitHub and non-native WeChat legacy fallbacks', async () => {
    const github = service.loginWithGithub();
    const githubRequest = httpTesting.expectOne(API.AUTH.GITHUB_LOGIN);
    expect(githubRequest.request.method).toBe('GET');
    githubRequest.flush({
      message: 1000,
      detail: { uuid: 'github-uuid', token: 'github-token' },
    });
    await expect(github).resolves.toBe(true);

    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const wechat = service.loginWithWechat();
    const wechatRequest = httpTesting.expectOne(API.AUTH.WECHAT_LOGIN);
    expect(wechatRequest.request.method).toBe('GET');
    wechatRequest.flush({
      message: 1000,
      detail: { uuid: 'wechat-uuid', token: 'wechat-token' },
    });
    await expect(wechat).resolves.toBe(true);
  });

  it('calls server logout and always clears the local session', async () => {
    await dataService.setAuthData({
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'bearer',
    });

    const logout = service.logout();
    const request = httpTesting.expectOne(API.AUTH.LOGOUT);
    expect(request.request.method).toBe('POST');
    request.flush({ status: 200, data: null });

    await logout;
    expect(dataService.auth).toBeNull();
    expect(navigateRoot).toHaveBeenCalledWith('/login');
  });

  it('does not let a late logout clear a newer login session', async () => {
    await dataService.setAuthData({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      tokenType: 'bearer',
    });

    const logout = service.logout();
    const request = httpTesting.expectOne(API.AUTH.LOGOUT);
    await dataService.setAuthData({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      tokenType: 'bearer',
    });
    request.flush({ status: 200, data: null });

    await logout;
    expect(dataService.auth?.accessToken).toBe('new-access');
    expect(navigateRoot).not.toHaveBeenCalled();
  });
});
