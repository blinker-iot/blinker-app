import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import type { IonContent } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { NoticeService } from '../../../core/services/notice.service';
import { DeviceUiConnection, DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { DeviceV2PageLayoutService } from '../../../core/services/device-v2-page-layout.service';
import { arrangeTiles, capabilityTiles, displayValue, InterfaceTile, toPageLayout } from './interface-draft';
import { legacyRoot, readLegacyPanel } from '../../../core/device-v2/legacy-panel';
import { DevicePanelRecord, DevicePanelService } from '../../../core/services/device-panel.service';
import { PageLayoutPanelComponent, type PanelCard } from '../../../device/v2/panel/page-layout-panel';
import type { WorkflowPreview } from './interface-workflow';
import { InterfaceGenerationService, type InterfaceGenerationOptions } from './interface-generation.service';
import { UI_THEMES, UiTheme } from '../../../core/device-v2/ui-theme';
import { legacyPreviewCards } from './legacy-preview-cards';

type Method = 'automatic' | 'ai' | 'classic';

@Component({
  selector: 'app-device-uic', standalone: true, imports: [IonicModule, FormsModule, PageLayoutPanelComponent],
  templateUrl: './device-uic.page.html', styleUrls: ['./device-uic.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class DeviceUicPage implements OnInit, OnDestroy {
  readonly id: string;
  readonly backHref: string;

  readonly methods: { id: Method; title: string; subtitle: string; icon: string }[] = [
    { id: 'automatic', title: '自动适配', subtitle: '根据设备能力生成基础面板', icon: 'fa-sparkles' },
    { id: 'ai', title: 'AI 生成', subtitle: '描述需求，生成个性化面板', icon: 'fa-wand-magic-sparkles' },
    { id: 'classic', title: '手动编辑', subtitle: '添加部件，调整布局与属性', icon: 'fa-grid-4' },
  ];

  readonly styles = UI_THEMES;
  style: UiTheme = 'natural';

  get selectedStyle() { return this.styles.find(option => option.id === this.style)!; }
  get previewStyle() { return this.selected === 'ai' || this.selected === 'automatic' ? this.style : null; }

  readonly suggestions = ['把常用开关放在最上面', '以监测数据为主，布局紧凑', '大按钮，方便家人使用'];
  device?: BlinkerDevice;
  selected: Method | null = null;
  sourceTiles: InterfaceTile[] = [];
  tiles: InterfaceTile[] = [];
  prompt = '';
  adjustment = '';
  summary = '';
  error = '';
  loading = false;
  generating = false;
  generated = false;
  saving = false;
  previewCount = 0;
  progressMessage = '';
  workflowPreview?: WorkflowPreview;
  private generationController?: AbortController;
  private previousDraft?: { tiles: InterfaceTile[]; summary: string; generated: boolean; preview?: WorkflowPreview };
  snapshot?: DeviceUiSnapshot;
  private revision = 0;
  private layoutReady = false;
  private fingerprint = '';
  private epoch = 0;
  private refreshVersion = 0;
  private readonly subscriptions = new Subscription();
  private deviceSubscriptions = new Subscription();
  private connection?: DeviceUiConnection;
  private destroyed = false;
  private legacyRecord?: DevicePanelRecord | null;

  @ViewChild('studioContent') private content?: IonContent;
  @ViewChild('previewPanel') private previewPanel?: ElementRef<HTMLElement>;
  constructor(route: ActivatedRoute, private readonly nav: NavController,
    private readonly data: DataService,
    private readonly devices: DeviceService, private readonly notice: NoticeService,
    private readonly deviceUi: DeviceUiPort, private readonly pageLayouts: DeviceV2PageLayoutService,
    private readonly generation: InterfaceGenerationService, private readonly cd: ChangeDetectorRef,
    private readonly panels: DevicePanelService) {
    this.id = route.snapshot.paramMap.get('id') || '';
    this.backHref = this.id ? `/device-manager/${encodeURIComponent(this.id)}` : '/home/device';
  }

  get isV2(): boolean { return this.device?.config.mode === 'bbp2'; }

  get debugEnabled(): boolean | undefined {
    if (!this.device) return undefined;
    if (this.device.config.component) return this.device.config.component === 'TestDashboard';
    if (!this.layoutReady) return undefined;

    return this.isV2 ? this.revision === 0 : !this.legacyRecord && !this.hasLegacyLayout;
  }

  private get hasLegacyLayout(): boolean {
    const root = legacyRoot(this.device?.config.layouter);

    return !!root['pagePanel'] || (Array.isArray(root['dashboard']) && root['dashboard'].length > 0);
  }

  get missingCapabilityMessage(): string {
    if (!this.isV2) return '尚无可用组件，请等待设备数据或在编辑页面添加部件。';

    return this.snapshot?.manifestAccepted
      ? '已读取的设备能力中没有可生成的控制或数据组件，请检查设备能力配置。'
      : '尚未识别到设备能力，请连接设备并重新读取。';
  }

  get canApply(): boolean {
    return !!this.selected && !!this.device && !this.device.config.isShared && !this.saving && !this.generating
      && (this.selected === 'classic' || (!!this.tiles.length && this.layoutReady
        && ((this.selected === 'automatic' && this.isV2) || this.generated)));
  }

  get panelCards(): PanelCard[] {
    if (!this.device || !this.tiles.length) return [];
    if (!this.isV2) return legacyPreviewCards(this.tiles, this.device);
    if (!this.snapshot?.manifestAccepted) return [];

    const layout = toPageLayout(this.tiles, this.snapshot, 1, this.previewStyle || undefined);

    return layout.widgets.map(widget => {
      const field = this.snapshot!.endpoints.find(field => field.key === widget.endpointKey)!;

      const extras = widget.extraKeys?.flatMap(key => {
        const extra = this.snapshot!.endpoints.find(field => field.key === key);

        return extra ? [{ field: extra, value: extra.value }] : [];
      });

      return { widget, field, value: field.value, extras, display: displayValue(field.value),
        draft: field.value == null ? '' : String(field.value), error: '', disabled: false };
    });
  }

  get widgetCount(): number {
    try { const widgets = JSON.parse(this.device?.config.layouter || '{}').dashboard; return Array.isArray(widgets) ? widgets.length : 0; } catch { return 0; }
  }

  ngOnInit(): void {
    this.bindDevice();
    this.subscriptions.add(this.data.userDataLoader.subscribe(loaded => { if (loaded) this.bindDevice(); }));
  }

  ionViewWillEnter(): void {
    this.bindDevice();

    if (this.selected && this.selected !== 'classic' && this.isV2 && !this.connection) void this.refreshCapabilities();
  }

  ionViewDidLeave(): void {
    this.cancelGeneration();
    this.epoch++;
    this.refreshVersion++;

    this.generating = false;
    this.loading = false;

    this.connection?.close();

    this.connection = undefined;
  }

  ngOnDestroy(): void {
    this.cancelGeneration();

    this.destroyed = true;

    this.epoch++;
    this.refreshVersion++;
    this.subscriptions.unsubscribe();
    this.deviceSubscriptions.unsubscribe();
    this.connection?.close();
  }

  selectMethod(method: Method): void {
    if (!this.device || this.saving || this.generating || this.device.config.isShared) return;

    if (method === 'classic') {
      void this.nav.navigateForward(`/device/${encodeURIComponent(this.id)}/edit`);

      return;
    }

    this.selected = method;

    void this.content?.scrollToTop(0);

    this.error = '';
    this.summary = '';
    this.generated = false;
    this.workflowPreview = undefined;
    this.tiles = arrangeTiles(this.sourceTiles, this.previewStyle || undefined);

    if (this.isV2) void this.refreshCapabilities();
  }

  closeEditor(): void { if (!this.saving && !this.generating) { this.selected = null; this.error = ''; } }

  chooseStyle(style: UiTheme): void {
    if (this.generating || this.saving || style === this.style) return;

    this.style = style;
    this.generated = false;
    this.workflowPreview = undefined;
    this.summary = '';
    this.error = '';
    this.tiles = arrangeTiles(this.sourceTiles, style);
  }

  useSuggestion(suggestion: string): void { if (!this.generating && !this.saving) this.prompt = suggestion; }

  async refreshCapabilities(): Promise<void> {
    if (!this.device || !this.isV2 || this.loading || this.generating || this.saving) return;

    try {
      this.connection?.close();

      this.connection = this.deviceUi.openConnection(this.device.deviceName);

      // The accepted manifest is already observed through watchState. A live device
      // connection may take much longer than the layout read, or stay offline.
      const connection = this.connection;

      void connection.ready.catch(() => {
        if (this.connection === connection && this.selected && !this.destroyed && !this.sourceTiles.length) {
          this.error = '设备能力尚未就绪，请连接设备后重新读取。';

          this.render();
        }
      });
    } catch {
      this.error = '设备能力或已保存布局暂不可用，请确认设备连接后重试。';

      this.render();

      return;
    }

    await this.readLayout();
  }

  private async readLayout(): Promise<void> {
    if (!this.device || !this.isV2) return;

    const version = ++this.refreshVersion;

    this.loading = true;
    this.layoutReady = false;
    this.error = '';

    this.render();

    try {
      const record = await this.pageLayouts.get(this.device.deviceName);

      if (version !== this.refreshVersion) return;

      this.revision = record?.revision || 0;
      this.layoutReady = true;
    } catch {
      if (version === this.refreshVersion) this.error = '设备能力或已保存布局暂不可用，请确认设备连接后重试。';
    } finally {
      if (version === this.refreshVersion) { this.loading = false; this.render(); }
    }
  }

  async generate(refining = false): Promise<void> {
    const prompt = refining ? this.adjustment.trim() : this.prompt.trim() || this.selectedStyle.prompt;

    if (refining && (!this.generated || !this.isV2 || !prompt)) return;

    const base = refining ? { tiles: this.tiles, summary: this.summary, preview: this.workflowPreview } : undefined;

    if (this.selected !== 'ai' || !this.device || this.device.config.isShared) return;
    if (this.generating || this.saving) return;

    if (!this.sourceTiles.length) {
      this.error = this.missingCapabilityMessage;

      this.render();

      return;
    }

    if (!prompt || prompt.length > 1200) return;
    if (this.sourceTiles.length > 64) { this.error = 'AI 生成最多支持 64 个组件，请使用自动适配或经典编辑器。'; return; }
    if (this.device?.config.isPreview) { this.error = '体验设备可预览布局；请登录并选择自己的设备后使用 AI 生成。'; return; }

    const epoch = ++this.epoch;
    const fingerprint = this.fingerprint;
    const controller = new AbortController();

    this.generationController = controller;
    this.previousDraft = { tiles: this.tiles, summary: this.summary, generated: this.generated, preview: this.workflowPreview };
    this.previewCount = 0;
    this.progressMessage = '';
    this.generating = true;
    this.generated = false;
    this.workflowPreview = undefined;
    this.summary = '';
    this.error = '';

    this.render();
    this.scrollToPreview();

    try {
      const options: InterfaceGenerationOptions = {
        signal: controller.signal,
        base,
        snapshot: this.isV2 ? this.snapshot : undefined,
        onProgress: message => {
          if (epoch !== this.epoch || this.destroyed || fingerprint !== this.fingerprint) return;

          this.progressMessage = message;

          this.render();
        },
        onPreview: result => {
          if (epoch !== this.epoch || this.destroyed || fingerprint !== this.fingerprint) return;

          this.tiles = this.withLiveValues(result.tiles);
          this.previewCount = result.tiles.length;
          this.workflowPreview = result.preview;

          this.render();
        },
      };

      const result = await (base && this.snapshot
        ? this.generation.refine(prompt, this.sourceTiles, this.style, { ...options, base, snapshot: this.snapshot })
        : this.generation.generate(prompt, this.sourceTiles, this.style, options));

      if (epoch !== this.epoch || this.destroyed) return;
      if (fingerprint !== this.fingerprint) throw new Error('设备能力已更新，请重新生成');

      this.tiles = this.withLiveValues(result.tiles);
      this.summary = result.summary;
      this.workflowPreview = result.preview;
      this.generated = true;

      if (refining) this.adjustment = '';

      this.previousDraft = undefined;
    } catch (error) {
      if (epoch === this.epoch) {
        this.restoreDraft();

        const code = (error as { code?: string })?.code;
        const feedback = (error as { feedback?: string })?.feedback || '';

        this.error = code === 'INTERFACE_AI_UNAVAILABLE' ? 'AI 服务尚未配置，请联系服务管理员；也可以使用自动适配或拖拽编辑。'
          : code === 'INTERFACE_AI_REVIEW_REJECTED' ? `界面暂未通过视觉审查。${feedback} 请调整需求后重试，上一次通过的预览已保留。`
          : code === 'INTERFACE_AI_RATE_LIMIT' ? '生成请求较多，请稍后再试。'
          : code === 'INTERFACE_AI_TIMEOUT' || code === 'GATEWAY_TIMEOUT' ? '生成超时，请重试。上一次预览已保留。'
          : '生成未完成，请稍后重试。上一次预览已保留。';
      }
    } finally { if (epoch === this.epoch) { this.generating = false; this.generationController = undefined; this.render(); } }
  }

  cancelGeneration(): void {
    if (!this.generating) return;

    this.epoch++;
    this.generationController?.abort();

    this.generationController = undefined;
    this.generating = false;
    this.previewCount = 0;

    this.restoreDraft();
    this.render();
  }

  private restoreDraft(): void {
    if (this.previousDraft) {
      this.tiles = this.withLiveValues(this.previousDraft.tiles);
      this.summary = this.previousDraft.summary;
      this.generated = this.previousDraft.generated;
      this.workflowPreview = this.previousDraft.preview;
      this.previousDraft = undefined;
    }
  }

  private withLiveValues(tiles: InterfaceTile[]): InterfaceTile[] {
    const source = new Map(this.sourceTiles.map(tile => [tile.id, tile]));

    return tiles.map(tile => ({ ...tile, value: source.get(tile.id)?.value ?? tile.value, level: source.get(tile.id)?.level ?? tile.level }));
  }

  private scrollToPreview(): void {
    this.previewPanel?.nativeElement.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    });
  }

  async apply(): Promise<void> {
    if (!this.canApply || !this.device) return;

    if (this.selected === 'classic') {
      await this.nav.navigateForward(`/device/${encodeURIComponent(this.id)}/edit`);

      return;
    }

    const device = this.device;

    this.saving = true;
    this.error = '';

    this.render();

    let layoutSaved = false;

    try {
      const component = !this.isV2 ? 'Layouter2Component' : 'DeviceV2';
      const config: { component: string; layouter?: string } = { component };

      if (this.isV2) {
        const record = await this.pageLayouts.saveCandidate(device.deviceName,
          toPageLayout(this.tiles, this.snapshot!, this.revision, this.previewStyle || undefined), this.snapshot!.endpoints, this.revision);

        this.revision = record.revision;
        layoutSaved = true;
      } else {
        const legacy = readLegacyPanel(device);
        const widgets = this.panelCards.map(card => card.widget);

        this.legacyRecord = await this.panels.save(device,
          { schemaVersion: 1, columns: 8, widgets, style: this.style }, legacy.bindings, this.legacyRecord?.revision ?? 0);

        this.panels.install(device, this.legacyRecord);
      }

      const saved = !this.isV2 || device.config.isPreview || await this.devices.saveDeviceConfig(device, config);

      if (!saved) throw new Error('config-save-failed');

      Object.assign(device.config, config);
      device.subject.next({ key: 'component', value: component, source: 'device-uic' });
      await this.notice.showToast('新界面已应用');
      await this.nav.navigateRoot(`/device/${encodeURIComponent(this.id)}`);
    } catch (error) {
      const code = (error as { code?: string })?.code;

      if (code === 'DEVICE_V2_PAGE_LAYOUT_CONFLICT' || code === 'DEVICE_V2_PAGE_LAYOUT_MANIFEST_STALE' || code === 'DEVICE_PANEL_CONFLICT') {
        this.layoutReady = false;
        this.error = '设备能力或布局已在其他位置更新，请刷新后重新预览。';
      } else this.error = layoutSaved ? '布局已保存，但界面切换失败，请重试应用。' : '保存失败，当前界面未切换。请重试应用。';
    } finally { this.saving = false; this.render(); }
  }

  async setDebugMode(enabled: boolean): Promise<void> {
    if (!this.device || this.saving || this.device.config.isShared) return;

    this.saving = true;
    this.error = '';

    this.render();

    try {
      if (!this.isV2) {
        if (!enabled && !await this.panels.get(this.device) && !this.hasLegacyLayout) {
          await this.nav.navigateForward(`/device/${encodeURIComponent(this.id)}/edit`);

          return;
        }

        await this.panels.setView(this.device, enabled ? 'debug' : 'normal');
        await this.nav.navigateRoot(`/device/${encodeURIComponent(this.id)}`);

        return;
      }

      if (!enabled && !await this.pageLayouts.get(this.device.deviceName)) {
        await this.nav.navigateForward(`/device/${encodeURIComponent(this.id)}/edit`);

        return;
      }

      const component = enabled ? 'TestDashboard' : 'DeviceV2';

      if (!this.device.config.isPreview && !await this.devices.saveDeviceConfig(this.device, { component })) throw new Error();

      this.device.config.component = component;

      this.device.subject.next({ key: 'component', value: component, source: 'device-uic' });
      await this.nav.navigateRoot(`/device/${encodeURIComponent(this.id)}`);
    } catch { this.error = '界面配置保存失败，请稍后重试'; }

    finally { this.saving = false; this.render(); }
  }

  private bindDevice(): void {
    const device = this.data.device?.dict?.[this.id];

    if (device === this.device) return;

    this.cancelGeneration();
    this.refreshVersion++;
    this.deviceSubscriptions.unsubscribe();

    this.deviceSubscriptions = new Subscription();

    this.epoch++;
    this.connection?.close();

    this.device = device;
    this.snapshot = undefined;
    this.fingerprint = '';
    this.summary = '';
    this.error = '';
    this.generated = false;
    this.workflowPreview = undefined;
    this.layoutReady = false;
    this.revision = 0;
    this.loading = false;
    this.generating = false;
    this.selected = null;
    this.sourceTiles = device ? capabilityTiles(device) : [];
    this.tiles = arrangeTiles(this.sourceTiles, this.previewStyle || undefined);

    if (device && !this.isV2) void this.loadLegacyPanel();
    if (device && this.isV2 && !device.config.component) void this.readLayout();

    if (device && this.isV2) this.deviceSubscriptions.add(this.deviceUi.watchState(device.deviceName).subscribe({
      next: snapshot => {
        this.snapshot = snapshot;

        const fingerprint = snapshot.manifestAccepted ? snapshot.manifestFingerprint || '' : '';
        const changed = fingerprint !== this.fingerprint;

        this.fingerprint = fingerprint;
        this.sourceTiles = capabilityTiles(device, snapshot);

        if (changed) {
          this.cancelGeneration();

          this.generated = false; this.summary = ''; this.workflowPreview = undefined; this.layoutReady = false;

          if (fingerprint && this.selected && this.selected !== 'classic') void this.readLayout();
        }

        if (!this.generated && !this.generating) this.tiles = arrangeTiles(this.sourceTiles, this.previewStyle || undefined);
        else this.tiles = this.withLiveValues(this.tiles);

        this.render();
      },
      error: () => { this.error = '无法读取设备能力，请重新连接'; this.render(); },
    }));

    this.render();
  }

  private render(): void { if (!this.destroyed) this.cd.markForCheck(); }

  private async loadLegacyPanel(): Promise<void> {
    const device = this.device;
    const epoch = this.epoch;

    if (!device) return;

    this.loading = true;

    try {
      const record = await this.panels.get(device);

      if (this.destroyed || epoch !== this.epoch) return;

      this.legacyRecord = record;

      if (record) this.panels.install(device, record);

      this.sourceTiles = capabilityTiles(device);
      this.tiles = arrangeTiles(this.sourceTiles, this.previewStyle || undefined);
      this.layoutReady = true;
    } catch { this.error = '无法读取已保存的组件面板，请稍后重试。'; }

    finally { if (epoch === this.epoch) { this.loading = false; this.render(); } }
  }
}
