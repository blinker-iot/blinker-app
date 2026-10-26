import { TestBed } from '@angular/core/testing';
import { KeysWidgetComponent } from './keys/keys-widget';
import { LevelsWidgetComponent } from './levels/levels-widget';
import type { PanelCard } from './widget-kit';

describe('UI3 Keys and Levels touch presentation preserves existing actions', () => {
  function keysCard(rows = 1): PanelCard {
    return {
      widget: { widgetId: 'saved-keys', endpointKey: 'remote', title: '遥控器', type: 'button', variant: 'keys',
        grid: { x: 0, y: 3, width: 4, height: rows },
        options: { choiceIcons: '开灯:bulb', choiceTones: '开灯:orange' } },
      field: { id: 1, key: 'remote', role: 'action', valueType: 'text', readable: false,
        writable: true, notifies: false, choices: ['开灯', '关灯', '原有长名称'] },
      value: undefined, display: '', draft: '', error: '', disabled: false,
    };
  }

  function levelsCard(style: 'bars' | 'dots' | 'segment' = 'bars', rows = 1): PanelCard {
    return {
      widget: { widgetId: 'saved-levels', endpointKey: 'speed', title: '档位', type: 'slider', variant: 'levels',
        grid: { x: 2, y: 4, width: 2, height: rows },
        options: { style, showButtons: true, allowOff: true, labels: '低速,中速,高速' } },
      field: { id: 2, key: 'speed', role: 'property', valueType: 'integer', readable: true,
        writable: true, notifies: true, minimum: 0, maximum: 3, step: 1 },
      value: 2, display: '2', draft: '', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [KeysWidgetComponent, LevelsWidgetComponent] }).compileComponents();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retains every key, choice appearance and original one-command press', () => {
    const fixture = TestBed.createComponent(KeysWidgetComponent);
    const card = keysCard();
    const saved = structuredClone(card);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const buttons = [...fixture.nativeElement.querySelectorAll('.key')] as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(card.field.choices);
    expect(buttons[0].classList.contains('toned')).toBe(true);
    expect(buttons[0].querySelector('app-ui-icon')).not.toBeNull();
    expect(fixture.nativeElement.classList.contains('inline')).toBe(true);
    buttons[0].click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'select', value: '开灯' });
    fixture.detectChanges();
    expect(buttons[0].classList.contains('sent')).toBe(true);
    expect(card).toEqual(saved);
  });

  it('preserves Keys row distribution without changing saved coordinates', () => {
    const fixture = TestBed.createComponent(KeysWidgetComponent);
    const card = keysCard(3);
    const saved = structuredClone(card.widget);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    expect(fixture.componentInstance.columns).toBe(1);
    expect(fixture.nativeElement.querySelector('.hd-t').textContent).toBe('遥控器');
    expect(fixture.nativeElement.classList.contains('inline')).toBe(false);
    expect(card.widget).toEqual(saved);
  });

  it('blocks disabled Keys through both native buttons and the existing handler', () => {
    const fixture = TestBed.createComponent(KeysWidgetComponent);
    fixture.componentRef.setInput('card', { ...keysCard(), disabled: true });
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    for (const button of fixture.nativeElement.querySelectorAll('button')) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    fixture.componentInstance.press('开灯');
    expect(fixture.componentInstance.sent()).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it.each(['bars', 'dots', 'segment'] as const)('preserves %s level selection and optional off semantics', style => {
    const fixture = TestBed.createComponent(LevelsWidgetComponent);
    const card = levelsCard(style);
    const saved = structuredClone(card);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    const buttons = [...fixture.nativeElement.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(3);
    expect(buttons.map(button => button.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(fixture.nativeElement.classList.contains('rowc')).toBe(true);
    buttons[1].click();
    expect(action).toHaveBeenNthCalledWith(1, { kind: 'range', value: 0 });
    buttons[2].click();
    expect(action).toHaveBeenNthCalledWith(2, { kind: 'range', value: 3 });
    if (style === 'bars') {
      expect(buttons[0].querySelector('.lv-bar-fill')?.getAttribute('aria-hidden')).toBe('true');
      expect(buttons[0].style.getPropertyValue('--h')).toBe('52');
      expect(buttons[2].style.getPropertyValue('--h')).toBe('100');
    }
    if (style === 'dots') {
      expect(buttons[0].querySelector('.lv-dot-face')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(card).toEqual(saved);
  });

  it('retains the exact endpoint step, nudge and range boundaries', () => {
    const fixture = TestBed.createComponent(LevelsWidgetComponent);
    const card = levelsCard();
    card.field = { ...card.field, minimum: 2, maximum: 8, step: 2 };
    card.widget.options = { ...card.widget.options, allowOff: false };
    card.value = 2;
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    expect(fixture.componentInstance.levels).toEqual([2, 4, 6, 8]);
    fixture.nativeElement.querySelectorAll('[role="radio"]')[1].click();
    fixture.nativeElement.querySelector('[aria-label="升档"]').click();
    expect(action).toHaveBeenNthCalledWith(1, { kind: 'range', value: 4 });
    expect(action).toHaveBeenNthCalledWith(2, { kind: 'range', value: 6 });
  });

  it('keeps all twelve supported levels and only changes the compact host presentation', () => {
    const fixture = TestBed.createComponent(LevelsWidgetComponent);
    const card = levelsCard('dots');
    card.field = { ...card.field, minimum: 1, maximum: 12 };
    const saved = structuredClone(card.widget);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role="radio"]')).toHaveLength(12);
    expect(card.widget).toEqual(saved);
    fixture.componentRef.setInput('card', { ...card, widget: { ...card.widget,
      grid: { ...card.widget.grid, height: 3 } } });
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('rowc')).toBe(false);
  });

  it('blocks disabled level, off and nudge commands', () => {
    const fixture = TestBed.createComponent(LevelsWidgetComponent);
    fixture.componentRef.setInput('card', { ...levelsCard(), disabled: true });
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    for (const button of fixture.nativeElement.querySelectorAll('button')) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    fixture.componentInstance.set(2);
    fixture.componentInstance.nudge(1);
    expect(action).not.toHaveBeenCalled();
  });
});
