import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  HostListener,
  Inject,
  OnDestroy,
} from '@angular/core';

import { ActivatedRoute } from '@angular/router';
import { getServiceRegion, isServiceRegion, ServiceRegion } from '../../../configs/service-region.config';

import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { DeviceUiEndpoint, DeviceUiSnapshot, DeviceUiValue } from '../../../core/device-v2/device-ui.port';
import { EndpointHistory } from '../../../core/device-v2/endpoint-history';
import { PanelMode } from '../../../core/device-v2/custom-panel';
import { generateDefaultPageLayout, migratePageLayout, visiblePageWidgets } from '../../../core/device-v2/page-layout';
import { generateAutomaticPageLayout } from '../../../core/device-v2/automatic-page-layout';

import {
  DeviceV2EndpointAccess as Access,
  DeviceV2EndpointKind as Kind,
  DeviceV2ManifestField,
} from '../../../core/protocol/device-v2';

import { Subscription } from 'rxjs';
import { DEVICE_CONSOLE_HOST, DeviceConsoleHost } from '../../../core/device-v2/console-host';

import {
  DeviceConsole,
  DeviceConsoleService,
  ConsoleViewSession,
  parseConsoleLink,
} from '../../../core/services/device-console.service';

import { PublicConsoleBookmarksService } from '../../../core/services/public-console-bookmarks.service';
import { CustomPanelFrameComponent } from '../../../device/custom-panel/custom-panel-frame.component';
import { PageLayoutPanelComponent } from '../../../device/v2/panel/page-layout-panel';
import { formatValue, PanelCard } from '../../../device/v2/widgets/widget-kit';
import { readDeviceTheme } from '../../../device/device-theme';
import { readStoredTheme } from '../../../core/theme/theme';

interface WireValue {
  value?: boolean | number | string | null;
  encoding?: string;
}

interface ViewSnapshot {
  manifest: { revision: number; fingerprint: string; fields: DeviceV2ManifestField[] } | null;

  state: { revision: number; manifestFingerprint: string; values: Record<string, WireValue>; updatedAt: number } | null;
  liveValues: Record<string, WireValue>;
  online: boolean;
  observedAt: number;
  lastSeenAt: number | null;
}

