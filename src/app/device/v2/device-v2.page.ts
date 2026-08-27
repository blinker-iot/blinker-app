import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { BlinkerDevice } from '../../core/model/device.model';
import {
  DeviceUiConnectionState,
  DeviceUiEndpoint,
  DeviceUiEvent,
  DeviceUiPort,
  DeviceUiSnapshot,
  DeviceUiTelemetryLease,
  DeviceUiValue,
} from '../../core/device-v2/device-ui.port';
import {
  diffPageLayout,
  generateDefaultPageLayout,
  migratePageLayout,
  PageLayout,
  PageLayoutDiff,
  PageLayoutWidget,
  parsePageLayout,
} from '../../core/device-v2/page-layout';
import {
  DeviceV2PageLayoutRecord,
  DeviceV2PageLayoutService,
} from '../../core/services/device-v2-page-layout.service';

function emptySnapshot(): DeviceUiSnapshot {
  return {
    manifestRevision: null,
    manifestFingerprint: null,
    manifestAccepted: false,
    stateRevision: null,
    stateFresh: false,
    endpoints: [],
  };
}

@Component({
  selector: 'app-device-v2-page',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
  templateUrl: './device-v2.page.html',
  styleUrls: ['./device-v2.page.scss'],
})
export class DeviceV2Page implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) device!: BlinkerDevice;

  accountState: DeviceUiConnectionState = 'idle';
  snapshot = emptySnapshot();
  layout?: PageLayout;
  layoutStale?: PageLayoutDiff;
  layoutUpdating = false;
  lastEvent?: DeviceUiEvent;
  error = '';
  telemetryError = '';
  telemetryActive = false;
  telemetryIntervalMs = 0;
  pending = new Set<string>();

  private initialized = false;
  private destroyed = false;
  private renderPending = false;
  private logicalDeviceId = '';
  private syncing?: Promise<void>;
  private layoutLoadKey = '';
  private layoutEpoch = 0;
  private storedLayout?: DeviceV2PageLayoutRecord;
  private appActive = true;
  private pageVisible = true;
  private telemetry?: DeviceUiTelemetryLease;
  private telemetryDetach?: () => void;
  private telemetryKey = '';
  private telemetryEpoch = 0;
  private telemetryOpening = false;
  private telemetryValues = new Map<string, DeviceUiValue | undefined>();
  private readonly drafts = new Map<string, string>();
  private readonly fieldErrors = new Map<string, string>();
  private endpointsByKey = new Map<string, DeviceUiEndpoint>();
  private readonly subscriptions = new Subscription();
  private deviceSubscriptions = new Subscription();

  constructor(
    private readonly deviceUi: DeviceUiPort,
    private readonly pageLayouts: DeviceV2PageLayoutService,
    private readonly changeDetector: ChangeDetectorRef = { detectChanges: () => undefined } as ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initialized = true;
    this.subscriptions.add(this.deviceUi.appActive.subscribe(active => {
      this.appActive = active;
      this.refreshTelemetry();
    }));
    this.bindDevice();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.initialized) this.bindDevice();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.releaseTelemetry();
    void this.deviceUi.disconnect(this.logicalDeviceId).catch(() => undefined);
    this.subscriptions.unsubscribe();
    this.deviceSubscriptions.unsubscribe();
  }

  ionViewDidEnter(): void {
    if (this.destroyed) return;
    this.pageVisible = true;
    void this.synchronize();
    this.refreshTelemetry();
  }

  ionViewDidLeave(): void {
    this.pageVisible = false;
    this.refreshTelemetry();
    void this.deviceUi.disconnect(this.logicalDeviceId).catch(() => undefined);
  }

  get widgets(): PageLayoutWidget[] {
    return this.layout?.widgets ?? [];
  }

  get layoutStaleText(): string {
    if (!this.layoutStale) return '';
    const affected = this.layoutStale.removedWidgetIds.length
      + this.layoutStale.incompatibleWidgetIds.length;
    const added = this.layoutStale.addedEndpointKeys.length;
    return `设备能力已变化：${affected} 个旧控件需调整，${added} 个能力待加入。`;
  }

  endpoint(widget: PageLayoutWidget): DeviceUiEndpoint | undefined {
    return this.endpointsByKey.get(widget.endpointKey);
  }

  get stateLabel(): string {
    if (this.direct && this.accountState === 'ready') return '蓝牙已连接';
    if (!this.direct && this.device?.data?.cloudReachable === true) return '云端在线';
    if (this.accountState === 'retrying') return '正在重连';
    if (this.accountState === 'connecting') return '正在连接';
    if (!this.direct && this.device?.data?.cloudReachable === null) return '状态未知';
    return '离线';
  }

  get canControl(): boolean {
    const reachable = this.direct
      ? this.accountState === 'ready'
      : this.device?.data?.cloudReachable === true;
    return reachable && this.snapshot.stateFresh;
  }

  get waitingForCapabilities(): boolean {
    return !this.snapshot.manifestAccepted
      && (this.accountState === 'connecting' || this.accountState === 'retrying');
  }

  value(field: DeviceUiEndpoint): DeviceUiValue | undefined {
    return this.telemetryValues.has(field.key)
      ? this.telemetryValues.get(field.key)
      : field.value;
  }

  display(field: DeviceUiEndpoint): string {
    return this.format(this.value(field));
  }

  get lastEventText(): string {
    if (!this.lastEvent) return '';
    return Object.entries(this.lastEvent.values)
      .map(([key, value]) => `${key}: ${this.format(value)}`)
      .join(', ');
  }

  private format(value?: DeviceUiValue): string {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Uint8Array) {
      return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join(' ');
    }
    if (value === null) return 'null';
    if (value === undefined) return '—';
    return String(value);
  }

  unit(field: DeviceUiEndpoint): string {
    return field.unit ?? '';
  }

  inputType(field: DeviceUiEndpoint): 'number' | 'text' {
    return field.valueType === 'text' ? 'text' : 'number';
  }

  draft(field: DeviceUiEndpoint): string {
    const saved = this.drafts.get(field.key);
    if (saved !== undefined) return saved;
    const current = this.value(field);
    return typeof current === 'string' || typeof current === 'number'
      || typeof current === 'bigint'
      ? String(current)
      : '';
  }

  updateDraft(field: DeviceUiEndpoint, event: CustomEvent): void {
    const value = event.detail?.value;
    this.drafts.set(field.key, value === null || value === undefined ? '' : String(value));
  }

  fieldError(field: DeviceUiEndpoint): string {
    return this.fieldErrors.get(field.key) ?? '';
  }

  async setBoolean(field: DeviceUiEndpoint, event: CustomEvent): Promise<void> {
    await this.send(field, event.detail?.checked === true);
  }

  async execute(field: DeviceUiEndpoint): Promise<void> {
    await this.send(field, field.valueType === 'null' ? null : true);
  }

  async setSlider(field: DeviceUiEndpoint, event: CustomEvent): Promise<void> {
    const value = Number(event.detail?.value);
    if (!Number.isFinite(value)) return;
    await this.send(field, value);
  }

  async commit(field: DeviceUiEndpoint): Promise<void> {
    const raw = this.draft(field);
    let value: string | number;
    if (field.valueType === 'text') {
      value = raw;
    } else {
      value = Number(raw);
      if (!Number.isFinite(value) || (field.valueType === 'integer' && !Number.isSafeInteger(value))) {
        this.setFieldError(field.key, '请输入有效数值');
        return;
      }
    }
    await this.send(field, value);
  }

  retry(): void {
    this.layoutLoadKey = '';
    if (this.snapshot.manifestAccepted) this.applySnapshot(this.snapshot);
    void this.synchronize();
  }

  async updateLayout(): Promise<void> {
    if (!this.logicalDeviceId || !this.storedLayout || !this.layoutStale || this.layoutUpdating) return;
    this.layoutUpdating = true;
    this.error = '';
    try {
      const candidate = migratePageLayout(this.storedLayout.layout, this.snapshot);
      const record = await this.pageLayouts.saveCandidate(
        this.logicalDeviceId,
        candidate,
        this.snapshot.endpoints,
        this.storedLayout.revision,
      );
      this.applyStoredLayout(record, this.snapshot);
    } catch (error) {
      if (this.errorCode(error) === 'DEVICE_V2_PAGE_LAYOUT_CONFLICT') {
        this.layoutLoadKey = '';
        this.applySnapshot(this.snapshot);
      } else {
        this.error = this.messageOf(error, '页面布局更新失败');
      }
    } finally {
      this.layoutUpdating = false;
      this.requestRender();
    }
  }

  private bindDevice(): void {
    const nextId = this.device?.deviceName || this.device?.id || '';
    if (nextId === this.logicalDeviceId) return;
    const previousId = this.logicalDeviceId;
    this.releaseTelemetry();
    if (previousId) void this.deviceUi.disconnect(previousId).catch(() => undefined);
    this.logicalDeviceId = nextId;
    this.accountState = 'idle';
    this.snapshot = emptySnapshot();
    this.layout = undefined;
    this.layoutStale = undefined;
    this.layoutUpdating = false;
    this.storedLayout = undefined;
    this.layoutLoadKey = '';
    this.layoutEpoch += 1;
    this.endpointsByKey.clear();
    this.lastEvent = undefined;
    this.error = '';
    this.telemetryError = '';
    this.pending = new Set<string>();
    this.drafts.clear();
    this.fieldErrors.clear();
    this.deviceSubscriptions.unsubscribe();
    this.deviceSubscriptions = new Subscription();
    if (!nextId) return;
    try {
      this.deviceSubscriptions.add(this.deviceUi.watchConnection(nextId).subscribe(state => {
        this.accountState = state;
        this.requestRender();
        if (state === 'ready') {
          void this.synchronize();
          this.refreshTelemetry();
        } else if (this.telemetry || this.telemetryOpening) {
          this.releaseTelemetry();
        }
      }));
      this.deviceSubscriptions.add(this.deviceUi.watchState(nextId).subscribe({
        next: snapshot => this.applySnapshot(snapshot),
        error: error => {
          this.error = this.messageOf(error, '设备状态读取失败');
          this.requestRender();
        },
      }));
      this.deviceSubscriptions.add(this.deviceUi.watchEvents(nextId).subscribe(
        event => {
          this.lastEvent = event;
          this.requestRender();
        },
      ));
      void this.synchronize();
    } catch (error) {
      this.error = this.messageOf(error, '设备标识无效');
      this.requestRender();
    }
  }

  private get direct(): boolean {
    return this.deviceUi.isBleDirect(this.logicalDeviceId);
  }

  private applySnapshot(snapshot: DeviceUiSnapshot): void {
    this.snapshot = snapshot;
    this.endpointsByKey = new Map(snapshot.endpoints.map(endpoint => [endpoint.key, endpoint]));
    this.requestRender();
    if (!snapshot.manifestAccepted || !snapshot.manifestFingerprint) {
      this.layout = undefined;
      this.layoutStale = undefined;
      this.layoutLoadKey = '';
      this.refreshTelemetry();
      return;
    }
    try {
      if (this.storedLayout) {
        this.layout = this.storedLayout.manifestFingerprint === snapshot.manifestFingerprint
          ? parsePageLayout(this.storedLayout.layout, snapshot.endpoints)
          : migratePageLayout(this.storedLayout.layout, snapshot);
      } else if (this.layout?.manifestFingerprint !== snapshot.manifestFingerprint) {
        this.layout = generateDefaultPageLayout(snapshot);
      }
    } catch (error) {
      this.layout = undefined;
      this.error = this.messageOf(error, '页面布局生成失败');
    }
    const loadKey = `${this.logicalDeviceId}\0${snapshot.manifestFingerprint}`;
    if (this.layoutLoadKey !== loadKey) {
      this.layoutLoadKey = loadKey;
      const epoch = ++this.layoutEpoch;
      void this.loadLayout(this.logicalDeviceId, snapshot, loadKey, epoch);
    }
    this.refreshTelemetry();
  }

  private async loadLayout(
    logicalDeviceId: string,
    snapshot: DeviceUiSnapshot,
    loadKey: string,
    epoch: number,
  ): Promise<void> {
    try {
      let record = await this.pageLayouts.get(logicalDeviceId);
      if (!this.layoutRequestIsCurrent(logicalDeviceId, loadKey, epoch)) return;
      if (!record) {
        const generated = generateDefaultPageLayout(snapshot);
        try {
          record = await this.pageLayouts.saveCandidate(
            logicalDeviceId,
            generated,
            snapshot.endpoints,
            0,
          );
        } catch (error) {
          if (this.errorCode(error) !== 'DEVICE_V2_PAGE_LAYOUT_CONFLICT') throw error;
          record = await this.pageLayouts.get(logicalDeviceId);
          if (!record) throw error;
        }
      }
      if (!this.layoutRequestIsCurrent(logicalDeviceId, loadKey, epoch)) return;
      this.applyStoredLayout(record, snapshot);
    } catch (error) {
      if (this.layoutRequestIsCurrent(logicalDeviceId, loadKey, epoch)) {
        this.error = this.messageOf(error, '页面布局同步失败');
      }
    } finally {
      this.requestRender();
    }
  }

  private applyStoredLayout(record: DeviceV2PageLayoutRecord, snapshot: DeviceUiSnapshot): void {
    this.storedLayout = record;
    if (record.manifestFingerprint === snapshot.manifestFingerprint) {
      this.layout = parsePageLayout(record.layout, snapshot.endpoints);
      this.layoutStale = undefined;
    } else {
      this.layoutStale = diffPageLayout(record.layout, snapshot.endpoints);
      this.layout = migratePageLayout(record.layout, snapshot);
    }
    this.refreshTelemetry();
    this.requestRender();
  }

  private refreshTelemetry(): void {
    if (this.accountState !== 'ready') {
      if (this.telemetry || this.telemetryOpening) this.releaseTelemetry();
      return;
    }
    const configuration = this.telemetryConfiguration();
    if (!configuration) {
      this.releaseTelemetry();
      return;
    }
    const key = `${this.logicalDeviceId}\0${this.snapshot.manifestFingerprint}\0`
      + `${configuration.intervalMs}\0${configuration.endpointKeys.join('\0')}`;
    if (key !== this.telemetryKey) {
      this.releaseTelemetry();
      this.telemetryKey = key;
    }
    if (this.telemetry) {
      void this.telemetry.setVisible(this.pageVisible && this.appActive).catch(error => {
        if (this.telemetryKey === key) this.setTelemetryError(error);
      });
      return;
    }
    if (!this.pageVisible || !this.appActive || this.telemetryOpening) return;
    const epoch = this.telemetryEpoch;
    this.telemetryOpening = true;
    void this.deviceUi.openTelemetry(
      this.logicalDeviceId,
      configuration.endpointKeys,
      configuration.intervalMs,
    ).then(lease => {
      if (this.destroyed || !this.pageVisible || !this.appActive || this.telemetryEpoch !== epoch
        || this.telemetryKey !== key) {
        if (this.telemetryEpoch === epoch && this.telemetryKey === key) {
          this.telemetryOpening = false;
        }
        void lease.close().catch(() => undefined);
        return;
      }
      this.telemetryOpening = false;
      this.telemetry = lease;
      this.telemetryDetach = lease.subscribe(snapshot => {
        this.telemetryActive = snapshot.active;
        this.telemetryIntervalMs = snapshot.effectiveIntervalMs;
        this.telemetryValues = new Map(Object.entries(snapshot.values));
        this.telemetryError = '';
        this.requestRender();
      });
    }).catch(error => {
      if (this.telemetryEpoch === epoch && this.telemetryKey === key) {
        this.telemetryOpening = false;
        this.setTelemetryError(error);
      }
    });
  }

  private telemetryConfiguration(): { endpointKeys: string[]; intervalMs: number } | undefined {
    if (!this.logicalDeviceId || !this.snapshot.manifestAccepted || !this.layout) return undefined;
    const fields = new Map<string, DeviceUiEndpoint>();
    for (const widget of this.layout.widgets) {
      const field = this.endpointsByKey.get(widget.endpointKey);
      if (field?.role === 'property' && field.readable && !field.writable
        && field.telemetryMinimumIntervalMs) {
        fields.set(field.key, field);
      }
    }
    if (!fields.size) return undefined;
    return {
      endpointKeys: [...fields.keys()],
      intervalMs: Math.max(
        1000,
        ...[...fields.values()].map(field => field.telemetryMinimumIntervalMs!),
      ),
    };
  }

  private releaseTelemetry(): void {
    this.telemetryEpoch += 1;
    this.telemetryOpening = false;
    this.telemetryKey = '';
    this.telemetryDetach?.();
    this.telemetryDetach = undefined;
    const lease = this.telemetry;
    this.telemetry = undefined;
    this.telemetryActive = false;
    this.telemetryIntervalMs = 0;
    this.telemetryValues.clear();
    if (lease) void lease.close().catch(() => undefined);
  }

  private setTelemetryError(error: unknown): void {
    this.telemetryError = this.messageOf(error, '实时数据暂不可用');
    this.telemetryActive = false;
    this.telemetryValues.clear();
    this.requestRender();
  }

  private layoutRequestIsCurrent(
    logicalDeviceId: string,
    loadKey: string,
    epoch: number,
  ): boolean {
    return this.logicalDeviceId === logicalDeviceId
      && this.layoutLoadKey === loadKey
      && this.layoutEpoch === epoch;
  }

  private synchronize(): Promise<void> {
    const logicalDeviceId = this.logicalDeviceId;
    if (!logicalDeviceId) return Promise.resolve();
    if (this.syncing) return this.syncing;
    this.error = '';
    const task = this.deviceUi.connect(logicalDeviceId)
      .catch((error) => {
        if (this.logicalDeviceId === logicalDeviceId) {
          this.error = this.messageOf(error, '设备同步失败');
          this.requestRender();
        }
      })
      .finally(() => {
        if (this.syncing === task) {
          this.syncing = undefined;
        }
        if (this.logicalDeviceId && this.logicalDeviceId !== logicalDeviceId) {
          void this.synchronize();
        }
        this.requestRender();
      });
    this.syncing = task;
    return task;
  }

  private async send(field: DeviceUiEndpoint, value: unknown): Promise<void> {
    if (!this.logicalDeviceId || this.pending.has(field.key)) return;
    this.setFieldError(field.key, '');
    this.pending = new Set(this.pending).add(field.key);
    try {
      await this.deviceUi.sendCommand(this.logicalDeviceId, field.key, value);
    } catch (error) {
      this.setFieldError(field.key, this.messageOf(error, '指令发送失败'));
    } finally {
      const pending = new Set(this.pending);
      pending.delete(field.key);
      this.pending = pending;
      this.requestRender();
    }
  }

  private requestRender(): void {
    if (this.destroyed || this.renderPending) return;
    this.renderPending = true;
    queueMicrotask(() => {
      this.renderPending = false;
      if (!this.destroyed) this.changeDetector.detectChanges();
    });
  }

  private setFieldError(key: string, message: string): void {
    if (message) this.fieldErrors.set(key, message);
    else this.fieldErrors.delete(key);
  }

  private messageOf(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : '';
    if (message === 'BLE_DIRECT_SCAN_TIMEOUT' || message === 'BLE_DIRECT_SCAN_FAILED') {
      return '未发现附近设备';
    }
    if (message === 'BLE_DIRECT_CREDENTIAL_NOT_FOUND') return '本机没有该设备的蓝牙授权';
    return message || fallback;
  }

  private errorCode(error: unknown): string {
    return error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  }
}
