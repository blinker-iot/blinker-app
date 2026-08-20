import { LAYOUTER2_PREVIEW_DATA } from './layouter2-preview.data';
import { configList, styleList } from './widgets/config';

describe('weather and air widget layout options', () => {
  const widgetTypes = ['wea', 'air'] as const;

  it.each(widgetTypes)('only exposes the 8x3 %s style', (type) => {
    expect(styleList[type]).toEqual([{ cols: 8, rows: 3 }]);
  });

  it.each(widgetTypes)('creates %s with the tall style at index zero', (type) => {
    const widget = Object.assign({}, configList[type], styleList[type][0]);

    expect(widget).toMatchObject({ type, lstyle: 0, cols: 8, rows: 3 });
  });

  it.each(widgetTypes)('previews %s with the tall style at index zero', (type) => {
    const widget = LAYOUTER2_PREVIEW_DATA.dashboard.find(
      (candidate) => candidate['type'] === type
    );

    expect(widget).toMatchObject({ type, lstyle: 0, cols: 8, rows: 3 });
  });
});
