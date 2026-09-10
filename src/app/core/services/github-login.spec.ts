import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { NavController } from '@ionic/angular/standalone';
import { API } from 'src/app/configs/api.config';
import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { NtfyService } from './ntfy.service';

const { secureValues } = vi.hoisted(() => ({
  secureValues: new Map<string, Record<string, unknown>>(),
}));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    setKeyPrefix: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(async (key: string) => secureValues.get(key) ?? null),
    set: vi.fn(async (key: string, value: Record<string, unknown>) => { secureValues.set(key, value); }),
    remove: vi.fn(async (key: string) => secureValues.delete(key)),
  },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: { open: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) },
}));

const callbackUrl = 'tech.diandeng.iot://auth/github';
const callback = `${callbackUrl}?code=github-code&state=github-state`;
const tokens = { access_token: 'github-access', refresh_token: 'github-refresh' };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GitHub native login', () => {
  let service: AuthService;
  let data: DataService;
  let http: HttpTestingController;
  let digest: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;

  function createService(): AuthService {
    return new AuthService(
      TestBed.inject(HttpClient), data,
      { navigateRoot: vi.fn() } as unknown as NavController,
      { revoke } as unknown as NtfyService,
    );
  }

  function seedPending(expiresAt = Date.now() + 600_000): void {
    secureValues.set('github-login', {
      state: 'github-state', codeVerifier: 'v'.repeat(43), expiresAt,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    secureValues.clear();
    localStorage.clear();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    digest = vi.fn().mockResolvedValue(new Uint8Array(32).fill(5).buffer);
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
      randomUUID: () => 'installation-1',
      subtle: { digest },
    });
    TestBed.configureTestingModule({
      providers: [DataService, provideHttpClient(), provideHttpClientTesting()],
    });
    data = TestBed.inject(DataService);
    http = TestBed.inject(HttpTestingController);
    revoke = vi.fn().mockResolvedValue(undefined);
    service = createService();
  });

  afterEach(() => {
    try { http.verify(); } finally {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('persists a ten-minute verifier before opening the validated S256 authorization URL', async () => {
    let finishOpening!: () => void;
    const browserOpening = new Promise<void>((resolve) => { finishOpening = resolve; });
    vi.mocked(Browser.open).mockImplementationOnce(async () => {
      expect(secureValues.has('github-login')).toBe(true);
      await browserOpening;
    });
    const opened = service.loginWithGithub();
    await expect(service.loginWithGithub()).resolves.toBe(false);
    await settle();
    const request = http.expectOne(API.AUTH.GITHUB_START);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      code_challenge: btoa(String.fromCharCode(...new Uint8Array(32).fill(5))).replace(/=+$/, ''),
      code_challenge_method: 'S256',
    });
    const authorization = new URL('https://github.com/login/oauth/authorize');
    for (const [key, value] of Object.entries({
      state: 'github-state', redirect_uri: callbackUrl, ...request.request.body,
    })) authorization.searchParams.set(key, value as string);
    request.flush({ status: 200, data: {
      authorization_url: authorization.href, state: 'github-state', provider: 'github',
    } });
    await settle();
    const pending = secureValues.get('github-login')!;
    expect(pending['expiresAt']).toBe(Date.now() + 600_000);
    expect(pending['codeVerifier']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).toHaveBeenCalledWith('SHA-256', new TextEncoder().encode(pending['codeVerifier'] as string));
    expect(SecureStorage.setKeyPrefix).toHaveBeenCalledWith('blinker_');
    expect(Browser.open).toHaveBeenCalledExactlyOnceWith({ url: authorization.href });
    expect(data.auth).toBeNull();
    expect(localStorage.getItem('github-login')).toBeNull();

    const completion = service.completeGithubLogin(callback);
    expect(completion).not.toBeNull();
    await settle();
    http.expectOne(API.AUTH.GITHUB_LOGIN).flush({ status: 200, data: tokens });
    await expect(completion).resolves.toBe('success');
    finishOpening();
    await expect(opened).resolves.toBe(true);
  });

  it('restores a cold callback, consumes before exchange and stores a token pair once', async () => {
    seedPending();
    const restarted = createService();
    const save = vi.spyOn(data, 'setAuthData');
    const completion = restarted.completeGithubLogin(callback);
    expect(restarted.completeGithubLogin(callback)).toBeNull();
    await settle();
    const exchange = http.expectOne(API.AUTH.GITHUB_LOGIN);
    expect(secureValues.has('github-login')).toBe(false);
    expect(exchange.request.body).toEqual({
      code: 'github-code', state: 'github-state', code_verifier: 'v'.repeat(43), device_id: 'installation-1',
    });
    exchange.flush({ status: 200, data: tokens });
    await expect(completion).resolves.toBe('success');
    expect(save).toHaveBeenCalledOnce();
    expect(secureValues.get('session')).toMatchObject({ accessToken: 'github-access', refreshToken: 'github-refresh' });
    await expect(restarted.completeGithubLogin(callback)).resolves.toBe('ignored');
    http.expectNone(API.AUTH.GITHUB_LOGIN);
  });

  it('rejects unrelated callbacks and mismatched state without consuming the pending attempt', async () => {
    seedPending();
    expect(service.completeGithubLogin('https://auth/github?code=x&state=github-state')).toBeNull();
    expect(service.completeGithubLogin(`${callback}#fragment`)).toBeNull();
    await expect(service.completeGithubLogin(`${callbackUrl}?code=x&state=other`)).resolves.toBe('failed');
    expect(secureValues.has('github-login')).toBe(true);
    expect(Browser.close).not.toHaveBeenCalled();
    http.expectNone(API.AUTH.GITHUB_LOGIN);
  });

  it('expires pending authorization after ten minutes', async () => {
    seedPending(Date.now());
    await expect(service.completeGithubLogin(callback)).resolves.toBe('failed');
    expect(secureValues.has('github-login')).toBe(false);
    http.expectNone(API.AUTH.GITHUB_LOGIN);
  });

  it('consumes a matching user cancellation without creating a session', async () => {
    seedPending();
    await expect(service.completeGithubLogin(`${callbackUrl}?error=access_denied&state=github-state`)).resolves.toBe('cancelled');
    expect(secureValues.has('github-login')).toBe(false);
    expect(data.auth).toBeNull();
    http.expectNone(API.AUTH.GITHUB_LOGIN);
  });

  it.each([
    [{ access_token: 'incomplete' }, 'failed'],
    [{ status: 'needs_wechat_bind', pending_ticket: 'pending-ticket' }, 'needs_wechat_bind'],
  ])('does not save non-login responses: %j', async (response, expected) => {
    seedPending();
    const completion = service.completeGithubLogin(callback);
    await settle();
    http.expectOne(API.AUTH.GITHUB_LOGIN).flush({ status: 200, data: response });
    await expect(completion).resolves.toBe(expected);
    expect(data.auth).toBeNull();
    expect(secureValues.has('session')).toBe(false);
  });

  it('does not exchange when secure single-use consumption fails', async () => {
    seedPending();
    vi.mocked(SecureStorage.remove).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(service.completeGithubLogin(callback)).resolves.toBe('failed');
    http.expectNone(API.AUTH.GITHUB_LOGIN);
    expect(data.auth).toBeNull();
  });

  it('clears an old GitHub attempt after email login and after logout', async () => {
    seedPending();
    const emailLogin = service.loginWithEmailCode('person@example.com', '654321');
    http.expectOne(API.AUTH.EMAIL_LOGIN).flush({ status: 200, data: tokens });
    await expect(emailLogin).resolves.toBe(true);
    expect(secureValues.has('github-login')).toBe(false);

    seedPending();
    const logout = service.logout();
    await settle();
    http.expectOne(API.AUTH.LOGOUT).flush({ status: 200, data: null });
    await logout;
    expect(secureValues.has('github-login')).toBe(false);
    await expect(createService().completeGithubLogin(callback)).resolves.toBe('ignored');
    http.expectNone(API.AUTH.GITHUB_LOGIN);
  });

  it('invalidates an in-flight exchange as soon as logout starts', async () => {
    seedPending();
    const completion = service.completeGithubLogin(callback);
    await settle();
    const exchange = http.expectOne(API.AUTH.GITHUB_LOGIN);
    let finishRevoke!: () => void;
    revoke.mockReturnValueOnce(new Promise<void>((resolve) => { finishRevoke = resolve; }));
    const epoch = data.sessionEpoch;
    const logout = service.logout();
    await settle();
    exchange.flush({ status: 200, data: tokens });
    await expect(completion).resolves.toBe('ignored');
    expect(data.sessionEpoch).toBe(epoch);
    expect(data.auth).toBeNull();
    finishRevoke();
    await logout;
  });

  it('does not overwrite a newer session when a previous exchange completes late', async () => {
    seedPending();
    const completion = service.completeGithubLogin(callback);
    await settle();
    const exchange = http.expectOne(API.AUTH.GITHUB_LOGIN);
    await data.setAuthData({ accessToken: 'new-access', refreshToken: 'new-refresh', tokenType: 'bearer' });
    exchange.flush({ status: 200, data: tokens });
    await expect(completion).resolves.toBe('ignored');
    expect(data.auth?.accessToken).toBe('new-access');
  });
});
