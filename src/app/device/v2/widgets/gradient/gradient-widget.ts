import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';
import { formatNumber } from '../widget-kit';

// 色温 / 色彩滑块: a range on a colour-temperature, hue or brightness track.
@Component({
  selector: 'app-gradient-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './gradient-widget.html',
  styleUrls: ['./gradient-widget.scss'],
})
export class GradientWidgetComponent extends RangeWidgetBase {
  get track(): string { return this.options.track ?? 'cct'; }
  get percent(): number { return this.level * 100; }

  // Five evenly spaced labels; the colour-temperature track names its ends.
  get ticks(): string[] {
    const at = (share: number) => formatNumber(this.min + (this.max - this.min) * share, 0) + this.unit;
    const middle = [0.25, 0.5, 0.75].map(at);
    return this.track === 'cct' ? ['暖光', at(0), at(0.5), at(1), '冷光'] : [at(0), ...middle, at(1)];
  }
}
