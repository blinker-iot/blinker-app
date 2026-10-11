import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext, DeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { capabilityBooleanLabel, capabilityDisplayName, deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { StateHistoryItem, StateHistoryQuery, STATE_HISTORY_PAGE_LIMIT, STATE_HISTORY_RECORDED_TYPES,
  STATE_HISTORY_VIEW_LIMIT } from '../../../core/device-v2/state-history';
import { API } from '../../../configs/api.config';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2HistoryService } from '../../../core/services/device-v2-history.service';
import { DeviceV2ManifestCache } from '../../../core/services/device-v2-manifest-cache.service';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { GatewayHttpError } from '../../../core/model/response.model';

const DAY = 24 * 60 * 60 * 1000;
const TYPE_LABELS = ['开关', '整数', '非负整数', '数值', '数值', '文字'];

@Component({
  selector: 'app-device-storage', templateUrl: './device-storage.page.html', styleUrls: ['./device-storage.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, HeroCardComponent],
})
export class DeviceStoragePage implements OnDestroy {
  id = '';
  readonly ranges = [{ value: 60 * 60 * 1000, label: '最近 1 小时' }, { value: DAY, label: '最近 24 小时' },
    { value: 7 * DAY, label: '最近 7 天' }];
  readonly viewLimit = STATE_HISTORY_VIEW_LIMIT;
  readonly state = signal({ busy: false, ready: false, error: '', rows: [] as StateHistoryItem[],
    rangeMs: DAY, key: '', from: 0, to: 0, nextCursor: null as string | null, policyConfirmed: false });
  private readonly subscriptions = new Subscription();
  private visible = false;
  private destroyed = false;
  private generation = 0;
  private controller?: AbortController;
  private account?: DeviceV2AccountContext;

  constructor(private readonly route: ActivatedRoute, private readonly data: DataService,
    private readonly history: DeviceV2HistoryService, private readonly manifests: DeviceV2ManifestCache,
    private readonly visibility: AppVisibilityService) {
    this.subscriptions.add(data.authDataChanged.subscribe(() => {
      if (this.account && !this.accountCurrent()) {
        this.close(); this.state.update(s => ({ ...s, error: '登录账号已变化，请重新进入设备页面。' }));
      }
    }));
    this.subscriptions.add(visibility.active.subscribe(active => {
      if (!active) this.cancelAndClear();
      else if (this.visible && this.accountCurrent()) void this.refresh();
    }));
    this.subscriptions.add(data.deviceDataLoader.subscribe(() => {
      if (this.visible && !this.available) {
        this.cancelAndClear(); this.state.update(s => ({ ...s, error: '设备不可用或权限已变化，请刷新设备列表。' }));
      }
    }));
  }
  get defaultBackHref(): string { return `/device-manager/${this.id}`; }
  get deviceName(): string { return this.accountCurrent() ? deviceDisplayName(this.data.device?.dict?.[this.id]) : '设备'; }
  get available(): boolean {
    const device = this.data.device?.dict?.[this.id];
    return !!device && device.config.mode === 'bbp2' && !device.config.isPreview && !device.config.disabled;
  }
  get canQuery(): boolean { return this.visible && !this.destroyed && this.visibility.active.value
    && this.available && this.accountCurrent(); }
  get canLoadMore(): boolean { return this.canQuery && this.state().ready && !this.state().busy
    && !!this.state().nextCursor && this.state().rows.length < this.viewLimit; }
  get bounded(): boolean { return this.state().ready && this.state().rows.length >= this.viewLimit && !!this.state().nextCursor; }
  get keyOptions(): { key: string; label: string }[] {
    if (!this.accountCurrent()) return [];
    const fields = new Map<string, { key: string; kind: number; type: number }>();
    for (const field of this.manifests.load(this.id)?.fields ?? []) {
      if (field.kind === 0 && STATE_HISTORY_RECORDED_TYPES.includes(field.type as any)) fields.set(field.key, field);
    }
    for (const row of this.state().rows) if (!fields.has(row.key)) fields.set(row.key, row);
    // A removed historical field remains an exact visible filter after a
    // refresh returns no rows. Unknown type deliberately cannot match an alias.
    const selected = this.state().key;
    if (selected && !fields.has(selected)) fields.set(selected, { key: selected, kind: 0, type: -1 });
    return [...fields.values()].map(field => ({ key: field.key,
      label: capabilityDisplayName(this.data.device?.dict?.[this.id], field) }));
  }
  fieldLabel(row: StateHistoryItem): string { return capabilityDisplayName(this.data.device?.dict?.[this.id], row); }
  valueLabel(row: StateHistoryItem): string {
    return row.type === 0 && typeof row.state.value === 'boolean'
      ? capabilityBooleanLabel(this.data.device?.dict?.[this.id], row, row.state.value)
      : String(row.state.value);
  }
  typeLabel(row: StateHistoryItem): string { return TYPE_LABELS[row.type]; }
  utcDate(at: number): string { return new Date(at).toISOString(); }
  utcText(at: number): string { return this.utcDate(at).replace('T', ' ').replace('Z', ' UTC'); }

  ionViewWillEnter(): void {
    this.close(); this.id = this.route.snapshot.paramMap.get('id') || ''; this.visible = true;
    try {
      if (!this.data.auth?.uuid) throw Error('STATE_HISTORY_ACCOUNT_CHANGED');
      this.account = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      if (!this.available) throw Error('STATE_HISTORY_DEVICE_UNAVAILABLE');
      if (this.visibility.active.value) void this.refresh();
    } catch (error) { this.state.update(s => ({ ...s, error: this.errorText(error) })); }
  }
  ionViewWillLeave(): void { this.close(); }
  ngOnDestroy(): void { this.destroyed = true; this.close(); this.subscriptions.unsubscribe(); }
  close(): void { this.visible = false; this.account = undefined; this.cancelAndClear(); }
  private cancelAndClear(): void {
    ++this.generation; this.controller?.abort(); this.controller = undefined;
    this.state.update(s => ({ ...s, busy: false, ready: false, rows: [], nextCursor: null, policyConfirmed: false }));
  }
  changeRange(rangeMs: number): void {
    if (!this.ranges.some(range => range.value === rangeMs) || !this.canQuery) return;
    this.cancelAndClear(); this.state.update(s => ({ ...s, rangeMs })); void this.refresh();
  }
  changeKey(key: string): void {
    if ((key && !this.keyOptions.some(field => field.key === key)) || !this.canQuery) return;
    this.cancelAndClear(); this.state.update(s => ({ ...s, key })); void this.refresh();
  }
  async refresh(): Promise<void> {
    if (!this.canQuery || this.state().busy) return;
    this.cancelAndClear();
    const to = Date.now(), from = Math.max(0, to - this.state().rangeMs);
    this.state.update(s => ({ ...s, from, to }));
    await this.read(false);
  }
  async loadMore(): Promise<void> { if (this.canLoadMore) await this.read(true); }
  private async read(append: boolean): Promise<void> {
    const generation = ++this.generation, controller = this.controller = new AbortController(), id = this.id;
    const baseline = this.state();
    const query: StateHistoryQuery = { from: baseline.from, to: baseline.to, limit: STATE_HISTORY_PAGE_LIMIT,
      ...(baseline.key ? { key: baseline.key } : {}), ...(append ? { before: baseline.nextCursor! } : {}) };
    this.state.update(s => ({ ...s, busy: true, error: '' }));
    try {
      const page = await this.history.read(id, query, controller.signal);
      this.assertCurrent(id, generation, controller);
      const rows = append ? [...baseline.rows, ...page.items] : page.items;
      if (rows.length > this.viewLimit || new Set(rows.map(row => row.id)).size !== rows.length
        || (append && page.items.length && BigInt(page.items[0].id) >= BigInt(baseline.rows.at(-1)!.id))) {
        throw Error('STATE_HISTORY_RESPONSE_INVALID');
      }
      this.state.update(s => ({ ...s, rows, nextCursor: page.nextCursor, ready: true, policyConfirmed: true }));
    } catch (error) {
      if (this.current(id, generation, controller)) this.state.update(s => ({ ...s, ready: false,
        rows: [], nextCursor: null, policyConfirmed: false, error: this.errorText(error) }));
    } finally { if (this.current(id, generation, controller)) this.state.update(s => ({ ...s, busy: false })); }
  }
  private accountCurrent(): boolean {
    try { if (!this.account || !this.data.auth?.uuid) return false; assertDeviceV2AccountContext(this.data, this.account); return true; }
    catch { return false; }
  }
  private assertCurrent(id: string, generation: number, controller: AbortController): void {
    controller.signal.throwIfAborted();
    if (id !== this.id || generation !== this.generation || controller !== this.controller || !this.canQuery) {
      throw Error('STATE_HISTORY_ACCOUNT_CHANGED');
    }
  }
  private current(id: string, generation: number, controller: AbortController): boolean {
    try { this.assertCurrent(id, generation, controller); return true; } catch { return false; }
  }
  private errorText(error: unknown): string {
    if (error instanceof GatewayHttpError && [403, 404].includes(error.httpStatus)) return '设备不存在或查询权限已变化，请刷新设备列表。';
    if (error instanceof Error && error.message === 'STATE_HISTORY_ACCOUNT_CHANGED') return '请先登录当前账号，再重新进入设备页面。';
    if (error instanceof Error && error.message === 'STATE_HISTORY_DEVICE_UNAVAILABLE') return '当前设备无法查询状态历史。';
    return '尚未取得有效的状态历史，请手动刷新重试；不会使用演示数据代替。';
  }
}
