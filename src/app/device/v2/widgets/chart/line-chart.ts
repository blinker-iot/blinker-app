import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import {
  AreaSeries, ColorType, createChart, IChartApi, ISeriesApi, LineStyle, UTCTimestamp,
} from 'lightweight-charts';

import type { HistoryPoint } from '../widget-kit';
import { numeric } from '../widget-kit';

// Time-axis chart of numeric history. Colours follow the ui-theme tokens; the
// electronic theme (dotted controls) draws a dotted line without area fill.
@Component({
  selector: 'app-line-chart',
  standalone: true,
  template: '<div #canvas class="canvas"></div>',
  styles: [':host { display: block; } .canvas { width: 100%; height: 100%; min-height: 140px; }'],
})
export class LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() points: readonly HistoryPoint[] = [];
  @Input() decimals?: number;

  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLElement>;

  private chart?: IChartApi;
  private series?: ISeriesApi<'Area'>;
  private observer?: MutationObserver;
  private drawn?: HistoryPoint;
  private palette = '';

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.chart = createChart(this.canvas.nativeElement, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, fontSize: 10, attributionLogo: false },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScale: false,
      handleScroll: false,
    });
    this.series = this.chart.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false });

    // Theme or accent changes arrive as attribute changes on an ancestor.
    this.observer = new MutationObserver(() => this.applyTheme());
    for (let node: HTMLElement | null = this.host.nativeElement; node; node = node.parentElement) {
      this.observer.observe(node, { attributes: true, attributeFilter: ['data-ui-theme', 'style'] });
    }
    this.applyTheme();
    this.applyData();
  }

  ngOnChanges(): void {
    this.applyData();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.chart?.remove();
  }

  private applyData(): void {
    if (!this.series) return;
    const last = this.points[this.points.length - 1];
    if (last === this.drawn) return;
    this.drawn = last;

    // One point per second; later readings replace earlier ones in the same second.
    const bySecond = new Map<number, number>();
    for (const point of this.points) {
      const value = numeric(point.value);
      if (value !== undefined) bySecond.set(Math.floor(point.at / 1000), value);
    }
    this.series.setData([...bySecond].map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    this.series.applyOptions({ priceFormat: { type: 'price', precision: this.decimals ?? 1, minMove: 10 ** -(this.decimals ?? 1) } });
    this.chart?.timeScale().fitContent();
  }

  private applyTheme(): void {
    if (!this.chart || !this.series) return;
    const style = getComputedStyle(this.host.nativeElement);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const accent = token('--ui-accent');
    const muted = token('--ui-muted');
    const line = token('--ui-line');
    const dotted = token('--ui-control-edge') === 'dotted';
    const palette = [accent, muted, line, dotted].join();
    if (!accent || palette === this.palette) return;
    this.palette = palette;

    this.chart.applyOptions({
      layout: { textColor: muted, fontFamily: token('--ui-font-num') || undefined },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: line, style: dotted ? LineStyle.SparseDotted : LineStyle.Solid },
      },
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    this.series.applyOptions({
      lineColor: accent,
      lineStyle: dotted ? LineStyle.Dotted : LineStyle.Solid,
      lineWidth: dotted ? 3 : 2,
      topColor: dotted ? 'transparent' : withAlpha(accent, 0.28),
      bottomColor: 'transparent',
    });
  }
}

// The chart library parses colours itself, so tokens are converted to rgba here.
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return 'transparent';
  const [red, green, blue] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
