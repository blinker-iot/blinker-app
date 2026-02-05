import { Component, ElementRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Layouter2Service } from '../layouter2.service';
import { WidgetTextComponent } from './widget-text/widget-text';
import { WidgetNumberComponent } from './widget-number/widget-number';
import { WidgetButtonComponent } from './widget-button/widget-button';
import { WidgetRangeComponent } from './widget-range/widget-range';
import { WidgetTimerComponent } from './widget-timer/widget-timer';
import { WidgetColorComponent } from './widget-color/widget-color';
import { WidgetDebugComponent } from './widget-debug/widget-debug';
import { WidgetJoystickComponent } from './widget-joystick/widget-joystick';
import { WidgetChartComponent } from './widget-chart/widget-chart';
import { WidgetMapComponent } from './widget-map/widget-map.component';
import { WidgetInputComponent } from './widget-input/widget-input';
import { WidgetVideoComponent } from './widget-video/widget-video';
import { WidgetSelectComponent } from './widget-select/widget-select';
import { WidgetCustomComponent } from './widget-custom/widget-custom';

@Component({
    selector: 'widget-dynamic',
    templateUrl: './parentDynamic.component.html',
    styleUrls: ['parentDynamic.component.scss'],
    imports: [
        CommonModule,
        WidgetTextComponent,
        WidgetNumberComponent,
        WidgetButtonComponent,
        WidgetRangeComponent,
        WidgetTimerComponent,
        WidgetColorComponent,
        WidgetDebugComponent,
        WidgetJoystickComponent,
        WidgetChartComponent,
        WidgetMapComponent,
        WidgetInputComponent,
        WidgetVideoComponent,
        WidgetSelectComponent,
        WidgetCustomComponent
    ]
})
export class ParentDynamicComponent {
  @Input()
  widget;
  @Input()
  device;

  public get mode() {
    return this.layouterService.mode
  }

  get color() {
    return this.widget.clr
  }

  constructor(
    private layouterService: Layouter2Service,
    private el: ElementRef
  ) { }

  select() {
    this.layouterService.selectWidget(this.widget, this.el.nativeElement)
  }

}