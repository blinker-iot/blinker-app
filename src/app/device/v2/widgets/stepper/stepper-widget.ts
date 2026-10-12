import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';

// 数值步进器: − value +; one row high it becomes a row with the value between the buttons.
@Component({
  selector: 'app-stepper-widget',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './stepper-widget.html',
  styleUrls: ['./stepper-widget.scss'],
  host: { '[class.rowc]': 'rows === 1' },
})
export class StepperWidgetComponent extends RangeWidgetBase {
  get hold(): boolean { return this.options.longPress !== false; }
  get showRange(): boolean { return this.options.showRange !== false; }
}
