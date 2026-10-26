import { WidgetInspectorComponent } from './widget-inspector';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';

describe('Widget inspector size contract', () => {
  function inspector(grid = { x: 0, y: 0, width: 4, height: 1 }): WidgetInspectorComponent {
    const component = new WidgetInspectorComponent();
    component.widget = { widgetId: 'level', endpointKey: 'level', type: 'slider', variant: 'stepper', grid };
    return component;
  }

  it('shows distinct grid columns, including both full-row compact alternatives', () => {
    const component = inspector();
    expect(component.widths).toEqual([2, 4, 8]);
    expect(component.widths.map(width => component.widthLabel(width))).toEqual(['2 栏', '4 栏 · 窄屏整行', '8 栏 · 窄屏整行']);
  });

  it('does not rewrite a saved legacy grid while opening or reading choices', () => {
    const component = inspector({ x: 1, y: 6, width: 3, height: 5 });
    const original = structuredClone(component.widget);
    const emit = vi.spyOn(component.widgetChange, 'emit');
    void component.widths;
    void component.heights;
    void component.json;
    expect(component.widget).toEqual(original);
    expect(emit).not.toHaveBeenCalled();
  });

  it('fits a legacy dimension only on explicit resize, preserving identity and binding', () => {
    const component = inspector({ x: 1, y: 6, width: 3, height: 5 });
    const emitted: PageLayoutWidget[] = [];
    component.widgetChange.subscribe(widget => emitted.push(widget));
    component.setSize(8, 5);
    expect(emitted[0]).toEqual({
      widgetId: 'level', endpointKey: 'level', type: 'slider', variant: 'stepper',
      grid: { x: 0, y: 6, width: 8, height: 2 },
    });
    expect(component.widget.grid).toEqual({ x: 1, y: 6, width: 3, height: 5 });
  });
});
