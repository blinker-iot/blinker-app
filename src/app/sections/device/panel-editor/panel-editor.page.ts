import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonicModule, NavController } from '@ionic/angular';
import { DisplayGrid, Gridster, GridsterItem, GridsterConfig, GridsterItemConfig, GridType } from 'angular-gridster2';
import { Subscription } from 'rxjs';
import { DeviceUiConnection, DeviceUiPort, DeviceUiEndpoint, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { legacyField, readLegacyPanel, LegacyBinding } from '../../../core/device-v2/legacy-panel';
import { generateDefaultPageLayout, isExtraReading, migratePageLayout, PageLayoutWidget, parsePageWidgets, variantsFor } from '../../../core/device-v2/page-layout';
import { PanelDocument, placeWidget } from '../../../core/device-v2/panel-document';
import { UiTheme } from '../../../core/device-v2/ui-theme';
import { WIDGET_PRESETS, WidgetPreset, WidgetPresetId } from '../../../core/device-v2/widget-presets';
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
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';
import { VARIANT_LABELS } from '../widget-inspector/widget-labels';

interface EditorItem extends GridsterItemConfig { id: string; }
type EditorMode = 'edit' | 'layout' | 'preview';

@Component({
  selector: 'app-panel-editor', standalone: true,
  imports: [IonicModule, FormsModule, Gridster, GridsterItem, PageWidgetComponent, WidgetInspectorComponent],
  templateUrl: './panel-editor.page.html', styleUrls: ['./panel-editor.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})

export class PanelEditorPage implements OnInit, OnDestroy {
  readonly id: string;
  readonly variantLabels = VARIANT_LABELS;
  device?: BlinkerDevice;
  document?: PanelDocument;
  snapshot?: DeviceUiSnapshot;

  cards = new Map<string, PanelCard>();
  items: EditorItem[] = [];
  mode: EditorMode = 'edit';
  loading = true;
  saving = false;
  dirty = false;
  error = '';
  message = '';
  libraryOpen = false;
  selectedId = '';
  fieldKey = '';
  newKey = '';
  minimum = 0;
  maximum = 100;
  step = 1;
  choices = '';
  command = 'tap';
  search = '';

  options: GridsterConfig = {
    gridType: GridType.VerticalFixed, fixedRowHeight: 78, margin: 10, outerMargin: false,
    minCols: 2, maxCols: 2, minRows: 8, maxRows: 65551, maxItemCols: 2, maxItemRows: 16,
    mobileBreakpoint: 0, compactType: 'none', allowMultiLayer: false,
    displayGrid: DisplayGrid.None, scrollSensitivity: 60, scrollSpeed: 12,
    draggable: { enabled: false, ignoreContent: true, dragHandleClass: 'widget-drag', delayStart: 0,
      start: () => this.startDrag(), stop: () => this.finishDrag() },
    resizable: { enabled: false }, swap: true, swapWhileDragging: false, pushItems: false,
    itemChangeCallback: () => this.scheduleGridChange(),
  };

  private bindings: Record<string, LegacyBinding> = {};
  private record?: DeviceV2PageLayoutRecord | null;
  private connection?: DeviceUiConnection;
  private subscriptions = new Subscription();
  private stateSubscription?: Subscription;
  private deviceSubscription?: Subscription;
  private destroyed = false;
  private loadVersion = 0;
  private gridChangePending = false;
  private dragOrigin?: { items: EditorItem[]; widgets: PageLayoutWidget[] };
  private dragCleanup?: ReturnType<typeof setTimeout>;
  private savedState = '';
  private legacyRecord?: DevicePanelRecord | null;
  private previous: { document: PanelDocument; bindings: Record<string, LegacyBinding> }[] = [];
  private previewValues = new Map<string, unknown>();
  private drafts = new Map<string, string>();

  constructor(route: ActivatedRoute, private readonly data: DataService,
    private readonly devices: DeviceService, private readonly deviceUi: DeviceUiPort,
    private readonly layouts: DeviceV2PageLayoutService, private readonly nav: NavController,
    private readonly alerts: AlertController, private readonly notice: NoticeService,
    private readonly view: ViewService, private readonly cd: ChangeDetectorRef,
    private readonly panels: DevicePanelService) {
    this.id = route.snapshot.paramMap.get('id') || '';
  }

  @HostBinding('attr.data-ui-theme') get theme(): UiTheme {
    return readDeviceTheme(this.id) ?? this.document?.style ?? (this.view.theme === 'dark' ? 'dark' : 'natural');
  }

  get isV2(): boolean { return this.device?.config.mode === 'bbp2'; }
  get canUndo(): boolean { return this.previous.length > 0; }
  get selected(): PanelCard | undefined { return this.cards.get(this.selectedId); }

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
    return this.availableFields.filter(isExtraReading).map(field => ({ key: field.key, label: field.key }));
  }

  get availableFields(): DeviceUiEndpoint[] {
    const hidden = this.device?.config.hiddenEndpointKeys ?? [];

    return this.endpoints.filter(field => !hidden.includes(field.key));
  }

  widthLabel(width: number): string { return width <= 2 ? '半宽' : '整宽'; }

  get catalogue(): { id: WidgetPresetId; preset: WidgetPreset; card: PanelCard }[] {
    return (Object.entries(WIDGET_PRESETS) as [WidgetPresetId, WidgetPreset][]).flatMap(([id, preset]) => {
      const field = this.libraryField(preset);

      if (!field || (this.search && !`${VARIANT_LABELS[preset.variant]} ${id}`.toLowerCase().includes(this.search.toLowerCase()))) return [];

      const widget = this.presetWidget(id, preset, field.key);

      return [{ id, preset, card: this.cardFor(widget, field) }];
    });
  }

  ngOnInit(): void {
    void this.load();

    this.subscriptions.add(this.data.userDataLoader.subscribe(loaded => {
      if (loaded && !this.device) void this.load();
    }));
  }

  ionViewWillEnter(): void {
    if (this.device && this.isV2 && !this.connection) this.connect();
  }

  ionViewDidLeave(): void { this.connection?.close(); this.connection = undefined; }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.dragCleanup);

    this.loadVersion++;
    this.connection?.close();
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
    if (!this.device) return;

    this.connection?.close();

    this.connection = this.deviceUi.openConnection(this.device.deviceName);

    const connection = this.connection;

    void connection.ready.catch(() => {
      if (!this.destroyed && this.connection === connection && !this.document) {
        this.loading = false;
        this.error = '尚未读取设备能力，请连接设备后重试。';

        this.cd.markForCheck();
      }
    });
  }

  private initialize(): void {
    if (this.document || this.record === undefined || !this.snapshot?.manifestAccepted) return;

    try {
      const layout = !this.record ? generateDefaultPageLayout(this.snapshot)
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
    this.selectedId = '';
    this.options = { ...this.options, draggable: { ...this.options.draggable, enabled: mode === 'layout' } };

    this.previewValues.clear();
    this.drafts.clear();
    this.refreshCards();
  }

  openLibrary(): void {
    this.error = '';
    this.fieldKey = this.availableFields[0]?.key || (this.isV2 ? '' : '__new__');
    this.search = '';
    this.libraryOpen = true;
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
      this.selectedId = widget.widgetId;
    } catch (error) { this.error = error instanceof Error ? error.message : '无法添加部件'; }
  }

  updateWidget(widget: PageLayoutWidget): void {
    if (!this.document || this.saving) return;

    try {
      const placed = placeWidget(widget, this.document.widgets.filter(item => item.widgetId !== widget.widgetId));

      this.commit(this.document.widgets.map(item => item.widgetId === widget.widgetId ? placed : item));
    } catch { this.error = '属性内容或尺寸无效，请检查标题长度和部件参数。'; }
  }

  removeSelected(): void {
    if (!this.document || this.saving) return;

    this.commit(this.document.widgets.filter(widget => widget.widgetId !== this.selectedId));

    this.selectedId = '';
  }

  undo(): void {
    const previous = this.previous.pop();

    if (!previous || this.saving) return;

    this.document = previous.document;
    this.bindings = previous.bindings;
    this.dirty = this.serialize() !== this.savedState;
    this.selectedId = '';

    this.rebuildItems();
    this.refreshCards();
  }

  previewAction(card: PanelCard, action: WidgetAct): void {
    if (this.mode !== 'preview') return;

    if (action.kind === 'draft') this.drafts.set(card.field.key, String(action.value ?? ''));
    else if (action.kind !== 'invoke') this.previewValues.set(card.field.key,
      action.kind === 'commit' ? this.drafts.get(card.field.key) ?? action.value : action.value);

    this.refreshCards();
  }

  async save(): Promise<void> {
    if (!this.document || !this.device || this.saving || this.stale) return;

    this.saving = true;
    this.error = '';
    let layoutSaved = false;

    try {
      const component = this.isV2 ? 'DeviceV2' : 'Layouter2Component';
      const config: { component: string; layouter?: string; hiddenEndpointKeys?: string[] } = { component };

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

      await this.nav.navigateBack(`/device/${encodeURIComponent(this.id)}`);
    } catch (error) {
      const code = (error as { code?: string })?.code;

      this.error = code === 'DEVICE_V2_PAGE_LAYOUT_CONFLICT' || code === 'DEVICE_V2_PAGE_LAYOUT_MANIFEST_STALE' || code === 'DEVICE_PANEL_CONFLICT'
        ? '布局或设备能力已在其他位置更新。当前草稿已保留，请重新读取后再编辑。'
        : layoutSaved ? '布局已保存，但面板切换失败。请重试保存以完成切换。' : '保存失败，当前草稿已保留，请重试。';
    } finally { this.saving = false; }
  }

  async canDeactivate(): Promise<boolean> {
    if (this.saving) return false;
    if (!this.dirty) return true;

    const alert = await this.alerts.create({ header: '放弃未保存的修改？',
      message: '已保存的设备面板不会改变。',
      buttons: [{ text: '继续编辑', role: 'cancel' }, { text: '放弃修改', role: 'destructive' }] });

    await alert.present();

    return (await alert.onDidDismiss()).role === 'destructive';
  }

  async reload(): Promise<void> { if (await this.canDeactivate()) await this.load(); }

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

    return field && variantsFor(preset.type, field).includes(preset.variant) ? field : undefined;
  }

  private presetWidget(id: WidgetPresetId, preset: WidgetPreset, key: string): PageLayoutWidget {
    return { widgetId: id, endpointKey: key, title: key, type: preset.type, variant: preset.variant,
      options: { ...preset.options }, grid: { x: 0, y: 0, width: preset.width, height: preset.height } };
  }

  private cardFor(widget: PageLayoutWidget, field: DeviceUiEndpoint): PanelCard {
    const value = this.previewValues.has(field.key) ? this.previewValues.get(field.key) as DeviceUiEndpoint['value'] : field.value;

    return { widget, field, value, display: String(value ?? '—'), draft: this.drafts.get(field.key) ?? String(value ?? ''),
      extras: widget.extraKeys?.flatMap(key => {
        const extra = this.availableFields.find(endpoint => endpoint.key === key);

        return extra ? [{ field: extra, value: extra.value }] : [];
      }), error: '', disabled: false };
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
    this.items = this.layoutItems(this.document?.widgets ?? []);
  }

  private layoutItems(widgets: readonly PageLayoutWidget[]): EditorItem[] {
    // The editor shows two visual widths. Keep this projection out of the
    // persisted eight-column layout so opening the editor never resizes it.
    const hidden = this.device?.config.hiddenEndpointKeys ?? [];
    const ordered = widgets.filter(widget => !hidden.includes(widget.endpointKey))
      .sort((left, right) => left.grid.y - right.grid.y || left.grid.x - right.grid.x);
    let x = 0;
    let y = 0;
    let rowHeight = 0;

    return ordered.map(widget => {
      const cols = widget.grid.width <= 2 ? 1 : 2;

      if (x + cols > 2) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }

      const item = { id: widget.widgetId, x, y, cols, rows: widget.grid.height };
      x += cols;
      rowHeight = Math.max(rowHeight, item.rows);

      return item;
    });
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

  private startDrag(): void {
    clearTimeout(this.dragCleanup);
    if (!this.document) return;

    this.dragOrigin = { items: this.items.map(item => ({ ...item })), widgets: this.document.widgets };
  }

  private finishDrag(): void {
    const origin = this.dragOrigin;

    // Gridster commits both sides after its stop callback. A no-op drop has
    // no item-change callback, so discard that snapshot on the next task.
    this.dragCleanup = setTimeout(() => {
      if (this.dragOrigin === origin) this.dragOrigin = undefined;
    }, 0);
  }

  private scheduleGridChange(): void {
    if (this.gridChangePending || !this.dragOrigin || !this.document || this.mode !== 'layout' || this.saving) return;

    this.gridChangePending = true;

    queueMicrotask(() => {
      this.gridChangePending = false;
      const origin = this.dragOrigin;
      this.dragOrigin = undefined;

      if (this.destroyed || !origin || !this.document || this.mode !== 'layout' || this.saving) return;
      if (this.document.widgets !== origin.widgets) { this.rebuildItems(); return; }

      const changed = origin.items.filter(before => {
        const after = this.items.find(item => item.id === before.id);

        return after && (after.x !== before.x || after.y !== before.y);
      });

      if (changed.length !== 2) {
        this.rebuildItems();
        return;
      }

      const first = origin.widgets.find(widget => widget.widgetId === changed[0].id)!;
      const second = origin.widgets.find(widget => widget.widgetId === changed[1].id)!;
      const widgets = origin.widgets.map(widget => {
        const destination = widget === first ? second : widget === second ? first : undefined;

        return destination ? { ...widget, grid: { ...widget.grid, x: destination.grid.x, y: destination.grid.y } } : widget;
      });

      try {
        const projected = this.layoutItems(widgets);
        const unchanged = origin.items.filter(item => item.id !== first.widgetId && item.id !== second.widgetId);

        if (unchanged.some(before => {
          const after = projected.find(item => item.id === before.id);

          return !after || after.x !== before.x || after.y !== before.y;
        })) throw new Error('layout-shift');

        this.commit(widgets);
      } catch {
        this.rebuildItems();
        this.error = '这两个部件的尺寸不适合互换，已保留原位置。';
      }
    });
  }

  private serialize(): string { return JSON.stringify({ document: this.document, bindings: this.bindings }); }
}
