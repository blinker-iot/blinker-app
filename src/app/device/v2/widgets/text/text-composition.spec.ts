import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageWidgetComponent } from '../../panel/page-widget';
import type { PanelCard, WidgetAct } from '../widget-kit';
import { TextWidgetComponent } from './text-widget';

describe('QA5 text composition submission', () => {
  const paths = [
    { multiline: false, ctrlKey: false, metaKey: false },
    { multiline: true, ctrlKey: true, metaKey: false },
    { multiline: true, ctrlKey: false, metaKey: true },
  ];
  function card(multiline = false): PanelCard {
    return {
      widget: { widgetId: 'ime-text', endpointKey: 'message', title: '设备文字', type: 'input', variant: 'text',
        grid: { x: 0, y: 0, width: 4, height: 2 }, options: { multiline } },
      field: { id: 1, key: 'message', role: 'property', valueType: 'text', readable: true, writable: true, notifies: true },
      value: '设备原值', display: '设备原值', draft: '设备原值', disabled: false, error: '',
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TextWidgetComponent, PageWidgetComponent] }).compileComponents();
  });

  it.each(paths)('keeps IME confirmation separate from explicit submission: %j', keys => {
    const fixture = TestBed.createComponent(TextWidgetComponent), original = card(keys.multiline);
    const saved = structuredClone(original), actions: WidgetAct[] = [];
    let current = original;
    fixture.componentRef.setInput('card', current);
    fixture.componentInstance.act.subscribe(action => {
      actions.push(action);
      if (action.kind === 'draft') {
        current = { ...current, draft: action.value as string };
        fixture.componentRef.setInput('card', current);
      }
    });
    fixture.detectChanges();
    const input: HTMLInputElement | HTMLTextAreaElement = fixture.nativeElement.querySelector('.tx-in');
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = '设备中文';
    input.dispatchEvent(new InputEvent('input', { data: '文', isComposing: true, inputType: 'insertCompositionText' }));
    fixture.detectChanges();
    const confirm = new KeyboardEvent('keydown', { key: 'Enter', ...keys, isComposing: true, cancelable: true });
    expect(confirm.isComposing).toBe(true);
    input.dispatchEvent(confirm);
    expect(actions).toEqual([{ kind: 'draft', value: '设备中文' }]);
    expect(confirm.defaultPrevented).toBe(false);
    expect(fixture.nativeElement.querySelector('.tx-last').textContent).toBe('当前 设备原值');
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '设备中文' }));
    expect(actions).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ...keys }));
    expect(actions).toEqual([{ kind: 'draft', value: '设备中文' }, { kind: 'commit' }]);
    expect(fixture.componentInstance.card.draft).toBe('设备中文');
    expect(original).toEqual(saved);
  });

  it.each(paths)('does not submit a legacy IME 229 confirmation after compositionend: %j', keys => {
    const fixture = TestBed.createComponent(TextWidgetComponent), action = vi.fn();
    fixture.componentRef.setInput('card', { ...card(keys.multiline), draft: '已选中文' });
    fixture.componentInstance.act.subscribe(action); fixture.detectChanges();
    const input: HTMLInputElement | HTMLTextAreaElement = fixture.nativeElement.querySelector('.tx-in');
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '已选中文' }));
    const confirm = new KeyboardEvent('keydown', { key: 'Enter', ...keys, keyCode: 229, isComposing: false, cancelable: true });
    expect(confirm.keyCode).toBe(229); expect(confirm.isComposing).toBe(false);
    input.dispatchEvent(confirm);
    expect(action).not.toHaveBeenCalled(); expect(confirm.defaultPrevented).toBe(false);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.tx-send');
    expect(button.disabled).toBe(false); button.click();
    expect(action.mock.calls).toEqual([[{ kind: 'commit' }]]);
  });

  it.each(['readOnly', 'disabled'] as const)('retains %s protection after IME confirmation', boundary => {
    const fixture = TestBed.createComponent(TextWidgetComponent), action = vi.fn();
    fixture.componentRef.setInput('card', { ...card(), draft: '中文', disabled: boundary === 'disabled' });
    fixture.componentRef.setInput('readOnly', boundary === 'readOnly');
    fixture.componentInstance.act.subscribe(action); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.tx-in');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    input.dispatchEvent(new CompositionEvent('compositionend'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps numeric zero explicit and does not send it from an IME confirmation', () => {
    const fixture = TestBed.createComponent(TextWidgetComponent), action = vi.fn(), base = card();
    fixture.componentRef.setInput('card', { ...base, field: { ...base.field, valueType: 'integer' }, draft: '0' });
    fixture.componentInstance.act.subscribe(action); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.tx-in');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect(action).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(action.mock.calls).toEqual([[{ kind: 'commit' }]]);
    expect(fixture.componentInstance.card.draft).toBe('0');
  });

  it('keeps the shared preview inert across composing and ordinary keyboard events', () => {
    const fixture = TestBed.createComponent(PageWidgetComponent), action = vi.fn();
    fixture.componentRef.setInput('card', { ...card(), draft: '中文' });
    fixture.componentInstance.action.subscribe(action); fixture.detectChanges();
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(true);
    const child = fixture.debugElement.query(By.directive(TextWidgetComponent));
    const input: HTMLInputElement = child.nativeElement.querySelector('.tx-in');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    input.dispatchEvent(new CompositionEvent('compositionend'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(child.nativeElement.querySelector('.tx-send')).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
});
