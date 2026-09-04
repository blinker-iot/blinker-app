import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  isDevMode,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  CallOptions,
  type Connection,
  ErrorCode,
  type Methods,
  type RemoteProxy,
  WindowMessenger,
  connect,
} from 'penpal';
import { Subscription } from 'rxjs';

import { BlinkerDevice } from '../../core/model/device.model';
import { CloudStorageService } from '../../core/services/cloudStorage.service';
import { DeviceService } from '../../core/services/device.service';
import {
  DEFAULT_DEVICE_TEMPLATE_PATH,
  DEVICE_UI_CHANNEL,
  DEVICE_UI_PROTOCOL_VERSION,
  type ChildReadyPayload,
  type CommandResult,
  type DeviceHostContext,
  type DeviceSnapshot,
  type DeviceUpdate,
  type DeviceViewport,
  type HistoryPoint,
  type HistoryRequest,
  type HistoryResult,
  type JsonObject,
  type JsonValue,
} from './customizer-bridge';

interface DeviceTemplateMethods extends Methods {
  setHostContext: (context: DeviceHostContext) => { ok: boolean };
  updateDevice: (update: DeviceUpdate) => { ok: boolean };
  updateViewport: (viewport: DeviceViewport) => { ok: boolean };
  ping: () => 'pong';
}

type PenpalState = 'idle' | 'connecting' | 'connected' | 'failed';

const CONNECTION_TIMEOUT_MS = 10000;
const METHOD_TIMEOUT = new CallOptions({ timeout: 5000 });
const MAX_COMMAND_BYTES = 16 * 1024;
const MAX_HISTORY_POINTS = 1000;
const HISTORY_QUICK_CODES = new Set(['1h', '1d', '1w', '1m']);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

