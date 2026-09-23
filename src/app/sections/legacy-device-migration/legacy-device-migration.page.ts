import { HttpErrorResponse } from '@angular/common/http';
import { GatewayHttpError } from '../../core/model/response.model';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import {
  LegacyImportIssue, LegacyImportPreview, LegacyImportRecord, LegacyImportSync,
  legacyImportPath, legacySource,
} from '../../core/model/legacy-import.model';
import { DataService } from '../../core/services/data.service';
import { LegacyImportService } from '../../core/services/legacy-import.service';

@Component({
  selector: 'app-legacy-device-migration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, IonicModule],
  templateUrl: './legacy-device-migration.page.html',
  styleUrls: ['./legacy-device-migration.page.scss'],
})
export class LegacyDeviceMigrationPage implements OnDestroy {
  phone = '';
  password = '';
  busy = false;
  error = '';
  preview?: LegacyImportPreview;
  syncResult?: LegacyImportSync;
  confirmed = false;
  selected?: LegacyImportRecord;
  readonly path = legacyImportPath;
  private generation = 0;
  private observedEpoch: number;
  private readonly authSubscription: Subscription;

  constructor(
    readonly imports: LegacyImportService,
    private readonly data: DataService,
    private readonly route: ActivatedRoute,
    private readonly nav: NavController,
  ) {
    this.observedEpoch = data.sessionEpoch;
    this.authSubscription = data.authDataChanged.subscribe(() => {
      if (!data.auth || data.sessionEpoch !== this.observedEpoch) {
        this.clear();
        this.selected = undefined;
        void this.nav.navigateRoot('/login');
      }
      this.observedEpoch = data.sessionEpoch;
    });
  }

  get detail(): boolean { return this.route.snapshot.paramMap.has('sourceId'); }
  get expired(): boolean { return !!this.preview && Date.now() >= this.preview.expiresAt; }
  get canConfirm(): boolean {
    return !this.busy && !this.expired && this.preview?.previewComplete === true;
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.data.auth?.accessToken) {
      await this.nav.navigateRoot('/login');
      return;
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = this.generation;
    try {
      this.error = '';
      if (this.detail) {
        const source = legacySource({
          sourceCollection: this.route.snapshot.paramMap.get('collection'),
          sourceId: this.route.snapshot.paramMap.get('sourceId'),
        });
        const record = await this.imports.detail(source);
        if (generation === this.generation) this.selected = record;
      } else {
        await this.imports.load();
      }
    } catch (error) {
      if (generation === this.generation) this.error = this.message(error);
    }
  }

  async beginPreview(): Promise<void> {
    if (this.busy || !this.phone.trim() || !this.password) return;
    const input = { phone: this.phone.trim(), password: this.password };
    this.password = '';
    this.preview = undefined;
    this.syncResult = undefined;
    this.confirmed = false;
    const generation = ++this.generation;
    this.busy = true;
    this.error = '';
    try {
      const first = await this.imports.preview(input);
      input.password = '';
      if (generation !== this.generation) return;
      this.preview = this.checkPreview(first);
      await this.previewRemaining(generation);
    } catch (error) {
      if (generation === this.generation) this.error = this.message(error);
    } finally {
      input.password = '';
      if (generation === this.generation) this.busy = false;
    }
  }

  async continuePreview(): Promise<void> {
    if (this.busy || !this.preview || this.expired) return;
    const generation = this.generation;
    this.busy = true;
    this.error = '';
    try { await this.previewRemaining(generation); }
    catch (error) { if (generation === this.generation) this.error = this.message(error); }
    finally { if (generation === this.generation) this.busy = false; }
  }

  private async previewRemaining(generation: number): Promise<void> {
    const seen = new Set<number>();
    while (this.preview?.nextPage !== null) {
      const previous = this.preview!;
      if (seen.has(previous.nextPage!)) throw new Error('预览分页未完成，请重新验证');
      seen.add(previous.nextPage!);
      const page = this.checkPreview(await this.imports.preview({
        authorization: previous.authorization, page: previous.nextPage!,
      }));
      if (generation !== this.generation) return;
      if (page.authorization !== previous.authorization) throw new Error('迁移授权响应不一致');
      const items = new Map(previous.items.map(record => [this.path(record), record]));
      for (const record of page.items) items.set(this.path(record), record);
      this.preview = { ...page, items: [...items.values()], issues: [...previous.issues, ...page.issues] };
    }
    if (!this.preview?.previewComplete) throw new Error('全部设备尚未读取完成，不能确认同步');
  }

