import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WidgetVideoComponent } from './widget-video/widget-video';
import { WidgetTimerComponent } from './widget-timer/widget-timer';
import { WidgetRangeComponent } from './widget-range/widget-range';
import { WidgetJoystickComponent } from './widget-joystick/widget-joystick';
import { WidgetDebugComponent } from './widget-debug/widget-debug';
import { WidgetColorComponent } from './widget-color/widget-color';
import { WidgetChartComponent } from './widget-chart/widget-chart';
import { WidgetButtonComponent } from './widget-button/widget-button';
import { WidgetNumberComponent } from './widget-number/widget-number';
import { WidgetTextComponent } from './widget-text/widget-text';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { ParentDynamicComponent } from './parentDynamic.component';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { FormsModule } from '@angular/forms';
import { WidgetMapComponent } from './widget-map/widget-map.component';
import { WidgetInputComponent } from './widget-input/widget-input';
import { WidgetImageComponent } from './widget-image/widget-image';
import { ChartsModule } from 'src/app/core/charts/charts.module';
import { WidgetCustomComponent } from './widget-custom/widget-custom';
// import { NgxEchartsModule } from 'ngx-echarts';
import { BToggleComponent } from 'src/app/core/components/b-toggle/b-toggle.component';
import { BlinkerWidgetDirective } from './widget.directive';
import { WidgetSelectComponent } from './widget-select/widget-select';

@NgModule({
  declarations: [
    ParentDynamicComponent,
    WidgetTextComponent,
    WidgetNumberComponent,
    WidgetButtonComponent,
    WidgetChartComponent,
    WidgetColorComponent,
    WidgetDebugComponent,
    WidgetJoystickComponent,
    WidgetRangeComponent,
    WidgetTimerComponent,
    WidgetVideoComponent,
    WidgetMapComponent,
    WidgetInputComponent,
    WidgetImageComponent,
    WidgetCustomComponent,
    BlinkerWidgetDirective,
    WidgetSelectComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    ComponentsModule,
    FormsModule,
    ChartsModule,
    // NgxEchartsModule.forRoot({
    //   echarts: () => import('echarts'),
    // }),
  ],
  exports: [
    WidgetTextComponent,
    WidgetNumberComponent,
    WidgetButtonComponent,
    WidgetChartComponent,
    WidgetColorComponent,
    WidgetDebugComponent,
    WidgetJoystickComponent,
    WidgetRangeComponent,
    WidgetTimerComponent,
    WidgetVideoComponent,
    ParentDynamicComponent,
    WidgetMapComponent,
    WidgetInputComponent,
    WidgetImageComponent,
    WidgetCustomComponent
  ]
})
export class WidgetsModule { }
