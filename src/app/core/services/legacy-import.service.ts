import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { API } from '../../configs/api.config';
import { LegacyImportPreview, LegacyImportRecord, LegacyImportSync, LegacySource, legacySource } from '../model/legacy-import.model';
import { DataService } from './data.service';

@Injectable({ providedIn: 'root' })
export class LegacyImportService {
  readonly records = new BehaviorSubject<LegacyImportRecord[]>([]);
  private loadTask?: { epoch: number; promise: Promise<LegacyImportRecord[]> };

  constructor(private readonly http: HttpClient, private readonly data: DataService) {
    let epoch = data.sessionEpoch;
    data.authDataChanged.subscribe(() => {
      if (!data.auth || data.sessionEpoch !== epoch) this.records.next([]);
      epoch = data.sessionEpoch;
    });
  }

  preview(input: { phone: string; password: string } | { authorization: string; page: number }): Promise<LegacyImportPreview> {
    return this.post('/preview', input);
  }

  sync(authorization: string, offset: number): Promise<LegacyImportSync> {
    return this.post('/sync', { authorization, offset });
  }

  load(): Promise<LegacyImportRecord[]> {
    const epoch = this.data.sessionEpoch;
    if (this.loadTask?.epoch === epoch) return this.loadTask.promise;
    const promise = this.loadPages(epoch).finally(() => {
      if (this.loadTask?.promise === promise) this.loadTask = undefined;
    });
    this.loadTask = { epoch, promise };
    return promise;
  }

  async detail(source: LegacySource): Promise<LegacyImportRecord> {
    const key = legacySource(source);
    const epoch = this.data.sessionEpoch;
    this.assertSession(epoch);
    const response = await firstValueFrom(this.http.get<{ status: number; data: LegacyImportRecord }>(
      `${API.ACCOUNT.LEGACY_IMPORTS}/${key.sourceCollection}/${key.sourceId}`,
    ));
    this.assertSession(epoch);
    return this.record(this.body(response));
  }

  private async loadPages(epoch: number): Promise<LegacyImportRecord[]> {
    const records = new Map<string, LegacyImportRecord>();
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      this.assertSession(epoch);
      const response = await firstValueFrom(this.http.get<{
        status: number; data: { items: LegacyImportRecord[]; nextCursor: string | null };
      }>(API.ACCOUNT.LEGACY_IMPORTS, { params: cursor ? { cursor } : {} }));
      this.assertSession(epoch);
      const page = this.body(response);
      if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) {
        throw new Error('旧设备列表响应无效');
      }
      for (const value of page.items) {
        const record = this.record(value);
        records.set(`${record.sourceCollection}/${record.sourceId}`, record);
      }
      cursor = page.nextCursor;
      if (cursor !== null) {
        if (!cursor || seen.has(cursor)) throw new Error('旧设备列表分页未完成');
        seen.add(cursor);
      }
    } while (cursor !== null);
    const result = [...records.values()];
    this.records.next(result);
    return result;
  }

  private async post<T>(path: string, input: unknown): Promise<T> {
    const epoch = this.data.sessionEpoch;
    this.assertSession(epoch);
    const response = await firstValueFrom(this.http.post<{ status: number; data: T }>(
      API.ACCOUNT.LEGACY_IMPORTS + path, input,
    ));
    this.assertSession(epoch);
    return this.body(response);
  }

  private record(value: LegacyImportRecord): LegacyImportRecord {
    legacySource(value);
    if (!value.snapshot || typeof value.snapshot.displayName !== 'string') throw new Error('旧设备资料响应无效');
    return value;
  }

  private body<T>(response: { status: number; data: T }): T {
    if (response?.status !== 200 || response.data == null) throw new Error('旧设备迁移响应无效');
    return response.data;
  }

  private assertSession(epoch: number): void {
    if (!this.data.auth?.accessToken || this.data.sessionEpoch !== epoch) {
      throw new Error('登录账号已改变，请重新打开迁移页面');
    }
  }
}
