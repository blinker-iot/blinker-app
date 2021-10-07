import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { OwnSensorDashboard } from './own-sensor-dashboard/own-sensor-dashboard';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { SensorBlockComponent } from './components/sensor-block/sensor-block.component';
import { SensorChartComponent } from './components/sensor-chart/sensor-chart.component';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    PipesModule
  ],
  declarations: [
    OwnSensorDashboard,SensorBlockComponent,SensorChartComponent
  ],
  exports: [
    OwnSensorDashboard
  ]
})

export class OwnSensorModule { }