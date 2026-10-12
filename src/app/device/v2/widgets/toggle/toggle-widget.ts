import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { SwitchWidgetBase } from '../switch-base';

// 胶囊开关行: icon, title and caption with a pill switch at the end.
@Component({
  selector: 'app-toggle-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './toggle-widget.html',
  styleUrls: ['./toggle-widget.scss'],
})
export class ToggleWidgetComponent extends SwitchWidgetBase {
  get iconStyle(): string { return this.options.iconStyle ?? 'circle'; }
  get caption(): string { return this.armed() ? this.state : this.options.caption ?? ''; }
}
