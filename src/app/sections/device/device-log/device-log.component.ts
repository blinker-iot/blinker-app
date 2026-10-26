import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext, DeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { ActivityItem, ActivityQuery, ACTIVITY_MAX_AGE_MS, ACTIVITY_PAGE_LIMIT } from '../../../core/device-v2/device-activity';
import { capabilityDisplayName, deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { GatewayHttpError } from '../../../core/model/response.model';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ActivityService } from '../../../core/services/device-v2-activity.service';

type PageStatus = 'inactive' | 'ready' | 'signed-out' | 'account-changed' | 'unavailable'
  | 'preview' | 'unsupported' | 'shared' | 'owner-unconfirmed' | 'forbidden';
const UNAVAILABLE = {
  inactive: ['请从设备设置重新进入', '此页面没有后台活动采集或本地记录缓存。'],
  'signed-out': ['请先登录当前账号', '登录后请从设备列表重新进入设备设置。'],
  'account-changed': ['登录账号已变化', '请返回设备列表，重新进入当前账号的设备。'],
  unavailable: ['设备不存在或当前不可用', '设备可能已移除、停用或权限已变化，请返回设备列表确认。'],
  preview: ['预览设备没有活动记录', '预览内容不代表真实设备事件，不会生成演示记录。'],
  unsupported: ['当前设备暂不支持此入口', '此入口仅适用于当前账号下的 V2 设备，不会加载旧格式日志。'],
  shared: ['活动记录暂不向分享用户开放', '可按需查看已开放的状态历史或在线趋势。'],
  'owner-unconfirmed': ['当前设备的所有者权限尚未确认', '请返回设备列表确认，不会读取活动记录。'],
  forbidden: ['活动记录访问权限已变化', '请返回设备列表确认后重新进入。'],
} as const;
const STATUS_LABELS: Record<ActivityItem['status'], string> = {
  inflight: '处理中', acknowledged: '设备已确认', rejected: '请求被拒绝', outcome_unknown: '结果未知', not_sent: '未下发',
};

