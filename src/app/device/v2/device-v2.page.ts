import { Inject } from '@angular/core';
import { readDevicePanelMode } from '../device-panel-mode';
import { formatValue } from './widgets/widget-kit';
import { DeviceConsoleService, cloudConsole, consoleLayout, installConsole, canEditConsole } from '../../core/services/device-console.service';
import { DEVICE_CONSOLE_HOST, DeviceConsoleHost } from '../../core/device-v2/console-host';
import { CustomPanelFrameComponent } from '../custom-panel/custom-panel-frame.component';
import { EndpointHistory } from '../../core/device-v2/endpoint-history';
import { visiblePageWidgets } from '../../core/device-v2/page-layout';
import { generateAutomaticPageLayout } from '../../core/device-v2/automatic-page-layout';
import { PageLayoutPanelComponent, type PanelCard, type PanelAction } from './panel/page-layout-panel';
import { CommonModule } from '@angular/common';

import {
  ChangeDetectorRef,
  Component,
  Input,
  EventEmitter,
  Output,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

import { RouterModule } from '@angular/router';

import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonRouterLink,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Subscription } from 'rxjs';
import { BlinkerDevice } from '../../core/model/device.model';
import { capabilityBooleanLabel, capabilityDisplayName } from '../../core/device-v2/display-metadata';
import { canWriteDeviceEndpoint } from '../../core/device-v2/endpoint-control';
import {
  DeviceUiConnectivitySnapshot,
  DeviceUiConnectionState,
  DeviceUiConnection,
  DeviceUiEndpoint,
  DeviceUiEvent,
  DeviceUiPort,
  DeviceUiSnapshot,
  DeviceUiTelemetryLease,
  DeviceUiTelemetrySnapshot,
  DeviceUiTransport,
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
import { TelemetryChartComponent } from './telemetry-chart.component';
import { PanelEditorPage } from '../../sections/device/panel-editor/panel-editor.page';
import { EmbeddedPanelSession, SavedPanelEdit } from '../../sections/device/panel-editor/embedded-panel-session';
import {
  TelemetryPresentation,
  TelemetryFieldPresentation,
  telemetryFreshnessLabel,
  telemetryIntervalLabel,
  telemetrySourceLabel,
} from './telemetry-presentation';
const BLE_FOREGROUND_RECONNECT_DELAYS_MS = [1000, 2500, 5000] as const;

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
  imports: [
    CommonModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonRouterLink,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterModule,
    TelemetryChartComponent,
    PageLayoutPanelComponent,
    CustomPanelFrameComponent,
    PanelEditorPage,
  ],
  templateUrl: './device-v2.page.html',
  styleUrls: ['./device-v2.page.scss'],
})

export class DeviceV2Page implements OnInit, OnChanges, OnDestroy {
  @ViewChild(PanelEditorPage) panelEditor?: PanelEditorPage;
  @Output() panelEditChanged = new EventEmitter<void>();
  panelEditSession?: EmbeddedPanelSession;
  get panelRevision(): number { return this.storedLayout?.revision ?? 0; }

  beginPanelEdit(): boolean {
    if (this.customMode || !this.canEdit || this.device.config.canEditConsole === false
      || !this.panelLayoutReady || !this.layout || !this.snapshot.manifestAccepted || this.pending.size || this.layoutStale || this.layoutError) return false;
    this.panelEditSession = { device: this.device, document: this.layout,
      snapshot: this.snapshot, record: this.storedLayout ?? null };
    this.releaseTelemetry();
    this.requestRender();
    return true;
  }

  endPanelEdit(): void {
    this.panelEditSession = undefined;
    this.refreshTelemetry();
    this.requestRender();
  }

  acceptPanelEdit(saved: SavedPanelEdit): void {
    if (!this.panelEditSession) return;
    this.applyStoredLayout(saved.record ?? undefined, this.snapshot);
    if (saved.consoleRevision !== undefined) this.consoleRevision = saved.consoleRevision;
    this.endPanelEdit();
  }
  @Input({ required: true }) device!: BlinkerDevice;

  // Navigation cancellation is a lifetime boundary, not a rendering effect.
  // ComponentRef.setInput must fence pending Ready/native work immediately.
  private viewEnabled = true;

  @Input() get viewActive(): boolean { return this.viewEnabled; }

  set viewActive(active: boolean) {
    this.viewEnabled = active;

    this.setPageVisible(active);
  }

