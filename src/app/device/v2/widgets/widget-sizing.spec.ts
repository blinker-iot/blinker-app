import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageWidgetComponent } from '../panel/page-widget';
import { PageLayoutPanelComponent } from '../panel/page-layout-panel';
import { NumberWidgetComponent } from './number/number-widget';
import { StepperWidgetComponent } from './stepper/stepper-widget';
import type { PanelCard } from './widget-kit';

describe('Compact widget presentation and existing action boundary', () => {
  function card(role: 'property' | 'action' = 'property'): PanelCard {
    return {
      widget: { widgetId: 'saved-stepper', endpointKey: 'level', type: 'slider', variant: 'stepper',
        grid: { x: 2, y: 4, width: 2, height: 1 } },
      field: { id: 1, key: 'level', role, valueType: 'integer', readable: true,
        writable: true, notifies: true, minimum: 0, maximum: 100, step: 1 },
      value: 24, display: '24', draft: '', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    // jsdom has no media query implementation; use the existing reduced-motion
    // path so these command-boundary tests do not depend on animation timers.
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [StepperWidgetComponent, NumberWidgetComponent, PageWidgetComponent, PageLayoutPanelComponent] })
      .compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders the saved single-row property controls without changing its grid or binding', () => {
    const fixture = TestBed.createComponent(StepperWidgetComponent);
    const value = card();
    const original = structuredClone(value.widget);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const act = vi.fn();
    fixture.componentInstance.act.subscribe(act);

    expect(fixture.nativeElement.classList.contains('rowc')).toBe(true);
    expect(fixture.nativeElement.querySelector('.rc-copy strong').textContent).toBe('Level');
    expect(fixture.nativeElement.querySelectorAll('.rc-controls .rbtn')).toHaveLength(2);
    fixture.componentInstance.nudge(1);
    expect(act).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 25 });
    expect(value.widget).toEqual(original);
  });

  it('keeps an action stepper draft-only until its existing send key is pressed', () => {
    const fixture = TestBed.createComponent(StepperWidgetComponent);
    fixture.componentRef.setInput('card', card('action'));
    fixture.detectChanges();
    const act = vi.fn();
    fixture.componentInstance.act.subscribe(act);

    fixture.componentInstance.nudge(1);
    expect(act).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.rc-controls .ns-go').click();
    expect(act).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 25 });
  });

  it('keeps disabled property and action steppers from emitting', () => {
    for (const role of ['property', 'action'] as const) {
      const fixture = TestBed.createComponent(StepperWidgetComponent);
      fixture.componentRef.setInput('card', { ...card(role), disabled: true });
      fixture.detectChanges();
      const act = vi.fn();
      fixture.componentInstance.act.subscribe(act);
      fixture.componentInstance.nudge(1);
      fixture.componentInstance.send();
      expect(act).not.toHaveBeenCalled();
      expect([...fixture.nativeElement.querySelectorAll('button')].every((button: unknown) =>
        (button as HTMLButtonElement).disabled)).toBe(true);
      fixture.destroy();
    }
  });

  it('limits the compact number presentation to a saved single row', () => {
    const fixture = TestBed.createComponent(NumberWidgetComponent);
    const value = card();
    value.widget = { ...value.widget, type: 'value', variant: 'number' };
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('rowc')).toBe(true);
    expect(fixture.nativeElement.querySelector('.bn-num').getAttribute('aria-label')).toContain('24');
    fixture.componentRef.setInput('card', { ...value, widget: { ...value.widget, grid: { ...value.widget.grid, height: 2 } } });
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('rowc')).toBe(false);
  });

  it('keeps a preview inert and prevents its child action from escaping', () => {
    const fixture = TestBed.createComponent(PageWidgetComponent);
    fixture.componentRef.setInput('card', card());
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    const child = fixture.debugElement.query(By.directive(StepperWidgetComponent)).componentInstance as StepperWidgetComponent;

    child.act.emit({ kind: 'range', value: 25 });
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(true);
    expect(action).not.toHaveBeenCalled();
    fixture.componentRef.setInput('interactive', true);
    fixture.detectChanges();
    child.act.emit({ kind: 'range', value: 25 });
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(false);
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 25 });
  });

  it('reserves normal-flow feedback without modifying saved geometry or bindings', () => {
    const fixture = TestBed.createComponent(PageLayoutPanelComponent);
    const current = { ...card(), error: '请求未确认，请查询恢复' };
    const before = card();
    before.widget = { ...before.widget, widgetId: 'before', grid: { x: 0, y: 0, width: 2, height: 1 } };
    const input = [current, before];
    const original = structuredClone(input);
    fixture.componentRef.setInput('cards', input);
    fixture.detectChanges();
    const cells = [...fixture.nativeElement.querySelectorAll('.cell')] as HTMLElement[];
    expect(cells.map(cell => cell.dataset['widgetId'])).toEqual(['before', 'saved-stepper']);
    expect(cells[0].classList.contains('feedback')).toBe(false);
    expect(cells[1].classList.contains('feedback')).toBe(true);
    expect(cells[1].querySelector('.cell-error')?.textContent).toContain(current.error);
    expect(input).toEqual(original);
    fixture.componentRef.setInput('cards', [{ ...current, error: '' }, before]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.feedback')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cell-error')).toBeNull();
  });
});
