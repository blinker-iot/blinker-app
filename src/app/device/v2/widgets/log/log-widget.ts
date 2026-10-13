import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { ValueTransitionDirective } from '../value-transition.directive';
import { ReadingWidgetBase } from '../reading-base';

const DEFAULT_ROWS = 5;

// 事件记录: the latest readings or events, newest first, with their time.
@Component({
  selector: 'app-log-widget',
  standalone: true,
  imports: [ValueTransitionDirective, UiIconComponent],
  templateUrl: './log-widget.html',
  styleUrls: ['./log-widget.scss'],
})
export class LogWidgetComponent extends ReadingWidgetBase {
  get entries(): { time: string; text: string }[] {
    return (this.card.history ?? []).slice(-(this.options.points ?? DEFAULT_ROWS)).reverse().map(point => {
      const reading = this.describe(point.value);
      const time = new Date(point.at).toLocaleTimeString('zh-CN', { hour12: false });
      return { time, text: reading.text + (reading.unit ? ' ' + reading.unit : '') };
    });
  }
}
