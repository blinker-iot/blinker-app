import { TestBed } from '@angular/core/testing';
import { DialWidgetComponent } from './dial/dial-widget';
import { PickerWidgetComponent } from './picker/picker-widget';
import { rgbOfHsl, type PanelCard } from './widget-kit';

describe('UI3 picker and dial touch presentation keeps the original command contract', () => {
  function card(kind: 'picker' | 'dial'): PanelCard {
    return {
      widget: {
        widgetId: `saved-${kind}`, endpointKey: kind, type: kind === 'picker' ? 'color' : 'slider',
        variant: kind, title: '保留的部件', grid: { x: 4, y: 2, width: 4, height: kind === 'picker' ? 2 : 3 },
        options: kind === 'picker' ? { mode: 'both', palette: '#FF0000,invalid,#00FF00,#123456', showHex: true }
          : { sweep: 270, thickness: 12, showButtons: true, showTicks: true },
      },
      field: { id: 1, key: kind, role: 'property', valueType: 'integer', readable: true,
        writable: true, notifies: true, minimum: 10, maximum: 90, step: 5 },
      value: kind === 'picker' ? 0xff0000 : 50, display: '', draft: '', error: '', disabled: false,
    };
  }

  function pointer(target: Element, x: number, y: number, pointerId = 7): PointerEvent {
    return { currentTarget: target, clientX: x, clientY: y, pointerId } as unknown as PointerEvent;
  }

  function geometry(target: Element, width: number, height: number): DOMRect {
    const box = new DOMRect(17, 23, width, height);
    target.getBoundingClientRect = () => box;
    target.setPointerCapture = vi.fn();
    return box;
  }

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [PickerWidgetComponent, DialWidgetComponent] }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps valid palette order, selected colour and the original pick action without writing layout', () => {
    const fixture = TestBed.createComponent(PickerWidgetComponent);
    const input = card('picker');
    const original = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const buttons = [...fixture.nativeElement.querySelectorAll('.swc')] as HTMLButtonElement[];
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['#FF0000', '#00FF00', '#123456']);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    buttons[0].click();
    expect(action).not.toHaveBeenCalled();
    buttons[1].click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 0x00ff00 });
    expect(input).toEqual(original);
  });

  it.each(['wheel', 'both', 'swatches'] as const)('retains the %s picker appearance and saved options', mode => {
    const fixture = TestBed.createComponent(PickerWidgetComponent);
    const input = card('picker');
    input.widget.options = { ...input.widget.options, mode };
    const original = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    expect(!!fixture.nativeElement.querySelector('.cw-box')).toBe(mode !== 'swatches');
    expect(!!fixture.nativeElement.querySelector('.sws')).toBe(mode !== 'wheel');
    expect(!!fixture.nativeElement.querySelector('.sws.big')).toBe(mode === 'swatches');
    expect(input).toEqual(original);
  });

  it.each([100, 200])('preserves picker hue coordinates in the %ipx square and emits once on release', size => {
    const fixture = TestBed.createComponent(PickerWidgetComponent);
    const input = card('picker');
    const original = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const target: Element = fixture.nativeElement.querySelector('.cw-box');
    const box = geometry(target, size, size);
    const action = vi.fn();
    component.act.subscribe(action);
    component.turnStart(pointer(target, box.left + size / 2, box.top));
    expect(component.local()).toBe(rgbOfHsl(0, 88, 58));
    component.turnMove(pointer(target, box.right, box.top + size / 2, 8));
    expect(component.local()).toBe(rgbOfHsl(0, 88, 58));
    component.turnMove(pointer(target, box.right, box.top + size / 2));
    expect(component.local()).toBe(rgbOfHsl(90, 88, 58));
    expect(action).not.toHaveBeenCalled();
    component.turnEnd(pointer(target, box.right, box.top + size / 2));
    component.turnEnd(pointer(target, box.right, box.top + size / 2));
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: rgbOfHsl(90, 88, 58) });
    expect(input).toEqual(original);
  });

  it('keeps picker keyboard hue steps and disabled pointer, palette and keyboard boundaries', () => {
    const fixture = TestBed.createComponent(PickerWidgetComponent);
    const input = card('picker');
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const action = vi.fn();
    component.act.subscribe(action);
    component.key(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: rgbOfHsl(10, 88, 58) });
    fixture.componentRef.setInput('card', { ...input, disabled: true });
    fixture.detectChanges();
    action.mockClear();
    const target: Element = fixture.nativeElement.querySelector('.cw-box');
    geometry(target, 100, 100);
    component.turnStart(pointer(target, 117, 73));
    component.pick('#00FF00');
    component.key(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(target.setPointerCapture).not.toHaveBeenCalled();
    expect(target.getAttribute('aria-disabled')).toBe('true');
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect([...fixture.nativeElement.querySelectorAll('button')].every((button: unknown) =>
      (button as HTMLButtonElement).disabled)).toBe(true);
    expect(component.local()).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it.each([
    [240, 1], [240, 2], [270, 1], [270, 2], [300, 1], [300, 2],
  ])('preserves dial centre, sweep %i and scale %i through preview and release', (sweep, scale) => {
    const fixture = TestBed.createComponent(DialWidgetComponent);
    const input = card('dial');
    input.widget.options = { ...input.widget.options, sweep };
    const original = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const target: Element = fixture.nativeElement.querySelector('.dl-svg');
    const box = geometry(target, 220 * scale, component.viewHeight * scale);
    const at = (degrees: number, pointerId = 7) => {
      const radians = degrees * Math.PI / 180;
      return pointer(target, box.left + (110 + 84 * Math.sin(radians)) * scale,
        box.top + (110 - 84 * Math.cos(radians)) * scale, pointerId);
    };
    const action = vi.fn();
    component.act.subscribe(action);
    component.turnStart(at(-sweep / 2));
    expect(component.value).toBe(10);
    component.turnMove(at(sweep / 2, 8));
    expect(component.value).toBe(10);
    component.turnMove(at(0));
    expect(component.value).toBe(50);
    component.turnMove(at(sweep / 2));
    expect(component.value).toBe(90);
    expect(action).not.toHaveBeenCalled();
    component.turnEnd(at(sweep / 2));
    component.turnEnd(at(sweep / 2));
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 90 });
    expect(target.getAttribute('viewBox')).toBe(`0 0 220 ${component.viewHeight}`);
    expect(input).toEqual(original);
  });

  it('keeps dial press-and-hold local until release and cancels the repeat timer', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(DialWidgetComponent);
    const input = card('dial');
    const original = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const target: Element = fixture.nativeElement.querySelector('.dl-btns button:last-child');
    geometry(target, 48, 48);
    const action = vi.fn();
    component.act.subscribe(action);
    component.repeatStart(pointer(target, 41, 47), 1);
    expect(component.value).toBe(55);
    vi.advanceTimersByTime(490);
    expect(component.value).toBe(65);
    expect(action).not.toHaveBeenCalled();
    component.repeatStop();
    component.repeatStop();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 65 });
    vi.advanceTimersByTime(200);
    expect(component.value).toBe(65);
    expect(action).toHaveBeenCalledTimes(1);
    expect(input).toEqual(original);
    fixture.destroy();
  });

  it('keeps dial min/max key bounds, showButtons=false and disabled controls', () => {
    const fixture = TestBed.createComponent(DialWidgetComponent);
    const input = card('dial');
    fixture.componentRef.setInput('card', { ...input, value: 90 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dl-btns button:last-child').disabled).toBe(true);
    const action = vi.fn();
    const component = fixture.componentInstance;
    component.act.subscribe(action);
    component.key(new KeyboardEvent('keydown', { key: 'Home' }));
    component.key(new KeyboardEvent('keydown', { key: 'End' }));
    expect(action).toHaveBeenNthCalledWith(1, { kind: 'range', value: 10 });
    expect(action).toHaveBeenNthCalledWith(2, { kind: 'range', value: 90 });
    fixture.componentRef.setInput('card', { ...input, value: 10 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dl-btns button:first-child').disabled).toBe(true);
    fixture.componentRef.setInput('card', { ...input, disabled: true });
    fixture.detectChanges();
    action.mockClear();
    const target: Element = fixture.nativeElement.querySelector('.dl-svg');
    geometry(target, 220, component.viewHeight);
    component.turnStart(pointer(target, 127, 23));
    component.repeatStart(pointer(target, 127, 23), 1);
    component.key(new KeyboardEvent('keydown', { key: 'End' }));
    expect(action).not.toHaveBeenCalled();
    expect(target.setPointerCapture).not.toHaveBeenCalled();
    expect(target.getAttribute('aria-disabled')).toBe('true');
    expect(target.getAttribute('tabindex')).toBe('-1');
    fixture.componentRef.setInput('card', { ...input, widget: { ...input.widget,
      options: { ...input.widget.options, showButtons: false, showTicks: false } } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dl-btns')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.arc-tick')).toHaveLength(0);
    expect(component.value).toBe(50);
  });
});
