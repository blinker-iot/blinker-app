import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';
import { ValueTransitionDirective } from '../value-transition.directive';

// 大块滑块: the whole card is the track; vertical when taller than one row.
@Component({
  selector: 'app-level-widget',
  standalone: true,
  imports: [ValueTransitionDirective, UiIconComponent],
  templateUrl: './level-widget.html',
  styleUrls: ['./level-widget.scss'],
  host: {
    '[class.v]': 'vertical',
    '[class.h]': '!vertical',
    '[class.grad]': 'options.fill === "gradient"',
  },
})
export class LevelWidgetComponent extends RangeWidgetBase {
  get vertical(): boolean {
    return (this.options.orientation ?? (this.rows > 1 ? 'vertical' : 'horizontal')) === 'vertical';
  }

  get percent(): number { return this.level * 100; }

  get marks(): number[] {
    const count = this.options.ticks ?? 0;
    return Array.from({ length: Math.max(0, count - 1) }, (_, index) => (index + 1) / count * 100);
  }

  // Text over the fill switches to the on-accent colour once the fill reaches it.
  inverted(vertical: number, horizontal: number): boolean {
    return this.percent > (this.vertical ? vertical : horizontal);
  }
}
