import { WidgetRangeComponent } from './widget-range';

describe('range widget step controls', () => {
  function harness(value?: unknown) {
    const send = vi.fn();
    const range = new WidgetRangeComponent({ send } as never);
    range.widget = { key: 'level', min: 10, max: 12 };
    range.device = { data: { level: { val: value } } };
    return { range, send };
  }

  it('starts within a nonzero range and stops sending at the boundaries', () => {
    const { range, send } = harness();
    range.jia();
    expect(range.value).toBe(11);
    range.jia(); range.jia();
    expect(range.value).toBe(12);
    expect(send).toHaveBeenCalledTimes(2);
    range.jian(); range.jian(); range.jian();
    expect(range.value).toBe(10);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('normalizes numeric strings and malformed values before stepping', () => {
    const { range } = harness('11');
    range.jia();
    expect(range.value).toBe(12);
    range.value = 'invalid';
    range.jia();
    expect(range.value).toBe(11);
  });

  it('does not send from previews or invalid ranges', () => {
    const { range, send } = harness(11);
    range.isDemo = true;
    range.jia();
    expect(send).not.toHaveBeenCalled();
    range.isDemo = false;
    range.widget.max = 5;
    range.jian();
    expect(send).not.toHaveBeenCalled();
  });
});