@Component({
  selector: 'app-shared-console',
  standalone: true,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSpinner,
    IonTitle,
    IonToolbar,
    PageLayoutPanelComponent,
    CustomPanelFrameComponent,
  ],
  templateUrl: './shared-console.page.html',
  styleUrls: ['./shared-console.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class SharedConsolePage implements OnDestroy {
  console?: DeviceConsole;

  mode: PanelMode = 'normal';

  cards: PanelCard[] = [];
  loading = true;
  error = '';
  status = '正在连接';
  online = false;
  savingBookmark = false;
  bookmarkError = '';
  private session?: ConsoleViewSession;
  private source?: ViewSnapshot;
  private token = '';
  private region: ServiceRegion = getServiceRegion();
  private modeChosen = false;
  private history = new EndpointHistory();
  private controller?: AbortController;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private visible = false;
  private destroyed = false;
  private refreshEpoch?: number;
  private refreshPending = false;
  private hostActive = true;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly consoles: DeviceConsoleService,
    @Inject(DEVICE_CONSOLE_HOST) readonly host: DeviceConsoleHost,
    private readonly cd: ChangeDetectorRef,
    readonly bookmarks: PublicConsoleBookmarksService
  ) {
    this.subscriptions.add(
      host.activeChanges.subscribe((active) => {
        this.hostActive = active;

        if (!active) this.stop();
        else if (this.visible) void this.load();
      })
    );

    this.subscriptions.add(
      host.sessionChanges.subscribe(() => {
        if (this.visible) void this.load();
      })
    );
  }

  get customPanel() {
    const panel = this.console?.uiConfig.customPanel;

    return !this.loading && !this.error && this.mode === 'custom' && panel?.html.trim() ? panel : undefined;
  }

  get nextModeLabel(): string {
    return this.mode === 'custom' ? '切换到组件模式' : '切换到自定义模式';
  }

  @HostBinding('attr.data-ui-theme') get theme(): string {
    if (this.customPanel) return this.customPanel.theme;

    const preferred = this.console ? readDeviceTheme(this.console.logicalDeviceId) : undefined;

    return preferred ?? this.console?.layout?.style ?? (readStoredTheme() === 'dark' ? 'dark' : 'natural');
  }

  ionViewWillEnter(): void {
    this.visible = true;

    const token = this.route.snapshot.paramMap.get('token') || '';
    const requestedRegion = this.route.snapshot.queryParamMap.get('region');
    const region = isServiceRegion(requestedRegion) ? requestedRegion : getServiceRegion();

    if (token !== this.token || region !== this.region) this.modeChosen = false;

    this.token = token;
    this.region = region;

    void this.load();
  }

  ionViewDidLeave(): void {
    this.visible = false;

    this.stop();
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    this.stop();
    this.subscriptions.unsubscribe();
  }

  @HostListener('document:visibilitychange') visibilityChanged(): void {
    if (document.hidden) this.stop();
    else if (this.visible) void this.load();
  }

  async load(): Promise<void> {
    this.stop();

    const epoch = ++this.epoch;
    const token = this.token;
    const region = this.region;

    if (!this.visible || !this.hostActive || this.destroyed || document.hidden) return;

    this.loading = true;
    this.error = '';
    this.bookmarkError = '';
    this.console = undefined;
    this.source = undefined;
    this.cards = [];

    this.cd.markForCheck();

    try {
      if (!parseConsoleLink(`diandeng://console/${token}`)) throw new Error('控制台链接无效');

      if (this.host.authenticated && region === getServiceRegion()) {
        const sessionVersion = this.host.sessionVersion;

        try {
          const member = await this.consoles.resolveLink(token);

          if (!this.current(epoch) || this.host.sessionVersion !== sessionVersion) return;
          if (await this.host.openDevice(member.logicalDeviceId, sessionVersion)) return;
        } catch {
          /* A valid viewing link stays read-only when this account has no device access. */
        }
      }

      if (!this.current(epoch)) return;

      const session = await this.consoles.openView(token, region);

      if (!this.current(epoch)) {
        void this.consoles.closeView(session.sessionToken, session.region).catch(() => undefined);

        return;
      }

      this.session = session;
      this.console = session.console;

      if (!this.modeChosen || !this.console.availableModes.includes(this.mode)) this.mode = this.console.defaultMode;
      if (!this.current(epoch)) return;

      this.loading = false;
      this.status = '正在同步';

      void this.connect(epoch);
    } catch (error) {
      if (!this.current(epoch)) return;

      const code = (error as { code?: string }).code;

      this.error =
        code === 'CONSOLE_PUBLIC_ACCESS_DISABLED'
          ? '公开访问已关闭，仅已授权成员登录后可查看。'
          : code === 'CONSOLE_LINK_UNAVAILABLE'
          ? '链接已停用或到期，请联系分享者获取新链接。'
          : code === 'CONSOLE_VIEW_LIMIT'
          ? '当前查看人数较多，请稍后重试。'
          : '暂时无法打开控制台，请检查链接或稍后重试。';

      this.loading = false;
    }

    this.cd.markForCheck();
  }

  toggleMode(): void {
    this.selectMode(this.mode === 'custom' ? 'normal' : 'custom');
  }

  selectMode(value: string): void {
    if (!this.console?.availableModes.includes(value as PanelMode)) return;

    this.mode = value as PanelMode;
    this.modeChosen = true;

    this.renderCards();
  }

  get bookmarked(): boolean {
    return !!this.console && this.bookmarks.has(this.console.logicalDeviceId, this.token, this.region);
  }

  async addBookmark(): Promise<void> {
    if (!this.console || this.savingBookmark || this.bookmarked) return;

    const epoch = this.epoch;

    this.savingBookmark = true;
    this.bookmarkError = '';

    try {
      await this.bookmarks.add(this.console, this.token, this.region);
    } catch {
      if (this.current(epoch)) this.bookmarkError = '未能保存到本机，请重试';
    } finally {
      this.savingBookmark = false;

      this.cd.markForCheck();
    }
  }

  login(): void {
    void this.host.requestLogin(this.token, this.region);
  }

  private async connect(epoch: number): Promise<void> {
    if (!this.current(epoch) || !this.session) return;

    // A change committed while disconnected has no consoleChanged event to replay.
    if (this.source) await this.refreshConfiguration(epoch);
    if (!this.current(epoch) || !this.session) return;

    this.controller = new AbortController();

    const controller = this.controller;

    try {
      await this.consoles.events(this.session.sessionToken, controller.signal, (type, value) => {
        if (!this.current(epoch)) return;

        if (type === 'snapshot') {
          this.source = value as ViewSnapshot;
          this.online = this.source.online;
          this.status = this.online ? '实时同步' : '设备离线';

          this.renderCards();
        } else if (type === 'consoleChanged') void this.refreshConfiguration(epoch);

        else if (type === 'accessRevoked') {
          this.error = '公开访问已停止，仅已授权成员登录后可查看。';
          this.console = undefined;
          this.cards = [];

          this.stop();
        }

        this.cd.markForCheck();
      }, this.session.region);
    } catch {
      /* Reconnect obtains a full snapshot; no partial patch is replayed. */
    }

    if (!this.current(epoch) || controller.signal.aborted) return;

    this.online = false;
    this.status = '正在重新连接';

    this.cd.markForCheck();

    this.retryTimer = setTimeout(() => {
      if (!this.current(epoch)) return;

      if (!this.session || Date.now() >= this.session.expiresAt - 5000) void this.load();
      else void this.connect(epoch);
    }, 1500);
  }

  private async refreshConfiguration(epoch: number): Promise<void> {
    if (!this.session || !this.current(epoch)) return;

    if (this.refreshEpoch === epoch) {
      this.refreshPending = true;

      return;
    }

    this.refreshEpoch = epoch;
    this.refreshPending = false;

    try {
      const record = await this.consoles.refreshView(this.session.sessionToken, this.session.region);

      if (!this.current(epoch)) return;

      this.console = record;

      if (!record.availableModes.includes(this.mode)) this.mode = record.defaultMode;

      this.renderCards();
    } catch {
      if (this.current(epoch)) {
        this.error = '共享配置暂不可用，请重新打开。';

        this.stop();
      }
    } finally {
      if (this.refreshEpoch === epoch) {
        this.refreshEpoch = undefined;

        if (this.refreshPending && this.current(epoch)) void this.refreshConfiguration(epoch);
      }

      this.cd.markForCheck();
    }
  }

  private renderCards(): void {
    if (!this.console || !this.source?.manifest) {
      this.cards = [];

      return;
    }

    const wire = this.source;

    const types: DeviceUiEndpoint['valueType'][] = [
      'boolean',
      'integer',
      'integer',
      'number',
      'number',
      'text',
      'bytes',
      'object',
      'array',
      'null',
    ];

    const valueOf = (entry?: WireValue): DeviceUiValue | undefined => {
      if (!entry) return undefined;

      if ((entry.encoding === 'int64' || entry.encoding === 'uint64') && typeof entry.value === 'string')
        return BigInt(entry.value);

      if (entry.encoding === 'base64url' && typeof entry.value === 'string') {
        return Uint8Array.from(atob(entry.value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
      }

      return entry.value;
    };

    const endpoints: DeviceUiEndpoint[] = wire.manifest!.fields.map((field) => ({
      id: field.id,
      key: field.key,
      role: field.kind === Kind.Property ? 'property' : field.kind === Kind.Action ? 'action' : 'event',
      valueType: types[field.type] || 'null',
      readable: !!(field.access & Access.Read),
      writable: !!(field.access & (Access.Write | Access.Command)),
      notifies: !!(field.access & (Access.Notify | Access.Event)),
      ...field.constraints,
      choices: field.constraints?.enumValues,
      telemetryMinimumIntervalMs: field.telemetryMinimumIntervalMs,
      value: valueOf(wire.liveValues?.[field.key] ?? wire.state?.values?.[field.key]),
    }));

    if (wire.online) {
      for (const field of endpoints) this.history.record(field.key, field.value, true, wire.observedAt);
    }

    const snapshot: DeviceUiSnapshot = {
      manifestRevision: wire.manifest!.revision,
      manifestFingerprint: wire.manifest!.fingerprint,
      manifestAccepted: true,
      stateRevision: wire.state?.revision ?? null,
      stateFresh: wire.online,
      endpoints,
    };

    const layout = this.mode === 'custom'
      ? generateDefaultPageLayout(snapshot)
      : !this.console.layout?.widgets.length
        ? generateAutomaticPageLayout(snapshot, this.console.layout?.style ?? 'natural', this.console.uiConfig.hiddenEndpointKeys)
        : migratePageLayout(this.console.layout, snapshot, false);

    const fields = new Map(endpoints.map((field) => [field.key, field]));
    const hidden = this.mode === 'custom' ? [] : this.console.uiConfig.hiddenEndpointKeys ?? [];

    this.cards = visiblePageWidgets(layout, hidden).flatMap((widget) => {
      const field = fields.get(widget.endpointKey);

      if (!field) return [];

      const value = field.value;

      return [
        {
          widget,
          field,
          value,
          display: formatValue(value),
          history: this.history.points(field.key),
          draft: typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '',
          error: '',
          // Read-only is enforced by the renderer and bridge, not disabled-card styling.
          disabled: false,
          extras: widget.extraKeys?.filter((key) => !hidden.includes(key)).flatMap((key) => {
            const extra = fields.get(key);

            return extra ? [{ field: extra, value: extra.value }] : [];
          }),
        },
      ];
    });

    this.cd.markForCheck();
  }

  private current(epoch: number): boolean {
    return !this.destroyed && this.visible && this.epoch === epoch;
  }

  private stop(): void {
    this.epoch += 1;

    clearTimeout(this.retryTimer);
    this.controller?.abort();

    if (this.session) void this.consoles.closeView(this.session.sessionToken, this.session.region).catch(() => undefined);

    this.session = undefined;
    this.console = undefined;
    this.source = undefined;
    this.cards = [];
    this.history = new EndpointHistory();
  }
}
