import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonicModule, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { DeviceUiConnection, DeviceUiConnectionState, DeviceUiPort, DeviceUiEndpoint, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { legacyCommand, legacyField, readLegacyPanel, LegacyBinding } from '../../../core/device-v2/legacy-panel';
import { generateDefaultPageLayout, isExtraReading, migratePageLayout, PageLayoutWidget, parsePageWidgets, variantsFor } from '../../../core/device-v2/page-layout';
import { PanelDocument, placeWidget } from '../../../core/device-v2/panel-document';
import { UI_THEMES, UiTheme } from '../../../core/device-v2/ui-theme';
import { WIDGET_PRESETS, WidgetPreset, WidgetPresetId, presetMatchesField } from '../../../core/device-v2/widget-presets';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { DevicePanelRecord, DevicePanelService } from '../../../core/services/device-panel.service';
import { DeviceV2PageLayoutRecord, DeviceV2PageLayoutService } from '../../../core/services/device-v2-page-layout.service';
import { NoticeService } from '../../../core/services/notice.service';
import { ViewService } from '../../../core/services/view.service';
import { readDeviceTheme } from '../../../device/device-theme';
import { PageWidgetComponent } from '../../../device/v2/panel/page-widget';
import { PanelCard, WidgetAct } from '../../../device/v2/widgets/widget-kit';
import { VARIANT_LABELS } from '../widget-inspector/widget-labels';
import { PanelWidgetEditorContext, PanelWidgetEditorContextService } from './panel-widget-editor-context.service';

import { PanelSortableDirective, PanelSortItemDirective, PanelSortMove } from './panel-sortable.directive';
type EditorMode = 'edit' | 'layout' | 'preview';

@Component({
  selector: 'app-panel-editor', standalone: true,
  imports: [IonicModule, FormsModule, PageWidgetComponent, PanelSortableDirective, PanelSortItemDirective],
  templateUrl: './panel-editor.page.html', styleUrls: ['./panel-editor.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})

export class PanelEditorPage implements OnInit, OnDestroy {
  readonly id: string;
  readonly variantLabels = VARIANT_LABELS;
  readonly themes = UI_THEMES;
  previewTheme?: UiTheme;
  device?: BlinkerDevice;
  document?: PanelDocument;
  snapshot?: DeviceUiSnapshot;

  cards = new Map<string, PanelCard>();
  items: PageLayoutWidget[] = [];
  mode: EditorMode = 'edit';
  loading = true;
  saving = false;
  dirty = false;
  error = '';
  message = '';
  libraryOpen = false;
  fieldKey = '';
  newKey = '';
  minimum = 0;
  maximum = 100;
  step = 1;
  choices = '';
  command = 'tap';

  private bindings: Record<string, LegacyBinding> = {};
  private record?: DeviceV2PageLayoutRecord | null;
  private connection?: DeviceUiConnection;
  private connectionSubscription?: Subscription;
  private connectionReady = false;
  private connectionState: DeviceUiConnectionState = 'idle';
  private appActive = true;
  private pageVisible = false;
  private subscriptions = new Subscription();
  private stateSubscription?: Subscription;
  private deviceSubscription?: Subscription;
  private destroyed = false;
  private loadVersion = 0;
  private dragOrigin?: { items: PageLayoutWidget[]; widgets: PageLayoutWidget[] };
  private savedState = '';
  private legacyRecord?: DevicePanelRecord | null;
  private previous: { document: PanelDocument; bindings: Record<string, LegacyBinding> }[] = [];
  private pending = new Set<string>();
  private queued = new Map<string, { field: DeviceUiEndpoint; value: unknown }>();
  private fieldErrors = new Map<string, string>();
  private drafts = new Map<string, string>();
  private propertyContext?: PanelWidgetEditorContext;

  constructor(route: ActivatedRoute, private readonly data: DataService,
    private readonly devices: DeviceService, private readonly deviceUi: DeviceUiPort,
    private readonly layouts: DeviceV2PageLayoutService, private readonly nav: NavController,
    private readonly alerts: AlertController, private readonly notice: NoticeService,
    private readonly view: ViewService, private readonly cd: ChangeDetectorRef,
    private readonly panels: DevicePanelService,
    private readonly propertyContexts: PanelWidgetEditorContextService) {
    this.id = route.snapshot.paramMap.get('id') || '';
  }

  @HostBinding('attr.data-ui-theme') get theme(): UiTheme {
    return (this.mode === 'preview' ? this.previewTheme : undefined) ?? readDeviceTheme(this.id) ?? this.document?.style ?? (this.view.theme === 'dark' ? 'dark' : 'natural');
  }

  get isV2(): boolean { return this.device?.config.mode === 'bbp2'; }
  get canUndo(): boolean { return this.previous.length > 0; }

  private get canControl(): boolean {
    if (!this.device || this.destroyed || !this.pageVisible || !this.appActive || this.saving || this.stale) return false;

    if (!this.isV2) {
      return !!(this.device.config.isPreview || this.device.data?.enable
        || this.device.data?.state === 'connected' || this.devices.islocalDevice(this.device));
    }

    return this.connectionReady && this.connectionState === 'ready' && this.connection?.signal.aborted === false
      && this.snapshot?.manifestAccepted === true && this.snapshot.stateFresh;
  }

  get stale(): boolean {
    return this.isV2 && !!this.document && (!this.snapshot?.manifestAccepted
      || this.snapshot.manifestFingerprint !== this.loadedFingerprint);
  }

  private loadedFingerprint = '';

  get endpoints(): DeviceUiEndpoint[] {
    if (this.isV2) return this.snapshot?.endpoints ?? [];
    if (!this.device) return [];

    return [...new Map(Object.values(this.bindings).map(binding => {
      const field = legacyField(binding, this.device!);

      return [field.key, field] as const;
    })).values()];
  }

  get extraCandidates() {
    return this.availableFields.filter(field => isExtraReading(field)).map(field => ({
      key: field.key, label: field.key, role: field.role, valueType: field.valueType,
    }));
  }

  get availableFields(): DeviceUiEndpoint[] {
    const hidden = this.device?.config.hiddenEndpointKeys ?? [];

    return this.endpoints.filter(field => !hidden.includes(field.key));
  }

  get catalogue(): { id: WidgetPresetId; preset: WidgetPreset; card: PanelCard }[] {
    return (Object.entries(WIDGET_PRESETS) as [WidgetPresetId, WidgetPreset][]).flatMap(([id, preset]) => {
      const field = this.libraryField(preset);

      if (!field) return [];

      const widget = this.presetWidget(id, preset, field.key);

      return [{ id, preset, card: this.cardFor(widget, field) }];
    });
  }

  ngOnInit(): void {
    void this.load();

    this.subscriptions.add(this.deviceUi.appActive.subscribe(active => {
      this.appActive = active;

      if (!active) this.disconnect();
      else if (this.pageVisible && this.isV2 && (!this.connection || this.connection.signal.aborted)) this.connect();

      this.refreshCards();
    }));

    this.subscriptions.add(this.data.userDataLoader.subscribe(loaded => {
      if (loaded && !this.device) void this.load();
    }));
  }

  ionViewWillEnter(): void {
    this.pageVisible = true;
    if (this.isV2 && (!this.connection || this.connection.signal.aborted)) this.connect();
    this.refreshCards();
  }

  ionViewDidLeave(): void {
    this.pageVisible = false;
    this.disconnect();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.releasePropertyContext();

    this.loadVersion++;
    this.disconnect();
    this.subscriptions.unsubscribe();
    this.stateSubscription?.unsubscribe();
    this.deviceSubscription?.unsubscribe();
  }

  async load(): Promise<void> {
    const device = this.data.device?.dict?.[this.id];

    if (!device) { this.loading = false; this.error = '未找到设备，请等待设备列表加载后重试。'; return; }
    if (device.config.isShared) { this.loading = false; this.error = '共享设备不能修改组件面板。'; return; }

    const version = ++this.loadVersion;

    this.device = device;
    this.loading = true;
    this.error = '';
    this.document = undefined;
    this.record = undefined;
    this.previous = [];
    this.fieldErrors.clear();
    this.drafts.clear();

    this.stateSubscription?.unsubscribe();
    this.deviceSubscription?.unsubscribe();

    try {
      if (this.isV2) {
        this.stateSubscription = this.deviceUi.watchState(device.deviceName).subscribe(snapshot => {
          this.snapshot = snapshot;

          this.initialize();
          this.refreshCards();
        });

        this.connect();

        const record = await this.layouts.get(device.deviceName);

        if (this.destroyed || version !== this.loadVersion) return;

        this.record = record;

        this.initialize();
      } else {
        this.legacyRecord = await this.panels.get(device);

        if (this.destroyed || version !== this.loadVersion) return;
        if (this.legacyRecord) this.panels.install(device, this.legacyRecord);

        const panel = readLegacyPanel(device);

        this.document = panel.document;
        this.bindings = panel.bindings;
        this.message = panel.omitted ? `${panel.omitted} 个旧版部件暂不显示，原配置已保留。` : '';

        this.ready();

        this.deviceSubscription = device.subject.subscribe(() => this.refreshCards());
      }
    } catch {
      this.loading = false;
      this.error = '无法读取已保存的布局，请重试。原布局未修改。';
    }
  }

  private connect(): void {
    if (!this.device || !this.pageVisible || !this.appActive) return;

    this.disconnect();
    const connection = this.deviceUi.openConnection(this.device.deviceName);
    this.connection = connection;
    this.connectionSubscription = this.deviceUi.watchConnection(this.device.deviceName).subscribe(state => {
      this.connectionState = state;
      this.refreshCards();
    });

    void connection.ready.then(() => {
      if (this.destroyed || this.connection !== connection || connection.signal.aborted) return;

      this.connectionReady = true;
      this.refreshCards();
    }).catch(() => {
      if (!this.destroyed && this.connection === connection && !this.document) {
        this.loading = false;
        this.error = '尚未读取设备能力，请连接设备后重试。';

        this.cd.markForCheck();
      }
    });
  }

  private disconnect(): void {
    this.connectionReady = false;
    this.connectionState = 'idle';
    this.connectionSubscription?.unsubscribe();
    this.connection?.close();
    this.connection = undefined;
    this.pending = new Set();
    this.queued.clear();
  }

  private initialize(): void {
    if (this.document || this.record === undefined || !this.snapshot?.manifestAccepted) return;

    try {
      const layout = !this.record || !this.record.layout.widgets.length
        ? { ...generateDefaultPageLayout(this.snapshot), style: this.record?.layout.style }
        : this.record.manifestFingerprint === this.snapshot.manifestFingerprint ? this.record.layout
          : migratePageLayout(this.record.layout, this.snapshot);

      this.document = structuredClone(layout);
      this.loadedFingerprint = this.snapshot.manifestFingerprint!;

      this.ready();
    } catch { this.loading = false; this.error = '布局与当前设备字段不兼容，请重新读取。'; }
  }

  private ready(): void {
    this.loading = false;
    this.dirty = false;
    this.savedState = this.serialize();

    this.rebuildItems();
    this.refreshCards();
  }

  setMode(mode: EditorMode): void {
    if (this.saving) return;

    this.mode = mode;

    this.drafts.clear();
    this.refreshCards();
  }

  openLibrary(): void {
    this.error = '';
    this.fieldKey = this.availableFields[0]?.key || (this.isV2 ? '' : '__new__');
    this.libraryOpen = true;
  }

  async openWidget(widgetId: string): Promise<void> {
    const card = this.cards.get(widgetId);

    if (!card || this.saving) return;

    const editor = this;
    this.propertyContext = {
      deviceId: this.id, widgetId, card, theme: this.theme,
      extraCandidates: this.extraCandidates,
      get error() { return editor.error; },
      preview: widget => this.cardFor(widget, card.field),
      save: widget => this.saveWidgetChange(() => this.updateWidget(widget)),
      remove: () => this.saveWidgetChange(() => this.removeWidget(widgetId)),
      canLeave: () => this.canDeactivate(),
    };
    this.propertyContexts.set(this.propertyContext);

    try {
      const opened = await this.nav.navigateForward(this.widgetUrl(widgetId));

      if (!opened) this.releasePropertyContext();
    } catch {
      this.releasePropertyContext();
      this.error = '无法打开部件属性，请重试。';
    }
  }

  add(id: WidgetPresetId): void {
    if (!this.document || this.saving) return;

    const preset: WidgetPreset = WIDGET_PRESETS[id];
    const field = this.libraryField(preset);

    if (!field) return;

    if (!this.isV2 && this.fieldKey === '__new__' && preset.type === 'slider'
      && (!Number.isFinite(this.minimum) || !Number.isFinite(this.maximum) || this.maximum <= this.minimum
        || !Number.isFinite(this.step) || this.step <= 0)) {
      this.error = '最大值必须大于最小值，步进必须大于零。';

      return;
    }

    if (!this.isV2 && this.fieldKey === '__new__' && (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(this.newKey)
      || this.endpoints.some(endpoint => endpoint.key === this.newKey))) {
      this.error = '请输入不重复的字段 key：以字母开头，使用字母、数字、下划线或短横线。';

      return;
    }

    try {
      const widget = placeWidget({ ...this.presetWidget(id, preset, field.key), widgetId: `widget-${crypto.randomUUID()}` }, this.document.widgets);
      const bindings = { ...this.bindings };

      if (!this.isV2) {
        const previous = Object.values(bindings).find(binding => binding.field.key === field.key);

        bindings[widget.widgetId] = previous ? structuredClone(previous)
          : { field: { ...field, value: undefined }, source: { mode: 2, cus: this.command } };
      }

      this.commit([...this.document.widgets, widget], bindings);

      this.libraryOpen = false;
    } catch (error) { this.error = error instanceof Error ? error.message : '无法添加部件'; }
  }

  updateWidget(widget: PageLayoutWidget): void {
    if (!this.document || this.saving) return;

    try {
      const placed = placeWidget(widget, this.document.widgets.filter(item => item.widgetId !== widget.widgetId));

      this.commit(this.document.widgets.map(item => item.widgetId === widget.widgetId ? placed : item));
    } catch { this.error = '属性内容或尺寸无效，请检查标题长度和部件参数。'; }
  }

  private removeWidget(widgetId: string): void {
    if (!this.document || this.saving) return;

    this.commit(this.document.widgets.filter(widget => widget.widgetId !== widgetId));
  }

  undo(): void {
    const previous = this.previous.pop();

    if (!previous || this.saving) return;

    this.document = previous.document;
    this.bindings = previous.bindings;
    this.dirty = this.serialize() !== this.savedState;

    this.rebuildItems();
    this.refreshCards();
  }

  previewAction(card: PanelCard, action: WidgetAct): void {
    if (this.mode !== 'preview' || !card.field.writable) return;

    if (action.kind === 'draft') {
      this.drafts.set(card.field.key, String(action.value ?? ''));
      this.refreshCards();
      return;
    }

    if (!this.canControl) return;
    const input = action.kind === 'commit' ? this.drafts.get(card.field.key) ?? card.draft : action.value;

    if (!this.isV2) {
      this.sendLegacyPreview(card, input, action.kind === 'invoke');
      return;
    }

    const field = this.endpoints.find(endpoint => endpoint.key === card.field.key);
    if (!field?.writable) return;
    let value: unknown;

    if (action.kind === 'invoke') value = field.valueType === 'null' ? null : true;
    else if (action.kind === 'commit') {
      value = field.valueType === 'text' ? String(input ?? '') : Number(input);

      if (field.valueType !== 'text' && (!Number.isFinite(value)
        || (field.valueType === 'integer' && !Number.isSafeInteger(value)))) {
        this.fieldErrors.set(field.key, '请输入有效数值');
        this.refreshCards();
        return;
      }
    } else if (action.kind === 'toggle' && typeof input === 'boolean') value = input;
    else if (action.kind === 'range' && typeof input === 'number' && Number.isFinite(input)) value = input;
    else if (action.kind === 'select' && typeof input === 'string') value = input;
    else return;

    void this.sendPreview(field, value);
  }

  private async sendPreview(field: DeviceUiEndpoint, value: unknown): Promise<void> {
    if (!this.device || !this.canControl) return;

    if (this.pending.has(field.key)) {
      this.queued.set(field.key, { field, value });
      return;
    }

    const pending = this.pending;
    pending.add(field.key);
    this.fieldErrors.delete(field.key);
    this.refreshCards();

    try {
      await this.deviceUi.sendCommand(this.device.deviceName, field.key, value);
    } catch (error) {
      if (this.pending === pending && !this.destroyed) {
        const code = (error as { code?: string })?.code;
        const message = code === 'DEVICE_V2_READY_CANCELLED' ? ''
          : code === 'DEVICE_V2_COMMAND_OUTCOME_UNKNOWN' ? '操作结果尚未确认，请先检查设备状态，勿重复操作'
            : code === 'DEVICE_V2_READY_TIMEOUT' ? '设备尚未就绪，本次未发送控制指令'
              : code === 'DEVICE_V2_READY_RETIRED' ? '连接已变化，请重新连接设备'
                : error instanceof Error ? error.message : '指令发送失败';

        this.fieldErrors.set(field.key, message);
      }
    } finally {
      // An old connection must never clear pending work on the new one.
      if (this.pending === pending && !this.destroyed) {
        pending.delete(field.key);
        const next = this.queued.get(field.key);
        this.queued.delete(field.key);

        // Keep a hold's release behind its press instead of dropping it.
        if (next) void this.sendPreview(next.field, next.value);
        this.refreshCards();
      }
    }
  }

  private sendLegacyPreview(card: PanelCard, input: unknown, invoke: boolean): void {
    const binding = this.bindings[card.widget.widgetId];
    if (!binding?.field.writable || !this.device) return;
    const value = legacyCommand(binding, this.device, input, invoke);
    if (value === undefined) return;

    this.fieldErrors.delete(binding.field.key);

    try {
      if (this.device.config.isPreview) {
        const previous = this.device.data[binding.field.key];
        const property = binding.field.valueType === 'boolean' ? 'swi' : 'val';
        this.device.data[binding.field.key] = previous && typeof previous === 'object'
          ? { ...previous, [property]: value } : value;
        this.device.subject.next({ key: binding.field.key, value });
      } else {
        this.devices.sendData(this.device, JSON.stringify({ [binding.field.key]: value }));
      }
    } catch (error) {
      this.fieldErrors.set(binding.field.key, error instanceof Error ? error.message : '指令发送失败');
    }

    this.refreshCards();
  }

  async save(returnToDevice = true): Promise<boolean> {
    if (!this.document || !this.device || this.saving) return false;
    if (this.stale) {
      this.error = '设备字段已改变，请返回编辑页重新读取。';
      return false;
    }

    this.saving = true;
    this.error = '';
    let layoutSaved = false;

    try {
      const component = this.isV2 ? 'DeviceV2' : 'Layouter2Component';
      const config = { component, panelMode: 'normal' as const };

      if (this.isV2) {
        const revision = this.record?.revision ?? 0;

        this.record = await this.layouts.saveCandidate(this.device.deviceName, {
          ...this.document, revision: Math.max(1, revision), manifestFingerprint: this.loadedFingerprint,
        }, this.snapshot!.endpoints, revision);

        layoutSaved = true;
      } else {
        this.legacyRecord = await this.panels.save(this.device, this.document, this.bindings, this.legacyRecord?.revision ?? 0);

        this.panels.install(this.device, this.legacyRecord);
      }

      if (this.isV2 && !this.device.config.isPreview && !await this.devices.saveDeviceConfig(this.device, config)) throw new Error('config-save-failed');

      Object.assign(this.device.config, config);
      this.device.subject.next({ key: 'component', value: component, source: 'panel-editor' });

      this.dirty = false;
      this.savedState = this.serialize();

      await this.notice.showToast('组件面板已保存');

      this.saving = false;

      if (returnToDevice) await this.nav.navigateBack(`/device/${encodeURIComponent(this.id)}`);

      return true;
    } catch (error) {
      const code = (error as { code?: string })?.code;

      this.error = code === 'DEVICE_V2_PAGE_LAYOUT_CONFLICT' || code === 'DEVICE_V2_PAGE_LAYOUT_MANIFEST_STALE' || code === 'DEVICE_PANEL_CONFLICT'
        ? '布局或设备能力已在其他位置更新。当前草稿已保留，请重新读取后再编辑。'
        : layoutSaved ? '布局已保存，但面板切换失败。请重试保存以完成切换。' : '保存失败，当前草稿已保留，请重试。';

      return false;
    } finally { this.saving = false; }
  }

  private async saveWidgetChange(change: () => void): Promise<boolean> {
    const before = {
      document: this.document, bindings: this.bindings, previous: [...this.previous],
      dirty: this.dirty, savedState: this.savedState,
    };
    let saved = false;
    this.error = '';

    try {
      change();
      saved = !this.error && await this.save(false);

      return saved;
    } finally {
      if (!saved) {
        this.document = before.document;
        this.bindings = before.bindings;
        this.previous = before.previous;
        this.dirty = before.dirty;
        this.savedState = before.savedState;

        // Keep any revision returned by the server, but never leave a failed
        // property edit or removal inside the panel's unsaved document.
        this.rebuildItems();
        this.refreshCards();
      }
    }
  }

  async canDeactivate(nextUrl?: string): Promise<boolean> {
    if (this.saving) return false;
    if (this.propertyContext && nextUrl?.split('?')[0] === this.widgetUrl(this.propertyContext.widgetId)) return true;
    if (!this.dirty) {
      this.releasePropertyContext();
      return true;
    }

    const alert = await this.alerts.create({ header: '放弃未保存的修改？',
      message: '已保存的设备面板不会改变。',
      buttons: [{ text: '继续编辑', role: 'cancel' }, { text: '放弃修改', role: 'destructive' }] });

    await alert.present();

    const discard = (await alert.onDidDismiss()).role === 'destructive';

    if (discard) this.releasePropertyContext();

    return discard;
  }

  async reload(): Promise<void> { if (await this.canDeactivate()) await this.load(); }

  private widgetUrl(widgetId: string): string {
    return `/device/${encodeURIComponent(this.id)}/edit/widget/${encodeURIComponent(widgetId)}`;
  }

  private releasePropertyContext(): void {
    if (this.propertyContext) this.propertyContexts.release(this.propertyContext);
    this.propertyContext = undefined;
  }

  private libraryField(preset: WidgetPreset): DeviceUiEndpoint | undefined {
    if (!this.isV2 && this.fieldKey === '__new__') {
      const choices = this.choices.split(',').map(value => value.trim()).filter(Boolean);

      const field: DeviceUiEndpoint = {
        id: this.endpoints.length, key: this.newKey || '新字段',
        role: preset.type === 'button' ? 'action' : 'property',
        valueType: preset.type === 'switch' ? 'boolean' : preset.type === 'button' ? (preset.variant === 'action' ? 'null' : 'text')
          : preset.type === 'select' || preset.type === 'input' ? 'text' : preset.type === 'color' ? 'integer' : 'number',
        readable: preset.type !== 'button', writable: preset.type !== 'value', notifies: false,
        minimum: preset.type === 'color' ? 0 : this.minimum,
        maximum: preset.type === 'color' ? 0xffffff : this.maximum, step: this.step,
        ...(choices.length ? { choices } : {}),
      };

      return variantsFor(preset.type, field).includes(preset.variant) ? field : undefined;
    }

    const field = this.availableFields.find(endpoint => endpoint.key === this.fieldKey);

    return field && presetMatchesField(preset, field) ? field : undefined;
  }

  private presetWidget(id: WidgetPresetId, preset: WidgetPreset, key: string): PageLayoutWidget {
    return { widgetId: id, endpointKey: key, title: key, type: preset.type, variant: preset.variant,
      options: { ...preset.options }, grid: { x: 0, y: 0, width: preset.width, height: preset.height } };
  }

  private cardFor(widget: PageLayoutWidget, field: DeviceUiEndpoint): PanelCard {
    const value = field.value;

    return { widget, field, value, display: String(value ?? '—'), draft: this.drafts.get(field.key) ?? String(value ?? ''),
      extras: widget.extraKeys?.flatMap(key => {
        const extra = this.availableFields.find(endpoint => endpoint.key === key);

        return extra ? [{ field: extra, value: extra.value }] : [];
      }), error: this.fieldErrors.get(field.key) ?? '',
      disabled: this.mode === 'preview' && (this.pending.has(field.key) || !this.canControl) };
  }

  private refreshCards(): void {
    this.cards = new Map((this.document?.widgets ?? []).flatMap(widget => {
      const field = this.isV2 ? this.endpoints.find(endpoint => endpoint.key === widget.endpointKey)
        : this.bindings[widget.widgetId] && this.device ? legacyField(this.bindings[widget.widgetId], this.device) : undefined;

      return field ? [[widget.widgetId, this.cardFor(widget, field)] as const] : [];
    }));
    this.cd.markForCheck();
  }

  private rebuildItems(): void {
    const hidden = this.device?.config.hiddenEndpointKeys ?? [];

    this.items = (this.document?.widgets ?? []).filter(widget => !hidden.includes(widget.endpointKey))
      .sort((left, right) => left.grid.y - right.grid.y || left.grid.x - right.grid.x);
  }

  private commit(widgets: PageLayoutWidget[], bindings = this.bindings): void {
    if (!this.document) return;

    const parsed = parsePageWidgets(widgets, this.isV2 ? this.endpoints : undefined);

    if (JSON.stringify(parsed) === JSON.stringify(this.document.widgets) && bindings === this.bindings) return;

    this.previous.push({ document: structuredClone(this.document), bindings: structuredClone(this.bindings) });

    if (this.previous.length > 30) this.previous.shift();

    this.document = { ...this.document, widgets: parsed };
    this.bindings = bindings;
    this.dirty = this.serialize() !== this.savedState;
    this.error = '';

    this.rebuildItems();

    this.refreshCards();
  }

  startDrag(): void {
    if (!this.document || this.saving || this.stale) return;

    this.dragOrigin = { items: [...this.items], widgets: this.document.widgets };
  }

  moveDrag(move: PanelSortMove): void {
    if (!this.dragOrigin || this.document?.widgets !== this.dragOrigin.widgets) return;

    const from = this.items.findIndex(widget => widget.widgetId === move.from);
    const to = this.items.findIndex(widget => widget.widgetId === move.to);

    if (from < 0 || to < 0 || from === to) return;

    const items = [...this.items];
    const [widget] = items.splice(from, 1);
    items.splice(to, 0, widget);
    this.items = items;

    // Update the DOM and Sortable indices together before the next collision.
    this.cd.detectChanges();
  }

  finishDrag(canceled: boolean): void {
    const origin = this.dragOrigin;
    this.dragOrigin = undefined;

    if (!origin) return;
    if (canceled || !this.document || this.document.widgets !== origin.widgets
      || this.mode !== 'layout' || this.saving || this.stale) {
      this.rebuildItems();
      this.cd.detectChanges();
      return;
    }

    if (origin.items.every((widget, index) => widget.widgetId === this.items[index]?.widgetId)) return;

    const visible = new Set(this.items.map(widget => widget.widgetId));
    let index = 0;
    let x = 0;
    let y = 0;
    let rowHeight = 0;

    // Keep hidden widgets in their sequence slots and preserve every widget's
    // dimensions. Only coordinates change when the inserted order is packed.
    const widgets = [...origin.widgets].sort((left, right) => left.grid.y - right.grid.y || left.grid.x - right.grid.x)
      .map(widget => visible.has(widget.widgetId) ? this.items[index++] : widget)
      .map(widget => {
        if (x + widget.grid.width > 8) {
          x = 0;
          y += rowHeight;
          rowHeight = 0;
        }

        const placed = { ...widget, grid: { ...widget.grid, x, y } };
        x += widget.grid.width;
        rowHeight = Math.max(rowHeight, widget.grid.height);

        return placed;
      });

    try {
      this.commit(widgets);
    } catch {
      this.rebuildItems();
      this.error = '无法保存这次排序，已恢复原顺序。';
    }

    this.cd.detectChanges();
  }

  private serialize(): string { return JSON.stringify({ document: this.document, bindings: this.bindings }); }
}
