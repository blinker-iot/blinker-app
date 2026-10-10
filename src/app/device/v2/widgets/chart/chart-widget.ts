import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { DotTextComponent } from '../dot-text/dot-text';
import { ReadingWidgetBase } from '../reading-base';
import { parsePairs } from '../../../../core/device-v2/page-widget';
import { HistoryPoint, numeric, present } from '../widget-kit';
import { LineChartComponent } from './line-chart';

const DEFAULT_POINTS = 30;
const LOG_ROWS = 6;
const STATE_COLORS = ['--ui-accent', '--ui-teal', '--ui-orange', '--ui-purple', '--ui-green', '--ui-red'];
const SEMANTIC_COLORS: Readonly<Record<string, string>> = {
  ok: 'var(--ui-ok)', off: 'var(--ui-off)', warn: 'var(--ui-alert)', info: 'var(--ui-info)',
};

@Component({
  selector: 'app-chart-widget',
  standalone: true,
  imports: [UiIconComponent, DotTextComponent, LineChartComponent, NgTemplateOutlet],
  templateUrl: './chart-widget.html',
  styleUrls: ['./chart-widget.scss'],
})
export class ChartWidgetComponent extends ReadingWidgetBase {
  // Recorded history, or just the current reading when the host keeps none.
  get history(): readonly HistoryPoint[] {
    if (this.card.history?.length) return this.card.history;
    return this.card.value === undefined || this.card.value instanceof Uint8Array
      ? [] : [{ at: Date.now(), value: this.card.value }];
  }

  get series(): number[] {
    const limit = this.options.points ?? DEFAULT_POINTS;
    return this.history.flatMap(point => {
      const value = numeric(point.value);
      return value === undefined ? [] : [value];
    }).slice(-limit);
  }

  get curve(): string { return this.options.curve ?? 'area'; }

  // Sparkline in a 100 x 40 box: straight, smoothed or stepped.
  get trendLine(): string {
    const points = this.normalised(this.series, 4, 36);
    if (!points.length) return '';
    if (this.curve === 'steps') {
      return 'M' + points.map(([x, y], index) => index ? `${x} ${points[index - 1][1]} L${x} ${y}` : `${x} ${y}`).join(' L');
    }
    if (this.options.smooth) return smooth(points);
    return 'M' + points.map(([x, y]) => `${x} ${y}`).join(' L');
  }

  get trendArea(): string {
    const line = this.trendLine;
    return line && this.curve !== 'line' ? `${line} L100 40 L0 40 Z` : '';
  }

  // Extremes of the visible series, shown under the plot.
  get extremes(): { low: string; high: string } | undefined {
    const values = this.series;
    if (!values.length) return undefined;
    const show = (value: number) => present(value, this.options, this.card.field).text;
    return { low: show(Math.min(...values)), high: show(Math.max(...values)) };
  }

  // Bar heights as 0..1 of the visible range, never fully empty.
  get bars(): number[] {
    const values = this.series;
    const low = this.options.min ?? Math.min(...values);
    const high = this.options.max ?? Math.max(...values);
    return values.map(value => 0.08 + 0.92 * (high > low ? (value - low) / (high - low) : 0.5));
  }

  get stats(): { label: string; value: string }[] {
    const values = this.series;
    if (!values.length) return [];
    const show = (value: number) => present(value, this.options, this.card.field);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return [
      { label: '最低', value: show(Math.min(...values)).text },
      { label: '平均', value: show(average).text },
      { label: '最高', value: show(Math.max(...values)).text },
    ];
  }

  // State spans across the recorded window, for booleans, choices or numbers alike.
  get timeline(): { value: string; start: number; width: number; color: string }[] {
    const points = this.history.slice(-(this.options.points ?? 120));
    if (!points.length) return [];
    const start = points[0].at;
    const span = Math.max(1, Date.now() - start);
    const states = [...new Set(points.map(point => this.describe(point.value).text))];
    const semantics = new Map(parsePairs(this.options.states));
    return points.map((point, index) => {
      const end = points[index + 1]?.at ?? Date.now();
      const value = this.describe(point.value).text;
      const semantic = SEMANTIC_COLORS[semantics.get(value) ?? ''];
      return {
        value, start: (point.at - start) / span * 100, width: Math.max(0.6, (end - point.at) / span * 100),
        color: semantic ?? (point.value === false ? 'var(--ui-track)'
          : `var(${STATE_COLORS[states.indexOf(value) % STATE_COLORS.length]})`),
      };
    });
  }

  get legend(): { value: string; color: string }[] {
    const seen = new Map<string, string>();
    for (const span of this.timeline) if (!seen.has(span.value)) seen.set(span.value, span.color);
    return [...seen].map(([value, color]) => ({ value, color }));
  }

  get timeAxis(): { start: string; end: string } {
    const points = this.history.slice(-(this.options.points ?? DEFAULT_POINTS));
    return { start: points[0] ? this.time(points[0].at, false) : '', end: '现在' };
  }

  get windowStart(): string {
    const first = this.history[0];
    return first ? this.time(first.at, false) : '';
  }

  get log(): { time: string; text: string }[] {
    return this.history.slice(-(this.options.points ?? LOG_ROWS)).reverse().map(point => {
      const reading = this.describe(point.value);
      return { time: this.time(point.at, true), text: reading.text + (reading.unit ? ' ' + reading.unit : '') };
    });
  }

  private time(at: number, seconds: boolean): string {
    return new Date(at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
  }

  private normalised(values: number[], top: number, bottom: number): [number, number][] {
    if (!values.length) return [];
    const low = this.options.min ?? Math.min(...values);
    const high = this.options.max ?? Math.max(...values);
    const span = high - low || 1;
    const series = values.length === 1 ? [values[0], values[0]] : values;
    return series.map((value, index) => [
      +(index / (series.length - 1) * 100).toFixed(2),
      +(bottom - (value - low) / span * (bottom - top)).toFixed(2),
    ]);
  }
}

// Catmull-Rom spline through the points, as cubic Béziers.
function smooth(points: [number, number][]): string {
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index - 1] ?? points[index];
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const [x3, y3] = points[index + 2] ?? points[index + 1];
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6].map(value => +value.toFixed(2));
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6].map(value => +value.toFixed(2));
    path += ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`;
  }
  return path;
}
