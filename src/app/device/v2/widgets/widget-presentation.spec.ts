import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageWidgetComponent } from '../panel/page-widget';
import { GradientWidgetComponent } from './gradient/gradient-widget';
import { ModeWidgetComponent } from './mode/mode-widget';
import { TextWidgetComponent } from './text/text-widget';
import type { PanelCard } from './widget-kit';

describe('UI3 widget presentation preserves existing control contracts', () => {
  function card(kind: 'gradient' | 'mode' | 'text'): PanelCard {
    const numeric = kind === 'gradient';
    return {
      widget: { widgetId: `saved-${kind}`, endpointKey: kind, title: '保留的部件名称',
        type: numeric ? 'slider' : kind === 'mode' ? 'select' : 'input', variant: kind,
        grid: { x: 0, y: 0, width: 4, height: kind === 'text' ? 2 : 1 },
        options: kind === 'mode' ? { style: 'chips' } : {} },
      field: { id: 1, key: kind, role: 'property', valueType: numeric ? 'integer' : 'text',
        readable: true, writable: true, notifies: true, minimum: 0, maximum: 100, step: 1,
        ...(kind === 'mode' ? { choices: ['自动', '低速', '高速'] } : {}) },
      value: numeric ? 25 : kind === 'mode' ? '自动' : '原状态', display: '原状态',
      draft: '待发送文本', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({
      imports: [GradientWidgetComponent, ModeWidgetComponent, TextWidgetComponent, PageWidgetComponent],
    }).compileComponents();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps gradient strip appearance separate from its original slider handlers', () => {
    const fixture = TestBed.createComponent(GradientWidgetComponent);
    const value = card('gradient');
    const original = structuredClone(value);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const slider: HTMLElement = fixture.nativeElement.querySelector('.gs-track');
    expect(slider.getAttribute('role')).toBe('slider');
    expect(slider.querySelector('.gs-strip.cct')?.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.classList.contains('rowc')).toBe(true);
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 26 });
    expect(value).toEqual(original);
  });

  it('does not emit disabled gradient commands or mutate saved dimensions', () => {
    const fixture = TestBed.createComponent(GradientWidgetComponent);
    const value = { ...card('gradient'), disabled: true };
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    fixture.componentInstance.commit(30);
    expect(action).not.toHaveBeenCalled();
    fixture.componentRef.setInput('card', { ...value, widget: { ...value.widget,
      grid: { ...value.widget.grid, height: 2 } } });
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('rowc')).toBe(false);
  });

  it('keeps text entry draft-only and its separate send action explicit', () => {
    const fixture = TestBed.createComponent(TextWidgetComponent);
    const value = card('text');
    const original = structuredClone(value);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.tx-in');
    input.value = '新草稿';
    input.dispatchEvent(new Event('input'));
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'draft', value: '新草稿' });
    fixture.nativeElement.querySelector('.tx-send').click();
    expect(action).toHaveBeenNthCalledWith(2, { kind: 'commit' });
    expect(value).toEqual(original);
  });

  it('retains read-only and disabled text boundaries', () => {
    const fixture = TestBed.createComponent(TextWidgetComponent);
    fixture.componentRef.setInput('card', card('text'));
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    expect(fixture.nativeElement.querySelector('.tx-send')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tx-in').readOnly).toBe(true);
    fixture.componentInstance.send();
    fixture.componentInstance.draft('不可发送');
    expect(action).not.toHaveBeenCalled();
    fixture.componentRef.setInput('readOnly', false);
    fixture.componentRef.setInput('card', { ...card('text'), disabled: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-send').disabled).toBe(true);
    fixture.componentInstance.send();
    expect(action).not.toHaveBeenCalled();
  });

  it('preserves all mode choices and exposes current selection without changing layout', () => {
    const fixture = TestBed.createComponent(ModeWidgetComponent);
    const value = card('mode');
    const original = structuredClone(value);
    fixture.componentRef.setInput('card', value);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const buttons = [...fixture.nativeElement.querySelectorAll('.mode')] as HTMLButtonElement[];
    expect(buttons.map(button => button.title)).toEqual(value.field.choices!);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    buttons[0].click();
    expect(action).not.toHaveBeenCalled();
    buttons[1].click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'select', value: '低速' });
    expect(value).toEqual(original);
  });

  it('does not emit from disabled mode choices', () => {
    const fixture = TestBed.createComponent(ModeWidgetComponent);
    fixture.componentRef.setInput('card', { ...card('mode'), disabled: true });
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    for (const button of fixture.nativeElement.querySelectorAll('button')) expect(button.disabled).toBe(true);
    fixture.componentInstance.pick('低速');
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps the shared preview inert for each changed widget family', () => {
    for (const [kind, component] of [
      ['gradient', GradientWidgetComponent], ['mode', ModeWidgetComponent], ['text', TextWidgetComponent],
    ] as const) {
      const fixture = TestBed.createComponent(PageWidgetComponent);
      fixture.componentRef.setInput('card', card(kind));
      fixture.detectChanges();
      const action = vi.fn();
      fixture.componentInstance.action.subscribe(action);
      const child = fixture.debugElement.query(By.directive(component)).componentInstance;
      child.act.emit({ kind: 'commit' });
      expect(fixture.nativeElement.hasAttribute('inert')).toBe(true);
      expect(action).not.toHaveBeenCalled();
      fixture.destroy();
    }
  });
});
