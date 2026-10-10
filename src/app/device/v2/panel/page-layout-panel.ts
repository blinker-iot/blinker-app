import { Component, EventEmitter, Input, Output } from '@angular/core';

import type { UiTheme } from '../../../core/device-v2/ui-theme';
import { ButtonWidgetComponent } from '../widgets/button/button-widget';
import { ChartWidgetComponent } from '../widgets/chart/chart-widget';
import { ColorWidgetComponent } from '../widgets/color/color-widget';
import { DialWidgetComponent } from '../widgets/dial/dial-widget';
import { InputWidgetComponent } from '../widgets/input/input-widget';
import { MeterWidgetComponent } from '../widgets/meter/meter-widget';
import { SelectWidgetComponent } from '../widgets/select/select-widget';
import { SliderWidgetComponent } from '../widgets/slider/slider-widget';
import { SwitchWidgetComponent } from '../widgets/switch/switch-widget';
import { ValueWidgetComponent } from '../widgets/value/value-widget';
import { familyOf, type PanelAction, type PanelCard, type WidgetAct } from '../widgets/widget-kit';

export type { PanelAction, PanelCard } from '../widgets/widget-kit';

@Component({
  selector: 'app-page-layout-panel',
  standalone: true,
  imports: [
    ButtonWidgetComponent, ChartWidgetComponent, ColorWidgetComponent, DialWidgetComponent, InputWidgetComponent,
    MeterWidgetComponent, SelectWidgetComponent, SliderWidgetComponent, SwitchWidgetComponent, ValueWidgetComponent,
  ],
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

  readonly familyOf = familyOf;

  // Visual order, which narrow screens use for automatic placement.
  get ordered(): PanelCard[] {
    return [...this.cards].sort((left, right) =>
      left.widget.grid.y - right.widget.grid.y || left.widget.grid.x - right.widget.grid.x);
  }

  emit(card: PanelCard, act: WidgetAct): void {
    if (this.interactive) this.action.emit({ ...act, field: card.field });
  }
}
