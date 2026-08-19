import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
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

  async loginWithGithub(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<BlinkerResponse>(API.AUTH.GITHUB_LOGIN),
      );
      return await this.storeLegacyAuth(response);
    } catch (error) {
      return this.handleError(error);
    }
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
