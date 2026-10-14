import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, NavController } from '@ionic/angular';
import { Subscription, timeout } from 'rxjs';
import { API } from '../../../configs/api.config';
import type { BlinkerDevice } from '../../../core/model/device.model';
import { DeviceService } from '../../../core/services/device.service';
import { DevicePanelRecord, DevicePanelService } from '../../../core/services/device-panel.service';
import { readLegacyPanel } from '../../../core/device-v2/legacy-panel';
import { UI_THEMES, UiTheme } from '../../../core/device-v2/ui-theme';
import { CustomPanelFrameComponent } from '../../../device/custom-panel/custom-panel-frame.component';
import { CustomPanelDocument, parseCustomPanel } from '../../../core/device-v2/custom-panel';
import { CUSTOM_PANEL_TEMPLATE } from '../../../device/custom-panel/custom-panel-template';
import { ATOM_GUIDE } from '../../../device/custom-panel/atom-catalog';
import { GenerationDurationComponent } from './generation-duration.component';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';

@Component({
  selector: 'app-custom-panel-editor', standalone: true,
  imports: [FormsModule, IonicModule, CustomPanelFrameComponent, GenerationDurationComponent],
  templateUrl: './custom-panel-editor.component.html', styleUrls: ['./custom-panel-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomPanelEditorComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) device!: BlinkerDevice;
  @Input() cards: PanelCard[] = [];
  @Input() ready = false;
  @Input() record?: DevicePanelRecord | null;
  @Output() busy = new EventEmitter<boolean>();

  readonly themes = UI_THEMES;
  readonly suggestions = ['把常用开关放在最上面', '以监测数据为主，布局紧凑', '大按钮，方便家人使用'];
  theme: UiTheme = 'natural';
  prompt = '';
  preview?: CustomPanelDocument;
  generating = false;
  saving = false;
  error = '';
  message = '';
  private html = CUSTOM_PANEL_TEMPLATE;
  private initialized = false;
  private savedState = '';
  private capabilityKey = '';
  private generation?: Subscription;

  constructor(private readonly http: HttpClient, private readonly devices: DeviceService,
    private readonly panels: DevicePanelService, private readonly nav: NavController,
    private readonly alerts: AlertController, private readonly cd: ChangeDetectorRef) {}

  get selectedTheme() { return this.themes.find(option => option.id === this.theme)!; }
  get themeTriggerId() { return `custom-theme-${this.device.id || this.device.deviceName}`; }

  get canApply(): boolean {
    return this.ready && !!this.preview && !this.generating && !this.saving && !this.device.config.isShared;
  }

  ngOnChanges(): void {
    const key = JSON.stringify(this.fields());

    if (this.generating && key !== this.capabilityKey) {
      this.cancel();
      this.error = '设备能力已变化，生成已取消。请使用最新字段重新生成。';
    }

    this.capabilityKey = key;

    if (!this.ready || this.initialized) return;

    this.initialized = true;
    const saved = this.device.config.customPanel;
    this.html = saved?.html || CUSTOM_PANEL_TEMPLATE;
    this.theme = saved?.theme || 'natural';
    this.savedState = this.serialize();

    if (saved) this.refreshPreview();
  }

  ngOnDestroy(): void { this.generation?.unsubscribe(); }

  private refreshPreview(): void {
    try {
      this.preview = parseCustomPanel({ version: 1, html: this.html, theme: this.theme });
      this.error = '';
    } catch (error) { this.error = error instanceof Error ? error.message : '无法读取已保存的界面'; }
  }

  chooseTheme(theme: UiTheme): void {
    if (this.generating || this.saving || theme === this.theme || !this.themes.some(option => option.id === theme)) return;

    this.theme = theme;

    if (this.preview) this.refreshPreview();
  }

  generate(): void {
    if (this.generating || this.saving || !this.ready || this.device.config.isShared) return;
    if (this.device.config.isPreview) { this.error = '请登录并选择自己的设备后使用 AI 生成。'; return; }

    this.generating = true;
    this.error = '';
    this.message = '';
    this.busy.emit(true);

    this.generation = this.http.post(API.INTERFACE_WORKFLOW, {
      mode: 'custom',
      prompt: this.prompt.trim() || this.selectedTheme.prompt, theme: this.theme, fields: this.fields(),
      catalog: ATOM_GUIDE, template: CUSTOM_PANEL_TEMPLATE, html: this.html,
    }, { responseType: 'text', headers: { Accept: 'application/x-ndjson' } }).pipe(timeout(190000)).subscribe({
      next: response => {
        try {
          if (response.length > 2 * 1024 * 1024) throw new Error('生成结果过大');

          const events = response.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
          const complete = events.filter(event => event.type === 'complete' && event.mode === 'custom');

          if (events.some(event => event.type === 'error') || complete.length !== 1) throw new Error('生成未完成');

          const draft = parseCustomPanel({ version: 1, html: complete[0].data.html, theme: this.theme });
          this.html = draft.html;
          this.preview = draft;
          this.prompt = '';
          this.message = '界面已生成，可以继续描述需求调整。';
        } catch { this.error = '生成结果暂不可用，请重试。当前预览已保留。'; }

        this.finishGeneration();
      },
      error: error => {
        this.error = error?.code === 'INTERFACE_AI_UNAVAILABLE' ? 'AI 服务尚未配置，请联系服务管理员。'
          : error?.code === 'INTERFACE_AI_RATE_LIMIT' ? '生成请求较多，请稍后重试。'
          : '生成未完成，请稍后重试。当前草稿已保留。';
        this.finishGeneration();
      },
    });
  }

  cancel(): void {
    this.generation?.unsubscribe();
    this.finishGeneration();
  }

  async apply(): Promise<void> {
    if (!this.canApply) return;

    this.saving = true;
    this.error = '';
    this.busy.emit(true);

    try {
      const customPanel = parseCustomPanel({ version: 1, html: this.html, theme: this.theme });

      if (this.device.config.mode === 'bbp2') {
        const config = { customPanel, component: 'DeviceV2', panelMode: 'custom' as const };

        if (!this.device.config.isPreview && !await this.devices.saveDeviceConfig(this.device, config)) throw new Error('保存失败，请重试。');

        Object.assign(this.device.config, config);
      } else {
        const legacy = this.record?.panel || readLegacyPanel(this.device);
        this.record = await this.panels.save(this.device, legacy.document, legacy.bindings, this.record?.revision ?? 0, 'custom', customPanel);
        this.panels.install(this.device, this.record);
      }

      this.savedState = this.serialize();
      this.message = '自定义界面已应用。';
      this.device.subject.next({ key: 'component', value: this.device.config.component, source: 'custom-panel' });

      this.saving = false;
      this.busy.emit(false);

      await this.nav.navigateRoot(`/device/${encodeURIComponent(this.device.id || this.device.deviceName)}`);
    } catch (error) {
      this.error = (error as { code?: string })?.code === 'DEVICE_PANEL_CONFLICT'
        ? '界面已在其他位置更新，请重新打开后再生成。当前预览尚未保存。'
        : error instanceof Error ? error.message : '保存失败，请重试。';
    } finally { this.saving = false; this.busy.emit(false); this.cd.markForCheck(); }
  }

  async canDeactivate(): Promise<boolean> {
    if (this.saving) return false;
    if (!await this.confirmDiscard()) return false;

    this.cancel();

    return true;
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.initialized || !this.preview || this.serialize() === this.savedState) return true;

    const alert = await this.alerts.create({ header: '放弃未应用的界面？', message: '当前调整尚未应用，离开后将保留原来的界面。',
      buttons: [{ text: '继续编辑', role: 'cancel' }, { text: '放弃修改', role: 'discard' }] });
    await alert.present();

    return (await alert.onDidDismiss()).role === 'discard';
  }

  private fields() {
    // Describe capabilities, never send readings, identifiers, credentials or old bindings to AI.
    const unique = new Map(this.cards.map(card => [card.field.key, card]));

    return [...unique.values()].map(({ field: { value: _value, ...field }, widget }) => ({ ...field, label: widget.title || field.key }));
  }

  private finishGeneration(): void {
    this.generating = false;
    this.generation = undefined;
    this.busy.emit(false);
    this.cd.markForCheck();
  }

  private serialize(): string { return JSON.stringify([this.html, this.theme]); }
}
