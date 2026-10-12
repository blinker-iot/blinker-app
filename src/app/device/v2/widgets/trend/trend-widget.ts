import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';
import { HistoryPoint, numeric, present } from '../widget-kit';

const DEFAULT_POINTS = 24;

// 趋势曲线: recent readings as a line, area, bars or steps. Electronic draws
// the same series as dot columns; both are rendered and CSS picks one.
@Component({
  selector: 'app-trend-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './trend-widget.html',
  styleUrls: ['./trend-widget.scss'],
})
export class TrendWidgetComponent extends ReadingWidgetBase {
  get chart(): string { return this.options.chart ?? 'area'; }

  // Recorded history, or just the current reading when the host keeps none.
  get recent(): readonly HistoryPoint[] {
    const history = this.card.history?.length ? this.card.history
      : this.card.value === undefined ? [] : [{ at: Date.now(), value: this.card.value }];
    return history.filter(point => numeric(point.value) !== undefined).slice(-(this.options.points ?? DEFAULT_POINTS));
  }

  get series(): number[] {
    const values = this.recent.map(point => numeric(point.value)!);
    return values.length === 1 ? [values[0], values[0]] : values;
  }

  private get bounds(): { low: number; span: number } {
    const low = Math.min(...this.series);
    return { low, span: Math.max(...this.series) - low || 1 };
  }

  // Plot points in a 300 x 100 box.
  get points(): [number, number][] {
    const { low, span } = this.bounds;
    const count = this.series.length;
    return this.series.map((value, index) => [index / (count - 1) * 300, 90 - (value - low) / span * 78]);
  }

  get line(): string {
    const points = this.points;
    if (!points.length) return '';
    if (this.chart === 'steps') return points.reduce((path, [x, y], index) => index ? `${path}H${x}V${y}` : `M${x},${y}`, '');
    if (this.options.smooth !== false) return smooth(points);
    return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`).join('');
  }

  get bars(): { x: number; y: number; width: number; height: number }[] {
    const { low, span } = this.bounds;
    const width = 300 / this.series.length;
    return this.series.map((value, index) => {
      const height = 10 + (value - low) / span * 80;
      return { x: index * width + width * 0.2, y: 100 - height, width: width * 0.6, height };
    });
  }

  get end(): [number, number] | undefined { return this.points.at(-1); }

  // Dot columns for the electronic theme, 14–100% high.
  get columns(): number[] {
    const { low, span } = this.bounds;
    return this.series.map(value => 14 + (value - low) / span * 86);
  }

  get range(): string {
    if (!this.series.length) return '';
    const show = (value: number) => present(value, this.options, this.card.field).text;
    return `最低 ${show(Math.min(...this.series))} · 最高 ${show(Math.max(...this.series))}`;
  }

  get since(): string {
    const first = this.recent[0];
    return first ? new Date(first.at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
  }
}

// Catmull-Rom spline through the points, as cubic Béziers.
function smooth(points: [number, number][]): string {
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    path += `C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} `
      + `${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return path;
}