  async confirmSync(): Promise<void> {
    if (!this.canConfirm || !this.preview) return;
    const generation = this.generation;
    this.confirmed = true;
    this.busy = true;
    this.error = '';
    let offset: number | null = 0;
    const results = new Map<string, LegacyImportSync['results'][number]>();
    try {
      do {
        const response: LegacyImportSync = await this.imports.sync(this.preview.authorization, offset);
        if (generation !== this.generation) return;
        if (!Array.isArray(response.results) || !response.summary
          || (response.nextOffset !== null && (!Number.isSafeInteger(response.nextOffset) || response.nextOffset <= offset))) {
          throw new Error('同步响应不完整，可继续补齐已确认的资料');
        }
        response.results.forEach((result, index) => {
          const key = result.sourceId === null ? `invalid:${offset}:${index}` : this.path(legacySource(result));
          results.set(key, result);
        });
        this.syncResult = { ...response, results: [...results.values()] };
        this.preview.expiresAt = response.expiresAt;
        offset = response.nextOffset;
      } while (offset !== null);
    } catch (error) {
      if (generation === this.generation) this.error = this.message(error);
    } finally {
      if (generation === this.generation) {
        try { await this.imports.load(); }
        catch (error) { if (!this.error) this.error = this.message(error); }
        this.busy = false;
      }
    }
  }

  async connect(method: 'key' | 'ble'): Promise<void> {
    if (!this.selected || this.selected.snapshot.disabled) return;
    await this.nav.navigateForward('/guide/' + method, {
      queryParams: {
        sourceCollection: this.selected.sourceCollection,
        sourceId: this.selected.sourceId,
      },
    });
  }

  issueText(issue: LegacyImportIssue): string {
    const labels: Record<string, string> = {
      source_unavailable: '来源已不可用，请重新核对旧账号设备归属',
      SOURCE_UNAVAILABLE: '来源已不可用，请重新核对旧账号设备归属',
      PARAMETER_OWNERSHIP_UNVERIFIED: '参数归属待核对，内容未迁入',
      PARAMETER_BACKUP_AMBIGUOUS: '参数备份存在多个候选，未自动选择',
      PARAMETER_REFERENCE_MISSING: '参数备份缺少可靠关联',
      PARAMETER_REFERENCE_INVALID: '参数备份引用无效',
      CONFIG_REFERENCE_INVALID: '设备配置关联需核对，暂缓接入',
      UNKNOWN_FIELDS_OMITTED: '存在未识别字段，未复制这些字段',
      UNSAFE_OR_INVALID_FIELD: '字段不符合安全格式，未复制',
      UNSUPPORTED_LAYOUT_FORMAT: '此布局格式尚待适配',
      UNSUPPORTED_LAYOUT_VERSION: '此布局版本尚待适配',
      UNSUPPORTED_WIDGET: '此控件尚待适配',
      INVALID_OR_OVERSIZE_LAYOUT: '布局格式或大小超出支持范围',
      INVALID_FREQUENCY: '低功耗频率设置无效',
      INVALID_STRUCTURE: '配置结构需核对',
      REQUIRED_LAYOUT_FIELD_MISSING: '布局缺少必要内容',
      EXPORT_SIZE_LIMIT: '资料超出本次读取大小限制',
      INVALID_SOURCE_ID: '来源标识无效，未同步',
    };
    return (issue.path ? issue.path + '：' : '') + (labels[issue.code] ?? issue.code);
  }

  private checkPreview(value: LegacyImportPreview): LegacyImportPreview {
    if (!value?.authorization || !Array.isArray(value.items) || !Array.isArray(value.issues)
      || typeof value.previewComplete !== 'boolean' || !Number.isSafeInteger(value.total)
      || !Number.isSafeInteger(value.expiresAt)
      || (value.nextPage !== null && (!Number.isSafeInteger(value.nextPage) || value.nextPage < 0))
      || (value.previewComplete && value.nextPage !== null)) throw new Error('迁移预览响应不完整');
    for (const item of value.items) {
      legacySource(item);
      if (!item.snapshot || typeof item.snapshot.displayName !== 'string') throw new Error('设备资料不完整');
    }
    return value;
  }

  private message(error: unknown): string {
    const code = error instanceof GatewayHttpError ? error.code
      : error instanceof HttpErrorResponse ? error.error?.errorCode : undefined;
    const status = error instanceof GatewayHttpError ? error.httpStatus
      : error instanceof HttpErrorResponse ? error.status : undefined;
    if (status === 429) return '验证尝试过于频繁，请稍后重试';
    if (/AUTHORIZATION.*EXPIRED|AUTHORIZATION.*INVALID|GRANT.*EXPIRED/.test(code ?? '')) {
      return '本次迁移授权已失效，请重新验证并确认；已同步资料保留';
    }
    if (error instanceof HttpErrorResponse) {
      return typeof error.error?.errorMessage === 'string' ? error.error.errorMessage : '网络请求失败，请重试';
    }
    return error instanceof Error ? error.message : '读取失败，请重试';
  }

  private clear(): void {
    this.generation += 1;
    this.password = '';
    this.phone = '';
    this.preview = undefined;
    this.syncResult = undefined;
    this.confirmed = false;
    this.busy = false;
  }

  ionViewWillLeave(): void { this.clear(); }
  ngOnDestroy(): void { this.clear(); this.authSubscription.unsubscribe(); }
}