@Component({
  selector: 'app-device-log', templateUrl: './device-log.component.html', styleUrls: ['./device-log.component.scss'],
  imports: [CommonModule, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
})
export class DeviceLogComponent implements OnDestroy {
  readonly status = signal<PageStatus>('inactive');
  readonly deviceName = signal('');
  readonly viewLimit = 200;
  readonly state = signal({ busy: false, ready: false, error: '', rows: [] as ActivityItem[],
    from: 0, to: 0, nextCursor: null as string | null });
  private id = '';
  private readonly visible = signal(false);
  private destroyed = false;
  private readonly foreground = signal(true);
  private generation = 0;
  private controller?: AbortController;
  private account?: DeviceV2AccountContext;
  private readonly subscriptions = new Subscription();

  constructor(private readonly data: DataService, private readonly route: ActivatedRoute,
    private readonly navigation: NavController, private readonly activity: DeviceV2ActivityService,
    private readonly visibility: AppVisibilityService) {
    this.foreground.set(visibility.active.value);
    this.subscriptions.add(data.authDataChanged.subscribe(() => this.reconcile()));
    this.subscriptions.add(data.deviceDataLoader.subscribe(() => this.reconcile()));
    this.subscriptions.add(visibility.active.subscribe(active => {
      if (this.foreground() === active) return;
      this.foreground.set(active);
      if (!active) { this.cancelAndClear(true); this.deviceName.set(''); }
      else if (this.visible() && this.reconcile() && !this.state().error) void this.refresh();
    }));
  }

  get defaultBackHref(): string { return this.canNavigate ? `/device-manager/${encodeURIComponent(this.id)}` : '/home/device'; }
  get unavailableTitle(): string { return this.status() === 'ready' ? '' : UNAVAILABLE[this.status()][0]; }
  get unavailableDescription(): string { return this.status() === 'ready' ? '' : UNAVAILABLE[this.status()][1]; }
  get present(): boolean { return this.visible() && !this.destroyed && this.foreground(); }
  get canQuery(): boolean { return this.present && this.status() === 'ready' && this.accountCurrent() && this.ownerAvailable(); }
  get canLoadMore(): boolean { return this.canQuery && this.state().ready && !this.state().busy
    && !this.state().error && !!this.state().nextCursor && this.state().rows.length < this.viewLimit; }
  get bounded(): boolean { return this.state().ready && this.state().rows.length >= this.viewLimit && !!this.state().nextCursor; }
  get canNavigate(): boolean { return this.present && this.accountCurrent()
    && ['ready', 'shared', 'owner-unconfirmed'].includes(this.status()); }

  fieldLabel(row: ActivityItem): string {
    if (!this.canQuery) return row.endpointKey;
    const device = this.data.getDevice(this.id);
    const currentAlias = device?.displayMetadata?.capabilities.find(field => field.key === row.endpointKey);
    return capabilityDisplayName(device, currentAlias ?? { key: row.endpointKey });
  }
  statusLabel(row: ActivityItem): string { return STATUS_LABELS[row.status]; }
  utcDate(at: number): string { return new Date(at).toISOString(); }

  ionViewWillEnter(): void {
    if (this.destroyed) return;
    this.close(); this.visible.set(true); this.id = this.route.snapshot.paramMap.get('id') || '';
    if (!this.data.auth?.uuid) { this.show('signed-out'); return; }
    try {
      this.account = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      if (this.reconcile() && this.foreground()) void this.refresh();
    } catch { this.show('signed-out'); }
  }
  ionViewWillLeave(): void { this.close(); }
  ngOnDestroy(): void { this.destroyed = true; this.close(); this.subscriptions.unsubscribe(); }

  openHistory(target: 'storage' | 'trends'): void {
    this.reconcile();
    if (this.canNavigate) void this.navigation.navigateForward(`/device-manager/${encodeURIComponent(this.id)}/${target}`);
  }
  async refresh(): Promise<void> {
    if (!this.reconcile() || !this.canQuery || this.state().busy) return;
    this.cancelAndClear();
    const to = Date.now(), from = Math.max(0, to - ACTIVITY_MAX_AGE_MS);
    this.state.update(s => ({ ...s, from, to }));
    await this.read(false);
  }
  async loadMore(): Promise<void> { if (this.reconcile() && this.canLoadMore) await this.read(true); }

  private async read(append: boolean): Promise<void> {
    const generation = ++this.generation, controller = this.controller = new AbortController(), id = this.id;
    const baseline = this.state();
    const query: ActivityQuery = { from: baseline.from, to: baseline.to, limit: ACTIVITY_PAGE_LIMIT,
      ...(append ? { before: baseline.nextCursor! } : {}) };
    this.state.update(s => ({ ...s, busy: true, error: '' }));
    try {
      const page = await this.activity.read(id, query, controller.signal);
      if (!this.current(id, generation, controller)) return;
      const rows = append ? [...baseline.rows, ...page.items] : page.items;
      const previous = baseline.rows.at(-1), first = page.items[0];
      if (rows.length > this.viewLimit || new Set(rows.map(row => row.id)).size !== rows.length
        || (append && first && previous && !(first.createdAt < previous.createdAt
          || first.createdAt === previous.createdAt && BigInt(first.id) < BigInt(previous.id)))) {
        throw Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
      }
      this.state.update(s => ({ ...s, rows, nextCursor: page.nextCursor, ready: true }));
    } catch (error) {
      if (!this.current(id, generation, controller)) return;
      if (error instanceof GatewayHttpError && error.httpStatus === 403) { this.show('forbidden'); return; }
      this.state.update(s => ({ ...s, rows: [], nextCursor: null, ready: false, error: this.errorText(error) }));
    } finally {
      if (this.current(id, generation, controller)) { this.controller = undefined; this.state.update(s => ({ ...s, busy: false })); }
    }
  }
  private ownerAvailable(): boolean {
    const device = this.data.getDevice(this.id);
    const state = (device as { state?: unknown } | undefined)?.state;
    return !!device && device.config.mode === 'bbp2' && device.config.isShared === false
      && !device.config.isPreview && !device.config.disabled && (state === undefined || state === 'active');
  }
  private accountCurrent(): boolean {
    if (!this.account || this.account.authority !== API.BASE_URL || !this.data.auth?.uuid) return false;
    try { assertDeviceV2AccountContext(this.data, this.account); return true; } catch { return false; }
  }
  private reconcile(): boolean {
    if (!this.visible() || this.destroyed || !this.account) return false;
    if (!this.accountCurrent()) { this.show(this.data.auth?.uuid ? 'account-changed' : 'signed-out'); return false; }
    const device = this.data.getDevice(this.id);
    const state = (device as { state?: unknown } | undefined)?.state;
    if (!device || device.config.disabled || (state !== undefined && state !== 'active')) {
      this.show('unavailable'); return false;
    }
    if (device.config.isPreview) { this.show('preview'); return false; }
    if (device.config.mode !== 'bbp2') { this.show('unsupported'); return false; }
    if (device.config.isShared !== false) {
      this.cancelAndClear(); this.deviceName.set('');
      this.status.set(device.config.isShared === true ? 'shared' : 'owner-unconfirmed');
      return false;
    }
    if (this.status() === 'shared' || this.status() === 'owner-unconfirmed') return false;
    this.deviceName.set(this.foreground() ? deviceDisplayName(device) : ''); this.status.set('ready'); return true;
  }
  private current(id: string, generation: number, controller: AbortController): boolean {
    if (id !== this.id || generation !== this.generation || controller !== this.controller || controller.signal.aborted) return false;
    this.reconcile();
    return id === this.id && generation === this.generation && controller === this.controller && this.canQuery;
  }
  private show(status: Exclude<PageStatus, 'ready'>): void {
    this.cancelAndClear(); this.account = undefined; this.deviceName.set(''); this.status.set(status);
  }
  private cancelAndClear(preserveReadError = false): void {
    // A visibility change is not consent to retry a failed read. Retain only
    // the safe recovery prompt, never the records or their query context.
    const error = preserveReadError ? this.state().error : '';
    ++this.generation; this.controller?.abort(); this.controller = undefined;
    this.state.set({ busy: false, ready: false, error, rows: [], from: 0, to: 0, nextCursor: null });
  }
  private close(): void { this.visible.set(false); this.id = ''; this.show('inactive'); }
  private errorText(error: unknown): string {
    if (error instanceof GatewayHttpError) {
      if (error.httpStatus === 401) return '请重新登录后，再手动刷新活动记录。';
      if ([404, 503].includes(error.httpStatus)) return '活动记录服务暂不可用，请稍后手动刷新。';
      if (error.httpStatus === 400) return '查询范围或分页已失效，请手动刷新。';
    }
    return '未取得有效活动记录，请手动刷新；不会自动重试。';
  }
}
