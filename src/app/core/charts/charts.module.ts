import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LineChartAreaComponent } from './line-chart-area/line-chart-area.component';
// import { NgxEchartsModule } from 'ngx-echarts';
// import * as echarts from 'echarts/core';
// import { SVGRenderer } from 'echarts/renderers';

// echarts.use([SVGRenderer]);

@NgModule({
  imports: [
    CommonModule,
    LineChartAreaComponent
    // NgxEchartsModule.forRoot({
    //   echarts: () => import('echarts'),
    // })
  ],
  exports: [
    LineChartAreaComponent
  ]
})
export class ChartsModule { }
