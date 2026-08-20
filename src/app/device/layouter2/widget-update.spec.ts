import { LayouterService } from '../layouter.service';
import {
  cloneWidgetDraft,
  commitWidgetDraft,
  replaceDashboardWidget,
} from './widget-update';

describe('Layouter2 widget updates', () => {
  it('keeps editor changes isolated until the draft is committed', () => {
    const sourceWidget = {
      type: 'img',
      lstyle: 0,
      cols: 2,
      rows: 2,
      list: [{ url: 'before.png' }],
    };
    const draft = cloneWidgetDraft(sourceWidget);

    draft.lstyle = 2;
    draft.cols = 4;
    draft.rows = 3;
    draft.list[0].url = 'after.png';

    expect(sourceWidget).toMatchObject({
      lstyle: 0,
      cols: 2,
      rows: 2,
      list: [{ url: 'before.png' }],
    });

    commitWidgetDraft(sourceWidget, draft);
    expect(sourceWidget).toMatchObject({
      lstyle: 2,
      cols: 4,
      rows: 3,
      list: [{ url: 'after.png' }],
    });
  });

  it('replaces only the changed dashboard item reference', () => {
    const unchangedWidget = { type: 'btn', lstyle: 0, cols: 2, rows: 2 };
    const changedWidget = { type: 'tex', lstyle: 1, cols: 4, rows: 1 };
    const dashboard = [unchangedWidget, changedWidget];

    const updatedDashboard = replaceDashboardWidget(
      dashboard,
      changedWidget
    );

    expect(updatedDashboard).toBeDefined();
    expect(updatedDashboard).not.toBe(dashboard);
    expect(updatedDashboard?.[0]).toBe(unchangedWidget);
    expect(updatedDashboard?.[1]).not.toBe(changedWidget);
    expect(updatedDashboard?.[1]).toEqual(changedWidget);
  });

  it('publishes the changed widget through LayouterService', () => {
    const service = new LayouterService();
    const widget = { type: 'tex', lstyle: 1, cols: 4, rows: 1 };
    const actions: any[] = [];
    const subscription = service.action.subscribe((action) =>
      actions.push(action)
    );

    service.changeWidget(widget);

    expect(actions).toEqual([{ name: 'changeWidget', data: widget }]);
    subscription.unsubscribe();
  });
});
