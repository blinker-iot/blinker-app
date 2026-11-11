import { TestBed } from '@angular/core/testing';
import { TextWidgetComponent } from '../text/text-widget';
import type { PanelCard } from '../widget-kit';
import { ModeWidgetComponent } from './mode-widget';

describe('QA5 segmented mode scroll contract', () => {
  function card(rows: number, count: number): PanelCard {
    return {
      widget: { widgetId: 'saved-mode', endpointKey: 'mode', title: '原模式', type: 'select', variant: 'mode',
        grid: { x: 0, y: 0, width: 4, height: rows }, options: { style: 'segmented' } },
      field: { id: 1, key: 'mode', role: 'property', valueType: 'text', readable: true, writable: true,
        notifies: true, choices: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'].slice(0, count) },
      value: 'INFO', display: 'INFO', draft: '', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ModeWidgetComponent, TextWidgetComponent] }).compileComponents();
  });

  it.each([
    { rows: 1, count: 4 }, { rows: 1, count: 5 }, { rows: 2, count: 4 }, { rows: 2, count: 5 },
  ])('keeps the prescribed height and all full-size choices in one horizontal strip: %j', ({ rows, count }) => {
    const fixture = TestBed.createComponent(ModeWidgetComponent);
    const value = card(rows, count), original = structuredClone(value);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const strip: HTMLElement = fixture.nativeElement.querySelector('.modes.segmented');
    const style = getComputedStyle(strip);
    // jsdom checks only the emitted CSS contract; real geometry is checked on
    // the phone, not inferred from its nonexistent layout implementation.
    expect(style.flexWrap).toBe('nowrap');
    expect(style.overflowX).toBe('auto');
    expect(style.overflowY).toBe('hidden');
    const choices = [...strip.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(choices.map(button => button.textContent?.trim())).toEqual(value.field.choices);
    for (const button of choices) {
      const buttonStyle = getComputedStyle(button);
      expect(buttonStyle.flexBasis).toBe('48px');
      expect(Number.parseFloat(buttonStyle.minWidth)).toBeGreaterThanOrEqual(48);
      expect(Number.parseFloat(buttonStyle.minHeight)).toBeGreaterThanOrEqual(48);
    }
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    choices[0].click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'select', value: 'ERROR' });
    expect(value).toEqual(original);
  });

  it.each(['mode', 'text'] as const)('lets a %s card chain its existing overflow to the page', kind => {
    const fixture = kind === 'mode' ? TestBed.createComponent(ModeWidgetComponent) : TestBed.createComponent(TextWidgetComponent);
    const value = card(2, 5);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const style = getComputedStyle(fixture.nativeElement);
    expect(style.overscrollBehavior).toBe('auto');
    // Preserve the fallback for genuinely long text or historical compact
    // content; do not turn a scroll fix into blanket content clipping.
    expect(style.overflow).toBe('auto');
  });
});
