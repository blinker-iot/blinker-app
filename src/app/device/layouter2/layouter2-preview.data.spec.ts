import {
  LAYOUTER2_PREVIEW_DATA,
  LAYOUTER2_PREVIEW_DEVICE_DATA,
} from './layouter2-preview.data';
import { widgetList } from './widgets/config';

describe('Layouter2 preview data', () => {
  it('contains at least one widget for every type available in the editor', () => {
    const previewTypes = new Set(
      LAYOUTER2_PREVIEW_DATA.dashboard.map((widget) => widget['type']),
    );

    expect(
      widgetList
        .map((widget) => widget.type)
        .filter((type) => !previewTypes.has(type)),
    ).toEqual([]);
  });

  it('provides fresh cached series for the chart preview', () => {
    const latestTemperaturePoint =
      LAYOUTER2_PREVIEW_DEVICE_DATA.history.temperature['1h'].at(-1);

    expect(latestTemperaturePoint?.value).toBe(26.4);
    expect(Date.now() / 1000 - latestTemperaturePoint!.date).toBeLessThan(300);
  });

  it('uses the single-line text widget configuration', () => {
    const textWidgets = LAYOUTER2_PREVIEW_DATA.dashboard.filter(
      (widget) => widget['type'] === 'tex'
    );

    expect(textWidgets).toHaveLength(1);
    expect(textWidgets[0]).toMatchObject({
      lstyle: 3,
      cols: 8,
      rows: 1,
      size: 14,
      align: 'left',
    });
    expect(textWidgets[0]).not.toHaveProperty('t1');
    expect(textWidgets[0]).not.toHaveProperty('ico');
    expect(textWidgets[0]).not.toHaveProperty('clr');
    expect(LAYOUTER2_PREVIEW_DEVICE_DATA.welcome).not.toHaveProperty('tex1');
  });
});
