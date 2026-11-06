import { TestBed } from '@angular/core/testing';
import { PageLayoutPanelComponent } from '../panel/page-layout-panel';
import { HoldWidgetComponent } from './hold/hold-widget';
import { SlideWidgetComponent } from './slide/slide-widget';
import { StepperWidgetComponent } from './stepper/stepper-widget';
import { TextWidgetComponent } from './text/text-widget';
import { ToggleWidgetComponent } from './toggle/toggle-widget';
import { WidgetBase } from './widget-base';
import type { PanelCard } from './widget-kit';

describe('QA5 compact height budget', () => {
  function card(): PanelCard {
    return {
      widget: { widgetId: 'saved-control', endpointKey: 'value', title: '保留标题', type: 'switch', variant: 'toggle',
        grid: { x: 0, y: 0, width: 4, height: 1 }, options: {} },
      field: { id: 1, key: 'value', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true },
      value: false, display: 'false', draft: '', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PageLayoutPanelComponent, ToggleWidgetComponent, SlideWidgetComponent,
      HoldWidgetComponent, StepperWidgetComponent, TextWidgetComponent] }).compileComponents();
  });

  it('derives only card padding from the original grid fill height', () => {
    const fixture = TestBed.createComponent(PageLayoutPanelComponent), value = card(), original = structuredClone(value);
    fixture.componentRef.setInput('cards', [value]);
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('.cell');
    const budget = getComputedStyle(cell).getPropertyValue('--ui-card-pad-block');
    expect(budget).toContain('var(--fill-h)');
    expect(budget).toContain('60px');
    expect(budget).toContain('14px');
    expect(getComputedStyle(cell).getPropertyValue('--fill-h')).toContain('var(--rows)');
    expect(value).toEqual(original);
  });

  for (const [name, component, selector] of [
    ['toggle', ToggleWidgetComponent, null], ['slide', SlideWidgetComponent, null],
    ['hold', HoldWidgetComponent, '.hw'], ['stepper', StepperWidgetComponent, null],
  ] as const) {
    it(`lets the ${name} padding consume the shared budget without shrinking its target`, () => {
      const fixture = TestBed.createComponent<WidgetBase>(component), value = card();
      if (name === 'stepper') value.field = { ...value.field, valueType: 'integer', minimum: 0, maximum: 10, step: 1 };
      fixture.componentRef.setInput('card', value);
      fixture.detectChanges();
      const element = selector ? fixture.nativeElement.querySelector(selector) : fixture.nativeElement;
      // CSS declarations only: jsdom cannot prove pixel fit or native scrolling.
      expect(getComputedStyle(element).paddingBlock).toContain('--ui-card-pad-block');
    });
  }

  it('keeps a one-row stepper title and both 48px controls in the original row', () => {
    const fixture = TestBed.createComponent(StepperWidgetComponent), value = card(), original = structuredClone(value);
    value.field = { ...value.field, valueType: 'integer', minimum: 0, maximum: 10, step: 1 };
    value.value = 5;
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector('.rc-body');
    expect(getComputedStyle(body).flexDirection).toBe('row');
    expect(fixture.nativeElement.querySelector('.rc-copy strong').textContent).toBe(original.widget.title);
    const controls = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.rc-controls .rbtn')];
    expect(controls.map(button => button.getAttribute('aria-label'))).toEqual(['减少', '增加']);
    for (const button of controls) {
      expect(getComputedStyle(button).width).toBe('48px');
      expect(getComputedStyle(button).height).toBe('48px');
    }
    expect(value.widget.grid).toEqual(original.widget.grid);
  });

  it.each([2, 3])('fits multiline text presentation to its saved %i rows', rows => {
    const fixture = TestBed.createComponent(TextWidgetComponent), value = card();
    value.widget = { ...value.widget, type: 'input', variant: 'text', grid: { ...value.widget.grid, height: rows }, options: { multiline: true } };
    value.field = { ...value.field, valueType: 'text', maxLength: 120 };
    value.value = ''; value.display = ''; value.draft = '';
    const original = structuredClone(value);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const compact = rows <= 2, box = fixture.nativeElement.querySelector('.tx-box.multi');
    expect(fixture.nativeElement.classList.contains('compact-multiline')).toBe(compact);
    expect(getComputedStyle(box).flexDirection).toBe(compact ? 'row' : 'column');
    if (compact) expect(getComputedStyle(box).minHeight).toBe('0px');
    expect(getComputedStyle(fixture.nativeElement.querySelector('textarea')).minHeight).toBe('48px');
    const button = fixture.nativeElement.querySelector('.tx-send');
    expect(getComputedStyle(button).width).toBe('48px');
    expect(getComputedStyle(button).height).toBe('48px');
    const action = vi.fn(); fixture.componentInstance.act.subscribe(action);
    button.click(); expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'commit' });
    expect(value).toEqual(original);
  });

  it('retains read-only compact multiline without exposing a send control', () => {
    const fixture = TestBed.createComponent(TextWidgetComponent), value = card();
    value.widget = { ...value.widget, type: 'input', variant: 'text', grid: { ...value.widget.grid, height: 2 }, options: { multiline: true } };
    value.field = { ...value.field, valueType: 'text' };
    fixture.componentRef.setInput('card', value); fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('compact-multiline')).toBe(true);
    expect(fixture.nativeElement.querySelector('textarea').readOnly).toBe(true);
    expect(fixture.nativeElement.querySelector('.tx-send')).toBeNull();
  });
});
