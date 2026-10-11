import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { TELEMETRY_CHART_MAX_POINTS, TelemetryChartPoint } from './telemetry-presentation';

interface ChartCoordinates {
  paths: string[];
  dots: Array<{ x: number; y: number }>;
  rangeLabel: string;
  durationLabel: string;
}

/** Small live curve: fixed memory, relative arrival time, explicit sequence gaps. */
export function telemetryChartCoordinates(points: readonly TelemetryChartPoint[]): ChartCoordinates {
  const bounded = points.slice(-TELEMETRY_CHART_MAX_POINTS);
  const valid = bounded.filter(point => Number.isFinite(point.value)
    && Number.isFinite(point.receivedMonotonicMs) && point.receivedMonotonicMs >= 0);
  if (!valid.length) return { paths: [], dots: [], rangeLabel: '', durationLabel: '' };
  const first = valid[0].receivedMonotonicMs;
  const last = valid[valid.length - 1].receivedMonotonicMs;
  const min = Math.min(...valid.map(point => point.value));
  const max = Math.max(...valid.map(point => point.value));
  // Normalize before subtracting; finite opposite extrema must not overflow.
  const magnitude = Math.max(Math.abs(min), Math.abs(max), 1);
  const low = min / magnitude;
  const high = max / magnitude;
  const spread = high - low;
  const paths: string[] = [];
  const dots: Array<{ x: number; y: number }> = [];
  let path = '';
  let previous: TelemetryChartPoint | undefined;
  for (const point of bounded) {
    if (!Number.isFinite(point.value) || !Number.isFinite(point.receivedMonotonicMs)
      || point.receivedMonotonicMs < 0 || previous && point.receivedMonotonicMs < previous.receivedMonotonicMs) {
      if (path) paths.push(path);
      path = '';
      continue;
    }
    if (point.breakBefore && path) {
      paths.push(path);
      path = '';
    }
    const x = last > first ? 4 + ((point.receivedMonotonicMs - first) / (last - first)) * 312 : 160;
    const y = spread > 0 ? 84 - ((point.value / magnitude - low) / spread) * 76 : 46;
    const location = `${x.toFixed(2)},${y.toFixed(2)}`;
    path += `${path ? ' L' : 'M'}${location}`;
    dots.push({ x, y });
    previous = point;
  }
  if (path) paths.push(path);
  const format = (value: number) => value.toLocaleString('zh-CN', { maximumSignificantDigits: 6 });
  return {
    paths,
    dots,
    rangeLabel: min === max ? format(min) : `${format(min)} ～ ${format(max)}`,
    durationLabel: `最近 ${Math.max(0, (last - first) / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 秒 · ${dots.length} 点`,
  };
}

@Component({
  selector: 'app-telemetry-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure>
      <svg viewBox="0 0 320 92" role="img" [attr.aria-label]="label + '，按本机相对接收时间'">
        @for (path of chart.paths; track $index) {
          <path [attr.d]="path" />
        }
        @for (dot of chart.dots; track $index) {
          <circle [attr.cx]="dot.x" [attr.cy]="dot.y" r="1.5" />
        }
      </svg>
      <figcaption><span>{{ chart.rangeLabel }}{{ unit ? ' ' + unit : '' }}</span><span>{{ chart.durationLabel }}</span></figcaption>
    </figure>
  `,
  styles: [`
    :host { display: block; grid-column: 1 / -1; width: 100%; min-width: 0; }
    figure { margin: 0; }
    svg { display: block; width: 100%; max-height: 120px; color: var(--ion-color-primary, #3880ff); }
    path { fill: none; stroke: currentColor; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    circle { fill: currentColor; }
    figcaption { display: flex; justify-content: space-between; gap: 8px; color: var(--blinker-text-secondary); font-size: 10px; }
  `],
})
export class TelemetryChartComponent implements OnChanges {
  @Input() points: readonly TelemetryChartPoint[] = [];
  @Input() label = '实时变化';
  @Input() unit = '';
  chart = telemetryChartCoordinates([]);

  ngOnChanges(): void {
    this.chart = telemetryChartCoordinates(this.points);
  }
}
