import { Component } from '@angular/core';

import { parseList } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { ValueTransitionDirective } from '../value-transition.directive';
import { RangeWidgetBase } from '../range-base';

const MAX_LEVELS = 12;

// 档位选择: each step of a small integer range is a level; a range starting at 0 has 0 as "off".
@Component({
  selector: 'app-levels-widget',
  standalone: true,
  imports: [ValueTransitionDirective, UiIconComponent],
  templateUrl: './levels-widget.html',
  styleUrls: ['./levels-widget.scss'],
  host: { '[class.rowc]': 'rows === 1' },
})
export class LevelsWidgetComponent extends RangeWidgetBase {
  get style(): string { return this.options.style ?? 'bars'; }
  get hasOff(): boolean { return this.min === 0; }

  get levels(): number[] {
    const count = Math.min(MAX_LEVELS, Math.floor((this.max - this.min) / this.step) + 1);
    const values = Array.from({ length: count }, (_, index) => this.min + index * this.step);
    return this.hasOff ? values.slice(1) : values;
  }

  // 1-based position of the current value; 0 is off.
  get current(): number { return this.levels.indexOf(this.value) + 1; }

  name(level: number): string {
    return parseList(this.options.labels)[level - 1] || `${level} 档`;
  }

  get currentName(): string { return this.current ? this.name(this.current) : '已关闭'; }

  set(level: number): void {
    if (this.options.allowOff && this.hasOff && level === this.current) this.commit(this.min);
    else this.commit(this.levels[level - 1]);
  }

  height(level: number): number { return 28 + 72 * level / this.levels.length; }
}