  @Input() embedded = false;

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
  private commandGeneration = 0;
  private logicalDeviceId = '';
  private syncing?: Promise<void>;
  private syncAbort?: AbortController;
  private connection?: DeviceUiConnection;
  private synchronized = false;
  private layoutLoadKey = '';
  private layoutEpoch = 0;
  private storedLayout?: DeviceV2PageLayoutRecord;
  private panelLayoutReady = false;
  private layoutError = '';
  private storedCapabilitiesLoading = false;
  private consoleRevision?: number;
  private consoleTimer?: ReturnType<typeof setInterval>;
  private consoleRefreshing = false;
  private appActive = true;
  private pageVisible = false;
  private bleReconnectNeeded = false;
  private directConnectAllowed = true;
  private bleAdapterEnabled: boolean | null = null;
  private bleReconnectAttempt = 0;
  private bleReconnectTimer?: ReturnType<typeof setTimeout>;
  private telemetry?: DeviceUiTelemetryLease;

  private telemetryDetach?: () => void;
  private telemetryKey = '';
  private activeTransport: DeviceUiTransport = 'cloud';
  private telemetryEpoch = 0;
  private telemetryOpening = false;
  private telemetrySnapshot?: DeviceUiTelemetrySnapshot;
  private readonly telemetryPresentation = new TelemetryPresentation();
  private telemetryFields = new Map<string, TelemetryFieldPresentation>();
  private telemetryClockTimer?: ReturnType<typeof setInterval>;
  // Payload of each event endpoint's latest occurrence.
  private readonly eventValues = new Map<string, DeviceUiValue | undefined>();
  // The newest value waiting behind a field's command in flight; sent once that
  // settles, so a release (false, stop) is never lost behind its press.
  private readonly queued = new Map<string, unknown>();
  private history?: EndpointHistory;
  private readonly drafts = new Map<string, string>();
  private readonly fieldErrors = new Map<string, string>();
  private endpointsByKey = new Map<string, DeviceUiEndpoint>();
  private readonly subscriptions = new Subscription();
  private deviceSubscriptions = new Subscription();

