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
    // animation: false,
    grid: {
      left: 50,
      right: 10,
      top: 10,
      bottom: 35,
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        rotate: 45,
      },
      animation: false,
    },
    yAxis: {
      type: 'value',
      animation: false,
      scale: true
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
  @Input() quickCode = "1h";

  formatter = '{HH}:{mm}';

  constructor() { }

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges) {
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
    if (typeof changes['color'] != 'undefined') {
      setTimeout(() => {
        this.updata()
      }, 10)
    }
    if (typeof changes['quickCode'] != 'undefined') {
      switch (this.quickCode) {
        case 'rt':
          this.formatter = '{mm}:{ss}'
          break;
        case '1h':
          this.formatter = '{HH}:{mm}'
          break;
        case '1d':
          this.formatter = '{HH}:{mm}'
          break;
        case '1w':
          this.formatter = '{M}-{dd}'
          break;
        case '1m':
          this.formatter = '{M}-{dd}'
          break;
        default:
          break;
      }
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

      this.echartsInstance.setOption({
        xAxis: {
          axisLabel: {
            formatter: this.formatter
          }
        },
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
                  color: this.color + '99'
                }
              ])
            },
          }
        ]
      })
    })
  }
}
