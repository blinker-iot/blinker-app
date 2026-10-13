import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import type { BlinkerDevice } from '../../core/model/device.model';
import { DeviceService } from '../../core/services/device.service';
import { DevicePanelService } from '../../core/services/device-panel.service';
import { legacyCommand, legacyField, legacyRoot, readLegacyPanel, type LegacyPanel } from '../../core/device-v2/legacy-panel';
import { PageLayoutPanelComponent, type PanelAction, type PanelCard } from '../v2/panel/page-layout-panel';

@Component({
  selector: 'app-legacy-panel',
  standalone: true,
  imports: [PageLayoutPanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (error) { <p class="error" role="alert">{{ error }}</p> }
    @if (panel) {
      <app-page-layout-panel [cards]="cards" [interactive]="true" (action)="act($event)" />
    }
  `,
  styles: [':host { display: block; padding: 16px; } .error { color: var(--ui-alert); padding: 16px; }'],
})

export class LegacyPanelComponent implements OnChanges, OnDestroy {
  @Input() device!: BlinkerDevice;

  panel?: LegacyPanel;

  cards: PanelCard[] = [];
  error = '';
  private subscription?: Subscription;
  private drafts = new Map<string, string>();
  private loadVersion = 0;

  constructor(private readonly devices: DeviceService, private readonly panels: DevicePanelService) {}

  get layoutTheme() { return this.panel?.document.style; }

  ngOnChanges(): void {
    this.subscription?.unsubscribe();
    this.load();

    this.subscription = this.device.subject.subscribe(event => {
      if (event?.key === 'component' || event?.key === 'layouter') this.load();
      else {
        // New devices can report their first readings after the page opens.
        // Rebuild only the unsaved automatic view, without another cloud read.
        if (this.panel && this.automatic) this.panel = readLegacyPanel(this.device);
        this.refresh();
      }
    });
  }

  ngOnDestroy(): void { this.loadVersion++; this.subscription?.unsubscribe(); }

  act(action: PanelAction): void {
    const binding = this.panel?.bindings[action.widgetId || ''];

    if (!binding || !binding.field.writable) return;

    if (action.kind === 'draft') {
      this.drafts.set(binding.field.key, String(action.value ?? ''));
      this.refresh();

      return;
    }

    const input = action.kind === 'commit' ? this.drafts.get(binding.field.key) ?? action.value : action.value;
    const value = legacyCommand(binding, this.device, input, action.kind === 'invoke');

    if (value === undefined) return;

    if (this.device.config.isPreview) {
      const previous = this.device.data[binding.field.key];
      const property = binding.field.valueType === 'boolean' ? 'swi' : 'val';

      this.device.data[binding.field.key] = previous && typeof previous === 'object'
        ? { ...previous, [property]: value } : value;

      this.device.subject.next({ key: binding.field.key, value });
    } else this.devices.sendData(this.device, JSON.stringify({ [binding.field.key]: value }));
  }

  private get automatic(): boolean {
    const root = legacyRoot(this.device.config.layouter);
    const saved = root['pagePanel'] as { widgets?: unknown[] } | undefined;

    return !saved?.widgets?.length && !(Array.isArray(root['dashboard']) && root['dashboard'].length);
  }

  private async load(): Promise<void> {
    const version = ++this.loadVersion;

    try {
      this.panel = readLegacyPanel(this.device);
      this.refresh();

      const saved = await this.panels.get(this.device);

      if (version !== this.loadVersion) return;
      if (saved) this.panels.install(this.device, saved);

      this.panel = readLegacyPanel(this.device);
      this.error = '';

      this.refresh();
    } catch {
      if (version !== this.loadVersion) return;

      this.error = this.panel ? '暂时无法同步面板，当前显示本地配置。' : '无法读取组件面板，原界面配置已保留。';
    }
  }

  private refresh(): void {
    if (!this.panel) return;

    const fields = Object.values(this.panel.bindings).map(binding => legacyField(binding, this.device));

    this.cards = this.panel.document.widgets.map(widget => {
      const field = legacyField(this.panel!.bindings[widget.widgetId], this.device);

      return { widget, field, value: field.value,
        display: String(field.value ?? '—'), draft: this.drafts.get(field.key) ?? String(field.value ?? ''),
        extras: widget.extraKeys?.flatMap(key => {
          const extra = fields.find(item => item.key === key);

          return extra ? [{ field: extra, value: extra.value }] : [];
        }),
        error: '', disabled: !this.device.config.isPreview && !this.device.data?.enable
          && this.device.data?.state !== 'connected' && !this.devices.islocalDevice(this.device) };
    });
  }
}
