import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext, DeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { capabilityDisplayName, deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { HistoryWindow, historyEndInput, historyWindow, parseHistoryEnd, shiftHistoryWindow } from '../../../core/device-v2/history-window';
import { PeriodicHistoryDetail, PeriodicHistoryItem, PeriodicHistoryPolicyInput, periodicHistoryCurves,
  PERIODIC_HISTORY_VIEW_LIMIT } from '../../../core/device-v2/periodic-history';
import { GatewayHttpError } from '../../../core/model/response.model';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2PeriodicHistoryService } from '../../../core/services/device-v2-periodic-history.service';

const DAY = 86400000;
const PHASE_LABELS: Record<PeriodicHistoryDetail['runtime']['phase'], string> = {
  disabled: '记录未启用', waiting: '设置已保存，等待在线样本', active: '已收到归档样本',
  capacity: '暂未记录：资源或报文容量受限', cadence: '暂未记录：当前采样频率不兼容',
  unavailable: '暂未记录：设备或实时能力不可用', 'storage-error': '归档存储异常，实时与控制不受影响',
  'source-error': '实时来源异常，等待恢复', 'manifest-changed': '设备能力已变化，请核对记录设置',
};
@Component({
  selector: 'app-device-trends', templateUrl: './device-trends.page.html', styleUrls: ['./device-trends.page.scss'],
  imports: [CommonModule, FormsModule, IonBackButton, IonButtons, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar],
})
export class DeviceTrendsPage implements OnDestroy {
  id = '';
  readonly ranges = [{ value: 3600000, label: '1 小时' }, { value: DAY, label: '24 小时' }, { value: 7 * DAY, label: '7 天' }];
  readonly viewLimit = PERIODIC_HISTORY_VIEW_LIMIT;
  readonly state = signal({ busy: false, ready: false, detail: null as PeriodicHistoryDetail | null,
    rows: [] as PeriodicHistoryItem[], rangeMs: DAY, key: '', from: 0, to: 0, endInput: '', nextCursor: null as string | null,
    draftEnabled: false, draftKeys: [] as string[], writeBlocked: false, error: '', notice: '' });
  private readonly subscriptions = new Subscription();
  private account?: DeviceV2AccountContext;
  private controller?: AbortController;
  private generation = 0;
  private visible = false;
  private destroyed = false;
  // This is only an uncertainty guard, not a replay queue. No request body or
  // account data is persisted; recovery always reads the authoritative policy.
  private needsConfirmation = false;

