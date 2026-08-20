import { LAYOUTER2_PREVIEW_DATA } from './layouter2-preview.data';
import { configList, styleList } from './widgets/config';
import { normalizeWidgetLayout } from './widgets/widget-layout';

describe('debug and chart widget layout options', () => {
  const widgetTypes = ['deb', 'cha'] as const;

  it.each(widgetTypes)('only exposes the 8x4 %s style', (type) => {
    expect(styleList[type]).toEqual([{ cols: 8, rows: 4 }]);
  });

  it.each(widgetTypes)('creates %s with the 8x4 style at index zero', (type) => {
    const widget = Object.assign({}, configList[type], styleList[type][0]);

    expect(widget).toMatchObject({ type, lstyle: 0, cols: 8, rows: 4 });
  });

  it.each(widgetTypes)('previews %s with the 8x4 style at index zero', (type) => {
    const widget = LAYOUTER2_PREVIEW_DATA.dashboard.find(
      (candidate) => candidate['type'] === type
    );

    expect(widget).toMatchObject({ type, lstyle: 0, cols: 8, rows: 4 });
  });

  it.each(widgetTypes)('normalizes legacy 8x3 %s layouts', (type) => {
    expect(
      normalizeWidgetLayout({ type, lstyle: 0, cols: 8, rows: 3 })
    ).toEqual({ type, lstyle: 0, cols: 8, rows: 4 });
  });

  it.each(widgetTypes)('remaps the legacy 8x4 %s style index', (type) => {
    expect(
      normalizeWidgetLayout({ type, lstyle: 1, cols: 8, rows: 4 })
    ).toEqual({ type, lstyle: 0, cols: 8, rows: 4 });
  });
});
