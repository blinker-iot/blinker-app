import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LineChartAreaComponent } from './line-chart-area/line-chart-area.component';
import { NgxEchartsModule } from 'ngx-echarts';

@NgModule({
  declarations: [LineChartAreaComponent],
  imports: [
    CommonModule,
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts'),
    })
  ],
  exports: [
    LineChartAreaComponent
  ]
})
export class ChartsModule { }
