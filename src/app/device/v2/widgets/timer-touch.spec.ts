import { TestBed } from '@angular/core/testing';
import { TimerWidgetComponent } from './timer/timer-widget';
import type { PanelCard } from './widget-kit';

describe('Timer touch presentation preserves the existing range command boundary', () => {
  function card(value = 0): PanelCard {
    return {
      widget: { widgetId: 'saved-timer', endpointKey: 'remaining', title: '关闭延时', type: 'slider', variant: 'timer',
        grid: { x: 4, y: 3, width: 4, height: 2 },
        options: { presets: '1,5,15,30,60,120' } },
      field: { id: 1, key: 'remaining', role: 'property', valueType: 'integer', readable: true,
        writable: true, notifies: true, minimum: 0, maximum: 7200, step: 1, unit: 's' },
      value, display: String(value), draft: '', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [TimerWidgetComponent] }).compileComponents();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retains six configured presets and emits their original second values without changing the layout', () => {
    const fixture = TestBed.createComponent(TimerWidgetComponent);
    const input = card();
    const saved = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const choices = [...fixture.nativeElement.querySelectorAll('.tm-p')] as HTMLButtonElement[];
    expect(choices).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('.tm-presets').getAttribute('aria-label')).toBe('倒计时预设');
    expect(choices.map(choice => choice.textContent?.replace(/\s/g, ''))).toEqual(['1分钟', '5分钟', '15分钟', '30分钟', '1小时', '2小时']);
    choices[0].click();
    choices[5].click();
    expect(action).toHaveBeenNthCalledWith(1, { kind: 'range', value: 60 });
    expect(action).toHaveBeenNthCalledWith(2, { kind: 'range', value: 7200 });
    expect(input).toEqual(saved);
    fixture.destroy();
  });

  it('keeps the default preset selection and endpoint maximum clamp', () => {
    const fixture = TestBed.createComponent(TimerWidgetComponent);
    const input = card();
    input.widget.options = {};
    input.field.maximum = 3600;
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    expect(fixture.componentInstance.presets).toEqual([15, 30, 60, 120]);
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    fixture.nativeElement.querySelector('.tm-p:last-child').click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 3600 });
    fixture.destroy();
  });

  it.each(['ring', 'bar', 'text'] as const)('keeps the %s running state and one original cancellation command', style => {
    const fixture = TestBed.createComponent(TimerWidgetComponent);
    const input = card(90);
    input.widget.options = { ...input.widget.options, style };
    const saved = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const cancel = fixture.nativeElement.querySelector('.tm-x') as HTMLButtonElement;
    expect(cancel.getAttribute('aria-label')).toBe('取消关闭延时倒计时');
    expect(fixture.nativeElement.querySelector('.tm-presets')).toBeNull();
    cancel.click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 0 });
    expect(input).toEqual(saved);
    fixture.destroy();
  });

  it.each([0, 90])('blocks disabled native and handler commands while value=%i', value => {
    const fixture = TestBed.createComponent(TimerWidgetComponent);
    const input = { ...card(value), disabled: true };
    const saved = structuredClone(input);
    fixture.componentRef.setInput('card', input);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    for (const button of fixture.nativeElement.querySelectorAll('button')) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    fixture.componentInstance.start(5);
    fixture.componentInstance.cancel();
    expect(action).not.toHaveBeenCalled();
    expect(input).toEqual(saved);
    fixture.destroy();
  });
});
