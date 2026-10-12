import { Component, EventEmitter, Input, Output } from '@angular/core';

import type { UiTheme } from '../../../core/device-v2/ui-theme';
import { ActionWidgetComponent } from '../widgets/action/action-widget';
import { DialWidgetComponent } from '../widgets/dial/dial-widget';
import { GradientWidgetComponent } from '../widgets/gradient/gradient-widget';
import { LevelWidgetComponent } from '../widgets/level/level-widget';
import { LevelsWidgetComponent } from '../widgets/levels/levels-widget';
import { LogWidgetComponent } from '../widgets/log/log-widget';
import { ModeWidgetComponent } from '../widgets/mode/mode-widget';
import { NumberWidgetComponent } from '../widgets/number/number-widget';
import { PickerWidgetComponent } from '../widgets/picker/picker-widget';
import { RingWidgetComponent } from '../widgets/ring/ring-widget';
import { SlideWidgetComponent } from '../widgets/slide/slide-widget';
import { StatusWidgetComponent } from '../widgets/status/status-widget';
import { StepperWidgetComponent } from '../widgets/stepper/stepper-widget';
import { TextWidgetComponent } from '../widgets/text/text-widget';
import { TileWidgetComponent } from '../widgets/tile/tile-widget';
import { TimerWidgetComponent } from '../widgets/timer/timer-widget';
import { ToggleWidgetComponent } from '../widgets/toggle/toggle-widget';
import { TrendWidgetComponent } from '../widgets/trend/trend-widget';
import { variantOf, type PanelAction, type PanelCard, type WidgetAct } from '../widgets/widget-kit';

export type { PanelAction, PanelCard } from '../widgets/widget-kit';

@Component({
  selector: 'app-page-layout-panel',
  standalone: true,
  imports: [
    ActionWidgetComponent, DialWidgetComponent, GradientWidgetComponent, LevelWidgetComponent, LevelsWidgetComponent,
    LogWidgetComponent, ModeWidgetComponent, NumberWidgetComponent, PickerWidgetComponent, RingWidgetComponent,
    SlideWidgetComponent, StatusWidgetComponent, StepperWidgetComponent, TextWidgetComponent, TileWidgetComponent,
    TimerWidgetComponent, ToggleWidgetComponent, TrendWidgetComponent,
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

  readonly variantOf = variantOf;

  // Visual order, which narrow screens use for automatic placement.
  get ordered(): PanelCard[] {
    return [...this.cards].sort((left, right) =>
      left.widget.grid.y - right.widget.grid.y || left.widget.grid.x - right.widget.grid.x);
  }

  emit(card: PanelCard, act: WidgetAct): void {
    if (this.interactive) this.action.emit({ ...act, field: card.field });
  }
}
