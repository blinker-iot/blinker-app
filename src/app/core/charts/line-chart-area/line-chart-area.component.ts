import {
  Component,
  ElementRef,
  Input,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  createChart,
  AreaSeries,
  AreaSeriesPartialOptions,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import { color2Rgba } from '../../functions/func';

@Component({
  standalone: true,
  selector: 'line-chart-area',
  templateUrl: './line-chart-area.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./line-chart-area.component.scss'],
})
export class LineChartAreaComponent {
  @Input() data;
  @Input() color;
  @Input() quickCode = '1h';

  @ViewChild('chart') chartContainer: ElementRef;
  private chart: IChartApi;
  private areaSeries: ISeriesApi<'Area'>;

  ngAfterViewInit(): void {
    this.darwChart();
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.remove();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.areaSeries) return;
    if (changes['data'] || changes['color']) this.updateData();
  }

  darwChart() {
    if (this.chart) {
      this.chart.remove();
    }
    this.chart = createChart(this.chartContainer.nativeElement, {
      width: this.chartContainer.nativeElement.offsetWidth,
      height: this.chartContainer.nativeElement.offsetHeight,
      layout: {
        textColor: 'rgba(0, 0, 0, 0.45)',
        fontSize: 10,
      },
      grid: {
        vertLines: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
        horzLines: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(0, 0, 0, 0.3)',
      },
      rightPriceScale: {
        borderColor: 'rgba(0, 0, 0, 0.3)',
      },
    });
    const areaSeriesOptions: AreaSeriesPartialOptions = {};
    this.areaSeries = this.chart.addSeries(AreaSeries, areaSeriesOptions);
    this.updateData();
  }

  updateData() {
    if (!this.areaSeries) return;
    let dataList = [];
    (this.data ?? []).forEach((item) => {
      let time: UTCTimestamp = Math.floor(
        new Date(item.date).getTime() / 1000
      ) as UTCTimestamp;
      dataList.push({ time, value: item.value });
    });
    const color = this.color || '#389BEE';
    this.areaSeries.applyOptions({
      lineColor: color,
      topColor: color2Rgba(color, 0.6),
      bottomColor: '#fff',
      lineWidth: 2,
    });
    this.areaSeries.setData(dataList);
    if (dataList.length > 0) this.chart.timeScale().fitContent();
  }
}
