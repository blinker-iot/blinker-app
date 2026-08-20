import {
  TEXT_WIDGET_STYLES,
  normalizeTextWidget,
  normalizeTextWidgetAlignment,
  normalizeTextWidgetFontSize,
} from './widget-text-layout';

describe('text widget layout', () => {
  it('offers only one-row widths', () => {
    expect(TEXT_WIDGET_STYLES).toEqual([
      { cols: 2, rows: 1 },
      { cols: 4, rows: 1 },
      { cols: 6, rows: 1 },
      { cols: 8, rows: 1 },
    ]);
  });

  it.each([
    [{ type: 'tex', lstyle: 2, cols: 2, rows: 2 }, 0, 2],
    [{ type: 'tex', lstyle: 3, cols: 4, rows: 2 }, 1, 4],
    [{ type: 'tex', lstyle: 4, cols: 2, rows: 2 }, 0, 2],
    [{ type: 'tex', lstyle: 5, cols: 8, rows: 1 }, 3, 8],
    [{ type: 'tex', lstyle: 6, cols: 8, rows: 2 }, 3, 8],
  ])('maps legacy text layouts to one row', (widget, lstyle, cols) => {
    expect(normalizeTextWidget(widget)).toMatchObject({
      lstyle,
      cols,
      rows: 1,
      size: 14,
    });
  });

  it('keeps legacy text content and normalizes font sizes', () => {
    expect(
      normalizeTextWidget({
        type: 'tex',
        tex: '旧文本',
        size: '18px',
        cols: 4,
        rows: 2,
      })
    ).toMatchObject({ t0: '旧文本', size: 18, lstyle: 1, rows: 1 });

    expect(normalizeTextWidgetFontSize(undefined)).toBe(14);
    expect(normalizeTextWidgetFontSize(-20)).toBe(10);
    expect(normalizeTextWidgetFontSize(999)).toBe(24);
    expect(normalizeTextWidgetAlignment(undefined)).toBe('left');
    expect(normalizeTextWidgetAlignment('center')).toBe('center');
    expect(normalizeTextWidgetAlignment('right')).toBe('right');
  });

  it('does not alter non-text widgets', () => {
    const button = { type: 'btn', cols: 2, rows: 2 };
    expect(normalizeTextWidget(button)).toBe(button);
  });
});
