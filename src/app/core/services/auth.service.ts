import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { NavController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { solveChallenge } from 'altcha-lib/v1';
import { Wechat } from 'capacitor-wechat';
import { API } from 'src/app/configs/api.config';
import {
  AilyResponse,
  AltchaChallenge,
  AuthTokenPair,
  AuthTokenResponseData,
  BlinkerResponse,
  CurrentUser,
  GatewayHttpError,
} from '../model/response.model';
import { sha256 } from '../functions/func';
import { AuthData } from '../model/data.model';
import { DataService } from './data.service';
import { NtfyService } from './ntfy.service';

const GITHUB_CALLBACK_URL = 'tech.diandeng.iot://auth/github';
const GITHUB_PENDING_KEY = 'github-login';
const GITHUB_LOGIN_TTL_MS = 10 * 60 * 1000;

interface GithubStartData {
  authorization_url: string;
  state: string;
  provider: string;
}

interface PendingGithubLogin extends Record<string, unknown> {
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

export type GithubLoginResult = 'success' | 'cancelled' | 'failed' | 'needs_wechat_bind' | 'ignored';

interface WechatStartData {
  login_id: string;
  app_id: string;
  state: string;
  scope: string;
  expires_in: number;
}

interface WechatBindData {
  bound: boolean;
}

interface PendingWechatBind {
  loginId: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private emailCodeRequest: Promise<boolean> | null = null;
  private pendingWechatBind: PendingWechatBind | null = null;
  private githubStarting = false;
  private githubCallbackRunning = false;
  private githubLoginGeneration = 0;

  get githubLoginSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  get accessToken(): string | null {
    return this.dataService.auth?.accessToken || null;
  }

  get uuid(): string | undefined {
    return this.dataService.auth?.uuid;
  }

  get token(): string | undefined {
    return this.dataService.auth?.token;
  }

  get wechatNeedsBinding(): boolean {
    return !!this.getPendingWechatBind();
  }

  constructor(
    private http: HttpClient,
    private dataService: DataService,
    private navCtrl: NavController,
    private ntfyService: NtfyService,
  ) {}

  init(): void {
    this.dataService.authCheck.subscribe((state) => {
      if (state) void this.checkAuthState();
    });
  }

  isLogin(): boolean {
    return !!(
      this.dataService.auth?.accessToken &&
      this.dataService.auth?.refreshToken
    );
  }

  async checkAuthState(): Promise<boolean> {
    if (!this.isLogin()) return false;
    try {
      const response = await firstValueFrom(
        this.http.get<AilyResponse<CurrentUser>>(API.AUTH.ME),
      );
      return !!response?.data?.id;
    } catch {
      return false;
    }
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<BlinkerResponse>(API.AUTH.LOGIN, {
          params: {
            username,
            password: sha256(password),
          },
        }),
      );
      return await this.storeLegacyAuth(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async register(
    phone: string,
    smscode: string,
    password: string,
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<BlinkerResponse>(API.AUTH.REGISTER, {
          params: {
            phone,
            smsCode: smscode,
            password: sha256(password),
          },
        }),
      );
      return await this.storeLegacyAuth(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async retrieve(
    phone: string,
    smscode: string,
    password: string,
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<BlinkerResponse>(API.AUTH.RETRIEVE, {
          params: {
            phone,
            smsCode: smscode,
            password: sha256(password),
          },
        }),
      );
      return response.message === 1000;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getSmscode(phone: string, action: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<BlinkerResponse>(API.AUTH.SMSCODE, {
          params: { phone, sendType: action },
        }),
      );
      return response.message === 1000;
    } catch (error) {
      return this.handleError(error);
    }
  }

  sendEmailCode(email: string): Promise<boolean> {
    if (this.emailCodeRequest) return this.emailCodeRequest;
    this.emailCodeRequest = this.sendEmailCodeOnce(email).finally(() => {
      this.emailCodeRequest = null;
    });
    return this.emailCodeRequest;
  }

  async loginWithEmailCode(email: string, code: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<AilyResponse<AuthTokenResponseData>>(
          API.AUTH.EMAIL_LOGIN,
          {
            email,
            code,
            device_id: this.dataService.getInstallationId(),
          },
        ),
      );
      const tokens = this.toTokenPair(response?.data);
      if (!tokens) return false;
      await this.clearPendingGithubLogin();
      if (!await this.dataService.setAuthData(tokens)) return false;
      await this.bindPendingWechatIfPossible();
      return true;
    } catch {
      return false;
    }
  }

  async refreshSession(): Promise<AuthTokenPair | null> {
    const current = this.dataService.auth;
    if (!current?.refreshToken) return null;
    try {
      const response = await firstValueFrom(
        this.http.post<AilyResponse<AuthTokenResponseData>>(
          API.AUTH.REFRESH,
          { refresh_token: current.refreshToken },
        ),
      );
      const tokens = this.toTokenPair(response?.data);
      if (!tokens) return null;
      const replaced = await this.dataService.replaceAuthData(current, tokens);
      return replaced ? tokens : null;
    } catch {
      return null;
    }
  }

  async loginWithWechat(): Promise<boolean> {
    const platform = Capacitor.getPlatform();
    if (
      !Capacitor.isNativePlatform() ||
      (platform !== 'android' && platform !== 'ios')
    ) {
      return this.loginWithLegacyWechat();
    }

    try {
      const installed = await Wechat.isInstalled();
      if (!installed.value) return false;

      const deviceId = this.dataService.getInstallationId();
      const startResponse = await firstValueFrom(
        this.http.post<AilyResponse<WechatStartData>>(
          API.AUTH.WECHAT_MOBILE_START,
          { device_id: deviceId, platform },
        ),
      );
      const start = startResponse?.data;
      if (!this.isValidWechatStart(start)) return false;

      const expiresAt = Date.now() + start.expires_in * 1000;
      const sdkResult = await Wechat.login({
        scope: start.scope,
        state: start.state,
      });
      if (!sdkResult?.code || sdkResult.state !== start.state || Date.now() >= expiresAt) {
        return false;
      }

      try {
        const loginResponse = await firstValueFrom(
          this.http.post<AilyResponse<AuthTokenResponseData>>(
            API.AUTH.WECHAT_MOBILE_LOGIN,
            {
              login_id: start.login_id,
              code: sdkResult.code,
              state: sdkResult.state,
              device_id: deviceId,
            },
          ),
        );
        const tokens = this.toTokenPair(loginResponse?.data);
        if (!tokens) return false;
        await this.clearPendingGithubLogin();
        if (!await this.dataService.setAuthData(tokens)) return false;
        this.pendingWechatBind = null;
        return true;
      } catch (error) {
        if (error instanceof GatewayHttpError && error.code === 'AUTH_WECHAT_NOT_BOUND') {
          this.pendingWechatBind = {
            loginId: start.login_id,
            expiresAt,
          };
        }
        return false;
      }
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    const expectedEpoch = this.dataService.sessionEpoch;
    if (this.githubLoginSupported) {
      await this.clearPendingGithubLogin().catch(() => undefined);
    }
    try {
      await this.ntfyService.revoke();
    } catch {
      // Server logout and local cleanup must still complete if revocation is unavailable.
    }
    if (this.dataService.sessionEpoch !== expectedEpoch) return;
    try {
      if (this.dataService.auth?.accessToken) {
        await firstValueFrom(this.http.post(API.AUTH.LOGOUT, {}));
      }
    } catch {
      // Local cleanup is required even when the server session is unavailable.
    } finally {
      await this.clearLocalSession(expectedEpoch);
    }
  }

  async clearLocalSession(
    expectedEpoch = this.dataService.sessionEpoch,
  ): Promise<boolean> {
    if (this.dataService.sessionEpoch !== expectedEpoch) return false;
    this.pendingWechatBind = null;
    this.dataService.authDataExpire.next(true);
    await this.dataService.removeAuthData();
    if (
      this.dataService.sessionEpoch !== expectedEpoch + 1 ||
      this.dataService.auth
    ) {
      return false;
    }
    await this.navCtrl.navigateRoot('/login');
    return true;
  }

  // Returns once the authorization browser opens; login completes through the app link.
  async loginWithGithub(): Promise<boolean> {
    if (!this.githubLoginSupported || this.isLogin() || this.githubStarting || this.githubCallbackRunning) {
      return false;
    }
    this.githubStarting = true;
    const epoch = this.dataService.sessionEpoch;
    const generation = this.githubLoginGeneration;
    try {
      await SecureStorage.setKeyPrefix('blinker_');
      await SecureStorage.remove(GITHUB_PENDING_KEY, false);
      const codeVerifier = this.encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
      const codeChallenge = this.encodeBase64Url(new Uint8Array(digest));
      const response = await firstValueFrom(
        this.http.post<AilyResponse<GithubStartData>>(API.AUTH.GITHUB_START, {
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        }),
      );
      const start = response?.data;
      if (!start?.state || start.provider !== 'github') return false;
      const authorization = new URL(start.authorization_url);
      if (
        authorization.origin !== 'https://github.com' ||
        authorization.pathname !== '/login/oauth/authorize' ||
        authorization.username || authorization.password ||
        authorization.searchParams.get('state') !== start.state ||
        authorization.searchParams.get('redirect_uri') !== GITHUB_CALLBACK_URL ||
        authorization.searchParams.get('code_challenge') !== codeChallenge ||
        authorization.searchParams.get('code_challenge_method') !== 'S256' ||
        this.dataService.sessionEpoch !== epoch || this.githubLoginGeneration !== generation
      ) return false;

      const pending: PendingGithubLogin = {
        state: start.state,
        codeVerifier,
        expiresAt: Date.now() + GITHUB_LOGIN_TTL_MS,
      };
      await SecureStorage.set(GITHUB_PENDING_KEY, pending, false);
      if (this.dataService.sessionEpoch !== epoch || this.githubLoginGeneration !== generation) {
        await SecureStorage.remove(GITHUB_PENDING_KEY, false);
        return false;
      }
      this.githubStarting = false;
      await Browser.open({ url: authorization.href });
      return true;
    } catch {
      await SecureStorage.remove(GITHUB_PENDING_KEY, false).catch(() => undefined);
      return false;
    } finally {
      this.githubStarting = false;
    }
  }

  // A null result lets the shared app-link dispatcher ignore other links and duplicates.
  completeGithubLogin(url?: string): Promise<GithubLoginResult> | null {
    if (!url || !this.githubLoginSupported || this.githubCallbackRunning || this.githubStarting) return null;
    let callback: URL;
    try {
      callback = new URL(url);
    } catch {
      return null;
    }
    if (
      callback.protocol !== 'tech.diandeng.iot:' || callback.hostname !== 'auth' ||
      callback.pathname !== '/github' || callback.port || callback.username ||
      callback.password || callback.hash
    ) return null;
    this.githubCallbackRunning = true;
    return this.completeGithubLoginOnce(callback).finally(() => {
      this.githubCallbackRunning = false;
    });
  }

  private async completeGithubLoginOnce(callback: URL): Promise<GithubLoginResult> {
    const epoch = this.dataService.sessionEpoch;
    const generation = this.githubLoginGeneration;
    let closeBrowser = false;
    try {
      await SecureStorage.setKeyPrefix('blinker_');
      const saved = await SecureStorage.get(GITHUB_PENDING_KEY, false, false);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved instanceof Date) return 'ignored';
      if (
        typeof saved['state'] !== 'string' ||
        typeof saved['codeVerifier'] !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(saved['codeVerifier']) ||
        typeof saved['expiresAt'] !== 'number' || !Number.isFinite(saved['expiresAt']) ||
        saved['expiresAt'] <= Date.now()
      ) {
        await SecureStorage.remove(GITHUB_PENDING_KEY, false);
        return 'failed';
      }
      const states = callback.searchParams.getAll('state');
      if (states.length !== 1 || states[0] !== saved['state']) return 'failed';
      closeBrowser = true;

      // Consume before exchanging: a warm event and a cold launch may carry the same URL.
      await SecureStorage.remove(GITHUB_PENDING_KEY, false);
      if (this.dataService.sessionEpoch !== epoch || this.githubLoginGeneration !== generation || this.isLogin()) return 'ignored';
      const errors = callback.searchParams.getAll('error');
      if (errors.length) return errors.length === 1 && errors[0] === 'access_denied' ? 'cancelled' : 'failed';
      const codes = callback.searchParams.getAll('code');
      if (codes.length !== 1 || !codes[0].trim()) return 'failed';

      const response = await firstValueFrom(
        this.http.post<AilyResponse<AuthTokenResponseData | { status: string; pending_ticket: string }>>(
          API.AUTH.GITHUB_LOGIN,
          {
            code: codes[0],
            state: states[0],
            code_verifier: saved['codeVerifier'],
            device_id: this.dataService.getInstallationId(),
          },
        ),
      );
      if (this.dataService.sessionEpoch !== epoch || this.githubLoginGeneration !== generation) return 'ignored';
      const data = response?.data;
      if (!data) return 'failed';
      if ('status' in data) {
        return data.status === 'needs_wechat_bind' && data.pending_ticket ? 'needs_wechat_bind' : 'failed';
      }
      const tokens = this.toTokenPair(data);
      if (!tokens || !await this.dataService.setAuthData(tokens)) return 'failed';
      this.pendingWechatBind = null;
      return 'success';
    } catch {
      return 'failed';
    } finally {
      // Native close can reject after a cold launch or when the browser is already dismissed.
      if (closeBrowser) await Browser.close().catch(() => undefined);
    }
  }

  private async clearPendingGithubLogin(): Promise<void> {
    this.githubLoginGeneration += 1;
    if (!this.githubLoginSupported) return;
    await SecureStorage.setKeyPrefix('blinker_');
    await SecureStorage.remove(GITHUB_PENDING_KEY, false);
  }

  private encodeBase64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private async loginWithLegacyWechat(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<BlinkerResponse>(API.AUTH.WECHAT_LOGIN),
      );
      return await this.storeLegacyAuth(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async sendEmailCodeOnce(email: string): Promise<boolean> {
    try {
      const challenge = await firstValueFrom(
        this.http.get<AltchaChallenge>(API.AUTH.ALTCHA_CHALLENGE),
      );
      if (!this.isValidChallenge(challenge)) return false;
      const solution = await solveChallenge(
        challenge.challenge,
        challenge.salt,
        challenge.algorithm,
        challenge.maxnumber,
      ).promise;
      if (!solution) return false;

      const altcha = this.encodeAltchaPayload({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number: solution.number,
        salt: challenge.salt,
        signature: challenge.signature,
      });
      const response = await firstValueFrom(
        this.http.post<AilyResponse<null>>(API.AUTH.EMAIL_CODE, { email, altcha }),
      );
      return response?.status === 200;
    } catch {
      return false;
    }
  }

  private async bindPendingWechatIfPossible(): Promise<void> {
    const pending = this.getPendingWechatBind();
    if (!pending) return;
    try {
      const response = await firstValueFrom(
        this.http.post<AilyResponse<WechatBindData>>(
          API.AUTH.WECHAT_MOBILE_BIND,
          { login_id: pending.loginId },
        ),
      );
      if (response?.data?.bound === true) this.pendingWechatBind = null;
    } catch {
      // Email authentication remains valid even if the optional bind fails.
    }
  }

  private getPendingWechatBind(): PendingWechatBind | null {
    if (this.pendingWechatBind && this.pendingWechatBind.expiresAt > Date.now()) {
      return this.pendingWechatBind;
    }
    this.pendingWechatBind = null;
    return null;
  }

  private toTokenPair(data: AuthTokenResponseData | null | undefined): AuthTokenPair | null {
    if (!data?.access_token?.trim() || !data?.refresh_token?.trim()) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type?.trim() || 'bearer',
    };
  }

  private async storeLegacyAuth(response: BlinkerResponse): Promise<boolean> {
    if (response?.message !== 1000) return false;
    const auth = this.toLegacyAuth(response.detail);
    if (!auth) return false;
    await this.clearPendingGithubLogin();
    return this.dataService.setAuthData(auth);
  }

  private toLegacyAuth(detail: unknown): AuthData | null {
    if (typeof detail !== 'object' || detail === null) return null;
    const legacy = detail as { uuid?: unknown; token?: unknown };
    if (
      typeof legacy.uuid !== 'string' ||
      !legacy.uuid.trim() ||
      typeof legacy.token !== 'string' ||
      !legacy.token.trim()
    ) {
      return null;
    }
    return {
      accessToken: legacy.token,
      refreshToken: legacy.token,
      tokenType: 'legacy',
      uuid: legacy.uuid,
      token: legacy.token,
    };
  }

  private isValidChallenge(challenge: AltchaChallenge): boolean {
    return !!(
      challenge?.challenge &&
      challenge?.salt &&
      challenge?.signature &&
      challenge?.algorithm &&
      Number.isInteger(challenge.maxnumber) &&
      challenge.maxnumber > 0
    );
  }

  private isValidWechatStart(data: WechatStartData | null | undefined): data is WechatStartData {
    return !!(
      data?.login_id &&
      data?.app_id &&
      data?.state &&
      data?.scope &&
      Number.isInteger(data?.expires_in) &&
      data.expires_in > 0
    );
  }

  private encodeAltchaPayload(payload: Record<string, string | number>): string {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  handleError(error: unknown): boolean {
    console.error('An error occurred', error);
    return false;
  }
}
