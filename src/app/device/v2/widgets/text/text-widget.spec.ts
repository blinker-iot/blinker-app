import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageWidgetComponent } from '../../panel/page-widget';
import type { PanelCard, WidgetAct } from '../widget-kit';
import { TextWidgetComponent } from './text-widget';

describe('QA5 text submission', () => {
  function card(): PanelCard {
    return {
      widget: { widgetId: 'saved-text', endpointKey: 'label', title: '设备文字', type: 'input', variant: 'text',
        grid: { x: 0, y: 0, width: 4, height: 2 }, options: {} },
      field: { id: 1, key: 'label', role: 'property', valueType: 'text', readable: true, writable: true, notifies: true },
      value: '原文字', display: '原文字', draft: '原文字', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TextWidgetComponent, PageWidgetComponent] }).compileComponents();
  });

  it.each([
    { draft: '', multiline: false, ctrlKey: false, metaKey: false },
    { draft: '   ', multiline: false, ctrlKey: false, metaKey: false },
    { draft: '', multiline: true, ctrlKey: true, metaKey: false },
    { draft: '   ', multiline: true, ctrlKey: false, metaKey: true },
  ])('allows explicit pointer and keyboard text submission: %j', ({ draft, multiline, ctrlKey, metaKey }) => {
    const fixture = TestBed.createComponent(TextWidgetComponent);
    const value = card();
    value.widget.options = { multiline };
    const original = structuredClone(value);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const actions: WidgetAct[] = [];
    fixture.componentInstance.act.subscribe(action => {
      actions.push(action);
      // The existing host owns drafts; the widget must not mutate its input.
      if (action.kind === 'draft') fixture.componentRef.setInput('card', { ...value, draft: action.value as string });
    });
    const input: HTMLInputElement | HTMLTextAreaElement = fixture.nativeElement.querySelector('.tx-in');
    input.value = draft;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(actions).toEqual([{ kind: 'draft', value: draft }]);
    expect(fixture.componentInstance.card.draft).toBe(draft);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.tx-send');
    expect(button.disabled).toBe(false);
    button.click();
    expect(actions).toEqual([{ kind: 'draft', value: draft }, { kind: 'commit' }]);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey, metaKey }));
    expect(actions).toEqual([{ kind: 'draft', value: draft }, { kind: 'commit' }, { kind: 'commit' }]);
    expect(fixture.componentInstance.card.draft).toBe(draft);
    expect(value).toEqual(original);
  });

  it.each(['integer', 'number'] as const)('rejects blank %s on both paths but preserves explicit zero', valueType => {
    const fixture = TestBed.createComponent(TextWidgetComponent);
    const value = card();
    value.field = { ...value.field, valueType, minimum: 0, maximum: 100, step: 1 };
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    for (const draft of ['', '   ']) {
      fixture.componentRef.setInput('card', { ...value, draft });
      fixture.detectChanges();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.tx-send');
      expect(button.disabled).toBe(true);
      button.click();
      fixture.nativeElement.querySelector('.tx-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(action).not.toHaveBeenCalled();
    }
    fixture.componentRef.setInput('card', { ...value, draft: '0' });
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.tx-send');
    expect(button.disabled).toBe(false);
    button.click();
    fixture.nativeElement.querySelector('.tx-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(action.mock.calls).toEqual([[{ kind: 'commit' }], [{ kind: 'commit' }]]);
    expect(fixture.componentInstance.card.draft).toBe('0');
  });

  it.each(['readOnly', 'disabled'] as const)('retains the %s boundary for empty text', boundary => {
    const fixture = TestBed.createComponent(TextWidgetComponent);
    fixture.componentRef.setInput('card', { ...card(), draft: '', disabled: boundary === 'disabled' });
    fixture.componentRef.setInput('readOnly', boundary === 'readOnly');
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.tx-send');
    if (boundary === 'readOnly') expect(button).toBeNull();
    else {
      expect(button!.disabled).toBe(true);
      button!.click();
    }
    fixture.nativeElement.querySelector('.tx-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.componentInstance.send();
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps the shared editor preview inert rather than enabling real control', () => {
    const fixture = TestBed.createComponent(PageWidgetComponent);
    fixture.componentRef.setInput('card', { ...card(), draft: '' });
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(true);
    expect(fixture.nativeElement.querySelector('.tx-send')).toBeNull();
    const child = fixture.debugElement.query(By.directive(TextWidgetComponent)).componentInstance as TextWidgetComponent;
    child.send();
    child.act.emit({ kind: 'commit' });
    expect(action).not.toHaveBeenCalled();
  });
});
