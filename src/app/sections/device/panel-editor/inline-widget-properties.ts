import { ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { LegacyPanelSizingDirective } from '../../../core/directives/legacy-panel-sizing.directive';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import { PageWidgetComponent } from '../../../device/v2/panel/page-widget';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';

// Modal body only: the parent owns dismissal, the whole-panel draft and saving.
@Component({
  selector: 'app-inline-widget-properties',
  standalone: true,
  imports: [PageWidgetComponent, WidgetInspectorComponent, LegacyPanelSizingDirective],
  templateUrl: './inline-widget-properties.html',
  styleUrls: ['./panel-widget-editor.page.scss', './inline-widget-properties.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class InlineWidgetPropertiesComponent {
  private source!: PanelCard;
  private sourceWidget = '';
  widget?: PageLayoutWidget;
  invalid = false;
  draftVersion = 0;

  @Input({ required: true })
  set card(card: PanelCard) {
    this.source = card;
    const sourceWidget = JSON.stringify(card.widget);
    // Fresh State updates the preview, never a user's pending property input.
    if (sourceWidget === this.sourceWidget) return;
    this.sourceWidget = sourceWidget;
    this.widget = structuredClone(card.widget);
    this.invalid = false;
    this.draftVersion++;
  }
  get card(): PanelCard { return this.source; }

  @Input() @HostBinding('attr.data-ui-theme') theme: UiTheme = 'natural';
  @Input() extraCandidates: WidgetInspectorComponent['extraCandidates'] = [];
  @Input() error = '';
  @Input() disabled = false;
  @Input() canMoveEarlier = false;
  @Input() canMoveLater = false;
  @Output() applied = new EventEmitter<PageLayoutWidget>();
  @Output() removed = new EventEmitter<void>();
  @Output() canceled = new EventEmitter<void>();
  @Output() moved = new EventEmitter<number>();

  get previewCard(): PanelCard | undefined {
    return this.widget ? { ...this.source, widget: this.widget } : undefined;
  }

  get hasUnappliedChanges(): boolean {
    return !!this.widget && (this.invalid || JSON.stringify(this.widget) !== this.sourceWidget);
  }

  updateWidget(widget: PageLayoutWidget): void { this.widget = widget; }

  apply(): void {
    if (this.widget && !this.invalid && !this.disabled) this.applied.emit(structuredClone(this.widget));
  }
}
