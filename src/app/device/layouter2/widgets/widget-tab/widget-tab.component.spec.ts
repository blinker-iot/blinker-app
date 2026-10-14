import { WidgetTabComponent } from './widget-tab.component';

describe('tab widget state', () => {
  it('shows confirmed scalar and object states and preserves the other selections', () => {
    const send = vi.fn();
    const tabs = new WidgetTabComponent({ send } as never);
    tabs.widget = { key: 'modes' };
    tabs.device = { data: { modes: '01000' } };
    expect(tabs.val1).toBe(true);
    tabs.selectTab(0);
    expect(JSON.parse(send.mock.calls[0][0])).toEqual({ modes: '11000' });
    tabs.device.data.modes = { val: '11000' };
    expect(tabs.val).toBe(true);
    expect(tabs.val1).toBe(true);
    expect(tabs.val2).toBe(false);
  });
});