  constructor(private readonly route: ActivatedRoute, private readonly data: DataService,
    private readonly history: DeviceV2PeriodicHistoryService, private readonly visibility: AppVisibilityService) {
    this.subscriptions.add(data.authDataChanged.subscribe(() => {
      if (this.account && !this.accountCurrent()) { this.close(); this.needsConfirmation = false; }
    }));
    this.subscriptions.add(visibility.active.subscribe(active => {
      if (!active) this.clear(true); else if (this.canQuery) void this.refresh();
    }));
    this.subscriptions.add(data.deviceDataLoader.subscribe(() => {
      if (this.visible && !this.available) { this.clear(); this.state.update(s => ({ ...s, error: '设备或访问权限已变化，请返回设备列表。' })); }
    }));
  }
  get defaultBackHref(): string { return `/device-manager/${this.id}`; }
  get deviceName(): string { return this.accountCurrent() ? deviceDisplayName(this.data.device?.dict?.[this.id]) : '设备'; }
  get available(): boolean {
    const device = this.data.device?.dict?.[this.id];
    return !!device && device.config.mode === 'bbp2' && !device.config.isPreview && !device.config.disabled;
  }
  get canQuery(): boolean { return this.visible && !this.destroyed && this.visibility.active.value && this.available && this.accountCurrent(); }
  get canConfigure(): boolean { return this.canQuery && !!this.state().detail?.canConfigure && !this.data.device?.dict?.[this.id]?.config.isShared; }
  get canSave(): boolean { return this.canConfigure && !this.state().busy && !this.state().writeBlocked && !!this.input(); }
  get canLoadMore(): boolean { const s = this.state(); return this.canQuery && s.ready && !s.busy && !!s.nextCursor && s.rows.length < this.viewLimit; }
  get bounded(): boolean { const s = this.state(); return s.ready && s.rows.length >= this.viewLimit && !!s.nextCursor; }
  get windowPending(): boolean { const s = this.state(); return !!s.to && parseHistoryEnd(s.endInput) !== s.to; }
  get windowError(): string {
    const s = this.state(); if (!s.to) return '';
    const to = parseHistoryEnd(s.endInput);
    if (to === undefined) return '请输入有效的 UTC 结束日期和时间。';
    if (to > Date.now()) return '结束时间不能晚于当前时间。';
    return historyWindow(to, s.rangeMs) ? '' : '时间窗口超出可查询范围。';
  }
  get canApplyWindow(): boolean { return this.canQuery && !this.state().busy && this.windowPending && !this.windowError; }
  canShiftWindow(direction: -1 | 1): boolean {
    return this.canQuery && !this.state().busy && !!this.state().to && !!shiftHistoryWindow(this.state(), direction);
  }
  get phaseLabel(): string { const detail = this.state().detail; return detail ? PHASE_LABELS[detail.runtime.phase] : '尚未读取记录状态'; }
  get curves() { return periodicHistoryCurves(this.state().rows); }
  get keyOptions(): { key: string; type: number }[] {
    const fields = new Map((this.state().detail?.fields ?? []).map(field => [field.key, field]));
    for (const row of this.state().rows) if (!fields.has(row.key)) fields.set(row.key, { key: row.key, type: row.type });
    if (this.state().key && !fields.has(this.state().key)) fields.set(this.state().key, { key: this.state().key, type: -1 });
    return [...fields.values()];
  }
  fieldLabel(field: { key: string; type: number }): string {
    return capabilityDisplayName(this.data.device?.dict?.[this.id], { ...field, kind: 0 });
  }
  utcDate(at: number): string { return new Date(at).toISOString(); }
  utcText(at: number): string { return this.utcDate(at).replace('T', ' ').replace('Z', ' UTC'); }
  ionViewWillEnter(): void {
    this.close(); this.id = this.route.snapshot.paramMap.get('id') || ''; this.visible = true;
    this.state.update(s => ({ ...s, rangeMs: DAY, from: 0, to: 0, endInput: '' }));
    try {
      if (!this.data.auth?.uuid) throw Error('PERIODIC_HISTORY_ACCOUNT_CHANGED');
      this.account = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      if (!this.available) throw Error('PERIODIC_HISTORY_DEVICE_UNAVAILABLE');
      if (this.canQuery) void this.refresh();
    } catch { this.state.update(s => ({ ...s, error: '请登录并从有效的 V2 设备重新进入。' })); }
  }
  ionViewWillLeave(): void { this.close(); }
  ngOnDestroy(): void { this.destroyed = true; this.close(); this.subscriptions.unsubscribe(); }
  close(): void { this.visible = false; this.account = undefined; this.clear(); }
  private clear(preserveFilter = false): void {
    ++this.generation; this.controller?.abort(); this.controller = undefined;
    this.state.update(s => ({ ...s, busy: false, ready: false, detail: null, rows: [], nextCursor: null,
      draftKeys: [], draftEnabled: false, key: preserveFilter ? s.key : '', writeBlocked: this.needsConfirmation, error: '', notice: '' }));
  }
  selectField(key: string, selected: boolean): void {
    const s = this.state();
    if (!this.canConfigure || s.busy || s.writeBlocked || !s.detail!.fields.some(field => field.key === key)) return;
    this.state.update(current => ({ ...current, draftKeys: selected
      ? [...new Set([...current.draftKeys, key])].slice(0, 4) : current.draftKeys.filter(value => value !== key) }));
  }
  setEnabled(enabled: boolean): void {
    if (this.canConfigure && !this.state().busy && !this.state().writeBlocked) this.state.update(s => ({ ...s, draftEnabled: enabled }));
  }
  async refresh(): Promise<void> {
    if (!this.canQuery || this.state().busy) return;
    const baseline = this.state();
    const window = baseline.to ? { from: baseline.from, to: baseline.to }
      : historyWindow(Math.floor(Date.now() / 1000) * 1000, baseline.rangeMs);
    if (!window) return;
    const { key } = baseline;
    const request = this.begin();
    this.state.update(s => ({ ...s, ready: false, rows: [], nextCursor: null, writeBlocked: true, ...window,
      endInput: baseline.to ? s.endInput : historyEndInput(window.to) }));
    try {
      const [detail, page] = await Promise.all([this.history.detail(this.id, request.controller.signal),
        this.history.read(this.id, { ...window, limit: 50, ...(key ? { key } : {}) }, request.controller.signal)]);
      this.assertCurrent(request);
      const recovered = this.needsConfirmation; this.needsConfirmation = false;
      this.state.update(s => ({ ...s, detail, ready: true, rows: page.items, nextCursor: page.nextCursor,
        draftKeys: [...(detail.policy?.keys ?? [])], draftEnabled: detail.policy?.enabled ?? false, writeBlocked: false,
        notice: recovered ? '已只读刷新服务器设置，请核对当前内容；不会自动重发之前的保存。' : s.notice }));
    } catch (error) { this.fail(request, error); }
    finally { this.finish(request); }
  }
  async loadMore(): Promise<void> {
    if (!this.canLoadMore) return;
    const baseline = this.state(), request = this.begin();
    try {
      const page = await this.history.read(this.id, { from: baseline.from, to: baseline.to, limit: 50,
        ...(baseline.key ? { key: baseline.key } : {}), before: baseline.nextCursor! }, request.controller.signal);
      this.assertCurrent(request);
      const rows = [...baseline.rows, ...page.items];
      if (rows.length > this.viewLimit || new Set(rows.map(row => row.id)).size !== rows.length
        || page.items.length && baseline.rows.length && BigInt(page.items[0].id) >= BigInt(baseline.rows.at(-1)!.id)) {
        throw Error('PERIODIC_HISTORY_RESPONSE_INVALID');
      }
      this.state.update(s => ({ ...s, rows, nextCursor: page.nextCursor }));
    } catch (error) { this.fail(request, error); }
    finally { this.finish(request); }
  }
  changeRange(rangeMs: number): void {
    if (!this.canQuery || this.state().busy || !this.ranges.some(range => range.value === rangeMs)) return;
    const window = historyWindow(this.state().to, rangeMs);
    if (window) { this.state.update(s => ({ ...s, rangeMs })); this.queryWindow(window); }
  }
  editEnd(value: string): void {
    if (this.canQuery && !this.state().busy) this.state.update(s => ({ ...s, endInput: value }));
  }
  applyWindow(): void {
    if (!this.canApplyWindow) return;
    const window = historyWindow(parseHistoryEnd(this.state().endInput)!, this.state().rangeMs);
    if (window) this.queryWindow(window);
  }
  shiftWindow(direction: -1 | 1): void {
    if (!this.canShiftWindow(direction)) return;
    const window = shiftHistoryWindow(this.state(), direction);
    if (window) this.queryWindow(window);
  }
  latestWindow(): void {
    if (!this.canQuery || this.state().busy) return;
    const window = historyWindow(Math.floor(Date.now() / 1000) * 1000, this.state().rangeMs);
    if (window) this.queryWindow(window);
  }
  private queryWindow(window: HistoryWindow): void {
    this.state.update(s => ({ ...s, ...window, endInput: historyEndInput(window.to) }));
    void this.refresh();
  }
  changeKey(key: string): void {
    if (!this.canQuery || this.state().busy || key && !this.keyOptions.some(field => field.key === key)) return;
    this.state.update(s => ({ ...s, key })); void this.refresh();
  }
  async save(): Promise<void> {
    const input = this.input(); if (!this.canSave || !input) return;
    const request = this.begin(); this.needsConfirmation = true;
    this.state.update(s => ({ ...s, writeBlocked: true, notice: '' }));
    try {
      const detail = await this.history.save(this.id, input, request.controller.signal);
      this.assertCurrent(request); this.needsConfirmation = false;
      this.state.update(s => ({ ...s, detail, draftEnabled: detail.policy!.enabled, draftKeys: [...detail.policy!.keys],
        writeBlocked: false, notice: '服务器已确认记录设置。此确认不保证每个样本都已送达或持久化。' }));
      // No list refresh on save: the accepted result is immediately visible,
      // while the runtime phase and sample history remain separate facts.
    } catch (error) {
      const denied = error instanceof GatewayHttpError && [403, 404].includes(error.httpStatus);
      if (this.current(request)) this.state.update(s => ({ ...s, writeBlocked: true,
        ...(denied ? { detail: null, rows: [], ready: false, nextCursor: null, draftKeys: [], draftEnabled: false } : {}),
        error: error instanceof GatewayHttpError && error.httpStatus === 409
          ? '设置版本或设备能力已变化，请只读刷新后核对；旧版本禁止再次保存。'
          : denied ? '设备不存在或设置权限已变化，请只读刷新后核对；不会自动重发。'
          : '保存结果尚未确认。请只读刷新服务器设置进行核对，不会自动重发。' }));
    } finally { this.finish(request); }
  }
  private input(): PeriodicHistoryPolicyInput | undefined {
    const s = this.state(), detail = s.detail; if (!detail || detail.policy?.revision === 0xffffffff) return;
    // A changed Manifest must not prevent the owner disabling the exact old policy.
    if (!s.draftEnabled && detail.policy && detail.manifestFingerprint !== detail.policy.manifestFingerprint) {
      return { expectedRevision: detail.policy.revision, enabled: false,
        manifestFingerprint: detail.policy.manifestFingerprint, keys: [...detail.policy.keys] };
    }
    if (!detail.manifestFingerprint || !s.draftKeys.length || s.draftKeys.length > 4
      || s.draftKeys.some(key => !detail.fields.some(field => field.key === key))) return;
    return { expectedRevision: detail.policy?.revision ?? 0, enabled: s.draftEnabled,
      manifestFingerprint: detail.manifestFingerprint, keys: [...s.draftKeys] };
  }
  private begin() {
    const request = { id: this.id, generation: ++this.generation, controller: this.controller = new AbortController() };
    this.state.update(s => ({ ...s, busy: true, error: '' })); return request;
  }
  private assertCurrent(request: { id: string; generation: number; controller: AbortController }): void {
    request.controller.signal.throwIfAborted();
    if (!this.canQuery || request.id !== this.id || request.generation !== this.generation || request.controller !== this.controller) throw Error('PERIODIC_HISTORY_ACCOUNT_CHANGED');
  }
  private current(request: { id: string; generation: number; controller: AbortController }): boolean {
    try { this.assertCurrent(request); return true; } catch { return false; }
  }
  private finish(request: { id: string; generation: number; controller: AbortController }): void {
    if (this.current(request)) {
      this.state.update(s => ({ ...s, busy: false }));
      request.controller.abort(); this.controller = undefined;
    }
  }
  private fail(request: { id: string; generation: number; controller: AbortController }, error: unknown): void {
    if (!this.current(request)) return;
    const denied = error instanceof GatewayHttpError && [403, 404].includes(error.httpStatus);
    this.state.update(s => ({ ...s, ready: false, rows: [], nextCursor: null, ...(denied ? { detail: null, draftKeys: [], draftEnabled: false } : {}),
      error: denied ? '设备不存在或访问权限已变化，请返回设备列表。' : '尚未取得有效在线趋势，请手动刷新；不会使用缓存或演示点代替。' }));
  }
  private accountCurrent(): boolean {
    try { if (!this.account || !this.data.auth?.uuid) return false; assertDeviceV2AccountContext(this.data, this.account); return true; }
    catch { return false; }
  }
}
