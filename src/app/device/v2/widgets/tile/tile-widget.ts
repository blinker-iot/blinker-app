import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { SwitchWidgetBase } from '../switch-base';

// 图标开关卡: the whole card is the switch; one row high it lays out as a bar.
@Component({
  selector: 'app-tile-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './tile-widget.html',
  styleUrls: ['./tile-widget.scss'],
  host: {
    role: 'switch',
    tabindex: '0',
    '[attr.aria-checked]': 'on',
    '[attr.aria-label]': 'title',
    '[attr.data-style]': 'options.activeStyle ?? "fill"',
    '[class.on]': 'on',
    '[class.wide]': 'rows === 1',
    '(click)': 'toggle()',
    '(keydown.enter)': 'toggle()',
    '(keydown.space)': '$event.preventDefault(); toggle()',
  },
})
export class TileWidgetComponent extends SwitchWidgetBase {
  get corner(): string { return this.options.corner ?? 'dot'; }
}
