import { DEVICE_CONSOLE_HOST, DeviceConsoleHost } from '../../../core/device-v2/console-host';
import { DeviceConsoleService, cloudConsole, canEditConsole, consoleWriteConflict, installConsole } from '../../../core/services/device-console.service';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Input, OnChanges, OnDestroy, Output } from '@angular/core';
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
import { interfaceGenerationError, interfaceGenerationErrorMessage } from './interface-generation-error';
import { interfaceGenerationOwner } from './interface-generation-owner';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { customPanelGenerationFields } from './custom-panel-generation-fields';

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
  @Input() active = true;
  @Input() manifestFingerprint = '';
  @Input() record?: DevicePanelRecord | null;
  @Input() consoleRevision?: number;
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
  private destroyed = false;
  private savedState = '';
  private capabilityKey = '';
  private generation?: Subscription;
  private readonly lifecycle = new Subscription();
  private generationEpoch = 0;
  private owner = '';
  private ownerDevice?: BlinkerDevice;
  private blockedDevice?: BlinkerDevice;
  private sessionVersion: number;
  private hostActive = true;
  private baseConsoleRevision?: number;
  private consoleConflict = false;
  private saveEpoch = 0;

  constructor(private readonly http: HttpClient, private readonly devices: DeviceService,
    private readonly panels: DevicePanelService, private readonly nav: NavController,
    private readonly alerts: AlertController, private readonly cd: ChangeDetectorRef,
    private readonly consoles: DeviceConsoleService,
    @Inject(DEVICE_CONSOLE_HOST) private readonly host: DeviceConsoleHost) {
    this.sessionVersion = this.host.sessionVersion;
    this.lifecycle.add(this.host.activeChanges.subscribe(active => {
      this.hostActive = active;
      if (!active) this.cancel();
      this.cd.markForCheck();
    }));
    this.lifecycle.add(this.host.sessionChanges.subscribe(() => this.checkSession()));
  }

  get selectedTheme() { return this.themes.find(option => option.id === this.theme)!; }
  get themeTriggerId() { return `custom-theme-${this.device.id || this.device.deviceName}`; }

  get generationReady(): boolean {
    return this.ready && this.initialized && this.active && this.hostActive
      && !this.destroyed && !this.blockedDevice;
  }

  get canApply(): boolean {
    return this.generationReady && !!this.preview && !this.generating && !this.saving && canEditConsole(this.device)
      && !this.consoleConflict && (!cloudConsole(this.device) || this.baseConsoleRevision !== undefined);
  }

  ngOnChanges(): void {
    this.checkSession();
    if (this.blockedDevice === this.device) return;
    this.blockedDevice = undefined;

    const owner = interfaceGenerationOwner(this.device, this.host.sessionVersion, this.manifestFingerprint);
    const key = JSON.stringify(this.fields());

    if (this.owner && (owner !== this.owner || key !== this.capabilityKey)) this.clearDraft();

    this.owner = owner;
    this.ownerDevice = this.device;
    this.capabilityKey = key;

    if (!this.active || !this.hostActive || !this.ready) this.cancel();
    if (!this.ready || this.initialized) return;

    this.initialized = true;
    this.baseConsoleRevision = this.consoleRevision;

    const saved = this.device.config.customPanel;
    this.html = saved?.html || CUSTOM_PANEL_TEMPLATE;
    this.theme = saved?.theme || 'natural';
    this.savedState = this.serialize();

    if (saved) this.refreshPreview();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.lifecycle.unsubscribe();
    this.cancel();
  }

  private checkSession(): void {
    if (this.sessionVersion === this.host.sessionVersion) return;

    this.sessionVersion = this.host.sessionVersion;
    // Account notifications precede the next device inventory. Never reload
    // a saved panel from the previous account's still-bound object.
    this.blockedDevice = this.ownerDevice || this.device;
    this.ownerDevice = undefined;
    this.owner = '';
    this.capabilityKey = '';
    this.clearDraft();
    this.cd.markForCheck();
  }

  private clearDraft(): void {
    this.cancel();
    this.saveEpoch++;
    if (this.saving) { this.saving = false; this.busy.emit(false); }
    this.initialized = false;
    this.preview = undefined;
    this.html = CUSTOM_PANEL_TEMPLATE;
    this.theme = 'natural';
    this.prompt = '';
    this.savedState = '';
    this.error = '';
    this.message = '';
    this.baseConsoleRevision = undefined;
    this.consoleConflict = false;
  }

  private refreshPreview(): void {
    try {
      this.preview = parseCustomPanel({ version: 1, html: this.html, theme: this.theme });
      this.error = '';
    } catch (error) { this.error = error instanceof Error ? error.message : '无法读取已保存的界面'; }
  }

  chooseTheme(theme: UiTheme): void {
    if (!this.generationReady || this.generating || this.saving || theme === this.theme || !this.themes.some(option => option.id === theme)) return;

    this.theme = theme;

    if (this.preview) this.refreshPreview();
  }

  generate(): void {
    this.checkSession();
    if (this.generating || this.saving || !this.generationReady || !canEditConsole(this.device)) return;

    if (this.device.config.isPreview) { this.error = '请登录并选择自己的设备后使用 AI 生成。'; return; }

    this.generating = true;
    this.error = '';
    this.message = '';

    this.busy.emit(true);

    const epoch = ++this.generationEpoch;
    const owner = this.owner;
    const capabilityKey = this.capabilityKey;
    const theme = this.theme;
    const current = () => {
      this.checkSession();
      return this.generating && epoch === this.generationEpoch && this.generationReady
        && owner === this.owner
        && owner === interfaceGenerationOwner(this.device, this.host.sessionVersion, this.manifestFingerprint)
        && capabilityKey === JSON.stringify(this.fields());
    };
    const generation = new Subscription();
    this.generation = generation;
    generation.add(this.http.post(API.INTERFACE_WORKFLOW, {
      mode: 'custom',
      prompt: this.prompt.trim() || this.selectedTheme.prompt, theme, fields: this.fields(),
      catalog: ATOM_GUIDE, template: CUSTOM_PANEL_TEMPLATE, html: this.html,
    }, { responseType: 'text', headers: { Accept: 'application/x-ndjson' } }).pipe(timeout(190000)).subscribe({
      next: response => {
        if (!current()) return;
        try {
          if (response.length > 2 * 1024 * 1024) throw interfaceGenerationError('INTERFACE_AI_OUTPUT_TOO_LARGE');

          const events = response.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
          const failure = events.find(event => event.type === 'error');
          const complete = events.filter(event => event.type === 'complete' && event.mode === 'custom');

          if (failure) throw interfaceGenerationError(failure.code);
          if (complete.length === 0) throw interfaceGenerationError('INTERFACE_AI_INCOMPLETE');
          if (complete.length !== 1) throw interfaceGenerationError('INTERFACE_AI_INVALID_RESPONSE');

          const draft = parseCustomPanel({ version: 1, html: complete[0].data.html, theme });

          this.html = draft.html;
          this.preview = draft;
          this.prompt = '';
          this.message = '界面已生成，可以继续描述需求调整。';
        } catch (error) {
          this.error = interfaceGenerationErrorMessage((error as { code?: string })?.code
            ? error : interfaceGenerationError('INTERFACE_AI_INVALID_RESPONSE'))
            + (this.preview ? '当前预览已保留。' : '');
        }

        this.finishGeneration();
      },
      error: error => {
        if (!current()) return;
        this.error = interfaceGenerationErrorMessage(error) + (this.preview ? '当前预览已保留。' : '');

        this.finishGeneration();
      },
    }));
  }

  cancel(): void {
    this.finishGeneration();
  }

  async apply(): Promise<void> {
    if (!this.canApply) return;

    const session = this.host.sessionVersion;
    const device = this.device;
    const owner = this.owner, operation = ++this.saveEpoch;
    const current = () => operation === this.saveEpoch && session === this.host.sessionVersion && !this.destroyed
      && this.device === device && this.owner === owner;

    this.saving = true;
    this.error = '';

    this.busy.emit(true);

    try {
      const customPanel = parseCustomPanel({ version: 1, html: this.html, theme: this.theme });

      if (this.device.config.mode === 'bbp2') {
        const config = { customPanel, component: 'DeviceV2', panelMode: 'custom' as const };

        if (cloudConsole(this.device)) {
          const source = await this.consoles.save(this.device.deviceName,
            { uiConfig: { customPanel, panelMode: 'custom' } }, this.baseConsoleRevision!);

          if (!current()) return;

          installConsole(this.device, source);
          this.baseConsoleRevision = source.revision;
        } else if (!this.device.config.isPreview && !await this.devices.saveDeviceConfig(this.device, config)) {
          throw new Error('保存失败，请重试。');
        }

        Object.assign(this.device.config, config);
      } else {
        const legacy = this.record?.panel || readLegacyPanel(this.device);

        this.record = await this.panels.save(this.device, legacy.document, legacy.bindings, this.record?.revision ?? 0, 'custom', customPanel);

        if (!current()) return;
        this.panels.install(this.device, this.record);
      }

      if (!current()) return;

      this.savedState = this.serialize();
      this.message = '自定义界面已应用。';

      this.device.subject.next({ key: 'component', value: this.device.config.component, source: 'custom-panel' });

      this.saving = false;

      this.busy.emit(false);
      await this.nav.navigateRoot(`/device/${encodeURIComponent(this.device.id || this.device.deviceName)}`);
    } catch (error) {
      if (!current()) return;
      if (consoleWriteConflict(error)) this.consoleConflict = true;
      this.error = this.consoleConflict
        ? '界面已在其他位置更新，请重新打开读取后确认。当前预览已保留，尚未保存。'
        : ['DEVICE_PANEL_CONFLICT'].includes((error as { code?: string })?.code || '')
        ? '界面已在其他位置更新，请重新打开后再生成。当前预览尚未保存。'
        : error instanceof Error ? error.message : '保存失败，请重试。';
    } finally { if (current()) { this.saving = false; this.busy.emit(false); this.cd.markForCheck(); } }
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
    return customPanelGenerationFields(this.cards);
  }

  private finishGeneration(): void {
    if (!this.generating && !this.generation) return;
    const generation = this.generation;
    this.generating = false;
    this.generation = undefined;
    this.generationEpoch++;
    generation?.unsubscribe();

    this.busy.emit(false);
    if (!this.destroyed) this.cd.markForCheck();
  }

  private serialize(): string { return JSON.stringify([this.html, this.theme]); }
}
