import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ActionWidgetComponent } from '../widgets/action/action-widget';
import { DialWidgetComponent } from '../widgets/dial/dial-widget';
import { DpadWidgetComponent } from '../widgets/dpad/dpad-widget';
import { GradientWidgetComponent } from '../widgets/gradient/gradient-widget';
import { HoldWidgetComponent } from '../widgets/hold/hold-widget';
import { KeysWidgetComponent } from '../widgets/keys/keys-widget';
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
import { UptimeWidgetComponent } from '../widgets/uptime/uptime-widget';
import { MemoryWidgetComponent } from '../widgets/memory/memory-widget';
import { variantOf, type PanelCard, type WidgetAct } from '../widgets/widget-kit';

@Component({
  selector: 'app-page-widget',
  standalone: true,
  imports: [
    ActionWidgetComponent, DialWidgetComponent, DpadWidgetComponent, GradientWidgetComponent, HoldWidgetComponent,
    KeysWidgetComponent, LevelWidgetComponent, LevelsWidgetComponent, LogWidgetComponent, ModeWidgetComponent,
    NumberWidgetComponent, PickerWidgetComponent, RingWidgetComponent, SlideWidgetComponent, StatusWidgetComponent,
    StepperWidgetComponent, TextWidgetComponent, TileWidgetComponent, TimerWidgetComponent, ToggleWidgetComponent,
    TrendWidgetComponent, UptimeWidgetComponent, MemoryWidgetComponent,
  ],
  templateUrl: './page-widget.html',
  styles: [':host { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }'],
  host: { '[attr.inert]': 'interactive ? null : ""' },
})

export class PageWidgetComponent {
  @Input({ required: true }) card!: PanelCard;
  @Input() interactive = false;
  @Output() action = new EventEmitter<WidgetAct>();

  readonly variantOf = variantOf;

  emit(act: WidgetAct): void {
    if (this.interactive) this.action.emit(act);
  }
}
