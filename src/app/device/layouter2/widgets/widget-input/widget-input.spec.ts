import { WidgetInputComponent } from './widget-input';

describe('input widget submission', () => {
  it('sends the entered text as an escaped widget payload and ignores blank input', () => {
    const send = vi.fn();
    const input = new WidgetInputComponent({ send } as never);
    input.widget = { key: 'message' };
    input.sendmess = '  ';
    input.send();
    expect(send).not.toHaveBeenCalled();
    input.sendmess = 'hello "device"';
    input.send();
    expect(JSON.parse(send.mock.calls[0][0])).toEqual({ message: 'hello "device"' });
    expect(input.sendmess).toBe('hello "device"');
    input.isDemo = true;
    input.send();
    expect(send).toHaveBeenCalledOnce();
  });
});
