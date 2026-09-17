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

export type MigrationEndpoint = { kind: 'managed' }
  | { kind: 'self_hosted'; serverUrl: string };

export type MigrationTarget = { kind: 'managed' }
  | { kind: 'self_hosted'; serverUrl: string; serverKey?: string };

export interface MigrationPreview {
  action: 'configure' | 'migrate';
  previewRevision: string;
  target: MigrationEndpoint;
  deviceCount: number;
}

export interface MigrationTask {
  id: string;
  status: 'queued' | 'migrating' | 'switching' | 'restoring' | 'completed' | 'failed' | 'blocked';
  source: MigrationEndpoint;
  target: MigrationEndpoint;
  serviceState: 'source' | 'paused' | 'target';
  errorCode: string | null;
  cleanup: {
    state: 'none' | 'awaiting_confirmation' | 'processing' | 'completed';
    side: 'source' | 'target' | null;
  };
  updatedAt: number;
}

export interface MigrationCleanupPreview {
  taskId: string;
  side: 'source' | 'target';
  endpoint: MigrationEndpoint;
  deviceCount: number;
  recoverability: 'not_guaranteed';
  cleanupRevision: string;
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

  async previewMigration(target: MigrationTarget): Promise<MigrationPreview> {
    const response = await firstValueFrom(
      this.http.post<AilyResponse<MigrationPreview>>(API.ACCOUNT.SELF_HOSTED_MIGRATION + '/preview', {
        target,
      }),
    );
    return response.data;
  }

  async startMigration(
    target: MigrationTarget,
    expectedRevision: string,
    idempotencyKey: string,
  ): Promise<MigrationTask> {
    const response = await firstValueFrom(
      this.http.post<AilyResponse<MigrationTask>>(API.ACCOUNT.SELF_HOSTED_MIGRATION, {
        target, expectedRevision,
      }, { headers: { 'Idempotency-Key': idempotencyKey } }),
    );
    return response.data;
  }

  async getMigration(taskId?: string): Promise<MigrationTask | null> {
    const response = await firstValueFrom(
      this.http.get<AilyResponse<MigrationTask | null>>(API.ACCOUNT.SELF_HOSTED_MIGRATION, {
        params: taskId !== undefined ? { taskId } : {},
      }),
    );
    return response.data;
  }

  async previewCleanup(taskId: string): Promise<MigrationCleanupPreview> {
    const response = await firstValueFrom(
      this.http.post<AilyResponse<MigrationCleanupPreview>>(
        API.ACCOUNT.SELF_HOSTED_MIGRATION + '/' + encodeURIComponent(taskId) + '/cleanup/preview',
        {},
      ),
    );
    return response.data;
  }

  async confirmCleanup(taskId: string, expectedRevision: string): Promise<MigrationTask> {
    const response = await firstValueFrom(
      this.http.post<AilyResponse<MigrationTask>>(
        API.ACCOUNT.SELF_HOSTED_MIGRATION + '/' + encodeURIComponent(taskId) + '/cleanup',
        { expectedRevision },
      ),
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
