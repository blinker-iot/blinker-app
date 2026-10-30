import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LegacyPanelSizingDirective } from '../../../core/directives/legacy-panel-sizing.directive';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import { PageWidgetComponent } from './page-widget';
import { type PanelAction, type PanelCard, type WidgetAct } from '../widgets/widget-kit';

export type { PanelAction, PanelCard } from '../widgets/widget-kit';

@Component({
  selector: 'app-page-layout-panel',
  standalone: true,
  imports: [PageWidgetComponent, LegacyPanelSizingDirective],
  templateUrl: './page-layout-panel.html',
  styleUrls: ['./page-layout-panel.scss'],
})

export class PageLayoutPanelComponent {
  @Input() cards: PanelCard[] = [];
  // Without a theme the panel inherits the nearest [data-ui-theme] ancestor.
  @Input() theme?: UiTheme;
  @Input() interactive = false;
  // Outlined card, for editors.
  @Input() selectedId?: string;
  @Output() action = new EventEmitter<PanelAction>();

  // Visual order, which narrow screens use for automatic placement.
  get ordered(): PanelCard[] {
    return [...this.cards].sort((left, right) =>
      left.widget.grid.y - right.widget.grid.y || left.widget.grid.x - right.widget.grid.x);
  }

  emit(card: PanelCard, act: WidgetAct): void {
    if (this.interactive) this.action.emit({ ...act, field: card.field, widgetId: card.widget.widgetId });
  }
}
