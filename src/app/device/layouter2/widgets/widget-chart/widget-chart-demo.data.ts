export interface WidgetChartDataPoint {
  date: Date;
  value: number;
}

const DEMO_POINT_INTERVAL_MS = 5 * 60 * 1000;
const DEMO_VALUES = [
  24,
  28,
  26,
  34,
  31,
  39,
  36,
  45,
  42,
  51,
  47,
  56,
];

export function createWidgetChartDemoData(
  now = Date.now()
): WidgetChartDataPoint[] {
  return DEMO_VALUES.map((value, index) => ({
    date: new Date(
      now - (DEMO_VALUES.length - index - 1) * DEMO_POINT_INTERVAL_MS
    ),
    value,
  }));
}
