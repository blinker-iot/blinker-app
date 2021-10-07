import { Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { EChartsOption } from 'echarts';
import * as echarts from 'echarts';
import { BehaviorSubject } from 'rxjs';

@Component({
  selector: 'line-chart-area',
  templateUrl: './line-chart-area.component.html',
  styleUrls: ['./line-chart-area.component.scss']
})
export class LineChartAreaComponent implements OnInit {
  echartsInstance;
  chartOption: EChartsOption = {
    grid: {
      left: 50,
      right: 10,
      top: 15,
      bottom: 35,
    },
    xAxis: {
      type: 'time',
      // boundaryGap: false,
      axisTick: {
        // length:50
      },
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      // show: false
    },
    dataZoom: {
      type: 'inside'
    },
    tooltip: {
      show: true,
      trigger: 'axis'
    },
    series: [
      {
        data: [],
        type: 'line',
        smooth: true,
        lineStyle: {
          width: 0
        },
        showSymbol: false,
        areaStyle: {}
      },
    ],
  };

  loaded = new BehaviorSubject(false)

  @Input() data;
  @Input() color;

  constructor() { }

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges) {
    if (typeof changes['color'] != 'undefined') {
      console.log(this.color);
    }
    if (typeof changes['data'] != 'undefined') {
      let subscription = this.loaded.subscribe(result => {
        if (result) {
          setTimeout(() => {
            this.updata()
            subscription.unsubscribe()
          }, 10)
        }
      })
    }
  }

  onChartInit(ec) {
    this.echartsInstance = ec;
    this.loaded.next(true)
  }

  updata() {
    let dataList = [];
    this.data.forEach(item => {
      let time = new Date(item.date)
      dataList.push([time, item.value])
      // console.log(dataList);

      this.echartsInstance.setOption({
        series: [
          {
            data: dataList,
            areaStyle: {
              opacity: 0.8,
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                {
                  offset: 0,
                  color: this.color
                },
                {
                  offset: 0.8,
                  color: this.color+'99'
                }
              ])
            },
          }
        ]
      })
    })
  }
}
