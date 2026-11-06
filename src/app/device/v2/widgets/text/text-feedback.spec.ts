import { TestBed } from '@angular/core/testing';
import { PageWidgetComponent } from '../../panel/page-widget';
import type { PanelCard, WidgetAct } from '../widget-kit';
import { TextWidgetComponent } from './text-widget';

describe('QA5 current text feedback', () => {
  function card(): PanelCard {
    return {
      widget: { widgetId: 'saved-text', endpointKey: 'message', title: '原文本', type: 'input', variant: 'text',
        grid: { x: 0, y: 0, width: 4, height: 2 }, options: {} },
      field: { id: 1, key: 'message', role: 'property', valueType: 'text', readable: true, writable: true, notifies: true },
      value: '原值', display: '原值', draft: '原值', disabled: false, error: '',
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TextWidgetComponent, PageWidgetComponent] }).compileComponents();
  });

  it('distinguishes a known empty text value from an absent reading without emitting', () => {
    const fixture = TestBed.createComponent(TextWidgetComponent), value = { ...card(), value: '', display: '', draft: '' };
    const original = structuredClone(value), action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    fixture.componentRef.setInput('card', value); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('当前（空文本）');
    expect(action).not.toHaveBeenCalled(); expect(value).toEqual(original);
  });

  it.each([undefined, null])('does not invent a current value from a draft when the reading is %s', value => {
    const fixture = TestBed.createComponent(TextWidgetComponent), action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    fixture.componentRef.setInput('card', { ...card(), value, display: '', draft: '尚未提交的草稿' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('尚未发送');
    expect(action).not.toHaveBeenCalled();
  });

  it.each([
    { value: '   ', display: '   ', valueType: 'text' as const, expected: '当前    ' },
    { value: 0, display: '0', valueType: 'integer' as const, expected: '当前 0' },
    { value: '', display: '', valueType: 'integer' as const, expected: '尚未发送' },
  ])('preserves the current feedback outside known empty text: %j', ({ value, display, valueType, expected }) => {
    const fixture = TestBed.createComponent(TextWidgetComponent), base = card(), action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    fixture.componentRef.setInput('card', { ...base, value, display, field: { ...base.field, valueType } }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe(expected);
    expect(action).not.toHaveBeenCalled();
  });

  it('changes current feedback only when the host supplies a new value, not on draft or commit', () => {
    const fixture = TestBed.createComponent(TextWidgetComponent), original = card(), saved = structuredClone(original);
    let current = original;
    fixture.componentRef.setInput('card', current); fixture.detectChanges();
    const actions: WidgetAct[] = [];
    fixture.componentInstance.act.subscribe(action => {
      actions.push(action);
      if (action.kind === 'draft') { current = { ...current, draft: action.value as string }; fixture.componentRef.setInput('card', current); }
    });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.tx-in');
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('当前 原值');
    fixture.nativeElement.querySelector('.tx-send').click(); fixture.detectChanges();
    expect(actions).toEqual([{ kind: 'draft', value: '' }, { kind: 'commit' }]);
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('当前 原值');
    // A host input update models a new reading; this test does not fabricate
    // a device ACK or change the production host's value from its draft.
    fixture.componentRef.setInput('card', { ...current, value: '', display: '' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('当前（空文本）');
    expect(actions).toHaveLength(2); expect(original).toEqual(saved);
  });

  it('renders the same known value in an inert preview without exposing Send', () => {
    const fixture = TestBed.createComponent(PageWidgetComponent), action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    fixture.componentRef.setInput('card', { ...card(), value: '', display: '', draft: '' }); fixture.detectChanges();
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(true);
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('当前（空文本）');
    expect(fixture.nativeElement.querySelector('.tx-send')).toBeNull(); expect(action).not.toHaveBeenCalled();
  });
});