@Component({
  standalone: true,
  imports: [CommonModule],
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'blinker-customizer',
  templateUrl: './customizer.component.html',
  styleUrls: ['./customizer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// Keep the registered component name compatible with existing device configs.
// eslint-disable-next-line @angular-eslint/component-class-suffix
export class Customizer implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) device!: BlinkerDevice;
  @Input() customizerUrl = '';

  iframeSrc: SafeResourceUrl | null = null;
  loaded = false;
  loading = true;
  isFailed = false;
  errorMessage = '';

  private resolvedUrl = '';
  private bundledTemplate = false;
  private penpalConnection: Connection<DeviceTemplateMethods> | null = null;
  private remoteApi: RemoteProxy<DeviceTemplateMethods> | null = null;
  private penpalRemoteWindow: Window | null = null;
  private penpalRemoteDocument: Document | null = null;
  private penpalState: PenpalState = 'idle';
  private childReadyReported = false;
  private childReadyTimer?: number;
  private viewportTimer?: number;
  private resizeObserver?: ResizeObserver;
  private deviceSubject?: Subscription;
  private pendingUpdate?: DeviceUpdate;
  private updateTask: Promise<void> | null = null;
  private revision = 0;
  private destroyed = false;
  private readonly resizeHandler = () => this.scheduleViewportUpdate();

  constructor(
    private readonly hostElement: ElementRef<HTMLElement>,
    private readonly deviceService: DeviceService,
    private readonly sanitizer: DomSanitizer,
    private readonly cloudStorageService: CloudStorageService,
    private readonly ngZone: NgZone,
    private readonly cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.prepareFrame();
    this.deviceSubject = this.device.subject.subscribe((event) => {
      this.queueDeviceUpdate(event);
    });
  }

  ngAfterViewInit(): void {
    this.observeViewport();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.deviceSubject?.unsubscribe();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resizeHandler);
    window.visualViewport?.removeEventListener('resize', this.resizeHandler);
    if (typeof this.viewportTimer !== 'undefined') {
      window.clearTimeout(this.viewportTimer);
    }
    this.destroyPenpalConnection();
  }

  onFrameLoad(event: Event): void {
    const iframe = event.target as HTMLIFrameElement;
    if (!iframe.contentWindow) {
      this.fail('设备界面没有提供可连接的窗口。');
      return;
    }
    if (this.shouldReusePenpalConnection(iframe)) return;
    this.startPenpalConnection(iframe);
  }

  retry(): void {
    if (!this.resolvedUrl) {
      this.prepareFrame();
      return;
    }

    const reloadUrl = new URL(this.resolvedUrl);
    reloadUrl.searchParams.set('_blinkerUiReload', String(Date.now()));
    this.destroyPenpalConnection();
    this.loaded = false;
    this.loading = true;
    this.isFailed = false;
    this.errorMessage = '';
    this.iframeSrc = null;
    this.cd.detectChanges();

    window.setTimeout(() => {
      if (this.destroyed) return;
      this.resolvedUrl = reloadUrl.toString();
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(
        this.resolvedUrl
      );
      this.cd.markForCheck();
    });
  }

  private prepareFrame(): void {
    try {
      const configuredUrl = this.customizerUrl.trim();
      this.bundledTemplate = !configuredUrl;
      const url = new URL(
        configuredUrl || DEFAULT_DEVICE_TEMPLATE_PATH,
        document.baseURI
      );

      if (!this.bundledTemplate && !this.isSupportedRemoteUrl(url)) {
        throw new Error(
          '仅支持 HTTPS、当前应用内地址，或开发环境中的本机 HTTP 地址。'
        );
      }

      const parentOrigin = this.serializeOrigin(window.location);
      if (parentOrigin) {
        url.searchParams.set('blinkerParentOrigin', parentOrigin);
      }
      if (this.bundledTemplate) {
        url.searchParams.set('blinkerBundled', '1');
      }
      if (this.isOpaqueAppOrigin()) {
        url.searchParams.set('blinkerOpaqueParent', '1');
      }

      this.resolvedUrl = url.toString();
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(
        this.resolvedUrl
      );
    } catch (error) {
      this.fail(this.errorText(error));
    }
  }

  private startPenpalConnection(iframe: HTMLIFrameElement): void {
    this.destroyPenpalConnection();
    this.loaded = false;
    this.loading = true;
    this.isFailed = false;
    this.errorMessage = '';
    this.penpalRemoteWindow = iframe.contentWindow;
    this.penpalRemoteDocument = this.readFrameDocument(iframe);
    this.penpalState = 'connecting';
    this.childReadyReported = false;

    let allowedOrigins: (string | RegExp)[];
    try {
      allowedOrigins = this.resolveAllowedOrigins();
    } catch (error) {
      this.fail(this.errorText(error));
      return;
    }

    const messenger = new WindowMessenger({
      remoteWindow: iframe.contentWindow!,
      allowedOrigins,
    });
    const connection = connect<DeviceTemplateMethods>({
      messenger,
      channel: DEVICE_UI_CHANNEL,
      timeout: CONNECTION_TIMEOUT_MS,
      methods: this.createHostMethods(),
    });
    this.penpalConnection = connection;
    this.childReadyTimer = window.setTimeout(() => {
      if (this.penpalConnection !== connection || this.loaded) return;
      this.ngZone.run(() => this.fail('设备界面连接超时，请重试。'));
    }, CONNECTION_TIMEOUT_MS);

    void connection.promise
      .then((remote) => {
        if (this.penpalConnection !== connection || this.destroyed) return;
        this.remoteApi = remote;
        this.penpalState = 'connected';
        // Match the reference child-tool host: push an initial snapshot, but
        // iframe visibility depend on receiving the RPC acknowledgement.
        void remote
          .setHostContext(this.createHostContext(), METHOD_TIMEOUT)
          .catch(() => undefined);
        this.ngZone.run(() => this.revealFrame());
      })
      .catch((error) => {
        if (
          this.penpalConnection !== connection ||
          this.destroyed ||
          this.isConnectionDestroyed(error)
        ) {
          return;
        }
        this.ngZone.run(() => this.fail(this.errorText(error)));
      });
  }

  private createHostMethods(): Methods {
    return {
      getHostContext: () => {
        // The returned snapshot already includes the newest device state, so
        // no queued pre-handshake update needs to be sent again.
        this.pendingUpdate = undefined;
        return this.createHostContext();
      },
      childReady: (payload: ChildReadyPayload) =>
        this.ngZone.run(() => this.handleChildReady(payload)),
      childError: (payload: { message?: unknown } = {}) =>
        this.ngZone.run(() => this.handleChildError(payload)),
      sendDeviceCommand: (command: unknown) => this.sendDeviceCommand(command),
      getHistory: (request: unknown) => this.getHistory(request),
    };
  }

  private handleChildReady(payload: ChildReadyPayload): { ok: boolean } {
    if (payload?.protocolVersion !== DEVICE_UI_PROTOCOL_VERSION) {
      this.fail(
        `设备界面协议版本不兼容：${payload?.protocolVersion ?? '未知'}`
      );
      return { ok: false };
    }
    this.childReadyReported = true;
    this.revealFrame();
    return { ok: true };
  }

  private handleChildError(
    payload: { message?: unknown } = {}
  ): { ok: boolean } {
    const message = this.errorText(
      payload.message || '设备界面报告加载失败。'
    );
    if (this.loaded || this.penpalState === 'connected') {
      // A late synchronization error must not cover an iframe that is already
      // usable. Keep the message for diagnostics and leave the UI visible.
      this.errorMessage = message;
      return { ok: true };
    }
    this.fail(message);
    return { ok: true };
  }

  private revealFrame(): void {
    this.clearChildReadyTimer();
    this.loaded = true;
    this.loading = false;
    this.isFailed = false;
    this.errorMessage = '';
    // Customizer is created dynamically below an OnPush device host. Force
    // this local view to update so the state overlay cannot remain stale.
    this.cd.detectChanges();
  }

  private createHostContext(): DeviceHostContext {
    return {
      protocolVersion: DEVICE_UI_PROTOCOL_VERSION,
      device: this.createDeviceSnapshot(),
      viewport: this.createViewport(),
      capabilities: {
        commands: !this.device.config.isPreview
          && this.device.data?.['canCommand'] !== false,
        history: true,
      },
    };
  }

  private createDeviceSnapshot(): DeviceSnapshot {
    const rawData = this.isPlainRecord(this.device.data)
      ? Object.fromEntries(
          Object.entries(this.device.data).filter(([key]) => key !== 'history')
        )
      : {};
    return {
      id: String(this.device.id || this.device.deviceName || ''),
      deviceName: String(this.device.deviceName || ''),
      name: String(
        this.device.config.customName || this.device.deviceName || ''
      ),
      type: String(this.device.deviceType || ''),
      mode: String(this.device.config.mode || ''),
      isPreview: !!this.device.config.isPreview,
      showSwitch: !!this.device.config.showSwitch,
      data: this.toJsonObject(rawData),
    };
  }

  private queueDeviceUpdate(event: unknown): void {
    const eventPayload = this.toJsonValue(event);
    this.pendingUpdate = {
      revision: ++this.revision,
      device: this.createDeviceSnapshot(),
      ...(this.isPlainRecord(eventPayload) ? { event: eventPayload } : {}),
    };
    this.flushDeviceUpdates();
  }

  private flushDeviceUpdates(): void {
    if (
      this.updateTask ||
      !this.childReadyReported ||
      !this.remoteApi ||
      !this.pendingUpdate
    ) {
      return;
    }
    const remote = this.remoteApi;
    const task = (async () => {
      while (this.remoteApi === remote && this.pendingUpdate) {
        const update = this.pendingUpdate;
        this.pendingUpdate = undefined;
        try {
          await remote.updateDevice(update, METHOD_TIMEOUT);
        } catch (error) {
          if (
            this.remoteApi !== remote ||
            this.destroyed ||
            this.isConnectionDestroyed(error)
          ) {
            break;
          }
          // The child can process a CALL even when its acknowledgement is
          // delayed or lost. Treat update failures as degraded sync instead
          // of replacing an already rendered device UI with an error overlay.
          break;
        }
      }
    })();
    this.updateTask = task;
    const finishTask = () => {
      // A task from a destroyed connection must never clear a newer task.
      if (this.updateTask !== task) return;
      this.updateTask = null;
      if (this.pendingUpdate && this.remoteApi && !this.destroyed) {
        this.flushDeviceUpdates();
      }
    };
    void task.then(finishTask, finishTask);
  }

  private sendDeviceCommand(command: unknown): CommandResult {
    if (this.device.config.isPreview) {
      return { accepted: false, reason: 'preview' };
    }
    if (this.device.data?.['canCommand'] === false) {
      return { accepted: false, reason: 'read-only' };
    }
    if (!this.isJsonObject(command)) {
      return { accepted: false, reason: 'invalid-command' };
    }

    try {
      const serialized = JSON.stringify(command);
      if (new TextEncoder().encode(serialized).byteLength > MAX_COMMAND_BYTES) {
        return { accepted: false, reason: 'command-too-large' };
      }
      this.deviceService.sendData(this.device, serialized);
      return { accepted: true };
    } catch {
      return { accepted: false, reason: 'invalid-command' };
    }
  }

  private async getHistory(request: unknown): Promise<HistoryResult> {
    if (!this.isHistoryRequest(request)) {
      return { ok: false, error: '历史数据请求格式无效' };
    }

    try {
      if (!this.device.config.isPreview) {
        const loaded = await this.cloudStorageService.getTimeSeriesData(
          this.device,
          request.key,
          request.quickCode
        );
        if (!loaded) return { ok: false, error: '历史数据加载失败' };
      }
      return {
        ok: true,
        points: this.readHistoryPoints(request),
      };
    } catch (error) {
      return { ok: false, error: this.errorText(error) };
    }
  }

  private readHistoryPoints(request: HistoryRequest): HistoryPoint[] {
    const history =
      this.device.data?.['history']?.[request.key]?.[request.quickCode];
    if (!Array.isArray(history)) return [];
    return history.slice(-MAX_HISTORY_POINTS).map((item: unknown) => {
      const record = this.isPlainRecord(item) ? item : {};
      const rawTimestamp = Number(record['date'] ?? record['timestamp'] ?? 0);
      return {
        timestamp:
          rawTimestamp > 0 && rawTimestamp < 1_000_000_000_000
            ? rawTimestamp * 1000
            : rawTimestamp,
        value: this.toJsonValue(record['value']),
      };
    });
  }

  private observeViewport(): void {
    const devicePage = this.hostElement.nativeElement.closest('app-device');
    const header = devicePage?.querySelector<HTMLElement>('ion-header');
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.hostElement.nativeElement);
      if (header) this.resizeObserver.observe(header);
    }
    window.addEventListener('resize', this.resizeHandler);
    window.visualViewport?.addEventListener('resize', this.resizeHandler);
    this.scheduleViewportUpdate();
  }

  private scheduleViewportUpdate(): void {
    if (typeof this.viewportTimer !== 'undefined') {
      window.clearTimeout(this.viewportTimer);
    }
    this.viewportTimer = window.setTimeout(() => {
      this.viewportTimer = undefined;
      this.pushViewport();
    }, 50);
  }

  private pushViewport(): void {
    if (!this.childReadyReported || !this.remoteApi) return;
    void this.remoteApi
      .updateViewport(this.createViewport(), METHOD_TIMEOUT)
      .catch(() => undefined);
  }

  private createViewport(): DeviceViewport {
    const hostRect = this.hostElement.nativeElement.getBoundingClientRect();
    const devicePage = this.hostElement.nativeElement.closest('app-device');
    const header = devicePage?.querySelector<HTMLElement>('ion-header');
    const headerRect = header?.getBoundingClientRect();
    return {
      headerHeight: Math.max(0, Math.round(headerRect?.bottom || 0)),
      width: Math.max(0, Math.round(hostRect.width || window.innerWidth)),
      height: Math.max(0, Math.round(hostRect.height || window.innerHeight)),
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  private resolveAllowedOrigins(): (string | RegExp)[] {
    const frameUrl = new URL(this.resolvedUrl);
    // The checked-in template is trusted and WindowMessenger still restricts
    // messages to this iframe's WindowProxy. A wildcard keeps local WebViews
    // whose postMessage origin is `null` compatible with the reference host.
    if (this.bundledTemplate) return ['*'];
    if (this.hasSameAppOrigin(frameUrl) && this.isOpaqueAppOrigin()) {
      return ['*'];
    }
    const origin = this.serializeOrigin(frameUrl);
    if (!origin) throw new Error('无法确定设备界面的安全来源。');
    return [origin];
  }

  private isSupportedRemoteUrl(url: URL): boolean {
    if (this.hasSameAppOrigin(url)) return true;
    if (url.protocol === 'https:') return true;
    return (
      isDevMode() &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
    );
  }

  private hasSameAppOrigin(url: URL): boolean {
    const appOrigin = this.serializeOrigin(window.location);
    return !!appOrigin && this.serializeOrigin(url) === appOrigin;
  }

  private isOpaqueAppOrigin(): boolean {
    return (
      window.location.origin === 'null' ||
      !['http:', 'https:'].includes(window.location.protocol)
    );
  }

  private serializeOrigin(
    value: Pick<Location | URL, 'origin' | 'protocol' | 'host'>
  ): string {
    if (value.origin && value.origin !== 'null') return value.origin;
    return value.protocol && value.host
      ? `${value.protocol}//${value.host}`
      : '';
  }

  private destroyPenpalConnection(): void {
    this.clearChildReadyTimer();
    this.remoteApi = null;
    this.pendingUpdate = undefined;
    this.updateTask = null;
    this.penpalConnection?.destroy();
    this.penpalConnection = null;
    this.penpalRemoteWindow = null;
    this.penpalRemoteDocument = null;
    this.penpalState = 'idle';
    this.childReadyReported = false;
  }

  private shouldReusePenpalConnection(iframe: HTMLIFrameElement): boolean {
    const sameSession =
      !!this.penpalConnection &&
      this.penpalRemoteWindow === iframe.contentWindow &&
      (this.penpalState === 'connecting' || this.penpalState === 'connected');
    if (!sameSession) return false;

    // Same-origin frames expose a new Document after real navigation while
    // duplicate load notifications keep the existing Document.
    const currentDocument = this.readFrameDocument(iframe);
    return (
      !currentDocument ||
      !this.penpalRemoteDocument ||
      currentDocument === this.penpalRemoteDocument
    );
  }

  private readFrameDocument(iframe: HTMLIFrameElement): Document | null {
    try {
      return iframe.contentDocument;
    } catch {
      return null;
    }
  }

  private clearChildReadyTimer(): void {
    if (typeof this.childReadyTimer !== 'undefined') {
      window.clearTimeout(this.childReadyTimer);
      this.childReadyTimer = undefined;
    }
  }

  private fail(message: string): void {
    this.clearChildReadyTimer();
    this.loading = false;
    this.loaded = false;
    this.isFailed = true;
    this.penpalState = 'failed';
    this.errorMessage = message || '设备界面加载失败。';
    this.cd.markForCheck();
  }

  private isConnectionDestroyed(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === ErrorCode.ConnectionDestroyed
    );
  }

  private isHistoryRequest(value: unknown): value is HistoryRequest {
    if (!this.isPlainRecord(value)) return false;
    const key = value['key'];
    const quickCode = value['quickCode'];
    return (
      typeof key === 'string' &&
      key.length > 0 &&
      key.length <= 64 &&
      !/[\u0000-\u001f]/u.test(key) &&
      !UNSAFE_OBJECT_KEYS.has(key) &&
      this.isPlainRecord(this.device.data) &&
      Object.hasOwn(this.device.data, key) &&
      typeof quickCode === 'string' &&
      HISTORY_QUICK_CODES.has(quickCode)
    );
  }

  private isJsonObject(value: unknown): value is JsonObject {
    return this.isPlainRecord(value) && this.isJsonValue(value, 0);
  }

  private isJsonValue(value: unknown, depth: number): boolean {
    if (depth > 12) return false;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return true;
    }
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) {
      return (
        value.length <= 256 &&
        value.every((item) => this.isJsonValue(item, depth + 1))
      );
    }
    if (!this.isPlainRecord(value)) return false;
    const entries = Object.entries(value);
    return (
      entries.length <= 128 &&
      entries.every(([, item]) => this.isJsonValue(item, depth + 1))
    );
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private toJsonObject(value: unknown): JsonObject {
    const normalized = this.toJsonValue(value);
    return this.isPlainRecord(normalized) ? normalized : {};
  }

  private toJsonValue(value: unknown): JsonValue {
    try {
      const serialized = JSON.stringify(value);
      return typeof serialized === 'undefined' ? null : JSON.parse(serialized);
    } catch {
      return null;
    }
  }

  private errorText(error: unknown): string {
    return error instanceof Error
      ? error.message
      : String(error || '设备界面加载失败。');
  }
}
