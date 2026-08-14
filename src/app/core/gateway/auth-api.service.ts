import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AltchaChallenge, solveAltcha } from './altcha-solver';
import { gatewayUrl } from './gateway.config';
import { gatewayContext } from './gateway.context';
import { GatewayError } from './gateway-error';
import {
  AilyEnvelope,
  GatewayTokenResponse,
  GatewayUserProfile,
} from './gateway.models';
import { GatewaySessionService } from './gateway-session.service';

@Injectable({ providedIn: 'root' })
export class GatewayAuthApiService {
  constructor(
    private http: HttpClient,
    private session: GatewaySessionService,
  ) {}

  async sendEmailCode(email: string): Promise<void> {
    const challenge = await firstValueFrom(this.http.get<AltchaChallenge>(
      gatewayUrl('/api/v1/auth/altcha/challenge'),
      { context: gatewayContext('none') },
    ));
    const altcha = await solveAltcha(challenge, { timeoutMs: 30_000 });
    const response = await firstValueFrom(this.http.post<AilyEnvelope<null>>(
      gatewayUrl('/api/v1/auth/email/code'),
      { email, altcha },
      { context: gatewayContext('none') },
    ));
    this.assertSuccess(response, 'AUTH_EMAIL_CODE_FAILED');
  }

  async login(email: string, code: string): Promise<GatewayUserProfile> {
    const response = await firstValueFrom(this.http.post<AilyEnvelope<GatewayTokenResponse>>(
      gatewayUrl('/api/v1/auth/email/login'),
      { email, code },
      { context: gatewayContext('none') },
    ));
    this.assertSuccess(response, 'AUTH_LOGIN_FAILED');
    this.session.establish(response.data);

    try {
      return await this.getCurrentUser();
    } catch (error) {
      this.session.clear();
      throw error;
    }
  }

  async getCurrentUser(): Promise<GatewayUserProfile> {
    const response = await firstValueFrom(this.http.get<AilyEnvelope<GatewayUserProfile>>(
      gatewayUrl('/api/v1/auth/me'),
      { context: gatewayContext('required') },
    ));
    this.assertSuccess(response, 'AUTH_ME_FAILED');
    if (!response.data?.id || !response.data?.email) {
      throw new GatewayError(502, 'AUTH_PROFILE_INVALID', 'The user profile is incomplete.');
    }
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      if (this.session.accessToken) {
        await firstValueFrom(this.http.post(
          gatewayUrl('/api/v1/auth/logout'),
          {},
          { context: gatewayContext('required', false) },
        ));
      }
    } finally {
      this.session.clear();
    }
  }

  private assertSuccess(response: AilyEnvelope<unknown>, fallbackCode: string): void {
    if (response?.status !== 200 || response.errorCode != null) {
      throw new GatewayError(
        Number(response?.status) || 400,
        String(response?.errorCode ?? fallbackCode),
        response?.errorMessage ?? 'Authentication request failed.',
        undefined,
        response,
      );
    }
  }
}
