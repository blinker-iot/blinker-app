import { TestBed } from '@angular/core/testing';
import { describe, expect, it, afterEach } from 'vitest';
import { TelemetryChartComponent, telemetryChartCoordinates } from './telemetry-chart.component';
import { TelemetryChartPoint } from './telemetry-presentation';

function point(time: number, value = 24, breakBefore = false): TelemetryChartPoint {
  return { receivedMonotonicMs: time, value, breakBefore };
}

describe('bounded relative-time telemetry chart', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows an empty chart rather than fabricated initial samples', () => {
    expect(telemetryChartCoordinates([])).toEqual({ paths: [], dots: [], rangeLabel: '', durationLabel: '' });
  });

  it('separates sequence gaps instead of drawing a continuous line', () => {
    const chart = telemetryChartCoordinates([point(100, 20), point(1100, 22),
      point(4100, 24, true), point(5100, 23)]);
    expect(chart.paths).toHaveLength(2);
    expect(chart.paths[0]).toBe('M4.00,84.00 L66.40,46.00');
    expect(chart.paths[1]).toBe('M253.60,8.00 L316.00,27.00');
    expect(chart.durationLabel).toBe('最近 5 秒 · 4 点');
    expect(chart.rangeLabel).toBe('20 ～ 24');
  });

  it('bounds rendering at 300 points and preserves single/constant samples', () => {
    const chart = telemetryChartCoordinates(Array.from({ length: 305 }, (_, index) => point(index * 1000)));
    expect(chart.dots).toHaveLength(300);
    expect(chart.durationLabel).toBe('最近 299 秒 · 300 点');
    expect(chart.paths[0]).not.toContain('NaN');
    expect(telemetryChartCoordinates([point(100)]).dots).toEqual([{ x: 160, y: 46 }]);
  });

  it('rejects non-finite values and breaks the line around invalid points', () => {
    const chart = telemetryChartCoordinates([point(0, 20), point(1000, Infinity), point(2000, 24)]);
    expect(chart.paths).toHaveLength(2);
    expect(chart.dots).toHaveLength(2);
    expect(chart.paths.join('')).not.toContain('Infinity');
  });

  it('normalizes opposite finite extrema without overflow', () => {
    const chart = telemetryChartCoordinates([point(0, -Number.MAX_VALUE), point(1000, Number.MAX_VALUE)]);
    expect(chart.paths).toEqual(['M4.00,84.00 L316.00,8.00']);
  });

  it('renders an accessible live SVG with relative time, values and units', async () => {
    await TestBed.configureTestingModule({ imports: [TelemetryChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TelemetryChartComponent);
    fixture.componentRef.setInput('points', [point(0, 20), point(1000, 22)]);
    fixture.componentRef.setInput('label', '温度实时变化');
    fixture.componentRef.setInput('unit', '°C');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('svg')?.getAttribute('aria-label')).toBe('温度实时变化，按本机相对接收时间');
    expect(root.querySelectorAll('path')).toHaveLength(1);
    expect(root.querySelectorAll('circle')).toHaveLength(2);
    expect(root.querySelector('figcaption')?.textContent).toContain('20 ～ 22 °C');
    expect(root.querySelector('figcaption')?.textContent).toContain('最近 1 秒 · 2 点');
    fixture.destroy();
  });
});