  constructor(
    private readonly deviceUi: DeviceUiPort,
    private readonly pageLayouts: DeviceV2PageLayoutService,
    private readonly consoles: DeviceConsoleService,
    @Inject(DEVICE_CONSOLE_HOST) private readonly host: DeviceConsoleHost,
    private readonly changeDetector: ChangeDetectorRef = { detectChanges: () => undefined,
      markForCheck: () => undefined } as ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.pageVisible = this.viewActive;
    this.initialized = true;

    this.subscriptions.add(this.deviceUi.appActive.subscribe(active => {
      const resumed = active && !this.appActive;

      this.appActive = active;
      this.reconcileConsoleTimer();

      if (!active) {
        this.clearTelemetryPresentation();
        this.cancelSynchronization();
        this.cancelBleReconnect(false);
      } else if (resumed && this.pageVisible) {
        this.resetBleReconnect();
        void this.synchronize();
      }

      this.refreshTelemetry();
    }));

    this.bindDevice();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.initialized && changes['device']) this.bindDevice();
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    this.reconcileConsoleTimer();
    this.cancelSynchronization();
    this.cancelBleReconnect();
    this.releaseTelemetry();
    this.subscriptions.unsubscribe();
    this.deviceSubscriptions.unsubscribe();
  }

  get customMode(): boolean { return readDevicePanelMode(this.device) === 'custom'; }

  get customPanel() {
    const panel = this.device.config.customPanel;

    return this.customMode && panel?.html.trim() ? panel : undefined;
  }

  get canEdit(): boolean { return canEditConsole(this.device); }
  get readOnly(): boolean { return this.device.config.isShared === true && this.device.data.canCommand !== true; }

  private allowedEndpoint(field: DeviceUiEndpoint): boolean {
    return canWriteDeviceEndpoint(this.device, field);
  }

  get widgets(): PageLayoutWidget[] {
    if (this.customMode && !this.customPanel) return [];

    const layout = this.customPanel && this.snapshot.manifestAccepted ? generateDefaultPageLayout(this.snapshot) : this.layout;

    if (!layout) return [];

    const hidden = this.customPanel ? [] : this.device.config.hiddenEndpointKeys ?? [];

    return visiblePageWidgets(layout, hidden).map(widget => ({
      ...widget,
      extraKeys: widget.extraKeys?.filter(key => !hidden.includes(key)),
    }));
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

  get panelCards(): PanelCard[] {
    return this.widgets.flatMap(widget => {
      const field = this.endpoint(widget);

      return field ? [{ widget: { ...widget, title: this.fieldTitle(widget, field) }, field,
        value: this.value(field), extras: this.extras(widget),
        history: this.history?.points(field.key),
        display: this.display(field), draft: this.draft(field), error: this.fieldError(field),
        disabled: !this.readOnly && (this.pending.has(field.key) || !this.canControl || !this.allowedEndpoint(field)) }] : [];
    });
  }

  // 附属读数 the device declares; read-only, so they never touch pending or drafts.
  private extras(widget: PageLayoutWidget): PanelCard['extras'] {
    return widget.extraKeys?.flatMap(key => {
      const field = this.endpointsByKey.get(key);

      return field ? [{ field, value: this.value(field) }] : [];
    });
  }

  onPanelAction(action: PanelAction): void {
    if (this.panelEditSession) return;
    const { field, value } = action;

    if (!this.allowedEndpoint(field)) return;

    if (action.kind === 'invoke') void this.execute(field);

    else if (action.kind === 'commit') void this.commit(field);
    else if (action.kind === 'toggle' && typeof value === 'boolean') void this.send(field, value);
    else if (action.kind === 'range' && typeof value === 'number' && Number.isFinite(value)) void this.send(field, value);
    else if (action.kind === 'select' && typeof value === 'string') void this.send(field, value);
    else if (action.kind === 'draft' && typeof value === 'string') {
      this.drafts.set(field.key, value);
      this.setFieldError(field.key, '');
    }
  }

  // Read by the hosting DevicePage, which applies the effective theme.
  get layoutTheme() {
    return this.customPanel?.theme || this.layout?.style;
  }

  get stateLabel(): string {
    return this.readOnly ? `${this.connectionStateLabel} · 仅查看` : this.connectionStateLabel;
  }

  private get connectionStateLabel(): string {
    if (this.connectionReady) {
      return { ble: '蓝牙已连接', lan: '局域网已连接', cloud: '云端已连接' }[this.activeTransport];
    }
    if (this.syncing) return '正在连接并同步';
    if (this.accountState === 'retrying') return '正在重连';
    if (this.accountState === 'connecting') return '正在连接';
    if (this.accountState === 'ready') return this.snapshot.stateFresh ? '连接未就绪' : '设备状态未同步';
    if (this.activeTransport === 'cloud' && this.accountState === 'idle'
      && this.device?.data?.cloudReachable === null) return '状态未知';
    return '离线';
  }

  get canControl(): boolean {
    return !this.readOnly && this.connectionReady;
  }

  private get connectionReady(): boolean {
    // Both signals are scoped to the selected carrier by DeviceUiPort. Its
    // fresh snapshot already fences offline/lost cloud presence and stale
    // manifests. Inventory presence is only a hint, not LAN readiness or ACL.
    return this.accountState === 'ready' && this.snapshot.manifestAccepted && this.snapshot.stateFresh && this.synchronized
      && this.connection?.signal.aborted === false && this.pageVisible && this.appActive;
  }

  get waitingForCapabilities(): boolean {
    return this.storedCapabilitiesLoading || (!this.snapshot.manifestAccepted
      && (this.accountState === 'connecting' || this.accountState === 'retrying'));
  }

  value(field: DeviceUiEndpoint): DeviceUiValue | undefined {
    const liveValue = this.telemetryFields.get(field.key)?.value;
    return liveValue !== undefined ? liveValue : this.eventValues.has(field.key)
      ? this.eventValues.get(field.key) : field.value;
  }

  telemetryField(field: DeviceUiEndpoint): TelemetryFieldPresentation | undefined {
    return this.telemetryFields.get(field.key);
  }

  telemetryFreshness(field: TelemetryFieldPresentation): string {
    return telemetryFreshnessLabel(field);
  }

  get telemetrySummary(): string {
    const source = this.telemetrySnapshot?.source;
    return source ? `${telemetrySourceLabel(source)} · ${telemetryIntervalLabel(this.telemetryIntervalMs)}` : '';
  }

  display(field: DeviceUiEndpoint): string {
    const value = this.value(field);
    return typeof value === 'boolean' && field.valueType === 'boolean'
      ? capabilityBooleanLabel(this.device, { key: field.key, kind: field.manifestKind, type: field.manifestType }, value)
      : this.format(value);
  }

  fieldTitle(widget: PageLayoutWidget, field: DeviceUiEndpoint): string {
    // Older generated layouts used the raw key as their default title.
    // A genuine custom widget title remains local to that widget.
    return widget.title && widget.title !== field.key ? widget.title
      : capabilityDisplayName(this.device, { key: field.key, kind: field.manifestKind, type: field.manifestType });
  }

  get lastEventText(): string {
    if (!this.lastEvent) return '';

    return Object.entries(this.lastEvent.values)
      .map(([key, value]) => {
        const field = this.endpointsByKey.get(key);
        const name = capabilityDisplayName(this.device, { key, kind: field?.manifestKind, type: field?.manifestType });
        return `${name}: ${this.format(value)}`;
      })
      .join(', ');
  }

  private format(value?: DeviceUiValue): string {
    return formatValue(value);
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

  fieldError(field: DeviceUiEndpoint): string {
    return this.fieldErrors.get(field.key) ?? '';
  }

  async execute(field: DeviceUiEndpoint): Promise<void> {
    await this.send(field, field.valueType === 'null' ? null : true);
  }

  async commit(field: DeviceUiEndpoint): Promise<void> {
    const raw = this.draft(field);
    let value: string | number;

    if (field.valueType === 'text') {
      value = raw;
    } else {
      value = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(value)
        || (field.valueType === 'integer' && !Number.isSafeInteger(value))) {
        this.setFieldError(field.key, '请输入有效数值');

        return;
      }
    }

    await this.send(field, value);
  }

  retry(): void {
    this.layoutLoadKey = '';

    this.resetBleReconnect();

    if (this.snapshot.manifestAccepted) this.applySnapshot(this.snapshot);

    void this.synchronize();
  }

  async updateLayout(): Promise<void> {
    if (!this.logicalDeviceId || !this.storedLayout || !this.layoutStale || this.layoutUpdating || !this.canEdit) return;

    this.layoutUpdating = true;
    this.error = '';

    try {
      const candidate = migratePageLayout(this.storedLayout.layout, this.snapshot);
      let record: DeviceV2PageLayoutRecord;

      if (cloudConsole(this.device)) {
        const session = this.host.sessionVersion;
        const source = await this.consoles.save(this.logicalDeviceId, { layout: candidate });

        if (session !== this.host.sessionVersion || this.destroyed) return;

        this.consoleRevision = source.revision;

        installConsole(this.device, source);

        record = consoleLayout(source)!;
      } else {
        record = await this.pageLayouts.saveCandidate(this.logicalDeviceId, candidate, this.snapshot.endpoints, this.storedLayout.revision);
      }

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

    if (nextId === this.logicalDeviceId) {
      this.reconcileConsoleTimer();
      return;
    }

    this.cancelSynchronization();
    this.releaseTelemetry();
    this.cancelBleReconnect();

    this.bleReconnectNeeded = false;
    this.directConnectAllowed = true;
    this.bleAdapterEnabled = null;
    this.logicalDeviceId = nextId;
    this.reconcileConsoleTimer();

    this.history = nextId ? new EndpointHistory() : undefined;
    this.accountState = 'idle';
    this.activeTransport = 'cloud';
    this.snapshot = emptySnapshot();
    this.layout = undefined;
    this.layoutStale = undefined;
    this.layoutUpdating = false;
    this.storedLayout = undefined;
    this.panelLayoutReady = false;
    this.panelEditSession = undefined;
    this.storedCapabilitiesLoading = false;
    this.layoutError = '';
    this.layoutLoadKey = '';
    this.layoutEpoch += 1;

    this.endpointsByKey.clear();

    this.lastEvent = undefined;

    this.eventValues.clear();

    this.error = '';
    this.telemetryError = '';
    this.pending = new Set<string>();

    this.queued.clear();
    this.drafts.clear();
    this.fieldErrors.clear();
    this.deviceSubscriptions.unsubscribe();

    this.deviceSubscriptions = new Subscription();

    if (!nextId) return;

    this.deviceSubscriptions.add(this.device.subject.subscribe(event => {
      if (event.key === 'hiddenEndpointKeys') {
        this.device.config.hiddenEndpointKeys = [...event.value];
      }

      if (event.key === 'hiddenEndpointKeys' || event.key === 'loaded') {
        this.refreshTelemetry();
        this.requestRender();
      }
    }));

    try {
      this.deviceSubscriptions.add(this.deviceUi.watchConnection(nextId).subscribe(state => {
        this.accountState = state;

        this.requestRender();

        if (state === 'ready') {
          if (this.pageVisible) void this.synchronize();

          this.refreshTelemetry();
        } else if (this.telemetry || this.telemetryOpening) {
          this.releaseTelemetry();
        }
      }));

      this.deviceSubscriptions.add(this.deviceUi.watchConnectivity(nextId).subscribe(
        connectivity => {
          // Ready -> ready carrier changes do not emit watchConnection again.
          // Retire the old stream before accepting a new source or its samples.
          const carrier = connectivity.activeTransport;
          if (this.activeTransport !== carrier) {
            this.activeTransport = carrier;
            this.releaseTelemetry();
            this.refreshTelemetry();
            this.requestRender();
          }
          this.updateBleReconnect(connectivity);
        },
      ));

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

          // Every event is an occurrence of its own, so each one is kept.
          for (const [key, value] of Object.entries(event.values)) {
            this.eventValues.set(key, value);
            this.history?.record(key, value, false);
          }

          this.requestRender();
        },
      ));

      if (this.pageVisible) void this.synchronize();
    } catch (error) {
      this.error = this.messageOf(error, '设备标识无效');

      this.requestRender();
    }
  }

  private applySnapshot(snapshot: DeviceUiSnapshot): void {
    if (this.snapshot.manifestFingerprint !== snapshot.manifestFingerprint) {
      this.retireCommands();
      this.history?.reset();
    }
    if (!snapshot.manifestAccepted && this.layout) {
      // Keep the last verified panel visible while the connection resynchronizes.
      // Its fields remain read-only until a fresh manifest and state arrive.
      snapshot = { ...snapshot, stateFresh: false, endpoints: this.snapshot.endpoints };
    }

    this.snapshot = snapshot;

    for (const endpoint of snapshot.endpoints) this.history?.record(endpoint.key, endpoint.value, true);

    this.endpointsByKey = new Map(snapshot.endpoints.map(endpoint => [endpoint.key, endpoint]));

    this.requestRender();

    if (!snapshot.manifestAccepted || !snapshot.manifestFingerprint) {
      this.layoutLoadKey = '';

      this.refreshTelemetry();

      return;
    }

    try {
      if (this.storedLayout?.layout.widgets.length) {
        this.layout = this.storedLayout.manifestFingerprint === snapshot.manifestFingerprint
          ? parsePageLayout(this.storedLayout.layout, snapshot.endpoints)
          : migratePageLayout(this.storedLayout.layout, snapshot);
      } else {
        this.layout = {
          ...generateAutomaticPageLayout(snapshot, this.storedLayout?.layout.style ?? 'natural',
            this.device.config.hiddenEndpointKeys),
          revision: this.storedLayout?.revision ?? 1,
        };
      }

      this.clearLayoutError();
    } catch (error) {
      this.layout = undefined;
      this.layoutError = this.error = this.messageOf(error, '页面布局生成失败');
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
    let validatingRecord = false;

    try {
      const session = this.host.sessionVersion;
      const source = cloudConsole(this.device) ? await this.consoles.get(logicalDeviceId) : undefined;

      if (session !== this.host.sessionVersion || !this.layoutRequestIsCurrent(logicalDeviceId, loadKey, epoch)) return;
      if (source) { installConsole(this.device, source); this.consoleRevision = source.revision; }

      const record = source ? consoleLayout(source) : await this.pageLayouts.get(logicalDeviceId);

      if (!this.layoutRequestIsCurrent(logicalDeviceId, loadKey, epoch)) return;

      // The live schema may have replaced an invalid preview with the same hash.
      validatingRecord = !!record;

      this.applyStoredLayout(record ?? undefined, this.snapshot);
    } catch (error) {
      if (this.layoutRequestIsCurrent(logicalDeviceId, loadKey, epoch)) {
        this.error = this.messageOf(error, '页面布局同步失败');

        if (validatingRecord) this.layoutError = this.error;
      }
    } finally {
      this.requestRender();
    }
  }

  private reconcileConsoleTimer(): void {
    if (this.destroyed || !this.pageVisible || !this.appActive || !this.logicalDeviceId || !cloudConsole(this.device)) {
      clearInterval(this.consoleTimer);
      this.consoleTimer = undefined;
    } else if (!this.consoleTimer) {
      this.consoleTimer = setInterval(() => void this.refreshConsole(), 4000);
    }
  }

  private async refreshConsole(): Promise<void> {
    if (this.destroyed || !this.pageVisible || !this.appActive || !cloudConsole(this.device) || this.consoleRefreshing) return;

    const id = this.logicalDeviceId;

    if (!id) return;

    const session = this.host.sessionVersion;

    this.consoleRefreshing = true;

    try {
      const source = await this.consoles.get(id);

      if (this.destroyed || session !== this.host.sessionVersion || id !== this.logicalDeviceId) return;

      installConsole(this.device, source);

      if (source.revision !== this.consoleRevision && this.snapshot.manifestAccepted) {
        this.consoleRevision = source.revision;

        this.applyStoredLayout(consoleLayout(source) ?? undefined, this.snapshot);
      }
    } catch (error) {
      if (session !== this.host.sessionVersion || id !== this.logicalDeviceId) return;

      if (this.device.config.isShared) {
        this.device.data.canCommand = false;
        this.device.config.canEditConsole = false;
      }

      this.error = '控制台权限或配置暂不可用，请重试。';
    } finally { this.consoleRefreshing = false; this.requestRender(); }
  }

  private applyStoredLayout(record: DeviceV2PageLayoutRecord | undefined, snapshot: DeviceUiSnapshot): void {
    this.panelLayoutReady = true;
    this.storedLayout = record;

    if (!record || !record.layout.widgets.length) {
      this.layout = {
        ...generateAutomaticPageLayout(snapshot, record?.layout.style ?? 'natural', this.device.config.hiddenEndpointKeys),
        revision: record?.revision ?? 1,
      };

      this.layoutStale = undefined;
    } else if (record.manifestFingerprint === snapshot.manifestFingerprint) {
      this.layout = parsePageLayout(record.layout, snapshot.endpoints);
      this.layoutStale = undefined;
    } else {
      this.layoutStale = diffPageLayout(record.layout, snapshot.endpoints);
      this.layout = migratePageLayout(record.layout, snapshot);
    }

    this.clearLayoutError();
    this.refreshTelemetry();
    this.requestRender();
  }

  private refreshTelemetry(): void {
    if (this.panelEditSession) { this.releaseTelemetry(); return; }
    if (this.accountState !== 'ready') {
      if (this.telemetry || this.telemetryOpening) this.releaseTelemetry();

      return;
    }

    const configuration = this.telemetryConfiguration();

    if (!configuration) {
      this.releaseTelemetry();

      return;
    }
    const key = `${this.logicalDeviceId}\0${this.snapshot.manifestFingerprint}\0${this.activeTransport}\0`
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
        if (this.destroyed || !this.pageVisible || !this.appActive || this.telemetry !== lease
          || this.telemetryEpoch !== epoch || this.telemetryKey !== key) return;
        this.telemetryActive = snapshot.active;
        this.telemetryIntervalMs = snapshot.effectiveIntervalMs;
        const newSample = snapshot.sampleSequence !== undefined && (snapshot.epoch !== this.telemetrySnapshot?.epoch
          || snapshot.streamId !== this.telemetrySnapshot?.streamId
          || snapshot.sampleSequence !== this.telemetrySnapshot?.sampleSequence);
        this.telemetrySnapshot = snapshot;
        this.telemetryPresentation.update(snapshot);
        this.refreshTelemetryPresentation();
        this.reconcileTelemetryClock();
        if (newSample) {
          for (const [key, value] of Object.entries(snapshot.values)) this.history?.record(key, value, false);
        }
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
    if (!this.logicalDeviceId || !this.snapshot.manifestAccepted || (!this.layout && !this.customPanel)) return undefined;

    const fields = new Map<string, DeviceUiEndpoint>();

    // Extra readings stream like the card's own field.
    for (const key of this.widgets.flatMap(widget => [widget.endpointKey, ...widget.extraKeys ?? []])) {
      const field = this.endpointsByKey.get(key);

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
    if (this.telemetry || this.telemetryOpening || this.telemetryKey) this.history?.reset();
    this.telemetryEpoch += 1;
    this.telemetryOpening = false;
    this.telemetryKey = '';

    this.telemetryDetach?.();

    this.telemetryDetach = undefined;

    const lease = this.telemetry;

    this.telemetry = undefined;
    this.telemetryActive = false;
    this.telemetryIntervalMs = 0;
    this.clearTelemetryPresentation();
    if (lease) void lease.close().catch(() => undefined);
  }

  private refreshTelemetryPresentation(): void {
    const now = performance.now();
    this.telemetryFields = new Map((this.telemetrySnapshot ? this.telemetryConfiguration()?.endpointKeys ?? [] : [])
      .map(key => [key, this.telemetryPresentation.field(key, now)]));
  }

  private reconcileTelemetryClock(): void {
    const enabled = this.telemetryActive && this.pageVisible && this.appActive && !this.destroyed;
    if (!enabled) {
      clearInterval(this.telemetryClockTimer);
      this.telemetryClockTimer = undefined;
    } else if (!this.telemetryClockTimer) {
      this.telemetryClockTimer = setInterval(() => {
        this.refreshTelemetryPresentation();
        this.requestRender();
      }, 1000);
    }
  }

  private clearTelemetryPresentation(): void {
    this.telemetryActive = false;
    this.telemetryIntervalMs = 0;
    clearInterval(this.telemetryClockTimer);
    this.telemetryClockTimer = undefined;
    this.telemetrySnapshot = undefined;
    this.telemetryPresentation.reset();
    this.telemetryFields.clear();
  }

  private setTelemetryError(error: unknown): void {
    this.telemetryError = this.messageOf(error, '实时数据暂不可用');
    this.telemetryActive = false;
    this.clearTelemetryPresentation();
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

  private async loadStoredCapabilities(logicalDeviceId: string): Promise<void> {
    if (this.storedCapabilitiesLoading || this.snapshot.manifestAccepted
      || !cloudConsole(this.device) || this.device.config.isShared) return;

    const session = this.host.sessionVersion;

    this.storedCapabilitiesLoading = true;

    this.requestRender();

    try {
      const snapshot = await this.deviceUi.readStoredSnapshot(logicalDeviceId);

      if (this.destroyed || session !== this.host.sessionVersion || logicalDeviceId !== this.logicalDeviceId) return;
      if (snapshot && !this.snapshot.manifestAccepted) this.applySnapshot(snapshot);
    } catch (error) {
      if (!this.destroyed && session === this.host.sessionVersion && logicalDeviceId === this.logicalDeviceId
        && !this.snapshot.manifestAccepted) {
        this.error = this.messageOf(error, '已保存的设备能力读取失败');
      }
    } finally {
      if (!this.destroyed && logicalDeviceId === this.logicalDeviceId) {
        this.storedCapabilitiesLoading = false;

        this.requestRender();
      }
    }
  }

  private synchronize(): Promise<void> {
    const logicalDeviceId = this.logicalDeviceId;

    if (!logicalDeviceId || this.destroyed || !this.pageVisible || !this.appActive) {
      return Promise.resolve();
    }

    if (this.syncing) return this.syncing;

    void this.loadStoredCapabilities(logicalDeviceId);

    // Refresh through the existing connection group. The ready scope owns
    // StateInterest until its replacement succeeds; a BLE scan must not
    // tear down working Cloud observation or briefly disable the page.
    if (this.connection?.signal.aborted) this.synchronized = false;

    this.error = '';

    const controller = new AbortController();

    this.syncAbort = controller;

    const connection = this.deviceUi.openConnection(logicalDeviceId, controller.signal);

    void connection.closed.then(() => {
      if (this.connection !== connection) return;

      this.synchronized = false;

      this.requestRender();
    });

    const task = connection.ready
      .then(() => {
        if (this.syncAbort !== controller || connection.signal.aborted) return;

        const previous = this.connection;

        if (previous && previous !== connection) this.retireCommands();
        this.connection = connection;
        this.synchronized = true;

        previous?.close();
      })
      .catch((error) => {
        if (this.syncAbort === controller && !controller.signal.aborted
          && !this.destroyed && this.pageVisible && this.appActive && this.logicalDeviceId === logicalDeviceId) {
          if (!this.synchronized) this.error = this.messageOf(error, '设备同步失败');

          this.requestRender();
        }
      })
      .finally(() => {
        if (this.syncAbort !== controller) return;

        this.syncAbort = undefined;
        this.syncing = undefined;

        this.scheduleBleReconnect();
        this.requestRender();
      });

    this.syncing = task;

    return task;
  }

  private clearLayoutError(): void {
    if (this.error === this.layoutError) this.error = '';

    this.layoutError = '';
  }

  private cancelSynchronization(): void {
    this.synchronized = false;
    this.retireCommands();
    this.history?.reset();
    this.eventValues.clear();

    const controller = this.syncAbort;

    this.syncAbort = undefined;
    this.syncing = undefined;

    controller?.abort();
    this.connection?.close();

    this.connection = undefined;
  }

  private retireCommands(): void {
    this.commandGeneration += 1;
    this.queued.clear();
    this.pending = new Set<string>();
  }

  private setPageVisible(visible: boolean): void {
    if (this.pageVisible === visible) return;

    this.pageVisible = visible;
    if (!visible) this.clearTelemetryPresentation();
    if (!this.initialized || this.destroyed) return;
    this.reconcileConsoleTimer();

    if (visible) {
      this.resetBleReconnect();
      void this.synchronize();
    } else {
      this.cancelSynchronization();
      this.cancelBleReconnect();
    }

    this.refreshTelemetry();
  }

  private updateBleReconnect(connectivity: DeviceUiConnectivitySnapshot): void {
    const adapterBecameEnabled = connectivity.bleAdapterEnabled === true
      && this.bleAdapterEnabled !== true;

    const directBecameAllowed = connectivity.directConnectAllowed
      && !this.directConnectAllowed;

    this.directConnectAllowed = connectivity.directConnectAllowed;
    this.bleAdapterEnabled = connectivity.bleAdapterEnabled;

    if (connectivity.bleState === 'ready') {
      this.bleReconnectNeeded = false;

      this.resetBleReconnect();

      return;
    }

    this.bleReconnectNeeded = connectivity.directConnectAllowed
      && connectivity.bleAccess !== false
      && (connectivity.bleState === 'stopped' || connectivity.bleState === 'nearby');

    if (!this.bleReconnectNeeded || connectivity.bleAdapterEnabled === false) {
      this.cancelBleReconnect(false);

      return;
    }

    if (adapterBecameEnabled || directBecameAllowed) this.cancelBleReconnect();

    this.scheduleBleReconnect();
  }

  private scheduleBleReconnect(): void {
    if (!this.bleReconnectNeeded || this.destroyed || !this.pageVisible || !this.appActive
      || this.bleAdapterEnabled === false || !this.logicalDeviceId
      || this.syncing || this.bleReconnectTimer
      || this.bleReconnectAttempt >= BLE_FOREGROUND_RECONNECT_DELAYS_MS.length) return;

    const delay = BLE_FOREGROUND_RECONNECT_DELAYS_MS[this.bleReconnectAttempt];

    this.bleReconnectTimer = setTimeout(() => {
      this.bleReconnectTimer = undefined;

      if (!this.bleReconnectNeeded || this.destroyed || !this.pageVisible || !this.appActive) return;

      this.bleReconnectAttempt += 1;

      void this.synchronize();
    }, delay);
  }

  private resetBleReconnect(): void {
    this.cancelBleReconnect();

    if (this.bleReconnectNeeded) this.scheduleBleReconnect();
  }

  private cancelBleReconnect(resetAttempt = true): void {
    if (this.bleReconnectTimer) clearTimeout(this.bleReconnectTimer);

    this.bleReconnectTimer = undefined;

    if (resetAttempt) this.bleReconnectAttempt = 0;
  }

  async send(field: DeviceUiEndpoint, value: unknown): Promise<void> {
    if (this.panelEditSession) return;
    if (!this.allowedEndpoint(field)) return;
    if (!this.logicalDeviceId || !this.canControl) return;
    const current = this.endpointsByKey.get(field.key);
    if (!current || current.id !== field.id || current.valueType !== field.valueType || current.role !== field.role) return;

    if (this.pending.has(field.key)) {
      this.queued.set(field.key, value);

      return;
    }

    this.setFieldError(field.key, '');

    this.pending = new Set(this.pending).add(field.key);
    const generation = this.commandGeneration;
    const deviceId = this.logicalDeviceId;
    const connection = this.connection;
    const fingerprint = this.snapshot.manifestFingerprint;
    const isCurrent = () => generation === this.commandGeneration && deviceId === this.logicalDeviceId
      && connection === this.connection && fingerprint === this.snapshot.manifestFingerprint && !this.destroyed;
    let confirmed = false;

    try {
      await this.deviceUi.sendCommand(deviceId, field.key, value);
      confirmed = true;
    } catch (error) {
      if (isCurrent()) this.setFieldError(field.key, this.messageOf(error, '指令发送失败'));
    } finally {
      if (!isCurrent()) return;
      const pending = new Set(this.pending);

      pending.delete(field.key);

      this.pending = pending;

      if (this.queued.has(field.key)) {
        const next = this.queued.get(field.key);

        this.queued.delete(field.key);
        // Never turn an unknown/rejected command into an automatic follow-up.
        if (confirmed) void this.send(current, next);
      }

      this.requestRender();
    }
  }

  // Device events arrive outside the zone. markForCheck schedules a full pass,
  // so the host page's bindings derived from this view (theme, state) follow too.
  private requestRender(): void {
    if (this.destroyed || this.renderPending) return;
    this.renderPending = true;
    queueMicrotask(() => {
      this.renderPending = false;
      if (!this.destroyed) {
        // The embedded shell also reads our status. A child-only refresh does
        // not invalidate its parent after an async/native completion.
        this.changeDetector.markForCheck();
        this.changeDetector.detectChanges();
      }
    });
  }

  private setFieldError(key: string, message: string): void {
    if (message) this.fieldErrors.set(key, message);
    else this.fieldErrors.delete(key);
  }

  private messageOf(error: unknown, fallback: string): string {
    const code = this.errorCode(error);

    if (code === 'DEVICE_V2_READY_TIMEOUT') return '设备尚未就绪，本次未发送控制指令，请确认设备在线后重试连接';
    if (code === 'DEVICE_V2_READY_RETIRED') return '连接已变化，请重新连接设备';
    if (code === 'DEVICE_V2_READY_CANCELLED') return '';
    if (code === 'DEVICE_V2_COMMAND_OUTCOME_UNKNOWN') return '操作结果尚未确认，请先检查设备状态，勿重复操作';

    const message = error instanceof Error ? error.message : '';
    if (message === 'DIRECT_TELEMETRY_NOT_SUPPORTED') return '此设备固件暂不支持本地实时数据';
    if (message === 'DIRECT_TELEMETRY_OBSERVE_REQUIRED') return '没有实时数据查看权限';
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
