import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from '../../configs/api.config';
import { AilyResponse } from '../model/response.model';

export interface SelfHostedServerConfig {
  state: 'not_configured' | 'enabled' | 'unavailable';
  serverUrl: string | null;
  keyConfigured: boolean;
  lastVerifiedAt: number | null;
  lastErrorCode: string | null;
}

@Injectable({ providedIn: 'root' })
export class SelfHostedServerService {
  constructor(private readonly http: HttpClient) {
    try {
      localStorage.removeItem('blinker:self-hosted-server-config');
    } catch {
      // Gateway configuration remains available when browser storage is disabled.
    }
  }

  async getConfig(): Promise<SelfHostedServerConfig> {
    const response = await firstValueFrom(
      this.http.get<AilyResponse<SelfHostedServerConfig>>(API.ACCOUNT.SELF_HOSTED_SERVER),
    );
    return response.data;
  }

  async saveConfig(address: string, key?: string): Promise<SelfHostedServerConfig> {
    const response = await firstValueFrom(
      this.http.put<AilyResponse<SelfHostedServerConfig>>(API.ACCOUNT.SELF_HOSTED_SERVER, {
        serverUrl: address,
        ...(key !== undefined ? { serverKey: key } : {}),
      }),
    );
    return response.data;
  }

  async clearConfig(): Promise<SelfHostedServerConfig> {
    const response = await firstValueFrom(
      this.http.delete<AilyResponse<SelfHostedServerConfig>>(API.ACCOUNT.SELF_HOSTED_SERVER),
    );
    return response.data;
  }

  normalizeAddress(value: string): string | null {
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
        || url.search || url.hash || /[\\\s]/.test(value.trim())) return null;
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      return url.toString();
    } catch {
      return null;
    }
  }
}
