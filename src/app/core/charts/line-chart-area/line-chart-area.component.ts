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
  ColorType,
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
  private themeObserver?: MutationObserver;

  ngAfterViewInit(): void {
    this.darwChart();
    this.themeObserver = new MutationObserver(() => this.applyChartTheme());
    // Theme changes may come from the app, a device preference, or a saved panel.
    let ancestor: Element | null = this.chartContainer.nativeElement;
    while (ancestor) {
      this.themeObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'data-device-theme', 'data-interface-style'] });
      ancestor = ancestor.parentElement;
    }
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
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
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
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
    this.applyChartTheme();
    this.updateData();
  }

  private applyChartTheme(): void {
    if (!this.chart) return;
    const style = getComputedStyle(this.chartContainer.nativeElement);
    const text = style.getPropertyValue('--blinker-text-secondary').trim() || '#526780';
    const line = style.getPropertyValue('--blinker-divider').trim() || '#e4ebf4';
    const border = style.getPropertyValue('--blinker-border').trim() || '#d8e2ef';
    this.chart.applyOptions({
      layout: { textColor: text },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      timeScale: { borderColor: border },
      rightPriceScale: { borderColor: border },
    });
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
      bottomColor: color2Rgba(color, 0),
      lineWidth: 2,
    });
    this.areaSeries.setData(dataList);
    if (dataList.length > 0) this.chart.timeScale().fitContent();
  }
}
