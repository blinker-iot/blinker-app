import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { OwnSensorDashboard } from './own-sensor-dashboard/own-sensor-dashboard';
import { TimerComponentsModule } from 'src/app/sections/timer/components/timer-components.module';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { SensorBlockComponent } from './components/sensor-block/sensor-block.component';
import { SensorChartComponent } from './components/sensor-chart/sensor-chart.component';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    TimerComponentsModule,
    PipesModule
  ],
  declarations: [
    OwnSensorDashboard,SensorBlockComponent,SensorChartComponent
  ],
  exports: [
    OwnSensorDashboard
  ],
  entryComponents: [
    OwnSensorDashboard
  ]
})

export class OwnSensorModule { }