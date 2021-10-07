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
import { WidgetTabComponent } from './widget-tab/widget-tab.component';
import { WidgetInputComponent } from './widget-input/widget-input';
import { WidgetImageComponent } from './widget-image/widget-image';
import { ChartsModule } from 'src/app/core/charts/charts.module';

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
    WidgetTabComponent,
    WidgetInputComponent,
    WidgetImageComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    ComponentsModule,
    FormsModule,
    ChartsModule
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
    WidgetTabComponent,
    WidgetInputComponent,
    WidgetImageComponent
  ]
})
export class WidgetsModule { }
